# SQL Server Partitioning & Maintenance Research Report
**Date:** 2026-02-25 | **Context:** File Management Service Database

---

## 1. PARTITION FUNCTION & SCHEME (Monthly datetime2)

### Pattern: RANGE RIGHT for datetime2
- **RANGE RIGHT:** Lower boundary value IS included in partition (simplest for datetime)
- N boundary values = N+1 partitions
- Each boundary = first value of next partition

### Initial Setup: 12 Months Forward + 1 Overflow

```sql
-- Create partition function with monthly boundaries (RIGHT range)
CREATE PARTITION FUNCTION pf_FilesByMonth_CreatedAt (datetime2(0))
    AS RANGE RIGHT
    FOR VALUES (
        '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01',
        '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01',
        '2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01'
    );
GO

-- Create partition scheme (all partitions → PRIMARY for simplicity, no separate filegroups needed for most scenarios)
CREATE PARTITION SCHEME ps_FilesByMonth_CreatedAt
    AS PARTITION pf_FilesByMonth_CreatedAt
    ALL TO ([PRIMARY]);
GO
```

### Composite PK with Partitioning

For table `Files(FileId uniqueidentifier, CreatedAt datetime2)`:
- **Clustered PK MUST include partitioning column** when unique
- Use non-clustered for business queries

```sql
CREATE TABLE dbo.Files (
    FileId UNIQUEIDENTIFIER NOT NULL,
    CreatedAt DATETIME2(0) NOT NULL,
    FileName NVARCHAR(MAX) NOT NULL,
    FileSize BIGINT NOT NULL,
    -- ... other columns

    -- Composite clustered PK: FileId first (logical), CreatedAt second (partitioning)
    CONSTRAINT pk_Files_FileIdCreatedAt PRIMARY KEY CLUSTERED (FileId, CreatedAt)
)
ON ps_FilesByMonth_CreatedAt (CreatedAt);
GO
```

**Why this works:**
- Uniqueness validated within partition + rest of cluster key = globally unique
- Partition elimination works on CreatedAt range predicates
- Clustered index supports both PK lookup + partition-based queries

---

## 2. PARTITION-ALIGNED INDEXES

### Index Alignment Requirement
- Index uses **same partition scheme** as table
- Partition function boundaries **must be identical** (same data type, values, count)
- Aligned indexes enable efficient SWITCH operations (partition archive/purge)

### Non-Unique Indexes (Auto-Include CreatedAt)

```sql
-- Non-unique NC index: engine auto-includes CreatedAt as nonkey column
CREATE NONCLUSTERED INDEX ix_Files_FileStatus_CreatedAt
    ON dbo.Files (FileStatus)
    INCLUDE (FileSize)
    ON ps_FilesByMonth_CreatedAt (CreatedAt);
GO

-- Verify alignment: query sys.partition_schemes
SELECT
    SCHEMA_NAME(t.schema_id) AS SchemaName,
    t.name AS TableName,
    i.name AS IndexName,
    CASE WHEN i.data_space_id = t.data_space_id THEN 'ALIGNED' ELSE 'NON-ALIGNED' END AS AlignmentStatus
FROM sys.tables t
JOIN sys.indexes i ON t.object_id = i.object_id
WHERE t.name = 'Files' AND i.type > 0;
GO
```

### Unique Nonclustered Indexes (Must Explicitly Include CreatedAt)

```sql
-- Unique NC index: MUST include partitioning column explicitly
CREATE UNIQUE NONCLUSTERED INDEX ux_Files_UploadToken_CreatedAt
    ON dbo.Files (UploadToken, CreatedAt)  -- CreatedAt is MANDATORY for uniqueness
    ON ps_FilesByMonth_CreatedAt (CreatedAt);
GO
```

**Why mandatory for unique indexes:**
- SQL validates uniqueness per partition (metadata operation)
- Must explicitly include partition key to ensure per-partition uniqueness = global uniqueness
- Database engine does NOT auto-add it for unique indexes

---

## 3. PARTITION MAINTENANCE: AUTO-EXTEND MONTHLY

