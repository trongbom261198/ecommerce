---
phase: 9
title: "Performance & Stress Testing"
priority: Medium
status: Pending
effort: 4h
depends_on: [5, 7]
---

# Phase 09 — Performance & Stress Testing

## Context Links
- [Plan Overview](plan.md)
- [Phase 05 — API Layer](phase-05-api-layer.md)
- [Phase 07 — Docker Deployment](phase-07-docker-deployment.md)
- [Brainstorm Report](../reports/brainstorm-260225-1018-central-file-management-service.md)

## Overview
Load, stress, and soak testing using k6. Validates the service can handle target throughput (60K uploads/day ≈ 42/min), identifies bottlenecks, and establishes performance baselines. Tests run against docker-compose environment (API + Redis) connected to external SQL Server and MinIO.

## Key Insights
- k6 is JavaScript-based — test scripts live in `tests/k6/` directory
- Target: 60K uploads/day = ~42 uploads/min sustained, ~120/min peak
- Key bottlenecks to find: MinIO upload throughput, SQL Server partition query perf, Redis lock contention, memory pressure from buffering
<!-- Red Team: Soak Test Memory Monitoring — 2026-02-25 -->
- Soak test catches memory leaks — k6 measures HTTP latency, but memory must be monitored separately via `docker stats` or `dotnet-counters`
- Run against docker-compose locally; guard scripts against accidentally targeting staging

## Requirements

### Functional
- **Load test**: sustained 42 uploads/min for 10 minutes
- **Stress test**: ramp to 200 uploads/min, find breaking point
- **Soak test**: 20 uploads/min for 30 minutes, monitor memory/temp files
- **Concurrent download test**: 100 concurrent downloads of mixed file sizes
- **Dedup throughput test**: same file uploaded concurrently by 50 VUs
- **Endpoint latency baselines**: p50, p95, p99 for all endpoints

### Non-Functional
- k6 scripts reusable across environments (configurable base URL)
- Results exportable (JSON summary for CI integration)
- Pass/fail thresholds defined per test

## Architecture

```
tests/k6/
├── config/
│   └── options.js              # Shared k6 options (thresholds, stages)
├── helpers/
│   └── api.js                  # HTTP helper functions (upload, download, etc.)
├── scripts/
│   ├── load-upload.js          # Sustained upload load test
│   ├── stress-upload.js        # Ramp-up stress test
│   ├── soak-test.js            # Long-running soak test
│   ├── concurrent-download.js  # Parallel download test
│   ├── dedup-throughput.js     # Dedup contention test
│   └── endpoint-baseline.js   # Latency baseline for all endpoints
├── data/
│   ├── small-file.txt          # 1KB test file
│   ├── medium-file.bin         # 5MB test file
│   └── large-file.bin          # 50MB test file
└── run-all.sh                  # Script to run all tests sequentially
```

### Test Environment Topology
```
k6 (local)
  │
  ▼ HTTP :5000
┌─────────────┐     ┌──────┐
│ file-manager │     │redis │
│ (Docker)     │     │:6379 │
└──────┬───────┘     └──────┘
       │
  ┌────┴────────────────────┐
  │ SQL Server  │  MinIO    │
  │ 10.14.142.30│ 10.14.142.32│
  └─────────────────────────┘
```

## Related Code Files

### Files to Create
- `tests/k6/config/options.js`
- `tests/k6/helpers/api.js`
- `tests/k6/scripts/load-upload.js`
- `tests/k6/scripts/stress-upload.js`
- `tests/k6/scripts/soak-test.js`
- `tests/k6/scripts/concurrent-download.js`
- `tests/k6/scripts/dedup-throughput.js`
- `tests/k6/scripts/endpoint-baseline.js`
- `tests/k6/data/small-file.txt`
- `tests/k6/run-all.sh`

### Files to Modify
- None — standalone test suite

## Implementation Steps

### 1. Shared Config (`tests/k6/config/options.js`)

```javascript
export const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
// <!-- Red Team: Test API Key Provisioning — 2026-02-25 -->
// PREREQUISITE: Seed a test service via scripts/utilities/add-service.sql BEFORE running tests
// API_KEY must be set — no fallback to prevent accidental auth bypass masking
if (!__ENV.API_KEY) {
    throw new Error('API_KEY env var required. Seed a test service first via add-service.sql');
}
export const API_KEY = __ENV.API_KEY;

export const defaultHeaders = {
    'X-Api-Key': API_KEY,
};

export const thresholds = {
    http_req_duration: ['p(95)<2000', 'p(99)<5000'], // 95th < 2s, 99th < 5s
    http_req_failed: ['rate<0.01'],                   // <1% error rate
    http_reqs: ['rate>10'],                            // >10 req/s throughput
};
```

