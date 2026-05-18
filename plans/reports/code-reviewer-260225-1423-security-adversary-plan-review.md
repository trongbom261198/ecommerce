# Security Adversary Plan Review

**Target:** Central File Management Service Plan (8 phases)
**Reviewer:** Security Adversary
**Date:** 2026-02-25

---

## Finding 1: API Keys Stored and Compared as Plaintext in Database

- **Severity:** Critical
- **Location:** Phase 02, section "Post-deployment: Seed Data"; Phase 04, section "FileRepository"; Phase 05, section "ApiKeyAuthMiddleware"
- **Flaw:** The `Services.ApiKey` column stores what the brainstorm calls a "SHA-256 or HMAC hash" (varchar(128)), but the seed script inserts a raw SHA-256 hash of a known passphrase, and the auth middleware does a direct string comparison: `GetServiceByApiKeyAsync(apiKey!)` which queries `WHERE ApiKey = @apiKey AND IsActive`. This means callers send the **hash itself** as the API key. The "hash" IS the credential -- if the database is breached, the attacker has every valid API key immediately. There is no salting, no key derivation function (bcrypt/Argon2), and no HMAC verification with a server-side secret.
- **Failure scenario:** An attacker gains read access to the Services table (SQL injection elsewhere, backup exposure, DBA credential compromise on the shared `sa` account). They extract all ApiKey values. Since those exact values are what clients send in `X-Api-Key`, the attacker can immediately impersonate any service. Additionally, the seed value `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` is the SHA-256 of an **empty string** -- not of "changeme-default-api-key" as the comment claims. This indicates the hashing approach is already broken at the planning stage.
- **Evidence:** Phase 02 seed script: `'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'` (SHA-256 of empty string ""). Phase 04: `GetServiceByApiKeyAsync(string apiKey) => FirstOrDefaultAsync(s => s.ApiKey == apiKey)`. Phase 05 middleware passes header value directly to this lookup.
- **Suggested fix:** Store API keys as HMAC-SHA256(key, server_secret) or bcrypt/Argon2id hash. Clients send the raw key; the server hashes it before DB lookup. Use a timing-safe comparison. Generate cryptographically random API keys (not human-chosen passphrases). Fix the seed data hash -- the current value is demonstrably wrong.

---

## Finding 2: SQL Server SA Account with Trivial Password Hardcoded Across Plan

- **Severity:** Critical
- **Location:** Phase 01, section "appsettings.json" (line 187); Phase 07, section "docker-compose.yml" (line 137) and ".env file" (line 199)
- **Flaw:** The connection string uses `User Id=sa;Password=123456` -- the SQL Server SA (sysadmin) account with a trivially guessable password. This is embedded in appsettings.json (which the plan notes will be committed to git), docker-compose.yml, and the .env file. The plan says "add appsettings.Production.json to .gitignore" but never actually creates a production config or removes credentials from the base appsettings.json.
- **Failure scenario:** (1) The base `appsettings.json` containing `sa/123456` gets committed (Phase 01 step 10: `git add . && git commit`). Any developer or CI/CD system with repo access now has sysadmin credentials to the production SQL Server at `10.14.142.30`. (2) The SA account has unrestricted access to ALL databases on the server, not just `FILE`. A compromise of this service = compromise of the entire SQL Server instance.
- **Evidence:** Phase 01 appsettings.json: `"SqlServer": "Server=10.14.142.30\\BTP;Database=FILE;User Id=sa;Password=123456;TrustServerCertificate=True;"`. Phase 01 step 10: `git add . && git commit`.
- **Suggested fix:** Create a dedicated SQL Server login with minimal privileges (db_datareader, db_datawriter, execute on specific stored procs) for the FILE database only. Never use SA. Use `dotnet user-secrets` for local dev, environment variables for deployment. Replace the connection string in appsettings.json with a placeholder that fails loudly if not overridden.

---

## Finding 3: No Authorization / Tenant Isolation -- Any Service Can Access Any File