### Problem
- Partition function defined for 12 months forward
- After 12 months, new inserts fail (out of range)
- **Solution:** Proactive extension 2-4 weeks before month ends

### T-SQL Maintenance Procedure

```sql
-- Maintenance procedure: extends partition function/scheme 3 months ahead
CREATE OR ALTER PROCEDURE sp_ExtendFilePartitions_ThreeMonthsAhead
    @ExecutionLog NVARCHAR(MAX) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @NextBoundaryDate DATETIME2(0) = DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()) + 3, 1);
    DECLARE @CurrentMonthEnd DATETIME2(0);
    DECLARE @SQL NVARCHAR(MAX);
    DECLARE @FunctionName NVARCHAR(128) = 'pf_FilesByMonth_CreatedAt';
    DECLARE @SchemeName NVARCHAR(128) = 'ps_FilesByMonth_CreatedAt';
    DECLARE @PartitionCount INT;
    DECLARE @MaxBoundary DATETIME2(0);

    BEGIN TRY
        -- Get current partition count and max boundary
        SELECT @PartitionCount = COUNT(*)
        FROM sys.partition_range_values
        WHERE function_id = (SELECT function_id FROM sys.partition_functions WHERE name = @FunctionName);

        SELECT @MaxBoundary = MAX(value)
        FROM sys.partition_range_values
        WHERE function_id = (SELECT function_id FROM sys.partition_functions WHERE name = @FunctionName);

        -- If max boundary < next quarter, extend
        IF @MaxBoundary IS NULL OR @MaxBoundary < @NextBoundaryDate
        BEGIN
            -- Add three new monthly boundaries
            SET @SQL = 'ALTER PARTITION FUNCTION ' + @FunctionName + '() SPLIT RANGE (''' +
                CAST(EOMONTH(GETDATE(), 1) + 1 DAY AS NVARCHAR(10)) + ''');';
            EXEC sp_executesql @SQL;

            SET @SQL = 'ALTER PARTITION SCHEME ' + @SchemeName + ' NEXT USED [PRIMARY];';
            EXEC sp_executesql @SQL;

            SET @ExecutionLog = 'Extended partition: ' + CAST(GETDATE() AS NVARCHAR(30)) + ' - Next boundary added.';
        END
        ELSE
        BEGIN
            SET @ExecutionLog = 'No extension needed. Max boundary: ' + CAST(@MaxBoundary AS NVARCHAR(30));
        END
    END TRY
    BEGIN CATCH
        SET @ExecutionLog = 'ERROR: ' + ERROR_MESSAGE();
        THROW;
    END CATCH
END;
GO

-- Schedule via SQL Agent Job (run monthly, 1st day)
-- EXEC sp_ExtendFilePartitions_ThreeMonthsAhead @ExecutionLog = @log OUTPUT;
```

### Alternative: RANGE SPLITTING in Loop (Production-Ready)

```sql
CREATE OR ALTER PROCEDURE sp_SplitPartitionsIfNeeded
    @PartitionFunctionName NVARCHAR(128),
    @PartitionSchemeName NVARCHAR(128),
    @ExtensionMonths INT = 3
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @pf_id INT, @FutureBoundary DATETIME2(0), @CurrentBoundary DATETIME2(0);
    DECLARE @Month INT = 1;
    DECLARE @SQL NVARCHAR(MAX);

    SELECT @pf_id = function_id FROM sys.partition_functions WHERE name = @PartitionFunctionName;

    -- Get max boundary
    SELECT @CurrentBoundary = MAX(value)
    FROM sys.partition_range_values
    WHERE function_id = @pf_id;

    SET @FutureBoundary = DATEFROMPARTS(
        YEAR(GETDATE()),
        MONTH(GETDATE()) + @ExtensionMonths,
        1
    );

    -- Extend if needed (loop to add multiple months)
    WHILE @CurrentBoundary < @FutureBoundary
    BEGIN
        SET @CurrentBoundary = EOMONTH(@CurrentBoundary) + 1 DAY;

        SET @SQL = 'ALTER PARTITION FUNCTION ' + @PartitionFunctionName + '() SPLIT RANGE (''' +
            CAST(@CurrentBoundary AS VARCHAR(10)) + ''')';
        EXEC sp_executesql @SQL;

        SET @SQL = 'ALTER PARTITION SCHEME ' + @SchemeName + ' NEXT USED [PRIMARY]';
        EXEC sp_executesql @SQL;
    END
END;
GO
```

