---
phase: 2
title: "Database Schema"
priority: High
status: Pending
effort: 3h
depends_on: [1]
---

# Phase 02 — Database Schema

## Context Links
- [Plan Overview](plan.md)
- [Brainstorm Report](../reports/brainstorm-260225-1018-central-file-management-service.md)
- [SQL Server Partitioning Research](../reports/researcher-260225-1408-sqlserver-partitioning-scripts.md)

## Overview
Create all SQL scripts for the FILE database on `10.14.142.30\BTP`. Scripts organized in `scripts/` folder. **MSSQL MCP tool** can execute scripts directly against the database. Database is currently EMPTY.

## Key Insights
- SQL Server partitioned tables require partition column in PK → composite PKs
- No FK to partitioned tables unless FK includes partition column → app-level referential integrity
- RANGE RIGHT for datetime2 = boundary value included in higher partition
- datetime2(0) sufficient (no fractional seconds needed)
- Non-unique indexes auto-include partition column
- EF Core cannot manage partitioned tables — use raw SQL scripts exclusively

## Requirements

### Functional
- 4 tables: Services, Files, FileReferences, AuditLogs
- Monthly partitioning on CreatedAt for Files, FileReferences, AuditLogs
- All indexes from brainstorm (8 total)
- Seed initial service record

### Non-Functional
- Scripts idempotent where possible (IF NOT EXISTS checks)
- Scripts executable via MSSQL MCP tool
- Partition boundaries: current month through 12 months ahead

## Architecture

### Partitioning Strategy
```
<!-- Updated: Validation Session 1 - Add 2026-02-01 boundary -->
pf_Monthly (datetime2(0)) RANGE RIGHT:
  Boundaries: 2026-02-01 through 2027-03-01 (14 boundaries = 15 partitions)
  Partition 1: < 2026-02-01 (historical catch-all)
  Partition 2: 2026-02-01 to 2026-02-28
  ...
  Partition 14: >= 2027-03-01 (overflow)

ps_Monthly → ALL TO ([PRIMARY])

Tables on ps_Monthly: Files, FileReferences, AuditLogs
Tables NOT partitioned: Services (small lookup table)
```

### Table Relationships (app-level, no DB FK for partitioned tables)
```
Services (1) ←→ (N) Files.CreatedByServiceId
Services (1) ←→ (N) FileReferences.ServiceId
Files    (1) ←→ (N) FileReferences.FileId       [app-level only]
Files    (1) ←→ (N) AuditLogs.FileId             [app-level only]
Services (1) ←→ (N) AuditLogs.ServiceId          [app-level only]
```

## Related Code Files

### Files to Create
- `scripts/pre-deployment/001-create-partition-functions.sql`
- `scripts/pre-deployment/002-create-tables.sql`
- `scripts/post-deployment/001-create-indexes.sql`
- `scripts/post-deployment/002-create-stored-procedures.sql`
- `scripts/post-deployment/003-seed-reference-data.sql`
- `scripts/maintenance/monthly-extend-partitions.sql`
- `scripts/maintenance/monthly-purge-audit-logs.sql`
- `scripts/maintenance/weekly-update-statistics.sql`
- `scripts/utilities/query-partition-sizes.sql`
- `scripts/utilities/query-partition-boundaries.sql`
<!-- Updated: Validation Session 1 - Service registration SQL template -->
- `scripts/utilities/add-service.sql`

## Implementation Steps

### 1. Pre-deployment: Partition Functions (`scripts/pre-deployment/001-create-partition-functions.sql`)

```sql
USE [FILE];
GO

-- Monthly partition function for datetime2(0)
IF NOT EXISTS (SELECT 1 FROM sys.partition_functions WHERE name = 'pf_Monthly')
BEGIN
    <!-- Updated: Validation Session 1 - Add 2026-02-01 boundary -->
    CREATE PARTITION FUNCTION pf_Monthly (datetime2(0))
    AS RANGE RIGHT FOR VALUES (
        '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01',
        '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01',
        '2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01',
        '2027-03-01'
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.partition_schemes WHERE name = 'ps_Monthly')
BEGIN
    CREATE PARTITION SCHEME ps_Monthly
    AS PARTITION pf_Monthly ALL TO ([PRIMARY]);
END
GO
```