### 2. API Helpers (`tests/k6/helpers/api.js`)

```javascript
import http from 'k6/http';
import { BASE_URL, defaultHeaders } from '../config/options.js';

export function uploadFile(fileData, fileName, tags) {
    const formData = {
        file: http.file(fileData, fileName, 'application/octet-stream'),
        originalFileName: fileName,
    };
    if (tags) formData.tags = tags;

    return http.post(`${BASE_URL}/api/files/upload`, formData, {
        headers: defaultHeaders,
        timeout: '30s',
    });
}

export function downloadFile(fileId) {
    return http.get(`${BASE_URL}/api/files/${fileId}`, {
        headers: defaultHeaders,
        timeout: '30s',
        responseType: 'binary',
    });
}

export function getFileInfo(fileId) {
    return http.get(`${BASE_URL}/api/files/${fileId}/info`, {
        headers: { ...defaultHeaders, 'Content-Type': 'application/json' },
    });
}

export function releaseFile(fileId) {
    return http.post(`${BASE_URL}/api/files/${fileId}/release`, null, {
        headers: defaultHeaders,
    });
}

export function checkHealth() {
    return http.get(`${BASE_URL}/health`);
}
```

### 3. Load Test: Sustained Upload (`tests/k6/scripts/load-upload.js`)

```javascript
import { check, sleep } from 'k6';
import { uploadFile } from '../helpers/api.js';
import { thresholds } from '../config/options.js';
import { randomBytes } from 'k6/crypto';
import { Counter, Trend } from 'k6/metrics';

const uploadDuration = new Trend('upload_duration_ms');
const uploadCount = new Counter('uploads_total');
const dedupCount = new Counter('dedup_hits');

export const options = {
    scenarios: {
        sustained_upload: {
            executor: 'constant-arrival-rate',
            rate: 42,                    // 42 uploads/min target
            timeUnit: '1m',
            duration: '10m',
            preAllocatedVUs: 20,
            maxVUs: 50,
        },
    },
    thresholds: {
        ...thresholds,
        upload_duration_ms: ['p(95)<3000'],  // upload p95 < 3s
    },
};

export default function () {
    // Random file content (1KB-100KB) to avoid dedup
    const size = Math.floor(Math.random() * 100000) + 1000;
    const data = randomBytes(size);
    const fileName = `loadtest-${Date.now()}-${__VU}.bin`;

    const res = uploadFile(data, fileName);
    uploadDuration.add(res.timings.duration);

    check(res, {
        'upload status 200': (r) => r.status === 200,
        'has fileId': (r) => JSON.parse(r.body).fileId !== undefined,
    });

    uploadCount.add(1);
    if (res.status === 200 && JSON.parse(res.body).isDuplicate) {
        dedupCount.add(1);
    }

    sleep(0.5);
}
```

### 4. Stress Test: Ramp to Breaking Point (`tests/k6/scripts/stress-upload.js`)

```javascript
import { check, sleep } from 'k6';
import { uploadFile } from '../helpers/api.js';
import { randomBytes } from 'k6/crypto';
import { Counter } from 'k6/metrics';

const authFailures = new Counter('auth_failures');

export const options = {
    stages: [
        { duration: '2m', target: 20 },   // warm up
        { duration: '3m', target: 50 },   // normal load
        { duration: '3m', target: 100 },  // high load
        { duration: '3m', target: 200 },  // stress
        { duration: '2m', target: 300 },  // breaking point
        { duration: '2m', target: 0 },    // recovery
    ],
    thresholds: {
        http_req_failed: ['rate<0.10'],    // allow up to 10% errors under stress
        http_req_duration: ['p(95)<10000'], // relaxed: p95 < 10s
        auth_failures: ['count<5'],         // <!-- Red Team: catch auth misconfiguration -->
    },
};

export default function () {
    const size = Math.floor(Math.random() * 50000) + 1000;
    const data = randomBytes(size);

    const res = uploadFile(data, `stress-${Date.now()}-${__VU}.bin`);

    // <!-- Red Team: Stress Test Auth Failure Detection — 2026-02-25 -->
    check(res, {
        'status is 200 or 503': (r) => r.status === 200 || r.status === 503,
        'not auth failure': (r) => r.status !== 401 && r.status !== 403,
    });
    if (res.status === 401 || res.status === 403) authFailures.add(1);

    sleep(0.1);
}
```

