# MinIO/S3 Compression & Per-Service Policy Research Report

**Date:** 2026-04-07  
**Researcher:** Technical Analyst  
**Status:** Complete

---

## Executive Summary

MinIO **does not support per-bucket or per-service compression policies natively**. Compression is configured globally across all buckets. To implement per-service compression strategies, you must handle compression at the **client (application) layer**, not at the MinIO server. This research evaluated 5 sources across compression mechanisms, deduplication interaction, enterprise policy patterns, metrics tracking, and production migration risks.

**Recommendation:** Implement **client-side compression before PUT** with per-service policy stored in application database, combined with metadata tracking for analytics and migration support.

---

## 1. MinIO Server-Side vs Client-Side Compression

### MinIO Native Compression (Global Only)

**Capability:** MinIO AIStor supports **transparent compression** — objects compress on PUT, decompress on GET, invisible to clients.

**Configuration Scope:** **Global only**
- Single `compression` config block applied to all buckets
- No per-bucket, per-service, or per-tenant granularity
- File extension and MIME type filters applied globally

**Technical Implementation:**
- Compression happens on PUT before disk write
- Decompression happens on GET after disk read
- For files >8MB: MinIO creates internal index for byte-range queries, allowing fast retrieval of any byte without decompressing entire file
- Write throughput: ~500MB+/core; decompress throughput: ~1GB+/core (CPU-bound)

**What MinIO Excludes by Default:**
- Incompressible formats (video, audio, image files)
- Small files <4KB (overhead > benefit)
- Already-compressed files (.gz, .zip, .7z, etc.)

**Critical Limitation:** No Content-Encoding header control per-object; compression is a storage optimization, not a transport-layer feature.

### Client-Side Compression Alternative

**Why Required for Per-Service Policies:**
- Application controls compression before PUT
- Service-specific policy decisions stay in application code/config
- Allows gradual rollout, testing, per-tenant billing
- Simplifies migration and rollback (don't compress = don't send compressed bytes)

**Tradeoffs:**
| Aspect | Server-Side | Client-Side |
|--------|-------------|------------|
| **Operator Effort** | Low (config only) | Medium (app-level) |
| **Per-Service Control** | ❌ None | ✓ Full |
| **CPU Overhead** | On MinIO server | On uploader/downloader |
| **Byte-Range Queries** | ✓ Fast via index | Requires whole-file decompress |
| **Metadata Tracking** | Limited | ✓ Full control |
| **Rollback Complexity** | Re-upload all objects | Only decompress on read |
| **Existing File Handling** | Re-compress all | Keep as-is, mark uncompressed |

**Recommendation:** Client-side for per-service policies; use MinIO's transparent compression as *optional secondary layer* if CPU available on MinIO nodes.

---

## 2. Compression + Deduplication Interaction

### Hash Order Decision

**Current Design:** Hash before compression (on raw content)

**Why This Is Correct:**
1. **Deduplication fidelity:** Two services uploading identical files will deduplicate even if they choose different compression algorithms
2. **Cross-service dedup:** Service A uses gzip, Service B uses no compression → still deduplicate raw content
3. **Standard practice:** Dedup always operates on canonical (uncompressed) form to maximize hit rate

**Hash AFTER Compression (Antipattern):**
- ❌ Different services = different compressed representations = no dedup
- ❌ Same algorithm + level differences = no dedup (gzip level 1 vs level 9 produces different bytes)
- ❌ Compression tools vary slightly per version; dedup becomes fragile

### Impact on Dedup Ratio

**Expected Behavior:**
- Dedup ratio **unaffected** by compression algorithm choice per service
- Compression ratio **independent** per service
- Total storage saved = dedup savings + per-service compression savings (multiplicative, not conflicting)

**Example:**
```
100 identical files from Service A (uncompressed):  10GB raw
100 identical files from Service B (gzip):          2GB raw input → 0.5GB compressed
DeduplicatedMinIO:
  - One copy of 1GB block:     1GB (raw canonical)
  - Service A stores:          1GB (uncompressed)
  - Service B stores:          0.5GB (compressed)
  Total savings:               9GB (from dedup) + 1.5GB (from Service B compression) = 10.5GB saved
```

### Database Schema Changes Required

**Existing Model (Current):**
```sql
files: (file_id, service_id, sha256_hash, original_size, mime_type, created_at)
```

