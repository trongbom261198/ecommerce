# Assumption Destroyer Review: Central File Management Service Plan

**Reviewer:** code-reviewer
**Date:** 2026-02-25
**Scope:** All 8 phases of `260225-1408-central-file-management-service` plan

---

## Finding 1: Upload Atomicity Is Broken -- MinIO Upload Succeeds but Confirm Fails Leaves Ghost Data

- **Severity:** Critical
- **Location:** Phase 3, section "FileService (Core Orchestrator)", step 6; Phase 4, section "AuditService"
- **Flaw:** The upload flow performs 4 sequential operations without a transaction: (1) CreateAsync (Pending), (2) UploadAsync to MinIO, (3) UpdateStatusAsync to Confirmed, (4) CreateReferenceAsync. If the process crashes or the DB connection drops between step 2 (MinIO upload succeeds) and step 3 (status update), the file exists in MinIO as a real object but the DB record stays `Pending`. The cleanup worker will then DELETE this valid file from MinIO after 15 minutes -- a data loss scenario. The plan calls this the "outbox pattern" but it is not a real outbox: there is no transactional outbox table, no message broker, and no idempotent replay mechanism.
- **Failure scenario:** Service A uploads a 90MB file. MinIO PutObject completes successfully after 45 seconds. Network flap causes the subsequent `UpdateStatusAsync` SQL call to fail. File stays `Pending`. Cleanup worker runs, sees a stale Pending record (>15 min old), deletes the MinIO object, deletes the DB record. Service A's user gets a success response (the upload controller already returned before confirm, or the request times out and retries, creating a second pending record). Either way, the file is gone.
- **Evidence:** Phase 3 pseudocode: `await _storage.UploadAsync(...); await _repo.UpdateStatusAsync(entity.FileId, entity.CreatedAt, "Confirmed", ct); await _repo.CreateReferenceAsync(...)` -- three non-atomic steps. No retry or compensation logic for the confirm step. No mention of what happens if confirm fails.
- **Suggested fix:** Wrap the Confirm + CreateReference in a DB transaction. Add retry with Polly specifically for the confirm step (it is idempotent). If confirm still fails after retries, log a critical alert and do NOT return success to the caller. Consider adding a `LastModifiedAt` column to detect stale-but-recently-uploaded files before cleanup deletes them.

---

## Finding 2: DownloadAsync Loads Entire File Into MemoryStream -- OOM on Large Files

- **Severity:** Critical
- **Location:** Phase 4, section "MinioStorageProvider", method `DownloadAsync`
- **Flaw:** The `DownloadAsync` implementation copies the entire MinIO object into a `MemoryStream` before returning it. For 100MB files (the documented max), this allocates 100MB on the managed heap per concurrent download. With even 20 concurrent downloads, that is 2GB of heap allocation just for response buffering. The plan acknowledges this in a note -- "For large files, use the streaming endpoint in the controller (Phase 05) that pipes MinIO stream directly to HTTP response" -- but both the regular download (`GET /api/files/{fileId}`) and the stream download (`GET /api/files/{fileId}/stream`) use the same `_fileService.DownloadAsync` which returns the MemoryStream. There is no separate streaming path implemented.
- **Evidence:** Phase 4 code: `var ms = new MemoryStream(); await _client.GetObjectAsync(... stream => stream.CopyTo(ms) ...); ms.Position = 0; return ms;`. Phase 5 controller: both `Download` and `StreamDownload` call `_fileService.DownloadAsync` which returns this MemoryStream.
- **Suggested fix:** Change `DownloadAsync` to return a pipe-through stream or use MinIO SDK's `GetObjectAsync` overload that returns a `Stream` directly. The controller should pipe this stream to the HTTP response without buffering. Alternatively, implement a separate `DownloadStreamAsync` that does not buffer.

---

## Finding 3: Dedup Lookup Across Partitions is a Full Scan