- **Severity:** Critical
- **Location:** Phase 05, sections "FilesController", "LegacyController"
- **Flaw:** After API key authentication identifies the calling service, no authorization check verifies that the service has permission to access the requested file. The `Download`, `GetInfo`, `Release`, and `Promote` endpoints accept a `fileId` and operate on it unconditionally. A service with a valid API key can download, release, or promote files owned by other services. The dedup is "per-service isolated" (different hash namespace per service), but the access endpoints have no service-scoping.
- **Failure scenario:** Service A uploads a confidential document. Service B (e.g., a less-trusted internal tool) knows or guesses the GUID (GUIDs from `NEWID()` are not cryptographically random in older SQL Server versions). Service B calls `GET /api/files/{fileId}` and downloads Service A's confidential file. Alternatively, Service B calls `POST /api/files/{fileId}/release` on Service A's file, decrementing the reference count and potentially triggering deletion.
- **Evidence:** Phase 05 FilesController `Download` method: `await _fileService.DownloadAsync(fileId, HttpContext.GetServiceId(), ...)` -- serviceId is passed but the plan's Core layer `GetByIdAsync` (Phase 04) only filters by `FileId` and `Status != 'Deleted'`, never checking `CreatedByServiceId` or verifying the calling service has a reference. Phase 03 `IFileRepository.GetByIdAsync(Guid fileId)` -- no service parameter.
- **Suggested fix:** All file-access operations must verify the calling service either owns the file or has an active FileReference to it. Add service-scoped checks: `WHERE FileId = @fileId AND EXISTS (SELECT 1 FROM FileReferences WHERE FileId = @fileId AND ServiceId = @callingServiceId AND IsActive = 1)`.

---

## Finding 4: Path Traversal / Object Key Injection via OriginalFileName

