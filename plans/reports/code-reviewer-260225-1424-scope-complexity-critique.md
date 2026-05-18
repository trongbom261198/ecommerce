# Scope & Complexity Critique: Central File Management Service Plan

**Reviewer:** code-reviewer (Scope & Complexity Critic)
**Date:** 2026-02-25
**Plan:** `plans/260225-1408-central-file-management-service/`
**Verdict:** Plan is generally well-scoped to the brainstorm requirements. Several over-engineering traps exist, primarily around premature partitioning complexity, an unnecessary Shared project, dual ORM usage, and Polly pipelines that aren't actually wired to anything.

---

## Finding 1: Shared Project Is a Pure Overhead Layer With a Single Consumer

- **Severity:** High
- **Location:** Phase 1, "Architecture" section; Phase 3, "FIS.FileManager.Shared" throughout
- **Flaw:** A dedicated `FIS.FileManager.Shared` class library exists solely for request/response DTOs. It has zero external packages, is referenced only by `Core` and `Api`, and the plan explicitly states there are NO external NuGet clients consuming this library. This is a 4th project that adds build time, project references, and cognitive overhead for zero benefit.
- **Failure scenario:** Every time a developer changes a DTO (which happens frequently during development), they must navigate a separate project, maintain separate namespace conventions, and deal with cross-project reference gymnastics. The "shared client SDK" justification doesn't exist in this plan -- there is no client NuGet package, no code generation, no consumer outside this solution.
- **Evidence:** Phase 3 architecture shows `FIS.FileManager.Shared/` with ~14 DTO files. Plan.md lists only internal services (A/B/C) consuming HTTP/REST, not a .NET client library. The brainstorm's project structure shows `Shared/` but only contains `Requests/` and `Responses/`.
- **Suggested fix:** Merge DTOs into `FIS.FileManager.Core` under a `Models/Requests` and `Models/Responses` folder. Drop the Shared project entirely. If a client SDK is ever needed (YAGNI), extract it then.

---

## Finding 2: Dual ORM (EF Core + Dapper) Adds Complexity Without Measurable Payoff at This Scale

- **Severity:** High
- **Location:** Phase 4, "FileRepository" section; Phase 1 NuGet packages
- **Flaw:** The plan uses EF Core for "standard CRUD" and Dapper for "perf-critical queries" via stored procedures. At the stated scale (5-60K files/day), EF Core can handle every query in this plan, including the stored procedure equivalents, using raw SQL via `FromSqlRaw` or `SqlQueryRaw`. The plan introduces two data access paradigms, two connection management strategies (`DbContext` + raw `IDbConnection`), and stored procedures that duplicate logic already expressible in LINQ or raw SQL.
- **Failure scenario:** Developers must understand and maintain two different parameter binding styles, two different result mapping conventions, and two different connection lifetime models in the same repository class. The `IDbConnection` injected via DI creates a scoped raw `SqlConnection` that doesn't participate in EF Core's change tracking or transaction scope -- a subtle bug factory for future maintainers trying to mix Dapper calls with EF Core `SaveChangesAsync` in the same unit of work.
- **Evidence:** Phase 4 line 152-153: `private readonly IDbConnection _dapper; // Inject raw SqlConnection for Dapper`. Phase 2 defines 5 stored procedures for queries that are simple SELECTs with WHERE clauses. `usp_GetActiveReferenceCount` is literally `SELECT COUNT(*) ... WHERE FileId = @FileId AND IsActive = 1`.
- **Suggested fix:** Use EF Core exclusively. For the stored procedure queries, use `context.Database.SqlQueryRaw<T>()` or simple LINQ equivalents. Remove Dapper NuGet package and the raw `IDbConnection` registration. Keep stored procedures in the DB if desired, but call them through EF Core's `FromSqlRaw`.

---

## Finding 3: SQL Server Monthly Partitioning Is Premature for the Expected Data Volume

