# Failure Mode Analysis: Central File Management Service Plan

**Reviewer:** Failure Mode Analyst
**Date:** 2026-02-25
**Scope:** All 8 phases of `260225-1408-central-file-management-service` plan
**Verdict:** 3 Critical, 3 High, 2 Medium findings

---

## Finding 1: Upload flow has an unrecoverable partial-failure window between MinIO upload and DB confirm

- **Severity:** Critical
- **Location:** Phase 3, section "FileService (Core Orchestrator)" step 6; Phase 4, section "FileRepository"
- **Flaw:** The upload flow performs three sequential writes with no transactional guarantee across them: (1) DB insert `Pending`, (2) MinIO upload, (3) DB update to `Confirmed` + (4) DB insert FileReference. Steps 3 and 4 are two separate DB writes not wrapped in a transaction. If the process crashes between step 3 and step 4, the file is `Confirmed` with zero references -- the orphan cleanup will delete it after 7 days grace even though it was just uploaded and the caller received an error, so they will retry and get a different file (or the same via dedup, but without a reference). Additionally, the caller received no FileId because the HTTP response never went out -- so the file exists but nobody knows about it.
- **Failure scenario:** Service uploads 50MB file. MinIO upload succeeds (step 2). DB confirms the file (step 3). Process crashes (OOM, host restart, IIS recycle) before creating the FileReference (step 4) and returning the response. Caller gets a TCP reset, retries the upload. Dedup finds the Confirmed file and creates a new reference -- but if the content hash changed between retries (client sends different file on retry), the original confirmed file becomes an orphan with zero refs. With the 7-day grace period, it silently leaks storage for a week then disappears.
- **Evidence:** Phase 3 pseudocode lines: `await _repo.UpdateStatusAsync(entity.FileId, entity.CreatedAt, "Confirmed", ct);` followed by `await _repo.CreateReferenceAsync(new FileReferenceEntity { ... }, ct);` -- no transaction scope wrapping them.
- **Suggested fix:** Wrap steps 3 and 4 in a single SQL transaction (`IDbTransaction` or `TransactionScope`). Alternatively, create the FileReference row in `Pending` state at step 1 alongside the File row, then flip both to active in one transaction at step 3.

---

## Finding 2: DownloadAsync loads entire file into MemoryStream -- guaranteed OOM on large files