---

## 4. PARTITION ARCHIVAL: SWITCH-OUT & PURGE

### Why SWITCH is Efficient
- **Metadata-only operation** (sub-second, no row copy)
- Moves entire partition between tables with zero locking
- **Perfect for:** monthly purge of 12-month AuditLogs

### AuditLogs Archive Pattern (Purge After 12 Months)

```sql
-- Create staging table with IDENTICAL structure + partition scheme
CREATE TABLE dbo.AuditLogs_Archive (
    AuditLogId BIGINT NOT NULL,
    CreatedAt DATETIME2(0) NOT NULL,
    EntityType NVARCHAR(100) NOT NULL,
    EntityId UNIQUEIDENTIFIER NOT NULL,
    Action NVARCHAR(50) NOT NULL,
    Changes NVARCHAR(MAX),

    CONSTRAINT pk_AuditLogs_Archive PRIMARY KEY CLUSTERED (AuditLogId, CreatedAt)
)
ON ps_FilesByMonth_CreatedAt (CreatedAt);  -- SAME scheme + partition function
GO

-- Monthly purge job: switch out old partitions to archive, then truncate
CREATE OR ALTER PROCEDURE sp_PurgeAuditLogs_OlderThan12Months
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @OldestPartitionBoundary DATETIME2(0) = DATEFROMPARTS(YEAR(GETDATE()) - 1, MONTH(GETDATE()), 1);
    DECLARE @PartitionNumber INT;
    DECLARE @SQL NVARCHAR(MAX);

    BEGIN TRY
        -- Find partition number for oldest month
        SELECT TOP 1 @PartitionNumber = p.partition_number
        FROM sys.partitions p
        JOIN sys.partition_range_values r ON p.partition_number = r.boundary_id
        WHERE p.object_id = OBJECT_ID('dbo.AuditLogs')
          AND r.value >= @OldestPartitionBoundary
        ORDER BY p.partition_number;

        IF @PartitionNumber IS NOT NULL AND @PartitionNumber > 1
        BEGIN
            -- Switch partition out
            SET @SQL = 'ALTER TABLE dbo.AuditLogs SWITCH PARTITION ' + CAST(@PartitionNumber AS NVARCHAR(5)) +
                ' TO dbo.AuditLogs_Archive PARTITION ' + CAST(@PartitionNumber AS NVARCHAR(5));
            EXEC sp_executesql @SQL;

            -- Truncate archive (purge oldest month)
            TRUNCATE TABLE dbo.AuditLogs_Archive;

            PRINT 'Switched partition ' + CAST(@PartitionNumber AS NVARCHAR(5)) + ' to archive and purged.';
        END
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO

-- Schedule: Monthly job on 1st of month (e.g., via SQL Agent)
-- EXEC sp_PurgeAuditLogs_OlderThan12Months;
```

---

## 5. HIGH-VOLUME INSERT OPTIMIZATION (20M+ rows/year ≈ 55K/day)

### Context
- Files: 5-60K inserts/day = 2-22M/year ✓ (partitioning helps)
- AuditLogs: auto-generated, likely 10K-100K/day (10M-37M/year)
- FileReferences: dependent on file activity

### Insert Best Practices

#### A. Batch Processing (Recommended for .NET)