- **Severity:** High
- **Location:** Phase 2, entire phase; plan.md "SQL Server (partitioned monthly)"
- **Flaw:** The plan introduces partition functions, partition schemes, composite PKs (breaking standard GUID-only PKs), loss of foreign key constraints, stored procedures to work around partition limitations, and monthly maintenance scripts -- all for a projected ~10-20M rows/year. Standard SQL Server tables with proper indexes handle 20M rows trivially. Partitioning adds operational complexity (monthly boundary extension, statistics updates, partition-aligned index requirements) that the team must maintain forever, starting from row zero.
- **Failure scenario:** The composite PK `(FileId, CreatedAt)` requirement propagates through every layer: repository methods need `createdAt` for updates/deletes, EF Core entity configurations need composite keys, the API layer must carry `CreatedAt` alongside `FileId` for any mutation. Phase 4 line 189-199 shows `ReleaseReferenceAsync(Guid refId, DateTime createdAt, ...)` -- the caller must always know the `CreatedAt` of the row to release it. This is an ergonomic disaster that infects the entire API design. Additionally, losing FK constraints to partitioned tables means referential integrity is 100% application code -- a single bug creates orphan references permanently.
- **Evidence:** Phase 2 Key Insights: "No FK to partitioned tables unless FK includes partition column --> app-level referential integrity". Phase 4 shows `UpdateStatusAsync(Guid fileId, DateTime createdAt, string status, ...)` requiring `createdAt` parameter that the caller must have previously fetched. Brainstorm says "~10-20M rows/yr" -- a number that SQL Server handles without partitioning using proper indexing.
- **Suggested fix:** Start with standard (non-partitioned) tables with simple GUID PKs, proper FK constraints, and standard indexes. Add a `IX_Files_CreatedAt` index for time-range queries. If after 6-12 months of production data the query planner shows partition-scan improvements, migrate then. The brainstorm's own risk assessment for "SQL Server bottleneck" can be mitigated by indexes alone at this scale.

---

## Finding 4: Polly Resilience Pipelines Declared But Never Used

- **Severity:** High
- **Location:** Phase 4, "Resilience/ResiliencePipelines.cs" section; Phase 4 DI Registration
- **Flaw:** The plan defines two named Polly resilience pipelines ("minio" and "sql") and registers them in DI. However, no code anywhere in the plan actually resolves or invokes these pipelines. `MinioStorageProvider` calls `_client.PutObjectAsync()` directly. `FileRepository` calls `_db.Files.FirstOrDefaultAsync()` directly. The resilience pipelines are dead code from day one.
- **Failure scenario:** The team believes retry and circuit breaker protection exists because the config is registered. In reality, every MinIO call and SQL call goes through unprotected, and transient failures cause immediate 500 errors. The pipelines provide a false sense of security.
- **Evidence:** Phase 4 section 4 (`MinioStorageProvider`) -- no `ResiliencePipeline` injection or `.ExecuteAsync()` wrapping. Phase 4 section 3 (`FileRepository`) -- no pipeline usage. Phase 4 section 8 (DI) calls `services.AddResiliencePipelines()` but no consumer resolves `ResiliencePipeline<T>`.
- **Suggested fix:** Either wire the pipelines into the actual service implementations (wrap MinIO/SQL calls in `pipeline.ExecuteAsync(async ct => ...)`) or remove the Polly packages and configuration entirely. Ship without retry/circuit-breaker if the team isn't ready to integrate it properly; add it when the first transient failure is observed in production.

---

## Finding 5: Five Stored Procedures Duplicate Logic That Exists in Application Code

- **Severity:** Medium
- **Location:** Phase 2, section "Post-deployment: Stored Procedures"
- **Flaw:** The plan creates 5 stored procedures (`usp_GetActiveReferenceCount`, `usp_FindDuplicateFile`, `usp_GetStalePendingFiles`, `usp_GetOrphanFiles`, `usp_GetExpiredTempFiles`) for queries that are simple SELECTs with WHERE clauses. These same queries are also expressed in `CleanupService` and `FileService` in the application code. This creates two places to maintain business logic -- the SQL scripts and the C# services.
- **Failure scenario:** A developer changes the orphan detection grace period logic in `CleanupService` but forgets to update `usp_GetOrphanFiles`. Or vice versa. The dual-source-of-truth guarantees drift. Additionally, Phase 6's `CleanupService` already re-implements the query logic in C# (line 276: `var graceDays = _config.GetValue(...)`) while also delegating to the stored proc through the repository. The indirection adds no value.
- **Evidence:** Phase 2 `usp_GetOrphanFiles` contains the WHERE clause `f.CreatedAt < DATEADD(DAY, -@GraceDays, SYSUTCDATETIME())`. Phase 6 `CleanOrphanFilesAsync` reads `graceDays` from config and passes it to `_repo.GetOrphanFilesAsync(graceDays, ct)` which calls the stored proc. The grace days logic exists in both layers.
- **Suggested fix:** Remove the stored procedures. Express all queries in the repository using EF Core LINQ or `FromSqlRaw`. Single source of truth in C# code. If a DBA later needs to run ad-hoc cleanup, provide the utility scripts (which already exist in `scripts/utilities/`) instead.