### 2. Pre-deployment: Create Tables (`scripts/pre-deployment/002-create-tables.sql`)

```sql
USE [FILE];
GO

-- Services (NOT partitioned — small lookup table)
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Services')
BEGIN
    CREATE TABLE dbo.Services (
        ServiceId       UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        ServiceName     NVARCHAR(63)     NOT NULL,
        ApiKey          VARCHAR(128)     NOT NULL,
        IsActive        BIT              NOT NULL DEFAULT 1,
        CreatedAt       DATETIME2(0)     NOT NULL DEFAULT SYSUTCDATETIME(),

        CONSTRAINT PK_Services PRIMARY KEY CLUSTERED (ServiceId),
        CONSTRAINT UQ_Services_ServiceName UNIQUE (ServiceName),
        CONSTRAINT UQ_Services_ApiKey UNIQUE (ApiKey)
    );
END
GO

-- Files (partitioned on CreatedAt)
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Files')
BEGIN
    CREATE TABLE dbo.Files (
        FileId              UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        ContentHash         CHAR(64)         NOT NULL,
        ObjectName          NVARCHAR(150)    NOT NULL,
        BucketName          NVARCHAR(63)     NOT NULL,
        FileSize            BIGINT           NOT NULL,
        MimeType            VARCHAR(100)     NOT NULL,
        Status              VARCHAR(10)      NOT NULL DEFAULT 'Pending',
        IsTemp              BIT              NOT NULL DEFAULT 0,
        ExpiresAt           DATETIME2(0)     NULL,
        CreatedAt           DATETIME2(0)     NOT NULL DEFAULT SYSUTCDATETIME(),
        CreatedByServiceId  UNIQUEIDENTIFIER NOT NULL,

        CONSTRAINT PK_Files PRIMARY KEY CLUSTERED (FileId, CreatedAt),
        CONSTRAINT FK_Files_Services FOREIGN KEY (CreatedByServiceId)
            REFERENCES dbo.Services(ServiceId),
        CONSTRAINT CK_Files_Status CHECK (Status IN ('Pending', 'Confirmed', 'Deleted'))
    ) ON ps_Monthly(CreatedAt);
END
GO

-- FileReferences (partitioned on CreatedAt)
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'FileReferences')
BEGIN
    CREATE TABLE dbo.FileReferences (
        RefId              UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        FileId             UNIQUEIDENTIFIER NOT NULL,
        ServiceId          UNIQUEIDENTIFIER NOT NULL,
        OriginalFileName   NVARCHAR(260)    NOT NULL,
        ReferenceKey       NVARCHAR(200)    NULL,
        Tags               NVARCHAR(MAX)    NULL,
        IsActive           BIT              NOT NULL DEFAULT 1,
        CreatedAt          DATETIME2(0)     NOT NULL DEFAULT SYSUTCDATETIME(),
        ReleasedAt         DATETIME2(0)     NULL,

        CONSTRAINT PK_FileReferences PRIMARY KEY CLUSTERED (RefId, CreatedAt),
        CONSTRAINT FK_FileReferences_Services FOREIGN KEY (ServiceId)
            REFERENCES dbo.Services(ServiceId)
        -- NO FK to Files: partitioned table cannot be FK target without partition key
    ) ON ps_Monthly(CreatedAt);
END
GO

-- AuditLogs (partitioned on CreatedAt)
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'AuditLogs')
BEGIN
    CREATE TABLE dbo.AuditLogs (
        LogId           BIGINT           IDENTITY(1,1) NOT NULL,
        CorrelationId   UNIQUEIDENTIFIER NOT NULL,
        ServiceId       UNIQUEIDENTIFIER NOT NULL,
        FileId          UNIQUEIDENTIFIER NULL,
        Action          VARCHAR(20)      NOT NULL,
        Details         NVARCHAR(MAX)    NULL,
        DurationMs      INT              NULL,
        StatusCode      SMALLINT         NULL,
        CreatedAt       DATETIME2(0)     NOT NULL DEFAULT SYSUTCDATETIME(),

        CONSTRAINT PK_AuditLogs PRIMARY KEY CLUSTERED (LogId, CreatedAt)
        -- NO FKs: audit table should not block deletes
    ) ON ps_Monthly(CreatedAt);
END
GO
```