### 5. Soak Test: Memory Leak Detection (`tests/k6/scripts/soak-test.js`)

```javascript
import { check, sleep } from 'k6';
import { uploadFile, downloadFile, releaseFile } from '../helpers/api.js';
import { randomBytes } from 'k6/crypto';

export const options = {
    scenarios: {
        soak: {
            executor: 'constant-arrival-rate',
            rate: 20,           // 20 ops/min — moderate sustained load
            timeUnit: '1m',
            duration: '30m',
            preAllocatedVUs: 10,
            maxVUs: 20,
        },
    },
    thresholds: {
        http_req_failed: ['rate<0.01'],
        http_req_duration: ['p(99)<5000'],
    },
};

export default function () {
    // Full cycle: upload → download → release
    const data = randomBytes(10000);
    const fileName = `soak-${Date.now()}-${__VU}.bin`;

    // Upload
    const uploadRes = uploadFile(data, fileName);
    check(uploadRes, { 'upload ok': (r) => r.status === 200 });

    if (uploadRes.status !== 200) return;

    const { fileId } = JSON.parse(uploadRes.body);

    // Download
    const dlRes = downloadFile(fileId);
    check(dlRes, { 'download ok': (r) => r.status === 200 });

    // Release
    const relRes = releaseFile(fileId);
    check(relRes, { 'release ok': (r) => r.status === 200 });

    sleep(1);
}
```

### 6. Concurrent Download Test (`tests/k6/scripts/concurrent-download.js`)

```javascript
import { check } from 'k6';
import { uploadFile, downloadFile, releaseFile } from '../helpers/api.js';
import { randomBytes } from 'k6/crypto';
import { SharedArray } from 'k6/data';

// Setup: upload files first, then hammer downloads
export function setup() {
    const fileIds = [];
    // <!-- Red Team: Include 50MB for streaming/OOM validation — 2026-02-25 -->
    const sizes = [1024, 100000, 1000000, 5000000, 52428800]; // 1KB, 100KB, 1MB, 5MB, 50MB

    for (const size of sizes) {
        const res = uploadFile(randomBytes(size), `dl-test-${size}.bin`);
        if (res.status === 200) {
            fileIds.push(JSON.parse(res.body).fileId);
        }
    }
    return { fileIds };
}

// <!-- Red Team: Teardown cleanup — 2026-02-25 -->
export function teardown(data) {
    for (const fileId of data.fileIds) {
        releaseFile(fileId);
    }
}

export const options = {
    scenarios: {
        concurrent_downloads: {
            executor: 'constant-vus',
            vus: 100,
            duration: '5m',
        },
    },
    thresholds: {
        http_req_duration: ['p(95)<5000'],
        http_req_failed: ['rate<0.01'],
    },
};

export default function (data) {
    const fileId = data.fileIds[Math.floor(Math.random() * data.fileIds.length)];
    const res = downloadFile(fileId);

    check(res, {
        'download status 200': (r) => r.status === 200,
        'has content': (r) => r.body && r.body.length > 0,
    });
}
```

### 7. Dedup Throughput Test (`tests/k6/scripts/dedup-throughput.js`)

```javascript
import { check, sleep } from 'k6';
import { uploadFile } from '../helpers/api.js';
import { Counter, Trend } from 'k6/metrics';

const dedupHits = new Counter('dedup_hits');
const dedupMisses = new Counter('dedup_misses');
// <!-- Red Team: Dedup Contention Metrics — 2026-02-25 -->
const dedupLatency = new Trend('dedup_upload_latency_ms');

// Same content uploaded by all VUs — should dedup after first
const SHARED_CONTENT = open('../data/small-file.txt', 'b');

export const options = {
    scenarios: {
        dedup_contention: {
            executor: 'constant-vus',
            vus: 50,
            duration: '3m',
        },
    },
    thresholds: {
        http_req_failed: ['rate<0.01'],
        dedup_hits: ['count>100'],  // expect most to be dedup hits
        // <!-- Red Team: measure lock contention latency — 2026-02-25 -->
        dedup_upload_latency_ms: ['p(99)<2000'],  // p99 < 2s under contention
    },
};

export default function () {
    const res = uploadFile(SHARED_CONTENT, 'dedup-test.txt');
    dedupLatency.add(res.timings.duration);

    check(res, { 'upload ok': (r) => r.status === 200 });

    if (res.status === 200) {
        const body = JSON.parse(res.body);
        if (body.isDuplicate) dedupHits.add(1);
        else dedupMisses.add(1);
    }

    sleep(0.2);
}
```

