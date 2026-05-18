# Security Adversary Review — Phase 09: Performance & Stress Testing

**Reviewer:** code-reviewer (security adversary mode)
**Date:** 2026-02-25
**Target:** `plans/260225-1408-central-file-management-service/phase-09-performance-testing.md`
**Scope:** k6 performance/stress test plan for .NET 8 file management service

---

## Finding 1: Hardcoded Fallback API Key Committed to Repository

- **Severity:** Critical
- **Location:** Phase 9, section "1. Shared Config (`tests/k6/config/options.js`)"
- **Flaw:** The fallback value `'test-api-key'` is baked into `options.js` as a JavaScript string literal. Because this file is committed to the repository alongside the service code, any developer, CI runner, or attacker with read access to the repo has a working credential against any environment that was provisioned using the seed data or where an operator typed this string as a real key. Previous red-team findings (Phases 1-8) confirmed the seed API key hash is SHA-256 of an empty string and that no key rotation or expiry mechanism exists.
- **Failure scenario:** A developer runs `k6 run scripts/load-upload.js` against a staging or production URL (easy to do by accident if `BASE_URL` is overridden but `API_KEY` is not). The hardcoded `'test-api-key'` credential is accepted, the attacker uploads arbitrary binaries at 42 req/min sustained, and the service has no per-service quota or rate limit to stop it.
- **Evidence:** `export const API_KEY = __ENV.API_KEY || 'test-api-key';`
- **Suggested fix:** Remove the fallback entirely. Fail fast if `API_KEY` env var is absent: `if (!__ENV.API_KEY) { throw new Error('API_KEY env var required'); }`. Never store a credential literal in source, even a "test" one.

---

## Finding 2: Internal Infrastructure IPs Exposed in Committed Plan

- **Severity:** High
- **Location:** Phase 9, section "Architecture — Test Environment Topology"
- **Flaw:** The topology diagram commits two internal IP addresses — `10.14.142.30` (SQL Server) and `10.14.142.32` (MinIO) — directly into the plan file, which lives in the git repository. These are not placeholder values; they are formatted as real RFC-1918 addresses with specific octets that suggest a real network segment.
- **Failure scenario:** A supply-chain or insider threat actor reads the repository (including its full git history), learns the exact SQL Server and MinIO host IPs, and uses that topology to plan lateral movement after gaining any foothold on the same network. This is reconnaissance gift-wrapped. Combined with the known MinIO default credentials (`minioadmin/minioadmin` found in prior phases) and the SA password in `appsettings.json`, an attacker has host, port, and credential for both datastores without touching the API.
- **Evidence:** `│ SQL Server  │  MinIO    │` / `│ 10.14.142.30│ 10.14.142.32│`
- **Suggested fix:** Replace with symbolic names (`sql-server-host`, `minio-host`) or environment variable references. Remove exact IPs from all committed documentation and plan files. Rotate those IPs or place them behind a service mesh if the repo is not fully private.

---

## Finding 3: Test Data Files Committed as Static Blobs Enable Dedup Oracle Attack

- **Severity:** High
- **Location:** Phase 9, sections "Test Data Generation" and "7. Dedup Throughput Test (`tests/k6/scripts/dedup-throughput.js`)"
- **Flaw:** `small-file.txt` is committed to the repository with fixed content (`"k6 test file content"`). The dedup test opens this file with `open('../data/small-file.txt', 'b')` and uploads it repeatedly. Because the service performs SHA-256 content-addressed dedup, any party who knows this fixed content can probe the production or staging service to determine whether that exact byte sequence already exists in storage — a dedup oracle. More critically, the plan does not specify that test-generated files are cleaned up after each run. After 50 VUs run for 3 minutes each, hundreds of identical `dedup-test.txt` file records accumulate in SQL Server with no teardown step.
- **Failure scenario:** (a) Dedup oracle: attacker uploads `small-file.txt` to the production endpoint, receives `isDuplicate: true`, confirms the service holds that content, and uses it as a timing/existence side-channel for sensitive files. (b) Data accumulation: after repeated CI runs, the `files` table and MinIO accumulate unbounded test artifacts that are never released, eroding storage quotas and masking real usage metrics. Prior red-team work confirmed no per-service storage quota exists, so this is unbounded.
- **Evidence:** `const SHARED_CONTENT = open('../data/small-file.txt', 'b');` with no teardown function defined in the test.
- **Suggested fix:** (a) Use `randomBytes` for dedup test content generated at runtime; do not commit predictable content. (b) Add a k6 `teardown()` function to each script that calls the delete/release endpoint for all uploaded file IDs collected during the run.