**Extended Model (With Compression):**
```sql
files: (
  file_id, 
  service_id, 
  sha256_hash,           -- hash of UNCOMPRESSED content (unchanged)
  original_size,         -- bytes of uncompressed data
  compressed_size,       -- NULL if uncompressed, bytes if compressed
  compression_algo,      -- 'none' | 'gzip' | 'brotli' | 'zstd'
  compression_level,     -- 1-9 for gzip, 1-11 for brotli
  is_compressed,         -- boolean flag for fast queries
  created_at
)
```

**Dedup Lookup:** Hash on raw content (sha256_hash), independent of compression_algo field.

**Queries:**
- "Find uncompressed files for Service X": `WHERE service_id = X AND compression_algo = 'none'`
- "Find all Service X files to re-compress": `WHERE service_id = X AND compression_algo != 'gzip'`
- "Calculate compression ratio for Service Y": `SELECT SUM(original_size), SUM(compressed_size) FROM files WHERE service_id = Y AND is_compressed = true`

---

## 3. Per-Service Compression Policies

### Configuration Pattern (Recommended)

**Policy Storage: Hybrid Approach**
1. **Default global policy** in config file / environment (what to do if service not in DB)
2. **Per-service overrides** in database ServiceEntity

**Policy Fields:**
```yaml
compression_policy:
  enabled: boolean              # Is compression active for this service?
  algorithm: string             # 'gzip' | 'brotli' | 'zstd' | 'none'
  level: integer                # 1 (fastest) to 9 (best ratio)
  skip_types: string[]          # MIME types to never compress (.zip, .mp4, etc.)
  skip_under_bytes: integer     # Don't compress files smaller than this
  max_upload_size_uncompressed: integer  # Don't compress files larger than this
  enabled_at: datetime          # When policy became active
  version: integer              # For audit/rollback tracking
```

**Default Policy (Config):**
```yaml
compression_policy:
  enabled: false                # Start conservative
  algorithm: gzip
  level: 6                       # Balance speed/ratio
  skip_types: ['.zip', '.gz', '.7z', '.mp4', '.mkv', '.jpg', '.png', '.webp']
  skip_under_bytes: 1024        # Don't compress tiny files
  max_upload_size_uncompressed: 5368709120  # 5GB cutoff (avoid huge CPU spike)
```

**Per-Service Override Example:**
```sql
-- Service "logs" compresses everything aggressive
INSERT INTO service_compression_policies VALUES (
  service_id=logs_service_id,
  enabled=true,
  algorithm='zstd',             -- Better ratio than gzip, fast decode
  level=3,                       -- Fast, assume logs are streamed
  skip_types='[]',
  skip_under_bytes=512,
  max_upload_size_uncompressed=NULL,  -- No limit
  version=1
);

-- Service "archive" disables compression (already compressed by client)
INSERT INTO service_compression_policies VALUES (
  service_id=archive_service_id,
  enabled=false,
  version=1
);
```

### Enterprise Pattern: Tiered by Service Criticality

Multi-tenant file systems often tier compression by service tier/cost:

| Service Tier | Compression | Algorithm | Level | Notes |
|-------------|-------------|-----------|-------|-------|
| **Free/Basic** | Aggressive | zstd | 8 | Cost optimization priority |
| **Professional** | Moderate | gzip | 6 | Balance CPU & storage |
| **Enterprise** | None/Optional | n/a | n/a | Performance priority, negotiated SLA |
| **Archive** | Disabled | n/a | n/a | Client owns compression |
| **Logs** | Aggressive | zstd | 3 | Fast compression + dedup |

### Application-Layer Policy Enforcement

**Pseudocode:**
```python
def should_compress(file_metadata, service_policy):
    if not service_policy.enabled:
        return False, 'none'
    
    mime_type = file_metadata.mime_type
    if mime_type in service_policy.skip_types:
        return False, 'none'
    
    size_bytes = file_metadata.size_bytes
    if size_bytes < service_policy.skip_under_bytes:
        return False, 'none'
    
    if service_policy.max_upload_size_uncompressed and \
       size_bytes > service_policy.max_upload_size_uncompressed:
        return False, 'none'
    
    return True, service_policy.algorithm

def upload_to_minio(file_data, service_id, sha256_hash):
    policy = get_service_policy(service_id)
    should_compress, algo = should_compress(file_data, policy)
    
    if should_compress:
        compressed_data = compress(file_data, algo, policy.level)
        minio_put(compressed_data, bucket=service_id)
        db_insert_file(sha256_hash, service_id, 
                      compressed_size=len(compressed_data),
                      compression_algo=algo)
    else:
        minio_put(file_data, bucket=service_id)
        db_insert_file(sha256_hash, service_id,
                      compressed_size=None,
                      compression_algo='none')
```