- **Severity:** High
- **Location:** Phase 03, section "FileService" (step 6); Phase 05, section "LegacyController"
- **Flaw:** The object key is constructed as `$"{hash[..8]}_{SanitizeFileName(request.OriginalFileName)}"` and later passed to MinIO as part of the key. The `SanitizeFileName` function is referenced but never defined in the plan. If improperly implemented, a filename like `../../admin/config.json` or one containing null bytes could manipulate the MinIO object path. The `LegacyController` endpoint `DownloadByName([FromQuery] string name)` passes a user-supplied string directly to `DownloadByNameAsync`, which queries `ObjectName` and constructs a MinIO key from it.
- **Failure scenario:** An attacker calls `GET /api/files/by-name?name=../../other-bucket-object` or uses URL-encoded path separators. If the constructed MinIO key includes unsanitized path components, the attacker could read or overwrite objects outside the intended path hierarchy. Even within the same bucket, navigating to a different date prefix could access another service's files.
- **Evidence:** Phase 03 step 6: `var objectName = $"{hash[..8]}_{SanitizeFileName(request.OriginalFileName)}"` -- SanitizeFileName is undefined. Phase 05 LegacyController: `DownloadByName([FromQuery] string name)` -- raw query parameter passed through. Phase 03 `FileEntity.GetFullObjectKey()`: `$"{CreatedAt:yyyy}/{CreatedAt:MM}/{CreatedAt:dd}/{CreatedAt:HH}/{CreatedAt:mm}/{ObjectName}"` -- ObjectName is from DB but originally from user input.
- **Suggested fix:** Define SanitizeFileName explicitly: strip all path separators (`/`, `\`, `..`), null bytes, control characters, and limit to alphanumeric + safe punctuation. For by-name lookups, validate that the resolved object belongs to the calling service's bucket. Never construct MinIO keys from raw user input without strict allowlist validation.

---

## Finding 5: MinIO Credentials are Default Admin with No SSL -- Full Object Store Takeover

- **Severity:** High
- **Location:** Phase 01, section "appsettings.json" (line 193-198); Phase 07, section "docker-compose.yml"
- **Flaw:** MinIO is accessed using `minioadmin/minioadmin` (the well-known default root credentials) over unencrypted HTTP (`UseSSL: false`). The plan mentions "change in production" in Phase 07 security considerations but provides no mechanism to enforce this. The MinIO endpoint `10.14.142.32:9000` is on a corporate network with no indication of network segmentation.
- **Failure scenario:** (1) Any host on the `10.14.142.0/24` network can connect to MinIO with the default credentials and read/delete all objects across all buckets (bypassing the File Manager API entirely). (2) HTTP traffic containing MinIO credentials and file contents is transmitted unencrypted; network sniffing yields both credentials and data. (3) If MinIO has the web console enabled (default on port 9001), an attacker gets full GUI access to manage all storage.
- **Evidence:** Phase 01: `"AccessKey": "minioadmin", "SecretKey": "minioadmin", "UseSSL": false`. Phase 07 docker-compose: `MinIO__AccessKey=minioadmin, MinIO__SecretKey=minioadmin, MinIO__UseSSL=false`.
- **Suggested fix:** Require non-default MinIO credentials as a deployment prerequisite. Enable TLS on MinIO. Create service-specific MinIO access policies (each service's API key maps to a MinIO policy scoped to its bucket). Add a startup check that rejects default credentials.

---

## Finding 6: Download Endpoint Loads Entire File into Memory -- Denial of Service

- **Severity:** High
- **Location:** Phase 04, section "MinioStorageProvider" (step 4, DownloadAsync method)
- **Flaw:** `DownloadAsync` reads the entire MinIO object into a `MemoryStream` before returning. For a 100MB file (the configured max), this allocates 100MB of managed memory per concurrent download. The plan notes this issue ("For large files, use streaming endpoint") but the actual implementation in Phase 04 still loads into MemoryStream, and the Phase 05 controller's `Download` endpoint calls this method. Only the `/stream` endpoint is noted to potentially differ, but both use the same `DownloadAsync` service method.
- **Failure scenario:** An attacker with a valid API key uploads a 100MB file, then issues 50 concurrent download requests. Each request allocates ~100MB, consuming ~5GB of memory. The service runs out of memory and crashes (or triggers GC pressure that makes all requests slow). With the 500MB batch upload limit, even larger files could be staged. This is a trivial application-layer DoS.
- **Evidence:** Phase 04 MinioStorageProvider: `var ms = new MemoryStream(); await _client.GetObjectAsync(...WithCallbackStream(stream => stream.CopyTo(ms))); ms.Position = 0; return ms;`. Note in Phase 04: "For large files, use the streaming endpoint in the controller."
- **Suggested fix:** Replace `DownloadAsync` with a pipe-through approach: return the MinIO stream directly (or wrap it in a seekable proxy if needed). Use `IStorageProvider.DownloadAsync` to return a stream that reads from MinIO on demand, not a fully-buffered copy. Apply concurrent download rate limiting per service.

---

## Finding 7: No Rate Limiting on Upload or Any Endpoint -- Storage Exhaustion

- **Severity:** High
- **Location:** Phase 05, all endpoints; Phase 03, Core layer
- **Flaw:** The plan has no rate limiting at any layer. The brainstorm mentions Redis for "future rate limiting" but it is not in any phase's implementation. A valid API key grants unlimited upload, download, and query requests. The 100MB per-file limit and 500MB batch limit are enforced, but there is no limit on the number of requests.
- **Failure scenario:** (1) A compromised or misbehaving service floods the upload endpoint: 100MB * 10 requests/sec = 1GB/sec into MinIO. At 60K files/day (design target), even modest abuse would exhaust MinIO storage or network bandwidth. (2) No per-service quota means one service can consume all storage, starving others. (3) Batch upload endpoint at 500MB per request amplifies this.
- **Evidence:** Phase 05 security considerations list "Request size limit prevents abuse" but say nothing about request rate. No mention of rate limiting, throttling, or per-service quotas in any phase. Brainstorm: "future rate limiting" only.
- **Suggested fix:** Implement per-service rate limiting using Redis (sliding window or token bucket). Add per-service storage quotas tracked in the Services table. Apply request rate limits at the middleware level before file processing begins.

---

## Finding 8: Audit Log Tampering / Incomplete Audit Trail

- **Severity:** Medium
- **Location:** Phase 02, section "AuditLogs table"; Phase 06, section "CleanupService"; Phase 04, section "AuditService"
- **Flaw:** (1) The AuditLogs table uses the same `sa` credentials as the application. The application can INSERT, UPDATE, and DELETE audit records. There is no write-only access control; a compromised application can erase its tracks. (2) The monthly purge script (`monthly-purge-audit-logs.sql`) uses `TRUNCATE TABLE ... WITH (PARTITIONS(@PartitionNumber))` which is a metadata operation that leaves no trace. (3) Cleanup operations log with `Guid.Empty` as the correlationId, making them harder to trace. (4) The AuditService writes to DB synchronously in the request path -- if it fails, the main operation may have already completed, creating gaps in the audit trail.
- **Failure scenario:** An attacker compromises the application or the SA account. They perform unauthorized file downloads, then DELETE or TRUNCATE the relevant AuditLog partition to cover their tracks. The partition-based purge makes this trivially easy -- entire months of logs disappear in a single unlogged metadata operation. Alternatively, if the audit INSERT fails (DB connection hiccup), the file operation succeeds but is unaudited.
- **Evidence:** Phase 06 CleanupService: `await _audit.LogAsync(Guid.Empty, ...)`. Phase 02 maintenance script: `TRUNCATE TABLE dbo.AuditLogs WITH (PARTITIONS(@PartitionNumber))`. Phase 04 AuditService: synchronous `SaveChangesAsync` in request path.
- **Suggested fix:** Use a separate, restricted DB login for audit writes (INSERT-only, no DELETE/UPDATE/TRUNCATE). Ship audit logs to an external immutable store (append-only log, SIEM). Make audit logging fire-and-forget via a background channel (but with at-least-once guarantee). Use unique correlationIds for cleanup operations, not Guid.Empty.

---

## Finding 9: Redis Used Without Authentication or TLS -- Lock Bypass and Cache Poisoning

- **Severity:** Medium
- **Location:** Phase 01, section "appsettings.json"; Phase 04, section "RedisService"; Phase 07, section "docker-compose.yml"
- **Flaw:** Redis is deployed without a password (`localhost:6379` / `redis:6379`) and without TLS. The plan mentions "optionally secured with password" (Phase 04) but never configures it. Redis is used for critical security functions: dedup distributed locks and cleanup leader election. An unauthenticated Redis allows any network-adjacent host to manipulate lock keys.
- **Failure scenario:** (1) An attacker on the network sends `DEL dedup:serviceA:abc123hash` to Redis, removing the dedup lock. Two concurrent uploads of the same file both proceed, creating duplicate storage entries and corrupting the dedup invariant. (2) The attacker sends `SET cleanup:leader <random> EX 99999` to Redis, permanently preventing the cleanup worker from acquiring the leader lock. Stale files, orphans, and temp files accumulate indefinitely. (3) The attacker uses Redis as a pivot for further network exploitation (Redis RCE via `CONFIG SET` or module loading).
- **Evidence:** Phase 01 appsettings: `"Redis": "localhost:6379"`. Phase 07 docker-compose: `redis:7-alpine` with no `--requirepass`. Phase 04 security: "Redis connection optionally secured with password."
- **Suggested fix:** Require a strong password on Redis (`--requirepass`). Enable TLS for Redis connections. Rename or disable dangerous commands (`CONFIG`, `DEBUG`, `FLUSHALL`). Bind Redis to internal interfaces only.

---

## Finding 10: Migration Endpoint Allows Arbitrary File Registration Without Verification

- **Severity:** Medium
- **Location:** Phase 05, section "MigrationController"
- **Flaw:** The `/api/migration/register` endpoint accepts a `RegisterMigrationRequest` containing `ObjectName`, `BucketName`, `OriginalFileName`, and `ServiceId`. It registers a file record in the database without verifying (1) that the object actually exists in MinIO, (2) that the calling service owns the specified bucket, or (3) that the provided ServiceId matches the authenticated service. This is designed for migrating legacy files, but it creates a trust-without-verify backdoor.
- **Failure scenario:** An attacker with any valid API key calls `POST /api/migration/register` with a `BucketName` belonging to another service and an `ObjectName` pointing to a sensitive file. This creates a FileReference in the attacker's name, and subsequent download calls via `/api/files/{fileId}` will serve that file (assuming Finding 3 is also unresolved). Even if Finding 3 is fixed, the attacker's FileReference makes the access appear legitimate.
- **Evidence:** Phase 05 MigrationController: `_fileService.RegisterExistingFileAsync(request, HttpContext.GetCorrelationId(), ct)` -- takes correlationId but no serviceId from HttpContext. Phase 03 Shared DTO: `RegisterMigrationRequest { string ObjectName, string BucketName, string? OriginalFileName, Guid ServiceId }` -- ServiceId is in the request body, not from auth context.
- **Suggested fix:** The migration endpoint must ignore the ServiceId in the request body and use the authenticated service's ID. Verify the MinIO object exists in the specified bucket. Verify the bucket name matches the calling service's name. Consider making this endpoint admin-only or time-limited (disable after migration window).

---

## Summary

| # | Finding | Severity |
|---|---------|----------|
| 1 | API keys stored/compared as plaintext; seed hash is SHA-256 of empty string | Critical |
| 2 | SA account with password `123456` committed to git | Critical |
| 3 | No authorization -- any service accesses any file by GUID | Critical |
| 4 | Path traversal via unsanitized OriginalFileName; SanitizeFileName undefined | High |
| 5 | MinIO default admin credentials over unencrypted HTTP | High |
| 6 | Download loads entire file into memory; trivial OOM DoS | High |
| 7 | No rate limiting or per-service quotas; storage exhaustion | High |
| 8 | Audit logs tamperable; synchronous writes create gaps | Medium |
| 9 | Redis unauthenticated; lock bypass and cache poisoning | Medium |
| 10 | Migration endpoint allows cross-service file registration without verification | Medium |

**3 Critical, 4 High, 3 Medium findings. The plan should not proceed to implementation without addressing at least the 3 Critical issues.**