```sql
-- Batch insert stored procedure (5K-10K rows per batch)
CREATE OR ALTER PROCEDURE sp_InsertFileBatch
    @FileDataXML XML  -- or JSON array
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO dbo.Files (FileId, CreatedAt, FileName, FileSize, FileStatus)
    SELECT
        c.value('@FileId', 'UNIQUEIDENTIFIER'),
        c.value('@CreatedAt', 'DATETIME2(0)'),
        c.value('@FileName', 'NVARCHAR(MAX)'),
        c.value('@FileSize', 'BIGINT'),
        c.value('@FileStatus', 'INT')
    FROM @FileDataXML.nodes('/files/file') t(c);

    -- For BULK-LOGGED recovery model, this achieves minimal logging
    -- For FULL recovery, consider tempdb log growth
END;
GO
```

#### B. Disable Non-Clustered Indexes During Bulk Load

```sql
-- Before bulk insert
ALTER INDEX ALL ON dbo.Files DISABLE;

-- ... insert operation ...

-- After insert
ALTER INDEX ALL ON dbo.Files REBUILD PARTITION = ALL;
```

#### C. Use TABLOCK Hint (Minimal Logging)

```sql
-- Insert with table lock (reduces locking overhead + minimal logging in BULK-LOGGED)
INSERT INTO dbo.Files WITH (TABLOCK) (FileId, CreatedAt, FileName, FileSize)
SELECT FileId, CreatedAt, FileName, FileSize
FROM @TempStaging;
```

#### D. Set Recovery Model Strategically

```sql
-- Before large load: switch to BULK-LOGGED
ALTER DATABASE [FileManagerDB] SET RECOVERY BULK_LOGGED;

-- ... perform inserts ...

-- After load: switch back to FULL
ALTER DATABASE [FileManagerDB] SET RECOVERY FULL;
BACKUP LOG [FileManagerDB] TO DISK = 'D:\SQLBackup\FileManagerDB.trn';
```

#### E. Monitor Partition Hit Rate

```sql
-- Check partition distribution after bulk inserts
SELECT
    p.partition_number,
    r.value AS BoundaryDate,
    p.rows AS RowCount,
    CONVERT(DECIMAL(10,2), (p.rows * 100.0) / SUM(p.rows) OVER()) AS PercentageOfTotal
FROM sys.partitions p
LEFT JOIN sys.partition_range_values r ON p.partition_number = r.boundary_id
WHERE p.object_id = OBJECT_ID('dbo.Files')
ORDER BY p.partition_number;
```

---

## 6. SQL SCRIPTS ORGANIZATION FOR .NET PROJECT

### Folder Structure

```
Database/
├── Migrations/                 # EF Core migrations (auto-generated)
│   ├── 20260225_InitialCreate.cs
│   ├── 20260225_InitialCreate.Designer.cs
│   └── FileManagerDbContextModelSnapshot.cs
│
├── Scripts/
│   ├── Pre-Deployment/         # Run BEFORE schema changes
│   │   └── 001_CreatePartitionFunctions.sql
│   │
│   ├── Post-Deployment/        # Run AFTER schema deployed
│   │   ├── 001_CreateIndexes.sql
│   │   ├── 002_CreateStoredProcs.sql
│   │   ├── 003_CreateSQLAgentJobs.sql
│   │   └── 004_SeedReferenceData.sql
│   │
│   ├── Maintenance/            # Scheduled jobs (run via Agent)
│   │   ├── monthly_extend_partitions.sql
│   │   ├── monthly_purge_audit_logs.sql
│   │   └── weekly_update_statistics.sql
│   │
│   └── Utilities/              # Ad-hoc queries for troubleshooting
│       ├── query_partition_sizes.sql
│       ├── query_partition_boundaries.sql
│       └── detect_partition_fragmentation.sql
│
├── Seed Data/                  # Reference tables (non-partition-related)
│   ├── FileStatuses.sql
│   ├── ServiceTypes.sql
│   └── ...
│
└── Script.PostDeployment.sql   # Master post-deployment orchestrator
```

### File Naming Convention

| Type | Pattern | Example |
|------|---------|---------|
| Migration | `YYYYMMDD_FeatureName.cs` | `20260225_InitialCreate.cs` |
| Pre-Deploy | `NNN_DescriptiveAction.sql` | `001_CreatePartitionFunctions.sql` |
| Post-Deploy | `NNN_DescriptiveAction.sql` | `002_CreateStoredProcs.sql` |
| Maintenance | `frequency_action_entity.sql` | `monthly_purge_audit_logs.sql` |