---

## 4. Compression Analytics & Reporting

### Metrics to Track

**Per-File Metrics:**
- `original_size` (bytes, uncompressed)
- `compressed_size` (bytes, after compression)
- `compression_ratio` = original_size / compressed_size (1.0 = no compression benefit)
- `time_to_compress` (milliseconds, for CPU overhead tracking)
- `compression_algo` (which algorithm was used)

**Aggregated Metrics:**
```sql
-- Per service
SELECT 
  service_id,
  COUNT(*) as file_count,
  SUM(original_size) as total_original_bytes,
  SUM(COALESCE(compressed_size, original_size)) as total_stored_bytes,
  (SUM(original_size) - SUM(COALESCE(compressed_size, original_size))) as bytes_saved,
  100.0 * (SUM(original_size) - SUM(COALESCE(compressed_size, original_size))) / SUM(original_size) as savings_percent
FROM files
WHERE is_compressed = true
GROUP BY service_id;

-- Per MIME type
SELECT 
  mime_type,
  COUNT(*) as file_count,
  AVG(original_size / COALESCE(compressed_size, original_size)) as avg_compression_ratio
FROM files
WHERE is_compressed = true
GROUP BY mime_type
ORDER BY avg_compression_ratio DESC;

-- Compression by algorithm effectiveness
SELECT 
  compression_algo,
  COUNT(*) as count,
  AVG(original_size / compressed_size) as avg_ratio,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY original_size / compressed_size) as median_ratio
FROM files
WHERE is_compressed = true
GROUP BY compression_algo;
```

### API Endpoint for Compression Stats

**New Endpoint:** `GET /api/v1/services/{service_id}/compression-stats`

```json
{
  "service_id": "logs",
  "compression_enabled": true,
  "policy": {
    "algorithm": "zstd",
    "level": 3
  },
  "statistics": {
    "total_files": 1250,
    "total_original_bytes": 125000000,
    "total_stored_bytes": 45000000,
    "bytes_saved": 80000000,
    "compression_ratio_avg": 2.78,
    "compression_ratio_median": 2.5,
    "compression_ratio_p95": 4.2,
    "files_compressed": 1200,
    "files_uncompressed": 50,
    "estimated_cpu_overhead_ms_per_upload": 150,
    "last_updated": "2026-04-07T12:00:00Z"
  },
  "by_mime_type": [
    {
      "mime_type": "application/json",
      "file_count": 800,
      "compression_ratio_avg": 3.5,
      "bytes_saved": 50000000
    },
    {
      "mime_type": "text/plain",
      "file_count": 400,
      "compression_ratio_avg": 2.2,
      "bytes_saved": 30000000
    }
  ]
}
```

### Dashboard Metrics Card (UI)

- **Compression Ratio:** Display efficiency (e.g., "2.8x compression")
- **Storage Saved:** Absolute bytes and percentage (e.g., "80 GB saved, 64%")
- **Compression Eligibility:** % of files that are compressible (e.g., "96% of files")
- **CPU Overhead Trend:** Graph of avg ms/upload over last 7 days (detect CPU bottleneck)

---

## 5. Production Considerations

### CPU Overhead Analysis

**Typical Compression Throughput:**
- **gzip (level 6):** 100-200 MB/sec on modern CPU
- **zstd (level 3):** 200-400 MB/sec on modern CPU
- **brotli (level 4):** 50-100 MB/sec on modern CPU

**Recommendation by Upload Path:**
- **Web uploads (user-facing):** Use fast algo (zstd-3) or no compression (UX impact)
- **Batch/batch API (backend):** Can afford zstd-8 or gzip-9 (background job)
- **Logs/metrics:** Use zstd-3 (high volume, fast dedup, minimal latency)

**CPU Cost Estimate:**
```
100MB file upload with zstd-3:
  - Compression time: 250ms
  - Total upload time: 500ms (compression) + 1000ms (network) = 1500ms
  - Overhead: +33% latency
```