- **Severity:** High
- **Location:** Phase 2, section "Stored Procedures", `usp_FindDuplicateFile`; Phase 2, index design
- **Flaw:** The dedup stored procedure queries `Files WHERE ContentHash = @hash AND CreatedByServiceId = @serviceId AND Status = 'Confirmed' ORDER BY CreatedAt DESC`. The index `IX_Files_ContentHash_ServiceId` is partition-aligned: `(ContentHash, CreatedByServiceId, CreatedAt) ON ps_Monthly(CreatedAt)`. Because the query does not filter on `CreatedAt`, SQL Server must scan ALL partitions to find a matching hash. With 14+ partitions and growing, this becomes progressively slower. After 2 years, every upload will trigger a 24+ partition fan-out seek.
- **Evidence:** Phase 2, stored procedure: `SELECT TOP 1 ... FROM dbo.Files WHERE ContentHash = @ContentHash AND CreatedByServiceId = @ServiceId AND Status = 'Confirmed' ORDER BY CreatedAt DESC` -- no CreatedAt filter. Index is partition-aligned, meaning each partition has its own B-tree. Query plan will be a merge of seeks across all partitions.
- **Suggested fix:** Either (a) add a non-aligned index on `(ContentHash, CreatedByServiceId)` that spans all partitions (trades insert perf for read perf), or (b) use the Redis dedup cache as primary lookup and only fall through to SQL on cache miss with a bounded CreatedAt range (e.g., last 6 months), or (c) maintain a separate small `DedupHashes` table that is NOT partitioned.

---

## Finding 4: API Key Stored and Compared as Plaintext -- No Hashing

- **Severity:** High
- **Location:** Phase 2, section "Seed Data"; Phase 4, section "FileRepository"; Phase 5, section "ApiKeyAuthMiddleware"
- **Flaw:** The brainstorm document says API keys are "Hashed, ASCII only" (varchar(128) column, "SHA-256 or HMAC hash = 64-128 hex"). But the seed data inserts a literal SHA-256 hash as the ApiKey value, and the auth middleware does `GetServiceByApiKeyAsync(apiKey)` which does a direct comparison: `FirstOrDefaultAsync(s => s.ApiKey == apiKey && s.IsActive)`. This means the client must send the PRE-HASHED value as the API key, which defeats the purpose of hashing (the hash IS the secret). Nowhere in the plan does the middleware hash the incoming key before comparison.
- **Evidence:** Phase 2 seed: `ApiKey = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'` (this is SHA-256 of empty string, not of 'changeme-default-api-key' as the comment claims). Phase 5 middleware: `repo.GetServiceByApiKeyAsync(apiKey!)` -- raw comparison. The comment says "Pre-hashed API key" but the lookup is direct equality.
- **Suggested fix:** Decide on one approach: (a) store keys hashed, hash incoming key before lookup (typical for API key auth), or (b) store keys in plaintext if this is internal-only and you accept the risk. Currently the plan contradicts itself. Also fix the seed data -- SHA-256 of empty string is not the hash of 'changeme-default-api-key'.

---

## Finding 5: Integration Tests Have No MinIO -- Half the System Is Untested

- **Severity:** High
- **Location:** Phase 8, section "CustomWebApplicationFactory" and "Risk Assessment"
- **Flaw:** The integration test setup uses Testcontainers for SQL Server and Redis but has no MinIO container. The risk assessment acknowledges: "MinIO not in Testcontainers (no official image) -- Use MinIO Docker image directly or mock IStorageProvider in integration tests." But the full-cycle test (`Upload_Download_Release`) requires MinIO to actually store and retrieve bytes. If `IStorageProvider` is mocked, the test does not verify: (a) actual MinIO upload/download, (b) object key format correctness, (c) bucket auto-creation, (d) cleanup actually deleting from MinIO. The plan does not specify which approach to take, leaving a gap.
- **Evidence:** Phase 8 `CustomWebApplicationFactory`: only `MsSqlContainer` and `RedisContainer` are created. No MinIO container. Comment: "MinIO not in Testcontainers (no official image)". But MinIO has a well-known Docker image `minio/minio` that works perfectly with Testcontainers' generic container support.
- **Suggested fix:** Add a generic Testcontainers definition: `new ContainerBuilder().WithImage("minio/minio").WithCommand("server", "/data").WithPortBinding(9000, true).Build()`. MinIO's Docker image is stable and widely used in CI. Wire it into the test factory.