- **Severity:** Critical
- **Location:** Phase 4, section "MinioStorageProvider", method `DownloadAsync` (line ~246-254)
- **Flaw:** The `DownloadAsync` implementation copies the entire MinIO object into a `MemoryStream` via `stream.CopyTo(ms)`. For files up to 100MB (the plan's stated limit), this allocates 100MB of contiguous memory per concurrent download. With even 20 concurrent downloads, that is 2GB heap pressure in a single request pipeline, causing GC pauses and potential `OutOfMemoryException` on 32-bit processes or memory-constrained containers.
- **Failure scenario:** Production load hits 30 concurrent downloads of 80MB files. The process allocates 2.4GB in MemoryStreams, triggers full GC collection, service freezes for seconds under GC pressure, health checks fail, load balancer routes away, cascading 503s to all clients. If the container memory limit is 1GB (common Docker default), the process is OOM-killed and all in-flight requests are lost.
- **Evidence:** Phase 4 code: `var ms = new MemoryStream(); await _client.GetObjectAsync(new GetObjectArgs()...WithCallbackStream(stream => stream.CopyTo(ms)), ct); ms.Position = 0; return ms;`. The note below says "For large files, use the streaming endpoint" but only FilesController's `/stream` endpoint uses `FileStreamResult` -- the regular `Download` endpoint at `GET /api/files/{fileId}` calls `File(stream, contentType, fileName)` which also buffers.
- **Suggested fix:** Never buffer in MemoryStream. Use MinIO's `GetObjectAsync` with a callback that pipes directly to the HTTP response stream. Or use `PipeReader`/`PipeWriter` to stream through. The `DownloadAsync` interface should return a factory (`Func<Stream, Task>`) instead of a `Stream`, so the consumer controls the output stream.

---

## Finding 3: Dedup is scoped per-service but stored procedures query without CreatedAt partition bounds

- **Severity:** Critical
- **Location:** Phase 2, section "Stored Procedures" (`usp_FindDuplicateFile`); Phase 4, section "FileRepository"
- **Flaw:** The dedup stored procedure `usp_FindDuplicateFile` queries `Files` table filtering only on `ContentHash`, `CreatedByServiceId`, and `Status='Confirmed'`, without any `CreatedAt` range. Because `Files` is partitioned on `CreatedAt`, this query must scan ALL partitions to find a matching row. With 20M rows/year across 14+ partitions, this becomes a full cross-partition scan on every single upload. The index `IX_Files_ContentHash_ServiceId` includes `CreatedAt` for partition alignment, but since the query has no `CreatedAt` predicate, SQL Server must probe every partition's index segment.
- **Failure scenario:** After 6 months of operation with ~10M rows across 7 partitions, every upload triggers a dedup check that scans 7 partition segments of the `IX_Files_ContentHash_ServiceId` index. At 60K files/day, that is 60K cross-partition index scans per day. As partitions grow to 12+, latency increases linearly. Uploads that should take 50ms start taking 500ms. Under load, SQL Server CPU spikes, connection pool exhausts, API returns 503.
- **Evidence:** Phase 2 stored procedure: `SELECT TOP 1 FileId, ObjectName, BucketName, FileSize, MimeType, CreatedAt FROM dbo.Files WHERE ContentHash = @ContentHash AND CreatedByServiceId = @ServiceId AND Status = 'Confirmed' ORDER BY CreatedAt DESC;` -- no `CreatedAt` bound. The `ORDER BY CreatedAt DESC` forces scanning from newest partition backward, stopping at first match, but worst case (no match) scans all.
- **Suggested fix:** Add a Redis cache for dedup lookups (`dedup-cache:{serviceId}:{hash}` -> `FileId`). On cache miss, query with a bounded `CreatedAt` range (e.g., last 90 days) covering the realistic dedup window. If no match in recent data, treat as new file. This bounds the scan to 3 partitions max.

---

## Finding 4: Cleanup worker deletes from MinIO then DB -- crash between = permanent ghost row

- **Severity:** High
- **Location:** Phase 6, section "Complete CleanupService Implementation", method `CleanStalePendingAsync`
- **Flaw:** The cleanup sequence is: (1) delete from MinIO, (2) delete/update DB record, (3) write audit log. If the process crashes after step 1 but before step 2, the DB row remains with Status=`Pending` (or `Confirmed` for orphans) but the MinIO object is gone. On the next cleanup cycle, the cleanup will try to delete the MinIO object again (idempotent, fine) then delete the DB row (fine). However, if a concurrent `DownloadAsync` request hits between step 1 and step 2 of the next cleanup cycle, it will find the DB row, try to download from MinIO, get a 404 `NoSuchKey` error, and the `ObjectExistsAsync` call silently returns `false` -- but DownloadAsync has no check for this, it just throws.
- **Failure scenario:** Cleanup deletes `report.pdf` from MinIO. Worker crashes. User requests download of `report.pdf` by FileId. DB says file exists and is `Confirmed`. MinIO returns 404. Unhandled `MinioException` propagates up, `GlobalExceptionMiddleware` returns generic 500 instead of a clear "file not found in storage" message.
- **Evidence:** Phase 6 code: `await _storage.DeleteAsync(file.BucketName, file.GetFullObjectKey(), ct); await _repo.DeleteAsync(file.FileId, file.CreatedAt, ct);` -- delete from storage first, then DB. Phase 4 `DownloadAsync` has no existence check before fetching.
- **Suggested fix:** Reverse the order: mark DB row as `Deleted` (or a new `Deleting` status) first, then delete from MinIO. This way, concurrent reads will see `Deleted` status and return 404 immediately. Also, add a guard in `DownloadAsync` that checks `ObjectExistsAsync` before streaming, or catch `MinioException` and return 404 with a clear error.

---

## Finding 5: Redis lock auto-renew timer fires synchronously on ThreadPool with no error handling

- **Severity:** High
- **Location:** Phase 4, section "RedisService", inner class `RedisLockHandle`
- **Flaw:** The `RedisLockHandle` uses a `System.Threading.Timer` that calls `db.LockExtendAsync(key, value, expiry)` from the timer callback. The timer callback is `_ => db.LockExtendAsync(key, value, expiry)` -- this returns a `Task` that is never awaited. If the `LockExtendAsync` call fails (Redis connection lost, timeout), the exception is swallowed silently as an unobserved task exception. The lock expires, another instance acquires it, and now two instances hold the "same" lock -- both proceed with the protected operation (upload dedup or cleanup), causing data corruption.
- **Failure scenario:** During a large file upload, the dedup lock is held with 5-minute TTL and 100-second renewal interval. Redis goes offline for 2 minutes (network blip, Redis restart). The renewal timer fires 3 times, each silently fails. After 5 minutes, the lock expires in Redis. A second concurrent upload with the same hash acquires the lock, passes the dedup check, and uploads to MinIO. Redis comes back. Now both uploads try to `UpdateStatusAsync` to `Confirmed` -- two copies of the same content exist, breaking dedup guarantees.
- **Evidence:** Phase 4 code: `_renewTimer = new Timer(_ => db.LockExtendAsync(key, value, expiry), null, expiry / 3, expiry / 3);` -- fire-and-forget async call in a sync Timer callback.
- **Suggested fix:** Use `PeriodicTimer` with an async loop instead of `System.Threading.Timer`. Catch and log renewal failures. After N consecutive failures, set a flag that causes `DisposeAsync` to NOT release the lock (let it expire naturally) and signal the caller that the lock is degraded.

---

## Finding 6: No partition maintenance automation -- partitions will run out and inserts will fail

- **Severity:** High
- **Location:** Phase 2, section "Maintenance: Monthly Partition Extension"; Phase 7, "Docker & Deployment"
- **Flaw:** The plan creates partition boundaries from March 2026 through March 2027 (13 boundaries). The `monthly-extend-partitions.sql` script exists but is a manual maintenance script with no automated scheduling. There is no SQL Server Agent job, no cron job, no background service, and no mention of how this script gets executed monthly. If nobody runs it, by March 2027 all new inserts will go into the overflow partition (partition 14), which will grow unbounded. Eventually, operations like `TRUNCATE TABLE ... WITH (PARTITIONS(n))` for audit log purging will not work correctly because the overflow partition contains data from multiple months.
- **Failure scenario:** The service runs for 13 months without anyone running the partition extension script. All data from April 2027 onward lands in the overflow partition. The weekly statistics update becomes increasingly slow on the giant overflow partition. The audit log purge tries to truncate "old" data but cannot isolate months within the overflow partition, so purging stops working. The AuditLogs table grows indefinitely.
- **Evidence:** Phase 2 lists `scripts/maintenance/monthly-extend-partitions.sql` as a file to create but Phase 6 (Background Services) only implements cleanup tasks -- no partition maintenance. Phase 7 (Docker) has no scheduled job for partition maintenance.
- **Suggested fix:** Either (a) add a `PartitionMaintenanceWorker` as a BackgroundService that runs monthly and executes the partition extension SQL, or (b) create a SQL Server Agent job definition in the deployment scripts, or (c) add it to the CleanupWorker's monthly check alongside MinIO orphan scan.

---

## Finding 7: API Key stored and compared as plaintext hash -- timing attack + no rotation support

- **Severity:** Medium
- **Location:** Phase 2, section "Seed Data"; Phase 5, section "ApiKeyAuthMiddleware"
- **Flaw:** The seed script stores `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` as the API key directly (notably, this is the SHA-256 hash of an empty string, not of 'changeme-default-api-key'). The `ApiKeyAuthMiddleware` compares the `X-Api-Key` header value directly against `Services.ApiKey` using EF Core `FirstOrDefaultAsync(s => s.ApiKey == apiKey)`. This means: (1) The raw API key value in the header must match exactly what is stored in DB -- so either the DB stores plaintext keys or the client must send pre-hashed keys. The plan is ambiguous about this. (2) SQL string comparison is vulnerable to timing attacks (though less critical for internal services). (3) There is no API key rotation mechanism -- changing a key requires DB update and simultaneous update of all clients.
- **Failure scenario:** An attacker with network access to internal traffic captures an API key from headers. Since there is no rotation mechanism, the key is valid forever. Alternatively, the hash in the seed data is wrong (`e3b0c44...` is `SHA256("")` not `SHA256("changeme-default-api-key")`), meaning the seed data will not match any real API key, and the default service will be unusable until manually fixed.
- **Evidence:** Phase 2 seed: `'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'` with comment `-- Pre-hashed API key (SHA-256 of 'changeme-default-api-key')` but `e3b0c44...` is actually `SHA256("")`. Phase 5 middleware: `repo.GetServiceByApiKeyAsync(apiKey!, context.RequestAborted)`.
- **Suggested fix:** (1) Fix the seed hash to the actual SHA-256 of the intended key. (2) Clarify the auth flow: clients send raw key, middleware hashes it, then compares against stored hash. (3) Use constant-time comparison for the hash. (4) Add a `KeyRotatedAt` column and support overlapping old+new keys during rotation windows.

---

## Finding 8: Integration tests mock MinIO but real upload flow is untested end-to-end

- **Severity:** Medium
- **Location:** Phase 8, section "Integration Test: WebApplicationFactory" and Risk Assessment
- **Flaw:** The `CustomWebApplicationFactory` sets up Testcontainers for SQL Server and Redis but explicitly does NOT include MinIO. The risk assessment acknowledges "MinIO not in Testcontainers (no official image)" and suggests "mock IStorageProvider in integration tests". This means the most critical path -- file bytes actually reaching MinIO and being retrievable -- is never tested in integration tests. The upload-download-release cycle test (section 5) would use a mocked `IStorageProvider`, so it tests the API plumbing and DB flow but not the actual MinIO interaction, multipart upload parsing at MinIO level, or bucket creation logic.
- **Evidence:** Phase 8 risk assessment: `MinIO not in Testcontainers (no official image) | Use MinIO Docker image directly or mock IStorageProvider in integration tests`. Phase 8 `CustomWebApplicationFactory` only replaces `DbContextOptions` and `IConnectionMultiplexer` -- no `IStorageProvider` replacement shown, meaning it would use the real MinIO (which may not be available in CI).
- **Suggested fix:** Use `minio/minio:latest` Docker image directly with Testcontainers' `GenericContainer` builder. MinIO runs perfectly in Docker (`docker run -p 9000:9000 minio/minio server /data`). This gives true end-to-end coverage. Example: `new ContainerBuilder().WithImage("minio/minio").WithPortBinding(9000, true).WithCommand("server", "/data").Build()`.

---

## Unresolved Questions

1. The plan states dedup is "per-service" but the `GetFullObjectKey()` method uses `CreatedAt` for path generation. If two services upload identical files, they get separate storage -- but what happens when Service A uploads, then Service A uploads the same file again 2 months later? The dedup query has no `CreatedAt` bound, so it finds the old copy. But the old copy's path is based on the old `CreatedAt`. Does the new reference point to the old file's path? If so, what happens when partition purging deletes old partitions -- the FileReference still points to the old file row that got purged?

2. The `FileEntity.Status` is stored as `varchar(10)` string but the Core entity uses a `string` property instead of the `FileStatus` enum. This means runtime string comparisons like `f.Status != "Deleted"` throughout the repository are brittle and will not produce compile-time errors if someone misspells a status value.

3. The `IStorageProvider` is registered as `Scoped` in Phase 4 DI but wraps a singleton `IMinioClient`. What is the rationale? If it holds no per-request state, it should be singleton to reduce DI overhead at 60K requests/day.