---

## Finding 4: Stress Test Explicitly Accepts HTTP 503 as a Pass Condition, Masking Auth Failures

- **Severity:** High
- **Location:** Phase 9, section "4. Stress Test: Ramp to Breaking Point (`tests/k6/scripts/stress-upload.js`)"
- **Flaw:** The stress test check is: `'status is 200 or 503': (r) => r.status === 200 || r.status === 503`. This check passes for any 5xx or the specific 503, but it also silently passes through auth failures (401, 403) and server errors (500, 502, 504) because those are not in the accepted set yet the threshold only measures `http_req_failed` — which in k6 defaults to network-level failures, not HTTP status codes. A 401 or 403 is not counted as a failed request by k6's built-in metric. The test will show 0% error rate while every single request is being rejected by the auth layer.
- **Failure scenario:** A developer accidentally points the stress test at a staging environment with a different API key configuration. Every request returns 401. The k6 run completes, thresholds pass (error rate <10%, p95 <10s all met because 401s are fast), and the report is filed as "stress test passed." Nobody notices the service was never actually under load — the bottleneck was never found, and the performance baseline is fabricated.
- **Evidence:** `check(res, { 'status is 200 or 503': (r) => r.status === 200 || r.status === 503 });` with `thresholds: { http_req_failed: ['rate<0.10'] }` and no explicit check on non-2xx/5xx codes.
- **Suggested fix:** Add an explicit check that counts 4xx as failures: define a custom Counter for `auth_failures` and increment it on 401/403. Add a threshold: `auth_failures: ['count<5']`. Alternatively use k6's `http_req_failed` correctly by setting `setResponseCallback(http.expectedStatuses(200, 503))` to mark everything else as failed.

---

## Finding 5: `run-all.sh` Leaks API Key Into Process Table and Shell History