---

## Finding 6: Download Endpoint Loads Entire File Into MemoryStream

- **Severity:** High
- **Location:** Phase 4, section 4 "MinioStorageProvider.DownloadAsync"; Phase 5, "FilesController.Download"
- **Flaw:** `MinioStorageProvider.DownloadAsync` copies the entire MinIO object into a `MemoryStream` before returning. For 100MB files at 60K files/day, this means the API server routinely allocates 100MB+ heap memory per concurrent download. The plan even acknowledges this problem in a comment (Phase 4 line 296: "For large files, use the streaming endpoint...") but provides no actual implementation of a streaming path. Both `Download` and `StreamDownload` controller endpoints call the same `_fileService.DownloadAsync` method, which returns the in-memory stream.
- **Failure scenario:** 10 concurrent downloads of 100MB files = 1GB heap allocation. Server runs out of memory under normal load. The `StreamDownload` endpoint claims to be for "large files" but uses the same `MemoryStream`-based path as the regular download.
- **Evidence:** Phase 4 line 246-254: `var ms = new MemoryStream(); ... stream.CopyTo(ms); ... return ms;`. Phase 5 line 252-256: both Download and StreamDownload call the same `_fileService.DownloadAsync` returning the same stream object.
- **Suggested fix:** Implement MinIO's callback stream properly -- pipe the MinIO download stream directly to the HTTP response using `GetObjectAsync` with a response stream callback or return the MinIO stream directly. Remove the separate `/stream` endpoint since the standard `/download` should always stream. One endpoint, always streaming.

---

## Finding 7: Two Separate Download-by-ID Endpoints Serve No Distinct Purpose

- **Severity:** Medium
- **Location:** Phase 5, FilesController sections "Download" and "StreamDownload"
- **Flaw:** The plan defines `GET /api/files/{fileId}` (Download) and `GET /api/files/{fileId}/stream` (StreamDownload). Both call the same `_fileService.DownloadAsync`. The only difference is that StreamDownload wraps the result in `FileStreamResult` with `EnableRangeProcessing = true` while Download uses `File(stream, contentType, fileName)`. In practice, `Controller.File()` already returns a `FileStreamResult` when given a Stream. The two endpoints are functionally identical.
- **Evidence:** Phase 5 line 251-256 (Download): `return File(stream, contentType, fileName)`. Line 261-269 (StreamDownload): `return new FileStreamResult(stream, contentType) { FileDownloadName = fileName, EnableRangeProcessing = true }`. The only difference is `EnableRangeProcessing = true` which should just be the default on the single endpoint.
- **Suggested fix:** Merge into a single `GET /api/files/{fileId}` endpoint that always returns `FileStreamResult` with `EnableRangeProcessing = true`. Remove the `/stream` endpoint.

---

## Finding 8: scripts/ Folder Has Four Subdirectories With .gitkeep From Day One But Only Two Are Used

- **Severity:** Medium
- **Location:** Phase 1, "Create scripts/ folder structure"; Phase 2, files created
- **Flaw:** Phase 1 creates `scripts/pre-deployment/`, `scripts/post-deployment/`, `scripts/maintenance/`, and `scripts/utilities/`. This is fine -- all four directories are populated in Phase 2. However, Phase 1 creates these as empty `.gitkeep` directories before any scripts exist, and the plan assumes they'll all be needed from day one. The `utilities/` scripts (partition size/boundary queries) are diagnostic scripts that could live anywhere. The `maintenance/` scripts depend on partitioning (Finding 3). If partitioning is deferred, 2 of 4 subdirectories and 5 of 10 scripts become unnecessary.
- **Failure scenario:** This is a minor YAGNI violation. If partitioning is deferred per Finding 3, the `maintenance/monthly-extend-partitions.sql`, `maintenance/monthly-purge-audit-logs.sql`, `maintenance/weekly-update-statistics.sql`, `scripts/utilities/query-partition-sizes.sql`, and `scripts/utilities/query-partition-boundaries.sql` are all dead scripts from day one.
- **Evidence:** Phase 2 files list: 5 of 10 scripts are partition-specific maintenance/utility scripts.
- **Suggested fix:** If partitioning is deferred, only create `scripts/pre-deployment/` and `scripts/post-deployment/`. Add maintenance scripts when partitioning is actually implemented.