---

## Finding 6: No Partition Maintenance Automation -- Manual Monthly Script Will Be Forgotten

- **Severity:** High
- **Location:** Phase 2, section "Maintenance: Monthly Partition Extension"; Phase 7 (Docker/Deployment)
- **Flaw:** The partition function starts with boundaries from March 2026 to March 2027 (13 months). The maintenance script `monthly-extend-partitions.sql` must be run manually each month to add the next boundary. There is no SQL Server Agent job, no scheduled task, no background service, and no mention of how this gets automated in production. If nobody runs this script, inserts after March 2027 will go into the overflow partition, degrading query performance and making future partition operations harder. The cleanup worker (Phase 6) does not include partition extension.
- **Evidence:** Phase 2: "Run monthly: adds next month's boundary to partition function" -- manual script. Phase 6 (CleanupWorker) runs 4 cleanup tasks but does NOT extend partitions. Phase 7 (Docker/Deployment) has no cron, no Agent job, no automation.
- **Suggested fix:** Either (a) add a 5th task to CleanupWorker that extends partitions (monthly check, e.g., if current month boundary is within 2 months of max boundary, extend), or (b) create a SQL Server Agent job as part of Phase 2 deployment, or (c) add a Kubernetes CronJob / Windows Task Scheduler entry in Phase 7.

---

## Finding 7: Redis Is Single Point of Failure for Uploads -- No Graceful Degradation

- **Severity:** High
- **Location:** Phase 3, section "FileService (Core Orchestrator)"; Phase 4, Risk Assessment
- **Flaw:** Every upload requires a Redis lock: `await _redis.AcquireLockAsync(lockKey, ...) ?? throw new TimeoutException("Dedup lock timeout")`. If Redis is down, every upload throws TimeoutException, which the global exception handler converts to HTTP 503. The entire upload path is blocked. The risk assessment for Phase 4 says "Graceful degradation (skip lock, log warning)" but the actual code throws, and no fallback path is implemented. For an internal file service handling 60K files/day, Redis downtime means total upload outage.
- **Evidence:** Phase 3 FileService: `?? throw new TimeoutException("Dedup lock timeout")`. Phase 4 risk: "Redis single point of failure | Graceful degradation (skip lock, log warning)" -- contradicted by the code that throws.
- **Suggested fix:** Implement actual graceful degradation: if Redis is unavailable, skip the dedup lock and proceed with upload (accepting potential duplicate storage). Add a circuit breaker around Redis calls. Log a warning. The worst case without dedup is wasted storage, which is recoverable; the worst case with no uploads is a full outage.

---

## Finding 8: CleanupService Deletes Files Without Verifying Active Downloads

- **Severity:** Medium
- **Location:** Phase 6, section "CleanupService Implementation", methods `CleanOrphanFilesAsync` and `CleanExpiredTempAsync`
- **Flaw:** The orphan cleanup and temp cleanup methods query files from the DB, then delete them from MinIO one by one. There is no check whether any of these files are currently being downloaded by an active HTTP request. If a user begins downloading a file (which streams from MinIO), and the cleanup worker simultaneously deletes that object from MinIO, the download will fail mid-stream with a broken pipe or incomplete response.
- **Evidence:** Phase 6 code: `foreach (var file in orphans) { await _storage.DeleteAsync(...); await _repo.UpdateStatusAsync(...); }` -- no concurrency guard. Phase 4 DownloadAsync streams from MinIO in real time.
- **Suggested fix:** Add a "last accessed" timestamp or use a short-lived lease/lock before deletion. Alternatively, accept this as an edge case given the 7-day grace period for orphans (unlikely anyone is downloading a file with 0 references that is 7+ days old). For temp files the risk is higher since ExpiresAt could be hit while actively in use -- consider extending expiry on download.