### File Size Thresholds

**Recommended Compression Decision:**
```
if file_size < 1 KB:        skip (overhead > benefit)
if file_size < 100 KB:      compress at low level
if file_size 100KB - 5GB:   compress normally
if file_size > 5GB:         skip or compress at level 1 (avoid CPU spike)
```

### Handling Corrupted Compressed Data

**Detection Strategies:**
1. **On GET:** Decompress with try-catch; if decompression fails, return 500 + alert
2. **On Read-Back Validation:** After compression, immediately decompress to verify integrity
3. **Checksum in Metadata:** Store SHA256 of compressed bytes; verify on GET

**Recovery Plan:**
```
IF decompress_fails(compressed_data):
  1. Log error with file_id, service_id, compression_algo
  2. Check if original uncompressed data still exists (dual-write)
  3. IF exists:  return uncompressed, mark file as "corrupted_compressed"
  4. IF not:    return 500 Service Unavailable, alert SRE
  5. SRE re-uploads uncompressed file; update DB is_compressed=false
```

**Prevention:**
- **Dual-write phase:** Upload uncompressed + compressed in parallel, keep uncompressed as fallback for 30 days
- **Post-compress validation:** Decompress immediately after PUT to verify integrity before committing
- **Verify on read:** Spot-check random files weekly; decompress to ensure integrity

### Migration Strategy (Existing Uncompressed Files)

**Phase 1: Enable Compression Policy (No Retrofit)**
- Time: Week 1
- Action: Update ServiceEntity compression_policy in database
- Scope: NEW files only, existing files unchanged
- DB Impact: Mark existing files with compression_algo='none'

**Phase 2: Background Recompression (Optional, Deferred)**
- Time: Weeks 2-4 (off-peak hours)
- Process: Async job that finds all uncompressed files in service
- For each file:
  1. GET from MinIO
  2. Compress locally
  3. PUT compressed version to MinIO under temp key
  4. Verify decompression success
  5. Swap: delete old, rename temp → original
  6. Update DB: compressed_size, compression_algo, is_compressed=true
- Safety: Run in batches of 100, verify each, abort on N failures
- Rollback: Keep uncompressed versions in MinIO for 72 hours before cleanup

**Phase 3: Cleanup**
- Time: Week 5+
- Action: Delete uncompressed versions from MinIO

**Risk Mitigation:**
- Start with single test service (logs)
- Monitor decompression success rate; if <99%, pause migration
- Maintain read-only copy of uncompressed data for 7 days
- Track file_id + original_size for audit; validate total bytes match

### Rollback Strategy

**Quick Rollback (If Compression Causes Issues):**
1. Set `compression_policy.enabled = false` in ServiceEntity
2. NEW uploads → uncompressed
3. EXISTING compressed files → can still decompress on GET (transparent)
4. Cost: Storage bloat until background recompression scheduled

**Full Rollback (Decompress All Files):**
1. Disable policy
2. Schedule bulk GET + decompress + PUT-uncompressed job
3. Verify 100% success before deleting compressed versions
4. Estimated time: For 10TB service, 4-8 hours depending on CPU available

**Scenario Runbook:**
- If decompress errors rise above 0.1%: Pause new uploads, alert SRE
- If API latency increases >200ms: Roll back compression for that service
- If compression_ratio degrades suddenly: Audit policy changes; verify no accidental enable on already-compressed formats

---

## Technology Assessment

### Compression Algorithms Ranked by Use Case

| Algorithm | Speed (MB/s) | Ratio | Recommendation | Caveat |
|-----------|---------|-------|-----------------|---------|
| **zstd-3** | 300+ | 2.5x | Logs, metrics, batch uploads | Less common than gzip |
| **gzip-6** | 150 | 2.8x | General purpose, web uploads | Standard, widely supported |
| **brotli-4** | 80 | 3.0x | Web assets (CSS/JS) | Slower compression, rare in object storage |
| **none** | ∞ | 1.0x | Already-compressed, streaming, performance-critical | Baseline |

**FIS Recommendation:** Default to **gzip-6** for compatibility; use **zstd-3** for logs/metrics (speed + ratio).

---

## Source Credibility Assessment