### 8. Endpoint Baseline (`tests/k6/scripts/endpoint-baseline.js`)

```javascript
import { check, group, sleep } from 'k6';
import { uploadFile, downloadFile, getFileInfo, releaseFile, checkHealth }
    from '../helpers/api.js';
import { randomBytes } from 'k6/crypto';
import { Trend } from 'k6/metrics';

const healthLatency = new Trend('health_latency_ms');
const uploadLatency = new Trend('upload_latency_ms');
const downloadLatency = new Trend('download_latency_ms');
const infoLatency = new Trend('info_latency_ms');
const releaseLatency = new Trend('release_latency_ms');

export const options = {
    vus: 5,
    iterations: 50,
    thresholds: {
        health_latency_ms: ['p(95)<100'],
        upload_latency_ms: ['p(95)<3000'],
        download_latency_ms: ['p(95)<2000'],
        info_latency_ms: ['p(95)<500'],
        release_latency_ms: ['p(95)<500'],
    },
};

export default function () {
    group('health', () => {
        const r = checkHealth();
        healthLatency.add(r.timings.duration);
        check(r, { 'health 200': (r) => r.status === 200 });
    });

    group('upload-download-info-release', () => {
        const data = randomBytes(5000);
        const upRes = uploadFile(data, `baseline-${__ITER}.bin`);
        uploadLatency.add(upRes.timings.duration);
        check(upRes, { 'upload 200': (r) => r.status === 200 });
        if (upRes.status !== 200) return;

        const { fileId } = JSON.parse(upRes.body);

        const dlRes = downloadFile(fileId);
        downloadLatency.add(dlRes.timings.duration);
        check(dlRes, { 'download 200': (r) => r.status === 200 });

        const infoRes = getFileInfo(fileId);
        infoLatency.add(infoRes.timings.duration);
        check(infoRes, { 'info 200': (r) => r.status === 200 });

        const relRes = releaseFile(fileId);
        releaseLatency.add(relRes.timings.duration);
        check(relRes, { 'release 200': (r) => r.status === 200 });
    });

    sleep(1);
}
```

### 9. Test Data Generation

<!-- Red Team: Windows-Compatible Test Data Generation — 2026-02-25 -->
**PowerShell (Windows):**
```powershell
# 1KB text
Set-Content -Path tests/k6/data/small-file.txt -Value "k6 test file content"

# 5MB binary
$bytes = [byte[]]::new(5MB); (New-Object Random).NextBytes($bytes)
[IO.File]::WriteAllBytes("tests/k6/data/medium-file.bin", $bytes)

# 50MB binary
$bytes = [byte[]]::new(50MB); (New-Object Random).NextBytes($bytes)
[IO.File]::WriteAllBytes("tests/k6/data/large-file.bin", $bytes)
```

**Bash (WSL/Linux/macOS):**
```bash
echo "k6 test file content" > tests/k6/data/small-file.txt
dd if=/dev/urandom of=tests/k6/data/medium-file.bin bs=1M count=5 2>/dev/null
dd if=/dev/urandom of=tests/k6/data/large-file.bin bs=1M count=50 2>/dev/null
```

### 10. Run Script (`tests/k6/run-all.sh`)