### 3. Post-deployment: Indexes (`scripts/post-deployment/001-create-indexes.sql`)

```sql
USE [FILE];
GO

-- Files: unique index on FileId (partition-aligned)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Files_FileId')
    CREATE UNIQUE NONCLUSTERED INDEX IX_Files_FileId
    ON dbo.Files (FileId, CreatedAt)
    ON ps_Monthly(CreatedAt);
GO

-- Files: dedup lookup (ContentHash + ServiceId, partition-aligned)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Files_ContentHash_ServiceId')
    CREATE NONCLUSTERED INDEX IX_Files_ContentHash_ServiceId
    ON dbo.Files (ContentHash, CreatedByServiceId, CreatedAt)
    ON ps_Monthly(CreatedAt);
GO

-- Files: by-name lookup (NOT partition-aligned — cross-partition by-name queries)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Files_ObjectName')
    CREATE NONCLUSTERED INDEX IX_Files_ObjectName
    ON dbo.Files (ObjectName)
    INCLUDE (FileId, BucketName, CreatedAt, Status);
GO

-- Files: cleanup scan (Status + CreatedAt)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Files_Status_CreatedAt')
    CREATE NONCLUSTERED INDEX IX_Files_Status_CreatedAt
    ON dbo.Files (Status, CreatedAt)
    INCLUDE (FileId, BucketName, ObjectName)
    ON ps_Monthly(CreatedAt);
GO

-- Files: temp cleanup (filtered index)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Files_IsTemp_ExpiresAt')
    CREATE NONCLUSTERED INDEX IX_Files_IsTemp_ExpiresAt
    ON dbo.Files (IsTemp, ExpiresAt)
    INCLUDE (FileId, BucketName, ObjectName, CreatedAt)
    WHERE IsTemp = 1
    ON ps_Monthly(CreatedAt);
GO

-- FileReferences: ref counting (FileId + IsActive)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_FileReferences_FileId_IsActive')
    CREATE NONCLUSTERED INDEX IX_FileReferences_FileId_IsActive
    ON dbo.FileReferences (FileId, IsActive)
    INCLUDE (ServiceId, RefId)
    ON ps_Monthly(CreatedAt);
GO

-- AuditLogs: trace lookup
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AuditLogs_CorrelationId')
    CREATE NONCLUSTERED INDEX IX_AuditLogs_CorrelationId
    ON dbo.AuditLogs (CorrelationId)
    ON ps_Monthly(CreatedAt);
GO

-- AuditLogs: service activity
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AuditLogs_ServiceId_CreatedAt')
    CREATE NONCLUSTERED INDEX IX_AuditLogs_ServiceId_CreatedAt
    ON dbo.AuditLogs (ServiceId, CreatedAt)
    ON ps_Monthly(CreatedAt);
GO
```

### 4. Post-deployment: Stored Procedures (`scripts/post-deployment/002-create-stored-procedures.sql`)