### Master Post-Deployment Orchestrator

```sql
-- Database/Scripts/Script.PostDeployment.sql
-- Executes all post-deployment scripts in correct order
IF BATCH_ABORT_ON_THROW IS OFF RETURN;

PRINT '=== Post-Deployment: Creating Indexes ==='
:r .\Post-Deployment\001_CreateIndexes.sql

PRINT '=== Post-Deployment: Creating Stored Procedures ==='
:r .\Post-Deployment\002_CreateStoredProcs.sql

PRINT '=== Post-Deployment: Creating SQL Agent Jobs ==='
:r .\Post-Deployment\003_CreateSQLAgentJobs.sql

PRINT '=== Post-Deployment: Seeding Reference Data ==='
:r .\Post-Deployment\004_SeedReferenceData.sql

PRINT '=== All post-deployment scripts completed ==='
```

### C# Integration Pattern

```csharp
// Models/Context/FileManagerDbContext.cs
protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
{
    // EF migrations handle base schema
    // Partitioning handled via post-deployment scripts
}

// Migrations/001_InitialCreate.cs (generated by EF)
protected override void Up(MigrationBuilder migrationBuilder)
{
    migrationBuilder.CreateTable("Files", table => new
    {
        FileId = table.Column<Guid>(),
        CreatedAt = table.Column<DateTime>(),
        // ... columns ...
        // PK constraint created here (no partitioning in migration)
    });
}

// Deployment script will:
// 1. Run EF migrations (creates base schema)
// 2. Run Pre-Deployment scripts (create partition functions)
// 3. Run Post-Deployment scripts (add partitions to tables via ALTER)
```

### EF Core + Partitioning Pattern

```sql
-- Post-Deployment script: Add partitioning AFTER table created by EF
-- File: Script.PostDeployment.sql or Database/Scripts/Post-Deployment/005_ApplyPartitioning.sql

-- Since Files table already created by EF, convert to partitioned via ALTER TABLE
-- This requires dropping and recreating table OR using SWITCH trick

-- Safer approach: Partition Functions created PRE-deployment (before table creation)
-- Then EF CREATE TABLE includes ON partition_scheme clause

-- Alternative: Keep EF simple, apply partitioning in post-deploy with minimal downtime
ALTER TABLE dbo.Files DROP CONSTRAINT pk_Files_FileIdCreatedAt;
ALTER TABLE dbo.Files ADD CONSTRAINT pk_Files_FileIdCreatedAt
    PRIMARY KEY CLUSTERED (FileId, CreatedAt)
    ON ps_FilesByMonth_CreatedAt (CreatedAt);
```

---

## 7. MAINTENANCE SCRIPTS: SCHEDULED JOBS

### Job 1: Extend Partitions (Monthly, 1st Day)

```sql
-- Job: Monthly Partition Extension
-- Schedule: 1st of every month, 2:00 AM
-- Purpose: Proactively add 3-month partition window

CREATE PROCEDURE sp_ScheduledTask_ExtendPartitions
AS
BEGIN
    EXEC sp_ExtendFilePartitions_ThreeMonthsAhead @ExecutionLog = @log OUTPUT;

    -- Log to admin table for audit
    INSERT INTO dbo.MaintenanceLog (TaskName, ExecutionTime, Status, Message)
    VALUES ('ExtendPartitions', GETDATE(), 'SUCCESS', @log);
END;
GO
```

### Job 2: Purge Old Audit Logs (Monthly, 2nd Day)