```bash
#!/bin/bash
set -e

# <!-- Red Team: Path + Environment Guards — 2026-02-25 -->
cd "$(dirname "$0")"

BASE_URL=${BASE_URL:-"http://localhost:5000"}

# Guard: prevent accidentally targeting non-local environments
if [[ "$BASE_URL" != *"localhost"* && "$BASE_URL" != *"127.0.0.1"* && "$FORCE_NONLOCAL" != "true" ]]; then
    echo "ERROR: BASE_URL ($BASE_URL) is not localhost. Set FORCE_NONLOCAL=true to override."
    exit 1
fi

# API_KEY required — no fallback
if [ -z "$API_KEY" ]; then
    echo "ERROR: API_KEY env var required. Seed a test service first via add-service.sql"
    exit 1
fi

RESULTS_DIR="./results/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$RESULTS_DIR"

echo "=== Performance Tests ==="
echo "Target: $BASE_URL"

# 1. Endpoint baseline
echo "--- Endpoint Baseline ---"
k6 run -e BASE_URL=$BASE_URL -e API_KEY=$API_KEY \
    --summary-export="$RESULTS_DIR/baseline.json" \
    scripts/endpoint-baseline.js

# 2. Load test
echo "--- Load Test (42 uploads/min x 10min) ---"
k6 run -e BASE_URL=$BASE_URL -e API_KEY=$API_KEY \
    --summary-export="$RESULTS_DIR/load.json" \
    scripts/load-upload.js

# 3. Dedup throughput
echo "--- Dedup Throughput ---"
k6 run -e BASE_URL=$BASE_URL -e API_KEY=$API_KEY \
    --summary-export="$RESULTS_DIR/dedup.json" \
    scripts/dedup-throughput.js

# 4. Concurrent downloads
echo "--- Concurrent Downloads (100 VUs) ---"
k6 run -e BASE_URL=$BASE_URL -e API_KEY=$API_KEY \
    --summary-export="$RESULTS_DIR/downloads.json" \
    scripts/concurrent-download.js

# 5. Stress test
echo "--- Stress Test (ramp to 300 VUs) ---"
k6 run -e BASE_URL=$BASE_URL -e API_KEY=$API_KEY \
    --summary-export="$RESULTS_DIR/stress.json" \
    scripts/stress-upload.js

echo "=== Results saved to $RESULTS_DIR ==="
echo "Note: Soak test (30min) should be run separately:"
echo "  k6 run -e BASE_URL=$BASE_URL scripts/soak-test.js"
```

## Performance Targets

| Metric | Target | Critical |
|--------|--------|----------|
| Upload throughput | 42/min sustained | <20/min |
| Upload p95 latency | <3s (small files) | >10s |
| Download p95 latency | <2s (5MB files) | >10s |
| Info/Release p95 | <500ms | >2s |
| Health endpoint p95 | <100ms | >1s |
| Error rate (load) | <1% | >5% |
| Error rate (stress) | <10% | >25% |
| Memory growth (soak) | <50MB/hour | >200MB/hour |
| Dedup hit rate | >95% (same content) | <80% |

## Todo List
<!-- Red Team: Updated prerequisites — 2026-02-25 -->
- [ ] Install k6 locally (`choco install k6` or download binary)
- [ ] Seed test service via `scripts/utilities/add-service.sql` and note the raw API key
- [ ] Create test data files (1KB, 5MB, 50MB) — use PowerShell on Windows
- [ ] Implement shared config and API helpers (no API key fallback)
- [ ] Implement endpoint baseline test
- [ ] Implement load test (sustained 42/min)
- [ ] Implement stress test (ramp to 300 VUs, with auth failure counter)
- [ ] Implement soak test (30 min) + run `docker stats` in parallel terminal
- [ ] Implement concurrent download test (include 50MB, add teardown)
- [ ] Implement dedup throughput test (with contention latency metric)
- [ ] Run baseline against docker-compose environment
- [ ] Document results and bottlenecks

## Success Criteria
- All 6 test scripts run without errors
- Load test: 42 uploads/min sustained for 10 min with <1% error rate
- Stress test: identifies breaking point VU count
<!-- Red Team: Soak Memory Monitoring — 2026-02-25 -->
- Soak test: memory growth < 50MB/30min (measured via `docker stats`, not k6)
- Dedup: >95% hit rate under concurrent access
- Baseline latencies documented for all endpoints
- Results exported as JSON for future comparison

## Risk Assessment
| Risk | Mitigation |
|------|-----------|
| k6 not installed on CI/CD | Document installation; k6 Docker image as fallback |
| Test data too small to stress | Use randomBytes for realistic file sizes |
| External SQL/MinIO bottleneck looks like API issue | Monitor SQL/MinIO independently during tests |
| Stress test overwhelms dev SQL Server | Run stress tests during off-hours; warn DBA |

## Security Considerations
- Test API keys only — never use production credentials in k6 scripts
- Test data is random binary — no sensitive content
- Results files contain latency metrics only, no credentials

## Next Steps
→ After baseline established: tune Kestrel/EF/MinIO connection pool settings
→ Compare results after each optimization pass
→ Integrate k6 into CI pipeline (optional, as smoke test with lower thresholds)