```sql
USE [FILE];
GO

-- Get active reference count for a file
CREATE OR ALTER PROCEDURE dbo.usp_GetActiveReferenceCount
    @FileId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SELECT COUNT(*) AS ActiveRefCount
    FROM dbo.FileReferences
    WHERE FileId = @FileId AND IsActive = 1;
END
GO

-- Find confirmed file by hash + service (dedup check)
-- <!-- Red Team: Dedup Query Partition Fix — 2026-02-25 -->
-- Bound query to recent 90 days to avoid full partition fan-out
-- Primary dedup check should use Redis cache; this is DB fallback
CREATE OR ALTER PROCEDURE dbo.usp_FindDuplicateFile
    @ContentHash CHAR(64),
    @ServiceId UNIQUEIDENTIFIER,
    @LookbackDays INT = 90
AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP 1 FileId, ObjectName, BucketName, FileSize, MimeType, CreatedAt
    FROM dbo.Files
    WHERE ContentHash = @ContentHash
      AND CreatedByServiceId = @ServiceId
      AND Status = 'Confirmed'
      AND CreatedAt >= DATEADD(DAY, -@LookbackDays, SYSUTCDATETIME())
    ORDER BY CreatedAt DESC;
END
GO

-- Get stale pending files for cleanup
CREATE OR ALTER PROCEDURE dbo.usp_GetStalePendingFiles
    @StaleMinutes INT = 15
AS
BEGIN
    SET NOCOUNT ON;
    SELECT FileId, ObjectName, BucketName, CreatedAt
    FROM dbo.Files
    WHERE Status = 'Pending'
      AND CreatedAt < DATEADD(MINUTE, -@StaleMinutes, SYSUTCDATETIME());
END
GO

-- Get orphan files (confirmed, no active refs, past grace period)
-- <!-- Red Team: Orphan Grace Period Fix — 2026-02-25 -->
-- Use last reference release date, not file CreatedAt, for grace period
-- A file created 30 days ago but released 1 minute ago should NOT be deleted
CREATE OR ALTER PROCEDURE dbo.usp_GetOrphanFiles
    @GraceDays INT = 7
AS
BEGIN
    SET NOCOUNT ON;
    SELECT f.FileId, f.ObjectName, f.BucketName, f.CreatedAt
    FROM dbo.Files f
    WHERE f.Status = 'Confirmed'
      AND NOT EXISTS (
          SELECT 1 FROM dbo.FileReferences r
          WHERE r.FileId = f.FileId AND r.IsActive = 1
      )
      -- Grace period starts from when the LAST reference was released
      AND NOT EXISTS (
          SELECT 1 FROM dbo.FileReferences r2
          WHERE r2.FileId = f.FileId
            AND r2.ReleasedAt > DATEADD(DAY, -@GraceDays, SYSUTCDATETIME())
      )
      -- Also handle files that never had any reference (stale uploads that got confirmed)
      AND (EXISTS (SELECT 1 FROM dbo.FileReferences r3 WHERE r3.FileId = f.FileId)
           OR f.CreatedAt < DATEADD(DAY, -@GraceDays, SYSUTCDATETIME()));
END
GO

-- Get expired temp files
CREATE OR ALTER PROCEDURE dbo.usp_GetExpiredTempFiles
AS
BEGIN
    SET NOCOUNT ON;
    SELECT FileId, ObjectName, BucketName, CreatedAt
    FROM dbo.Files
    WHERE IsTemp = 1
      AND ExpiresAt < SYSUTCDATETIME()
      AND Status = 'Confirmed';
END
GO
```

### 5. Post-deployment: Seed Data (`scripts/post-deployment/003-seed-reference-data.sql`)

```sql
USE [FILE];
GO

-- <!-- Red Team: API Key Auth Fix — 2026-02-25 -->
-- Seed initial service (example — replace with real service)
-- API key auth flow: client sends raw key in X-Api-Key header
-- Middleware computes HMAC-SHA256(raw_key, salt) and compares to stored ApiKey
-- Salt stored as first 32 chars of ApiKey, hash as remaining chars
IF NOT EXISTS (SELECT 1 FROM dbo.Services WHERE ServiceName = 'default-service')
BEGIN
    INSERT INTO dbo.Services (ServiceId, ServiceName, ApiKey, IsActive)
    VALUES (
        NEWID(),
        'default-service',
        -- Format: {salt}:{hmac_hash} — generate via service admin tool
        -- Placeholder: MUST be replaced with properly generated HMAC-SHA256 hash
        'REPLACE_WITH_GENERATED_HMAC_HASH',
        1
    );
END
GO
```

### 6. Maintenance: Monthly Partition Extension (`scripts/maintenance/monthly-extend-partitions.sql`)