---

## Finding 9: RedisLockHandle Auto-Renewal Timer Uses Fire-and-Forget Async

- **Severity:** Medium
- **Location:** Phase 4, section 5 "RedisService", inner class `RedisLockHandle`
- **Flaw:** The `RedisLockHandle` uses `new Timer(_ => db.LockExtendAsync(key, value, expiry), ...)` where the callback invokes an async method from a `System.Threading.Timer` delegate. The `Timer` callback signature is `void`, so `LockExtendAsync` returns a fire-and-forget `Task`. If the renewal fails (Redis connection lost, network blip), the exception is silently swallowed, the lock expires, and another instance takes over the leader lock while the original instance is still mid-operation.
- **Failure scenario:** Redis has a momentary network issue during lock renewal. The renewal silently fails. The lock TTL expires. A second instance acquires the same lock. Both instances now process the same cleanup batch, potentially double-deleting or racing on the same file records. The original instance has no idea its lock was lost.
- **Evidence:** Phase 4 line 350: `_renewTimer = new Timer(_ => db.LockExtendAsync(key, value, expiry), null, expiry / 3, expiry / 3)`. The async call is never awaited.
- **Suggested fix:** Use a proper async renewal pattern: a background `Task` with a `PeriodicTimer` that awaits the renewal call and sets a `_lockLost` flag on failure. The consuming code should check this flag. Alternatively, since lock-based cleanup is only an hourly background task, simplify by removing auto-renewal entirely -- set the lock TTL long enough to cover the entire cleanup run (e.g., 30 minutes) and skip renewal.

---

## Summary

| # | Finding | Severity | YAGNI / Over-Engineering Type |
|---|---------|----------|-------------------------------|
| 1 | Shared project with zero external consumers | High | Premature abstraction |
| 2 | Dual ORM (EF Core + Dapper) at low scale | High | Unnecessary complexity |
| 3 | Monthly partitioning for ~20M rows/year | High | Premature optimization |
| 4 | Polly pipelines registered but never invoked | High | Gold plating / dead code |
| 5 | Stored procedures duplicating C# query logic | Medium | Dual source of truth |
| 6 | Download loads entire file into MemoryStream | High | Missing streaming (functional bug) |
| 7 | Two identical download endpoints | Medium | Unnecessary API surface |
| 8 | Partition-dependent scripts created upfront | Medium | YAGNI |
| 9 | Fire-and-forget async in lock renewal timer | Medium | Incorrect async pattern |

**Net recommendation:** Findings 3, 6, and 4 are the most impactful. Deferring partitioning (Finding 3) cascades into simplifying composite PKs, restoring FK constraints, removing 5 stored procedures, eliminating maintenance scripts, and simplifying every repository method signature. Fixing the download stream (Finding 6) is a correctness issue that will cause OOM in production. Dead Polly pipelines (Finding 4) create false confidence in resilience that doesn't exist.

---

## Unresolved Questions

1. The brainstorm mentions "Redis dedup hash cache" as a future use case but the plan never implements caching -- only locking. Is Redis actually needed for anything besides the leader election lock? Could a simpler DB-based advisory lock replace Redis entirely?
2. The `MigrationController` for registering existing files references no migration plan or script for the existing `btp` bucket data. How will the ~N existing files be registered? Manual? Batch script? The plan has an endpoint but no migration execution strategy.
3. `appsettings.json` in Phase 1 hardcodes `sa:123456` as the DB password and `minioadmin:minioadmin` as MinIO credentials. These will be committed to git via Phase 1 step 10. The Security Considerations section notes this but proposes no concrete fix (like using user-secrets or placeholder values).
