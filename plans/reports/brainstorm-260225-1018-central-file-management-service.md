# Central File Management Service - Brainstorm Solution

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Tech stack | .NET 8 Web API | Modern, team knows .NET, good async/streaming |
| Database | SQL Server (existing) | Already available |
| Auth | API Key per service | Simple, internal services only |
| Dedup | SHA-256 hash, per-service isolation | No cross-service coupling |
| Cleanup trigger | Reference counting + TTL for temp | Services call release API |
| File size | 1-100MB, two-phase buffered upload | Buffer (<10MB memory, >10MB temp disk) → hash → dedup check → upload or skip |
| Bucket strategy | **1 bucket per service** | Service isolation, per-bucket quotas |
| Path format | `{yyyy}/{MM}/{dd}/{HH}/{mm}/{hash}_{name}.{ext}` | Time-based down to minute |
| ID strategy | Return **both** fileId (GUID) + objectName | Old services use objectName, new use fileId |
| Migration | Gradual — old files accessible via legacy endpoint | No big-bang migration needed |
| DB partitioning | Monthly range on `CreatedAt` | ~20M rows/yr, partition enables fast archive/purge |
| Cache/Lock | **Redis** (via Docker) | Distributed lock for cleanup worker, dedup hash cache, future rate limiting |
| Deploy | Docker + IIS (dual support) | |

### Critical Design Patterns (from gap analysis)

| Pattern | Problem | Solution |
|---------|---------|----------|
| DB-MinIO atomicity | MinIO upload OK but DB fails = orphan; OR crash between upload+confirm = MinIO orphan | Outbox: DB `Pending` → MinIO upload → `Confirmed`. Stale Pending cleanup: MinIO delete (idempotent) THEN DB delete. Covers all crash windows. |
| Dedup race condition | Concurrent identical uploads both pass hash check | Redis lock `dedup:{serviceId}:{hash}` serializes per hash+service; DB unique index impossible with partitioning |
| Retry + circuit breaker | Transient MinIO/SQL failures | Polly: 3 retries exponential backoff + circuit breaker returning 503 |
| Cleanup leader election | Multiple instances = double-deletes | Redis distributed lock (`RedLock`) before cleanup job runs |
| Two-phase upload | Need full hash before dedup check | Buffer file (memory <10MB, disk >10MB) → hash → dedup check → upload or skip |
| Health checks | Load balancer needs probes | `/health` (liveness) + `/health/ready` (DB + MinIO + Redis ping) |
| MinIO client singleton | 60K connections/day if new per request | Register `MinioClient` as singleton via `HttpClientFactory` |

## Context

**Problem:** MinioHelper embedded directly in each service, making direct S3/MinIO calls. No central metadata tracking, no dedup, no cleanup, no audit trail. 5-10 services, 5-60K files/day (1-100MB each) → storage waste, no traceability, orphaned files.

**Goal:** Centralized File Management Service owns all MinIO interactions, tracks metadata in SQL Server, handles dedup/cleanup, exposes REST API. Existing MinioHelper refactored to call this API instead of S3 directly.

---

## Architecture Overview

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  Service A   │  │  Service B   │  │  Service C   │
│ (MinioHelper)│  │ (MinioHelper)│  │ (MinioHelper)│
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                 │
       │  HTTP/REST (API Key auth)         │
       ▼                 ▼                 ▼