```sql
USE [FILE];
GO

-- Run monthly: adds next month's boundary to partition function
-- Calculate next boundary dynamically
DECLARE @NextBoundary DATETIME2(0);
DECLARE @MaxBoundary SQL_VARIANT;

SELECT @MaxBoundary = MAX(prv.value)
FROM sys.partition_functions pf
JOIN sys.partition_range_values prv ON pf.function_id = prv.function_id
WHERE pf.name = 'pf_Monthly';

SET @NextBoundary = DATEADD(MONTH, 1, CAST(@MaxBoundary AS DATETIME2(0)));

-- Only extend if boundary doesn't already exist
IF @NextBoundary IS NOT NULL
BEGIN
    DECLARE @SQL NVARCHAR(200) = N'ALTER PARTITION FUNCTION pf_Monthly() SPLIT RANGE ('''
        + CONVERT(VARCHAR(20), @NextBoundary, 120) + N''')';

    -- Ensure next filegroup is mapped
    ALTER PARTITION SCHEME ps_Monthly NEXT USED [PRIMARY];

    EXEC sp_executesql @SQL;

    PRINT 'Added partition boundary: ' + CONVERT(VARCHAR(20), @NextBoundary, 120);
END
GO
```

### 7. Maintenance: Purge Old Audit Logs (`scripts/maintenance/monthly-purge-audit-logs.sql`)

```sql
USE [FILE];
GO

-- Purge audit logs older than 12 months via partition TRUNCATE
-- Faster than DELETE — instant metadata operation
DECLARE @CutoffDate DATETIME2(0) = DATEADD(MONTH, -12, SYSUTCDATETIME());
DECLARE @PartitionNumber INT;

SELECT @PartitionNumber = $PARTITION.pf_Monthly(@CutoffDate);

-- Only truncate if partition contains old data
IF @PartitionNumber > 0
BEGIN
    -- Note: TRUNCATE TABLE ... WITH (PARTITIONS(n)) requires SQL Server 2016+
    TRUNCATE TABLE dbo.AuditLogs WITH (PARTITIONS(@PartitionNumber));
    PRINT 'Truncated AuditLogs partition ' + CAST(@PartitionNumber AS VARCHAR(10));
END
GO
```

### 8. Maintenance: Weekly Statistics Update (`scripts/maintenance/weekly-update-statistics.sql`)

```sql
USE [FILE];
GO

UPDATE STATISTICS dbo.Files WITH FULLSCAN;
UPDATE STATISTICS dbo.FileReferences WITH FULLSCAN;
UPDATE STATISTICS dbo.AuditLogs WITH FULLSCAN;

PRINT 'Statistics updated for Files, FileReferences, AuditLogs';
GO
```

### 9. Utilities: Query Partition Sizes (`scripts/utilities/query-partition-sizes.sql`)

```sql
USE [FILE];
GO

SELECT
    t.name AS TableName,
    p.partition_number AS PartitionNumber,
    prv.value AS BoundaryValue,
    p.rows AS RowCount,
    CAST(SUM(a.total_pages) * 8.0 / 1024 AS DECIMAL(10,2)) AS SizeMB
FROM sys.tables t
JOIN sys.indexes i ON t.object_id = i.object_id AND i.index_id <= 1
JOIN sys.partitions p ON i.object_id = p.object_id AND i.index_id = p.index_id
JOIN sys.allocation_units a ON p.partition_id = a.container_id
LEFT JOIN sys.partition_schemes ps ON i.data_space_id = ps.data_space_id
LEFT JOIN sys.partition_functions pf ON ps.function_id = pf.function_id
LEFT JOIN sys.partition_range_values prv ON pf.function_id = prv.function_id
    AND p.partition_number = prv.boundary_id + 1
WHERE t.name IN ('Files', 'FileReferences', 'AuditLogs')
GROUP BY t.name, p.partition_number, prv.value, p.rows
ORDER BY t.name, p.partition_number;
GO
```

### 10. Utilities: Query Partition Boundaries (`scripts/utilities/query-partition-boundaries.sql`)