---

## Finding 9: Dockerfile HEALTHCHECK Uses `curl` but ASP.NET Runtime Image Has No `curl`

- **Severity:** Medium
- **Location:** Phase 7, section "Dockerfile"
- **Flaw:** The Dockerfile uses `mcr.microsoft.com/dotnet/aspnet:8.0` as the runtime image and specifies `HEALTHCHECK CMD curl -f http://localhost:8080/health || exit 1`. The `aspnet:8.0` image is based on Debian slim and does NOT include `curl` by default. The health check will fail on every check, causing Docker/orchestrators to mark the container as unhealthy and potentially restart it in a loop.
- **Evidence:** Phase 7 Dockerfile: `FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime` followed by `HEALTHCHECK ... CMD curl -f http://localhost:8080/health || exit 1`.
- **Suggested fix:** Either (a) install curl in the runtime stage: `RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*`, or (b) use `wget` which is sometimes available, or (c) write a small .NET health check tool that ships with the app, or (d) remove the Dockerfile HEALTHCHECK and rely on orchestrator-level probes (Kubernetes, Docker Compose).

---

## Finding 10: Orphan File Query Uses CreatedAt as Grace Period Instead of Last-Reference-Released Date

- **Severity:** Medium
- **Location:** Phase 2, stored procedure `usp_GetOrphanFiles`; Phase 6, `CleanOrphanFilesAsync`
- **Flaw:** The orphan detection query is: `f.CreatedAt < DATEADD(DAY, -@GraceDays, SYSUTCDATETIME())` -- it uses the file's CREATION date, not the date when the last reference was released. A file created 8 days ago whose last reference was released 5 minutes ago will be immediately eligible for orphan cleanup (it passes the 7-day grace on CreatedAt). The grace period should protect against premature deletion AFTER the file becomes orphaned, not after it was created.
- **Evidence:** Phase 2 stored proc: `AND f.CreatedAt < DATEADD(DAY, -@GraceDays, SYSUTCDATETIME())`. The brainstorm says "7-day grace" for orphan cleanup, implying grace after becoming orphaned. But the query checks creation time.
- **Suggested fix:** Change the grace period to check the latest `ReleasedAt` from `FileReferences`: `AND NOT EXISTS (SELECT 1 FROM FileReferences r WHERE r.FileId = f.FileId AND (r.IsActive = 1 OR r.ReleasedAt > DATEADD(DAY, -@GraceDays, SYSUTCDATETIME())))`. Or add a `BecameOrphanAt` column to Files and set it when the last active reference is released.

---

## Unresolved Questions

1. The brainstorm mentions "RedLock with auto-extend" for the dedup lock, but the implementation uses simple StackExchange.Redis `LockTake`/`LockRelease` (single instance). If Redis is ever clustered, this lock is not safe. Is single-instance Redis a permanent assumption?
2. `IStorageProvider` is registered as `Scoped` in DI (Phase 4) but wraps a singleton `IMinioClient`. Why not register `MinioStorageProvider` as singleton too? Scoped creates unnecessary allocations per request.
3. The `docker-compose.yml` env var `ConnectionStrings__Redis=redis:6379` uses Docker internal DNS, but the `appsettings.json` has `"Redis": "localhost:6379"`. When running outside Docker (IIS), the localhost config works. When running in Docker, the env var overrides. But `ConnectionMultiplexer.Connect("redis:6379")` needs the Docker network to resolve "redis". If the API container starts before Redis (despite `depends_on`), the singleton `ConnectionMultiplexer` registration will throw on startup and crash the app -- there is no retry or lazy initialization for the Redis connection.