- **Severity:** High
- **Location:** Phase 9, section "10. Run Script (`tests/k6/run-all.sh`)"
- **Flaw:** The script passes `API_KEY` as a command-line argument: `k6 run -e BASE_URL=$BASE_URL -e API_KEY=$API_KEY`. On any Unix system (Linux CI runners, shared dev machines), process arguments are visible to all users via `ps aux`. On Windows CI runners with shared agents, the same applies via Task Manager or WMI. The API key is also written to shell history if the operator manually sets it in the same terminal session.
- **Failure scenario:** On a shared CI agent (common in self-hosted GitHub Actions or Jenkins), another pipeline's job runs `ps aux` or reads `/proc/<pid>/cmdline` at the moment the k6 process starts. The API_KEY value is captured, and the attacker now has a valid credential for the target environment — especially dangerous if the CI runner can reach the staging or production endpoint directly.
- **Evidence:** `k6 run -e BASE_URL=$BASE_URL -e API_KEY=$API_KEY \` repeated five times in `run-all.sh`.
- **Suggested fix:** Pass secrets via a k6 config file or environment variable set in the CI secret store (not on the command line). Use `export API_KEY=...` in a sourced `.env` file that is not committed, or use k6's `--env-file` flag pointing to a secrets file excluded from git. Never pass credentials as positional CLI arguments.

---

## Finding 6: No Isolation Between Test Runs and Production/Staging Data

- **Severity:** High
- **Location:** Phase 9, section "Overview" and "Security Considerations"
- **Flaw:** The plan states tests "can also target staging environment" and the only security consideration is "Test API keys only — never use production credentials." There is no mechanism enforced by the plan to prevent a test from running against the wrong environment. The `run-all.sh` script defaults to `http://localhost:5000` only as long as `BASE_URL` is unset — one accidental export in the shell or CI environment variable override, and the stress test (300 VUs, randomBytes uploads) hammers staging or production. Furthermore, since no tenant isolation exists (confirmed in prior red-team phases), the uploaded test artifacts in any environment are accessible to all service consumers, not just the test runner.
- **Failure scenario:** CI pipeline for the performance gate is misconfigured with `BASE_URL=https://staging.internal`. The stress test ramps to 300 VUs uploading 1KB-50KB files each. With no per-service quota, staging's MinIO fills up. Real services reading from staging receive latency spikes or timeouts. Meanwhile, `concurrent-download.js` exposes the 4 pre-uploaded test file GUIDs to any authenticated service that queries file metadata — no tenant scope filter means any other service can download those files.
- **Evidence:** `BASE_URL=${BASE_URL:-"http://localhost:5000"}` with no environment guard or confirmation prompt. Security Considerations section says "never use production credentials" but provides no technical control to enforce this.
- **Suggested fix:** Add an explicit environment guard at the top of `run-all.sh`: reject execution if `BASE_URL` contains known staging/production domain patterns unless a `--force-non-local` flag is passed. Require a `TEST_ENVIRONMENT=local` env var to be explicitly set. Add a teardown step that deletes all test-created files by service ID after each run.

---

## Finding 7: `concurrent-download.js` setup() Creates Persistent Test Files With No Teardown

- **Severity:** Medium
- **Location:** Phase 9, section "6. Concurrent Download Test (`tests/k6/scripts/concurrent-download.js`)"
- **Flaw:** The `setup()` function uploads 4 files (1KB, 100KB, 1MB, 5MB) and returns their GUIDs. There is no `teardown()` function defined. k6 will call `setup()` once per test run; on repeated CI runs this creates 4 new persistent file records each time, and the GUIDs are only held in memory for that run — subsequent runs cannot even clean up previous runs' files. The 5MB file in particular is stored in MinIO and counted against any storage quota.
- **Failure scenario:** After 100 CI runs, 400 file records exist in SQL Server (100 × 4) and 400MB of data sits in MinIO from concurrent-download alone. With no storage quota and no cleanup, this compounds with every other test script's artifacts. An attacker monitoring metadata endpoints can enumerate all files uploaded with the test service's API key and infer test cadence, environment topology, and operational patterns from timestamps.
- **Evidence:** `export function setup() { ... fileIds.push(JSON.parse(res.body).fileId); ... return { fileIds }; }` with no corresponding `export function teardown(data) { ... }` block.
- **Suggested fix:** Add a `teardown(data)` function that calls `releaseFile(fileId)` for each entry in `data.fileIds`. Apply the same pattern to all scripts that upload in `setup()`.

---

## Unresolved Questions

1. Does the test API key used in k6 scripts correspond to a real registered service in the database seed, or is it expected to be provisioned separately per environment? If the former, rotating it requires a DB migration, not just an env var change.
2. Are k6 result JSON files (`$RESULTS_DIR/*.json`) included in `.gitignore`? If not, latency profiles and endpoint maps accumulate in the repository and are committed.
3. The plan references running against `10.14.142.30` (SQL Server) directly — does k6 need network-level access to that host, or does it only reach the API? If the topology shows the k6 runner has direct DB visibility, that is a separate network segmentation finding.
4. Is there a CI step that validates `BASE_URL` is not a production endpoint before executing the stress test? If not, who is responsible for preventing accidental production targeting?