| Source | Credibility | Type | Key Finding |
|--------|-------------|------|-------------|
| **MinIO Official Docs** | ★★★★★ | Authoritative | Compression is global-only; no per-bucket policy |
| **MinIO Blog** | ★★★★ | Company-authored | Byte-range indexing for large compressed files |
| **AWS Re:Post / Storage Blog** | ★★★★★ | AWS official | S3 dedup patterns; hash before compression |
| **Red Hat ODF Docs** | ★★★★ | Enterprise OSS | Compression metrics collection standards |
| **Migration Rollback Blogs** | ★★★ | Consulting/DevOps | Rollback patterns; validated by case studies |

---

## Adoption Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| **Per-bucket policy unavailable in MinIO** | Certain | High | Use client-side compression, accept app complexity |
| **Corrupted compressed data on rare upgrade** | Low | Critical | Implement dual-write + decompression validation |
| **High CPU during backfill recompression** | Medium | Medium | Run off-peak; batch size tuning; monitor load |
| **Dedup effectiveness reduced if compressed before hash** | Not applicable | — | Hash BEFORE compression; confirmed best practice |
| **API client breaking on new compression_algo field** | Low | Medium | Backward-compatible: default to 'none'; version API |

---

## Recommendation

### Immediate (Weeks 1-2)
1. ✅ Implement client-side compression **before PUT** to MinIO
2. ✅ Extend `files` schema: add `compressed_size`, `compression_algo`, `is_compressed`
3. ✅ Define per-service policy config (database ServiceEntity extension)
4. ✅ Start with **default-disabled** policy; require explicit opt-in per service

### Short-term (Weeks 3-6)
5. ✅ Pilot compression on "logs" service only (high volume, low risk)
6. ✅ Implement compression stats API endpoint
7. ✅ Add decompression validation on GET (try-catch + fallback)
8. ✅ Monitor: CPU overhead, compression ratio, error rate

### Medium-term (Weeks 7-12)
9. ✅ Roll out to "metrics" service (if logs pilot succeeds)
10. ✅ Optional: Implement background recompression for existing uncompressed files
11. ✅ Add dashboard cards for compression efficiency
12. ✅ Document rollback procedures; test rollback for each service

### Do NOT
- ❌ Rely on MinIO's transparent compression for per-service control (not available)
- ❌ Hash compressed content (breaks cross-service dedup)
- ❌ Enable aggressive compression by default on unknown MIME types
- ❌ Skip decompression validation in production

---

## Unresolved Questions

1. **Zstd vs Gzip:** Which algorithm should be FIS default if gzip is standard? (Recommend gzip for now, consider zstd after pilot stabilizes.)
2. **Dual-write window:** How long to keep uncompressed fallback during rollout? (Suggest 30 days for batch workloads, 7 days for production.)
3. **Billing model:** Should compressed file storage be billed at compressed_size or original_size? (Recommend original_size for predictability.)
4. **Large file threshold:** Is 5GB the right cutoff for skipping compression? (Depends on available CPU; test with 1GB pilot first.)
5. **API backward compatibility:** Should GET return `X-Compression-Algo` header to clients? (Recommend yes, for debugging; update OpenAPI spec.)

---

## References

- [MinIO Transparent Data Compression](https://blog.min.io/transparent-data-compression/)
- [MinIO AIStor Data Compression Docs](https://docs.min.io/enterprise/aistor-object-store/administration/objects-and-versioning/data-compression/)
- [Deduplication vs Compression: Data Storage Optimization Myths](https://blog.min.io/myths-about-deduplication-and-compression/)
- [AWS Design Patterns for Multi-Tenant Access Control on S3](https://aws.amazon.com/blogs/storage/design-patterns-for-multi-tenant-access-control-on-amazon-s3/)
- [Object Data Migration Best Practices](https://www.komprise.com/glossary_terms/object-data-migration/)
- [RedHat OpenShift Data Foundation Monitoring Metrics](https://docs.redhat.com/en/documentation/red_hat_openshift_data_foundation/4.10/html/monitoring_openshift_data_foundation/metrics)
- [AWS Migration Rollback Strategies](https://aws.amazon.com/blogs/migration-and-modernization/migration-rollback-strategies-when-your-migration-doesnt-go-as-planned/)
- [Multi-Tenant Architecture Patterns](https://bix-tech.com/multi-tenant-architecture-the-complete-guide-for-modern-saas-and-analytics-platforms-2/)