```sql
-- Job: Monthly AuditLogs Purge
-- Schedule: 2nd of every month, 3:00 AM
-- Purpose: Archive & delete logs older than 12 months

CREATE PROCEDURE sp_ScheduledTask_PurgeAuditLogs
AS
BEGIN
    BEGIN TRY
        EXEC sp_PurgeAuditLogs_OlderThan12Months;

        INSERT INTO dbo.MaintenanceLog (TaskName, ExecutionTime, Status, Message)
        VALUES ('PurgeAuditLogs', GETDATE(), 'SUCCESS', 'Purged logs > 12 months');
    END TRY
    BEGIN CATCH
        INSERT INTO dbo.MaintenanceLog (TaskName, ExecutionTime, Status, Message)
        VALUES ('PurgeAuditLogs', GETDATE(), 'FAILED', ERROR_MESSAGE());
        THROW;
    END CATCH
END;
GO
```

### Job 3: Update Statistics (Weekly)

```sql
-- Job: Update Statistics on Partitioned Indexes
-- Schedule: Sunday, 4:00 AM
-- Purpose: Keep stats current for query optimizer

CREATE PROCEDURE sp_ScheduledTask_UpdatePartitionStats
AS
BEGIN
    -- Update table stats (samples 3 default partitions)
    UPDATE STATISTICS dbo.Files;
    UPDATE STATISTICS dbo.FileReferences;
    UPDATE STATISTICS dbo.AuditLogs;

    -- Optionally: FULLSCAN on specific high-cardinality indexes
    UPDATE STATISTICS dbo.Files ix_Files_FileStatus_CreatedAt WITH FULLSCAN;
END;
GO
```

---

## 8. PRODUCTION CHECKLIST

- [ ] Partition function: RANGE RIGHT (datetime2), 12-month forward window
- [ ] All large tables have composite PK with CreatedAt as second column
- [ ] All NC indexes are aligned (same partition scheme as table)
- [ ] Unique NC indexes explicitly include CreatedAt
- [ ] Archive staging table matches Files/AuditLogs structure & partition scheme
- [ ] Monthly extension job configured (runs 1st of month)
- [ ] AuditLogs purge job configured (12-month retention)
- [ ] Bulk inserts use TABLOCK + batching (5-10K rows/batch)
- [ ] Recovery model: FULL (switch to BULK-LOGGED during large loads only)
- [ ] Statistics update: weekly full scan on critical indexes
- [ ] Scripts organized: Pre-Deploy, Post-Deploy, Maintenance, Utilities
- [ ] Monitoring: partition distribution query + MaintenanceLog table

---

## UNRESOLVED QUESTIONS

1. **Archive retention policy:** How long keep switched-out partitions in `AuditLogs_Archive`? (Suggest: purge immediately after SWITCH, or keep for 3 months)
2. **FileReferences partitioning:** Same strategy as Files? Separate function if different cardinality?
3. **Filegroup strategy:** Use single PRIMARY (all partitions) or multiple filegroups for tiered storage?
4. **Statistics sampling:** Adequate with default sampling, or require FULLSCAN for partition elimination queries?
5. **EF Core integration:** Migrations-only approach, or hybrid (EF for schema, T-SQL for partitioning)?

---

## SOURCES

- [Partitioned Tables and Indexes - Microsoft Learn](https://learn.microsoft.com/en-us/sql/relational-databases/partitions/partitioned-tables-and-indexes?view=sql-server-ver17)
- [Create Partitioned Tables and Indexes - Microsoft Learn](https://learn.microsoft.com/en-us/sql/relational-databases/partitions/create-partitioned-tables-and-indexes?view=sql-server-ver16)
- [CREATE PARTITION FUNCTION - Microsoft Learn](https://learn.microsoft.com/en-us/sql/t-sql/statements/create-partition-function-transact-sql?view=sql-server-ver16)
- [SQL Server Partitioning Best Practices](https://blog.sqlauthority.com/2023/11/08/sql-server-aligned-and-non-aligned-indexes-for-partitioning/)
- [Automated Table Partitioning - SQL Shack](https://www.sqlshack.com/how-to-automate-table-partitioning-in-sql-server/)
- [Archiving SQL Server Data via Partitions](https://www.sqlshack.com/archiving-sql-server-data-using-partitions/)
- [Bulk Insert Optimization - AI2SQL](https://ai2sql.io/learn/sql-bulk-insert-optimization)
- [Entity Framework Core Migrations - Microsoft Learn](https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/applying)