```sql
USE [FILE];
GO

SELECT
    pf.name AS PartitionFunction,
    ps.name AS PartitionScheme,
    prv.boundary_id + 1 AS PartitionNumber,
    prv.value AS BoundaryValue,
    CASE pf.boundary_value_on_right WHEN 1 THEN 'RIGHT' ELSE 'LEFT' END AS RangeType
FROM sys.partition_functions pf
JOIN sys.partition_schemes ps ON pf.function_id = ps.function_id
JOIN sys.partition_range_values prv ON pf.function_id = prv.function_id
WHERE pf.name = 'pf_Monthly'
ORDER BY prv.boundary_id;
GO
```

### 11. Utilities: Add Service Template (`scripts/utilities/add-service.sql`)

<!-- Updated: Validation Session 1 - Service registration SQL template -->
```sql
USE [FILE];
GO

-- Template for registering a new service
-- Steps:
--   1. Generate a raw API key (any secure random string)
--   2. Generate a salt: 32-char hex string (e.g., openssl rand -hex 16)
--   3. Compute HMAC-SHA256(raw_key, salt) → hex encode
--   4. Store as: {salt}:{hmac_hex}
--   5. Give the raw key to the service team (never stored in DB)

DECLARE @ServiceName NVARCHAR(63) = N'REPLACE_SERVICE_NAME';
DECLARE @ApiKeyHash VARCHAR(128) = 'REPLACE_WITH_SALT_COLON_HMAC_HASH';

IF NOT EXISTS (SELECT 1 FROM dbo.Services WHERE ServiceName = @ServiceName)
BEGIN
    INSERT INTO dbo.Services (ServiceId, ServiceName, ApiKey, IsActive)
    VALUES (NEWID(), @ServiceName, @ApiKeyHash, 1);
    PRINT 'Service registered: ' + @ServiceName;
END
ELSE
    PRINT 'Service already exists: ' + @ServiceName;
GO
```

### 12. Execute scripts via MSSQL MCP

Run in order:
1. `scripts/pre-deployment/001-create-partition-functions.sql`
2. `scripts/pre-deployment/002-create-tables.sql`
3. `scripts/post-deployment/001-create-indexes.sql`
4. `scripts/post-deployment/002-create-stored-procedures.sql`
5. `scripts/post-deployment/003-seed-reference-data.sql`

**Important:** Use MSSQL MCP tool to execute each script against the FILE database.

## Todo List
- [ ] Create `scripts/pre-deployment/001-create-partition-functions.sql`
- [ ] Create `scripts/pre-deployment/002-create-tables.sql`
- [ ] Create `scripts/post-deployment/001-create-indexes.sql`
- [ ] Create `scripts/post-deployment/002-create-stored-procedures.sql`
- [ ] Create `scripts/post-deployment/003-seed-reference-data.sql`
- [ ] Create `scripts/maintenance/monthly-extend-partitions.sql`
- [ ] Create `scripts/maintenance/monthly-purge-audit-logs.sql`
- [ ] Create `scripts/maintenance/weekly-update-statistics.sql`
- [ ] Create `scripts/utilities/query-partition-sizes.sql`
- [ ] Create `scripts/utilities/query-partition-boundaries.sql`
- [ ] Execute pre-deployment scripts via MSSQL MCP
- [ ] Execute post-deployment scripts via MSSQL MCP
- [ ] Verify tables/indexes/partitions created correctly

## Success Criteria
- All 4 tables exist in FILE database with correct columns and constraints
- Partition function `pf_Monthly` has 14 boundaries (Feb 2026 – Mar 2027)
- All 8 indexes created and partition-aligned where specified
- All 5 stored procedures created
- Seed service record exists
- `query-partition-sizes.sql` returns valid results

## Risk Assessment
| Risk | Mitigation |
|------|-----------|
| Partition function already exists (re-run) | IF NOT EXISTS guards |
| Wrong datetime2 precision | Explicitly use datetime2(0) everywhere |
| FK constraint blocks partitioned table operations | Only FK from partitioned tables TO non-partitioned Services |

## Security Considerations
- DB credentials (sa/123456) for dev only — use Windows Auth or managed identity in prod
- Audit logs capture all operations for compliance
- No PII stored in AuditLogs.Details (only file metadata)

## Next Steps
→ Phase 03: Core Layer (entity models map to these tables)
→ Phase 04: Infrastructure (EF Core DbContext maps these tables)