┌──────────────────────────────────────────────────┐
│          File Central Service (.NET 8)           │
│                                                  │
│  ┌──────────┐ ┌───────────┐ ┌─────────────────┐ │
│  │ REST API │ │ Dedup Svc │ │ Cleanup Worker  │ │
│  │ Upload   │ │ SHA-256   │ │ RefCount=0 scan │ │
│  │ Download │ │ per-svc   │ │ Temp TTL expiry │ │
│  │ Release  │ │ isolation │ │ Grace period    │ │
│  │ Info     │ │           │ │                 │ │
│  └────┬─────┘ └───────────┘ └─────────────────┘ │
│       │                                          │
│  ┌────▼─────┐              ┌──────────────────┐  │
│  │ MinIO    │              │  SQL Server      │  │
│  │ Storage  │              │  (Metadata DB)   │  │
│  │ (S3 API) │              │                  │  │
│  └──────────┘              └──────────────────┘  │
└──────────────────────────────────────────────────┘
```

---

## Database Schema (SQL Server)

### Table: `Services`
| Column | Type | Length rationale | Description |
|--------|------|----------------|-------------|
| ServiceId | uniqueidentifier PK | 16 bytes | Auto-generated |
| ServiceName | nvarchar(63) | = MinIO bucket name limit | Also used as bucket name |
| ApiKey | varchar(128) | SHA-256 or HMAC hash = 64-128 hex | Hashed, ASCII only |
| IsActive | bit | 1 bit | Enable/disable |
| CreatedAt | datetime2 | 8 bytes | |

### Table: `Files`
| Column | Type | Length rationale | Description |
|--------|------|----------------|-------------|
| FileId | uniqueidentifier NOT NULL | 16 bytes fixed | Returned to clients |
| ContentHash | char(64) | SHA-256 hex = exactly 64 chars | Content hash for dedup |
| ObjectName | nvarchar(150) | `{hash8}_{filename}.{ext}` ~max 150 | Filename part only (NO path). Full MinIO key computed at runtime: `{yyyy}/{MM}/{dd}/{HH}/{mm}/{ObjectName}` from CreatedAt |
| BucketName | nvarchar(63) | MinIO bucket name limit = 63 chars | MinIO bucket (= service name) |
| FileSize | bigint | 8 bytes | Bytes |
| MimeType | varchar(100) | Longest MIME ~50 chars, safe at 100 | ASCII only, no need for nvarchar |
| Status | varchar(10) NOT NULL | Pending/Confirmed/Deleted max 9 | Outbox pattern status |
| IsTemp | bit | 1 bit | Temp file flag |
| ExpiresAt | datetime2 NULL | 8 bytes | TTL for temp files |
| CreatedAt | datetime2 NOT NULL | 8 bytes | Partition column |
| CreatedByServiceId | uniqueidentifier FK | 16 bytes | Which service uploaded |

**Full MinIO key** computed at runtime (not stored):
```
{BucketName}/{CreatedAt:yyyy}/{CreatedAt:MM}/{CreatedAt:dd}/{CreatedAt:HH}/{CreatedAt:mm}/{ObjectName}
→ dich-vu-cong/2026/02/25/10/18/a1b2c3d4_ho-so-cong-dan.pdf
```

**PK:** Composite `(FileId, CreatedAt)` — required for SQL Server partitioning on `CreatedAt`.
**Unique index:** `IX_Files_FileId` UNIQUE on `(FileId, CreatedAt)` — partition-aligned. FileId globally unique via app-level GUID guarantee.
**No FK from FileReferences:** SQL Server cannot create FK to a partitioned table unless FK includes partition key. Referential integrity enforced at **app level** (service layer validates FileId exists before insert). This is standard practice for partitioned designs.

**Outbox status flow:**
```
Pending → (MinIO upload success) → Confirmed
Pending → (stale after 15 min)   → cleanup worker attempts MinIO delete (idempotent, no-op if object doesn't exist) THEN deletes DB record
Confirmed → (all refs released + grace period) → Deleted (soft delete, MinIO object removed)
```

### Table: `FileReferences`
| Column | Type | Length rationale | Description |
|--------|------|----------------|-------------|
| RefId | uniqueidentifier NOT NULL | 16 bytes | |
| FileId | uniqueidentifier | 16 bytes | Points to Files (app-level ref, no DB FK — partitioned table constraint) |
| ServiceId | uniqueidentifier FK | 16 bytes | Which service owns ref |
| OriginalFileName | nvarchar(260) | Windows MAX_PATH = 260 | Caller's filename (each ref can have different name for same physical file) |
| ReferenceKey | nvarchar(200) | Service's internal ref, ~200 sufficient | Service's own identifier |
| Tags | nvarchar(max) | Variable JSON | JSON metadata |
| IsActive | bit | 1 bit | Released = false |
| CreatedAt | datetime2 NOT NULL | 8 bytes | Partition column |
| ReleasedAt | datetime2 NULL | 8 bytes | When ref was released |

**PK:** Composite `(RefId, CreatedAt)` for partitioning.
**No FK to Files:** Partitioned tables cannot be FK targets without including partition key. App-level validation ensures FileId exists before inserting FileReference.

### Table: `AuditLogs`
| Column | Type | Length rationale | Description |
|--------|------|----------------|-------------|
| LogId | bigint PK IDENTITY | 8 bytes | Auto-increment |
| CorrelationId | uniqueidentifier | 16 bytes | Request trace ID |
| ServiceId | uniqueidentifier | 16 bytes | |
| FileId | uniqueidentifier NULL | 16 bytes | |
| Action | varchar(20) | Longest = "Download" (8), safe at 20 | Upload/Download/Release/Delete/Cleanup |
| Details | nvarchar(max) | Variable JSON | JSON payload |
| DurationMs | int | 4 bytes | |
| StatusCode | smallint | 2 bytes, HTTP codes 100-599 | |
| CreatedAt | datetime2 NOT NULL | 8 bytes | Partition column |

**Indexes:**
- `IX_Files_FileId` UNIQUE on Files(FileId, CreatedAt) — partition-aligned; FileId globally unique via GUID generation (app guarantee). Covers FileId lookups efficiently.
- `IX_Files_ContentHash_ServiceId` on Files(ContentHash, CreatedByServiceId, CreatedAt) — partition-aligned; supports dedup SELECT lookups. **NOT unique** (partitioned unique would need CreatedAt which defeats dedup). **Dedup race prevention via Redis lock** (see below).
- `IX_Files_ObjectName` on Files(ObjectName) — by-name lookup
- `IX_FileReferences_FileId_IsActive` on FileReferences(FileId, IsActive) — ref counting
- `IX_Files_Status_CreatedAt` on Files(Status, CreatedAt) — cleanup scan for Pending/Deleted
- `IX_Files_IsTemp_ExpiresAt` on Files(IsTemp, ExpiresAt) WHERE IsTemp=1 — temp cleanup
- `IX_AuditLogs_CorrelationId` on AuditLogs(CorrelationId) — trace lookup
- `IX_AuditLogs_ServiceId_CreatedAt` on AuditLogs(ServiceId, CreatedAt) — service activity

### Table Partitioning Strategy

**Growth projection:** 5-60K files/day → ~10-20M rows/year in Files, even more in AuditLogs.

**Partition by `CreatedAt` (monthly range):**

| Table | Partition Column | Scheme | Retention |
|-------|-----------------|--------|-----------|
| `Files` | CreatedAt | Monthly | Keep all (soft delete) |
| `FileReferences` | CreatedAt | Monthly | Keep all |
| `AuditLogs` | CreatedAt | Monthly | Auto-purge after 12 months |

```sql
-- Partition function: monthly boundaries
CREATE PARTITION FUNCTION pf_Monthly (datetime2)
AS RANGE RIGHT FOR VALUES (
  '2026-01-01', '2026-02-01', '2026-03-01', /* ... */
  '2026-12-01', '2027-01-01'  -- extend annually via maintenance job
);

-- Partition scheme: map to filegroups (or all PRIMARY for simplicity)
CREATE PARTITION SCHEME ps_Monthly
AS PARTITION pf_Monthly ALL TO ([PRIMARY]);

-- Files table: partition on CreatedAt
-- PK must include partition column → composite PK (FileId, CreatedAt)
CREATE TABLE Files (
  FileId uniqueidentifier NOT NULL,
  CreatedAt datetime2 NOT NULL,
  /* ... other columns ... */
  CONSTRAINT PK_Files PRIMARY KEY (FileId, CreatedAt)
) ON ps_Monthly(CreatedAt);

-- AuditLogs: partition on CreatedAt
CREATE TABLE AuditLogs (
  LogId bigint IDENTITY NOT NULL,
  CreatedAt datetime2 NOT NULL,
  /* ... other columns ... */
  CONSTRAINT PK_AuditLogs PRIMARY KEY (LogId, CreatedAt)
) ON ps_Monthly(CreatedAt);
```

**Key design notes:**
- PK includes `CreatedAt` (SQL Server requires partition column in PK)
- `FileId` lookups still fast via non-clustered unique index on `FileId`
- AuditLogs oldest partitions can be truncated/archived after 12 months (instant, no row-by-row delete)
- Monthly maintenance job auto-creates next month's partition boundary
- FileReferences partitioned same way for consistent join performance

**Maintenance job (monthly):**
```sql
-- Auto-extend partition: add next month boundary
ALTER PARTITION FUNCTION pf_Monthly() SPLIT RANGE ('2027-02-01');

-- Optional: archive old AuditLogs partitions (>12 months)
-- SWITCH partition to archive table, then TRUNCATE
```

---

## REST API Design

### Authentication
- API Key in header: `X-Api-Key: {service-api-key}`
- Middleware validates against `Services` table
- Each request gets `CorrelationId` (from header or auto-generated)

### Endpoints

```
POST   /api/files/upload              → Upload file (multipart/form-data streaming)
  Body: file (stream), originalFileName, isTemp, ttlMinutes?, tags? (JSON)
  Returns: { fileId, objectName, fileName, fileSize, contentHash, isDuplicate }

GET    /api/files/{fileId}            → Download by fileId (GUID)
  Returns: byte[] with Content-Type header

GET    /api/files/{fileId}/stream     → Stream download (for large files)
  Returns: FileStreamResult with chunked transfer

GET    /api/files/{fileId}/info       → Get metadata only
  Returns: { fileId, objectName, fileName, fileSize, mimeType, contentHash, createdAt, tags }

POST   /api/files/{fileId}/release    → Release reference (decrement ref count)
  Returns: { released: true, remainingRefs: N }

POST   /api/files/{fileId}/promote    → Convert temp → permanent
  Returns: { promoted: true }

POST   /api/files/batch-upload        → Multiple files in one request
  Returns: [{ fileId, objectName, fileName, ... }, ...]

POST   /api/files/batch-info          → Get multiple file metadata
  Body: { fileIds: [...] }
  Returns: [{ fileId, objectName, ... }, ...]

GET    /api/files/by-name?name={objectName}  → Download by ObjectName (backward compat)
  ObjectName is ALWAYS slash-free (filename-only for new files, flat name for legacy).
  New files: "a1b2c3d4_ho-so-cong-dan.pdf" — service looks up in DB, computes full MinIO key from CreatedAt.
  Legacy files: "motcua_20250101_abc123.pdf" — service looks up in DB or falls through to old bucket directly.
  Returns: byte[] or stream

POST   /api/files/by-name/release?name={objectName} → Release by ObjectName (backward compat)
  Returns: { released: true }

POST   /api/migration/register        → Register existing MinIO file in DB
  Body: { objectName, bucketName, originalFileName?, serviceId }
  Returns: { fileId, objectName }
```

---

## Bucket & Path Organization

**1 bucket per service**, path organized by time down to minute:

```
dich-vu-cong/                         ← bucket (auto-created when service registers)
  └── 2026/02/25/10/18/
       ├── a1b2c3d4_ho-so-cong-dan.pdf
       └── e5f6g7h8_cmnd-scan.jpg

mot-cua/                              ← separate bucket per service
  └── 2026/02/25/10/30/
       └── i9j0k1l2_don-thu.pdf

old-motcua/                           ← existing bucket (legacy, read-only)
  ├── motcua_20250101_abc123.pdf      ← old flat files still accessible
  └── motcua_20250102_def456.docx
```

Central service auto-creates bucket on first upload from a new service. Old buckets remain read-only for legacy downloads.

---

## Deduplication Strategy (Hash + Per-Service Isolation)

```
Upload Flow (two-phase: hash-first, then upload-or-dedup):

Phase 1 — Hash:
1. Client streams file → API receives as multipart
2. API streams to temp buffer (disk or memory depending on size threshold, e.g. <10MB = memory, >10MB = temp disk)
3. SHA-256 computed incrementally during buffering (no second pass needed)

Phase 2 — Dedup check + Upload (with Redis lock):
4. Acquire Redis lock: key = "dedup:{serviceId}:{contentHash}", TTL = 5min, auto-renewed every 30s
   (RedLock with auto-extend: background task refreshes TTL while upload is active; if process crashes, lock expires after 5min; safe for 100MB uploads on slow networks)
5. Check DB: Files WHERE ContentHash = @hash AND CreatedByServiceId = @serviceId AND Status = 'Confirmed'
6. IF EXISTS (dedup hit):
   → Create new FileReference pointing to existing File
   → Release Redis lock → clean up temp buffer
   → Return existing FileId + isDuplicate=true
7. IF NOT EXISTS (new file):
   → INSERT Files with Status='Pending'
   → Stream temp buffer to MinIO: {service-bucket}/{yyyy}/{MM}/{dd}/{HH}/{mm}/{hash[0:8]}_{name}.{ext}
   → On MinIO success: UPDATE Status='Confirmed', insert FileReference
   → On MinIO failure: DELETE the Pending record
   → Release Redis lock → clean up temp buffer
   → Return new FileId + objectName
8. If Redis lock acquisition fails (another upload in progress for same hash+service):
   → Wait for lock (with timeout) → retry from step 5
   → Winner's upload will have completed by then → treat as dedup hit

Race condition prevention:
- Redis lock is PRIMARY guard — serializes concurrent identical uploads per service
- DB index on (ContentHash, ServiceId) supports fast lookups but is NOT unique (partition constraint)
- Only one upload per hash+service can proceed at a time → no double-upload possible
- Lock TTL (5min) with auto-renewal (30s) covers large uploads; expires naturally if process crashes
```

**Why not single-pass (hash+upload simultaneously)?** Dedup check requires the full hash BEFORE deciding whether to upload. Single-pass would always upload first, defeating dedup's storage savings. Buffer approach trades temp disk/memory for 30-50% storage savings.

**Why per-service isolation:** Cross-service dedup creates coupling. If Service A deletes a file, Service B shouldn't be affected. Per-service dedup keeps cleanup logic simple while still saving 30-50% storage within each service (many services upload same docs repeatedly).

---

## Cleanup Worker (Background Hosted Service)

```
Every 1 hour (configurable), with Redis distributed lock:

1. STALE PENDING CLEANUP (outbox):
   SELECT * FROM Files
   WHERE Status = 'Pending' AND CreatedAt < DATEADD(minute, -15, GETUTCDATE())
   → For each: attempt MinIO DELETE (idempotent — succeeds even if object doesn't exist, catches crash-after-upload case)
   → Then DELETE DB record → Log to AuditLogs

2. TEMP FILE CLEANUP:
   SELECT * FROM Files
   WHERE IsTemp = 1 AND ExpiresAt < GETUTCDATE() AND Status = 'Confirmed'
   → UPDATE Status = 'Deleted' → Delete from MinIO → Log to AuditLogs

3. ORPHAN FILE CLEANUP:
   SELECT f.* FROM Files f
   WHERE f.Status = 'Confirmed'
     AND NOT EXISTS (
       SELECT 1 FROM FileReferences r
       WHERE r.FileId = f.FileId AND r.IsActive = 1
     )
     AND f.CreatedAt < DATEADD(day, -7, GETUTCDATE())  -- 7-day grace
   → UPDATE Status = 'Deleted' → Delete from MinIO → Log to AuditLogs

4. MINIO ORPHAN SCAN (weekly):
   List all MinIO objects → Check against Files table
   → Objects not in DB and older than 30 days → Delete
   → Log cleanup report
```

---

## MinioHelper Refactoring

Modify existing MinioHelper to call File Central API instead of S3:

```csharp
// BEFORE: Direct S3 call
var response = httpClient.SendAsync(request); // to MinIO

// AFTER: Call File Central Service
var response = httpClient.PostAsync($"{FileCentralUrl}/api/files/upload", content);
```

**Key mappings:**
| Old MinioHelper Method | New Central API Call |
|----------------------|---------------------|
| UploadFile(byte[], ...) | POST /api/files/upload |
| UploadByteArray(...) | POST /api/files/upload |
| Download(fileName) | GET /api/files/by-name?name={objectName} |
| DownloadFile(response, fileName) | GET /api/files/{fileId}/stream |
| DeleteFile(fileName) | POST /api/files/{fileId}/release |
| UpdateObjectTags(...) | Handled by Tags in upload/info |
| GetFileToSign(...) | POST /api/files/upload (isTemp=true) |

**Dual ID return:** All upload methods return BOTH `fileId` (GUID) + `objectName`. Old services keep using objectName (no code change). New/updated services switch to fileId. Both work for download via:
- `GET /api/files/{fileId}` — new way
- `GET /api/files/by-name?name={objectName}` — backward compat

---

## Logging Strategy (Serilog + Structured Logging)

```
Every request logged with:
- CorrelationId (passed from client or auto-generated)
- ServiceId (from API key resolution)
- FileId (when applicable)
- Action (Upload/Download/Release/etc.)
- Duration (ms)
- FileSize (bytes)
- StatusCode

Log sinks:
- Console (Docker stdout)
- File (rolling, for IIS)
- SQL Server AuditLogs table (for querying)

Example log line:
[2026-02-25 10:30:15 INF] Upload | CorrId=abc-123 | Service=dich-vu-cong-v2 | FileId=def-456 | Size=5.2MB | Hash=a1b2c3... | Dedup=true | Duration=245ms
```

---

## Project Structure

```
FIS.FileManager/
├── src/
│   ├── FIS.FileManager.Api/           # .NET 8 Web API
│   │   ├── Controllers/
│   │   │   ├── FilesController.cs
│   │   │   ├── LegacyController.cs
│   │   │   └── MigrationController.cs
│   │   ├── Middleware/
│   │   │   ├── ApiKeyAuthMiddleware.cs
│   │   │   └── CorrelationIdMiddleware.cs
│   │   ├── BackgroundServices/
│   │   │   └── CleanupWorker.cs
│   │   ├── Program.cs
│   │   └── appsettings.json
│   │
│   ├── FIS.FileManager.Core/          # Business logic
│   │   ├── Services/
│   │   │   ├── FileService.cs         # Upload/Download/Release
│   │   │   ├── DeduplicationService.cs
│   │   │   └── CleanupService.cs
│   │   ├── Models/
│   │   │   ├── FileEntity.cs
│   │   │   ├── FileReference.cs
│   │   │   └── AuditLog.cs
│   │   └── Interfaces/
│   │       ├── IFileService.cs
│   │       ├── IStorageProvider.cs
│   │       └── IAuditService.cs
│   │
│   ├── FIS.FileManager.Infrastructure/ # Data access + MinIO
│   │   ├── Data/
│   │   │   ├── FileManagerDbContext.cs
│   │   │   └── Migrations/
│   │   ├── Storage/
│   │   │   └── MinioStorageProvider.cs
│   │   └── Logging/
│   │       └── AuditService.cs
│   │
│   └── FIS.FileManager.Shared/        # DTOs shared with clients
│       ├── Requests/
│       └── Responses/
│
├── tests/
│   ├── FIS.FileManager.UnitTests/
│   └── FIS.FileManager.IntegrationTests/
│
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml          # API + MinIO + SQL Server + Redis
│
└── docs/
```

---

## Tech Stack Summary

| Component | Technology | Why |
|-----------|-----------|-----|
| API Framework | .NET 8 Minimal API + Controllers | Modern, fast, team knows .NET |
| ORM | EF Core 8 + Dapper (for perf queries) | EF for CRUD, Dapper for bulk ops |
| Database | SQL Server (existing) | Already available |
| Object Storage | MinIO (via official .NET SDK) | Already deployed |
| Auth | API Key middleware | Simple, sufficient for internal services |
| Cache/Lock | Redis (via Docker) | Distributed lock, dedup hash cache |
| Resilience | Polly v8 | Retry + circuit breaker for MinIO/SQL |
| Logging | Serilog (structured) | Industry standard, multiple sinks |
| Background Jobs | .NET BackgroundService | No extra infra (Hangfire overkill here) |
| Upload buffering | IFormFile (memory <10MB) + temp disk (>10MB) | Two-phase: hash first, then dedup check + upload |
| Hashing | SHA-256 (incremental) | Computed during buffering, single read pass |
| Deploy | Docker + IIS (dual) | Matches requirement |

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Single point of failure | Deploy multiple instances behind load balancer; DB is source of truth |
| 60K files/day throughput | Two-phase buffering (<10MB memory, >10MB temp disk), async I/O, connection pooling, DB indexes |
| Memory pressure from 100MB files | Large files buffer to temp disk (not memory); hash computed during buffer write; MinIO upload streams from disk |
| MinioHelper dual-ID transition | Returns both fileId + objectName; by-name endpoints for backward compat |
| SQL Server bottleneck | Monthly partitioning from day 1, proper indexing, AuditLogs auto-purge after 12mo |
| Cleanup deletes active file | 7-day grace period + soft delete + audit trail for recovery |

---

## Verification Plan

1. **Unit tests:** Service layer logic (dedup, ref counting, cleanup rules)
2. **Integration tests:** Full upload→download→release→cleanup cycle against test MinIO + SQL
3. **Load test:** Simulate 60K uploads/day, measure throughput and memory
4. **Migration test:** Register old files, verify legacy download works
5. **Cleanup test:** Create temp files, verify auto-cleanup after TTL
