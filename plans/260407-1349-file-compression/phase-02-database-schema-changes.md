# Phase 2: Database Schema Changes

## Context Links
- [002-create-tables.sql](../../scripts/pre-deployment/002-create-tables.sql) — current Files table DDL
- [002-create-stored-procedures.sql](../../scripts/post-deployment/002-create-stored-procedures.sql) — current SPs
- [FileEntity.cs](../../src/FIS.FileManager.Core/Entities/FileEntity.cs) — 19 LOC
- [FileEntityConfiguration.cs](../../src/FIS.FileManager.Infrastructure/Data/Configurations/FileEntityConfiguration.cs) — 20 LOC

## Overview
- **Priority:** High
- **Status:** Pending
- **Effort:** 2h
- **Description:** Add compression metadata columns to Files table, update EF Core entity + configuration, and create migration SQL script. Backward compatible — all new columns have defaults.

## Key Insights
- Files table is partitioned on `(FileId, CreatedAt)` — ALTER TABLE ADD COLUMN is safe on partitioned tables (applies to all partitions)
- New columns must have defaults: `IsCompressed = 0`, `CompressedSize = NULL`, `CompressionAlgorithm = NULL`
- Stored procedures use explicit column lists (not SELECT *) — `usp_FindDuplicateFile` is the only SP that might benefit from returning compression info but does NOT need it (caller gets full entity from repo)
- No FK changes needed
- EF Core does NOT manage partitioned tables — raw SQL scripts only (existing convention)

## Requirements

### Functional
- F1: Files table gains 3 columns: `IsCompressed BIT`, `CompressedSize BIGINT NULL`, `CompressionAlgorithm VARCHAR(10) NULL`
- F2: Existing rows get `IsCompressed = 0` (uncompressed)
- F3: FileEntity.cs gains matching C# properties
- F4: EF Core configuration maps new columns correctly

### Non-Functional
- NF1: ALTER TABLE is online — no downtime
- NF2: All existing queries continue to work (defaults handle backward compat)
- NF3: Script is idempotent (IF NOT EXISTS guard)

## Architecture

### New Columns on `dbo.Files`

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `IsCompressed` | `BIT NOT NULL` | `0` | Flag: was file compressed before storage? |
| `CompressedSize` | `BIGINT NULL` | `NULL` | Compressed byte count (NULL = not compressed) |
| `CompressionAlgorithm` | `VARCHAR(10) NULL` | `NULL` | Algorithm used: `gzip`, `brotli`, or NULL |

**Design choice:** `FileSize` remains the RAW (uncompressed) size. `CompressedSize` is what's actually stored in MinIO. This means:
- API responses show original file size (user expectation)
- Compression ratio = `1 - (CompressedSize / FileSize)`
- Dedup hash is on raw content (unchanged)

## Related Code Files

### Files to Create
| File | Purpose |
|------|---------|
| `scripts/pre-deployment/003-add-compression-columns.sql` | ALTER TABLE DDL |

### Files to Modify
| File | Change |
|------|--------|
| `src/FIS.FileManager.Core/Entities/FileEntity.cs` | Add 3 properties |
| `src/FIS.FileManager.Infrastructure/Data/Configurations/FileEntityConfiguration.cs` | Add column mappings |

### Files to Modify
| File | Change |
|------|--------|
| `scripts/post-deployment/002-create-stored-procedures.sql` | Update usp_FindDuplicateFile to include compression columns |

### Files NOT Modified
- IFileRepository — no new query methods needed for schema change alone
- FileRepository — EF Core auto-maps new properties
- ServiceEntity — Phase 4 handles service-level policies

## Implementation Steps

### Step 1: Create SQL migration script

Create `scripts/pre-deployment/003-add-compression-columns.sql`:

```sql
USE [FILE];
GO

-- Add compression metadata columns to Files table
-- Safe on partitioned tables; applies to all partitions
-- Idempotent: IF NOT EXISTS guards

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.Files') AND name = 'IsCompressed'
)
BEGIN
    ALTER TABLE dbo.Files ADD IsCompressed BIT NOT NULL
        CONSTRAINT DF_Files_IsCompressed DEFAULT 0;
    PRINT 'Added Files.IsCompressed';
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.Files') AND name = 'CompressedSize'
)
BEGIN
    ALTER TABLE dbo.Files ADD CompressedSize BIGINT NULL;
    PRINT 'Added Files.CompressedSize';
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.Files') AND name = 'CompressionAlgorithm'
)
BEGIN
    ALTER TABLE dbo.Files ADD CompressionAlgorithm VARCHAR(10) NULL;
    PRINT 'Added Files.CompressionAlgorithm';
END
GO
```

### Step 2: Update FileEntity.cs

Add 3 properties after `CreatedByServiceId`:

```csharp
namespace FIS.FileManager.Core.Entities;
public class FileEntity
{
    public Guid FileId { get; set; }
    public string ContentHash { get; set; } = string.Empty;
    public string ObjectName { get; set; } = string.Empty;
    public string BucketName { get; set; } = string.Empty;
    public long FileSize { get; set; }
    public string MimeType { get; set; } = string.Empty;
    public string Status { get; set; } = "Pending";
    public bool IsTemp { get; set; }
    public DateTime? ExpiresAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public Guid CreatedByServiceId { get; set; }

    // Compression metadata
    public bool IsCompressed { get; set; }
    public long? CompressedSize { get; set; }
    public string? CompressionAlgorithm { get; set; }

    // Full MinIO object key including date-based path
    public string GetFullObjectKey()
        => $"{CreatedAt:yyyy}/{CreatedAt:MM}/{CreatedAt:dd}/{CreatedAt:HH}/{CreatedAt:mm}/{ObjectName}";

    /// <summary>Actual bytes stored in MinIO. Returns CompressedSize if compressed, else FileSize.</summary>
    public long StoredSize => IsCompressed && CompressedSize.HasValue ? CompressedSize.Value : FileSize;

    /// <summary>Compression ratio as percentage saved. Returns 0 if not compressed.</summary>
    public double CompressionRatio => IsCompressed && CompressedSize.HasValue && FileSize > 0
        ? Math.Round((1.0 - (double)CompressedSize.Value / FileSize) * 100, 1)
        : 0;
}
```

### Step 3: Update FileEntityConfiguration.cs

Add column mappings after the `ExpiresAt` mapping:

```csharp
// Compression metadata
builder.Property(e => e.IsCompressed).HasDefaultValue(false);
builder.Property(e => e.CompressedSize).IsRequired(false);
builder.Property(e => e.CompressionAlgorithm).HasColumnType("varchar(10)").IsRequired(false);

// Ignore computed properties
builder.Ignore(e => e.StoredSize);
builder.Ignore(e => e.CompressionRatio);
```

### Step 4: Verify compilation

```bash
dotnet build src/FIS.FileManager.Core
dotnet build src/FIS.FileManager.Infrastructure
dotnet build
```

### Step 5: Update stored procedure usp_FindDuplicateFile

The stored procedure `usp_FindDuplicateFile` uses an explicit SELECT column list. After adding compression columns, update it to include them — otherwise Dapper will map missing columns to defaults (`IsCompressed=false`), causing wrong metadata for dedup responses.

Add to `scripts/post-deployment/002-create-stored-procedures.sql` or create a new patch script:

```sql
-- Update usp_FindDuplicateFile to include compression columns
ALTER PROCEDURE dbo.usp_FindDuplicateFile
    @ContentHash CHAR(64),
    @ServiceId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP 1 FileId, ContentHash, ObjectName, BucketName, FileSize, MimeType, Status,
                 IsTemp, ExpiresAt, CreatedAt, CreatedByServiceId,
                 IsCompressed, CompressedSize, CompressionAlgorithm
    FROM dbo.Files
    WHERE ContentHash = @ContentHash
      AND CreatedByServiceId = @ServiceId
      AND Status = 'Confirmed'
    ORDER BY CreatedAt DESC;
END
GO
```

**Note:** The existing SP likely does not filter `Status = 'Confirmed'`. Adding this filter prevents dedup from returning orphaned Pending entities (pre-existing bug amplified by compression).

### Step 6: Run SQL script against database

```bash
sqlcmd -S "10.14.142.30\BTP" -d FILE -i scripts/pre-deployment/003-add-compression-columns.sql
```

## Todo List

- [ ] Create `scripts/pre-deployment/003-add-compression-columns.sql`
- [ ] Add IsCompressed, CompressedSize, CompressionAlgorithm to FileEntity.cs
- [ ] Add StoredSize and CompressionRatio computed properties to FileEntity.cs
- [ ] Update FileEntityConfiguration.cs with column mappings + Ignore for computed props
- [ ] Update usp_FindDuplicateFile to include compression columns and filter Status='Confirmed'
- [ ] Verify dotnet build succeeds
- [ ] Execute SQL script on dev database
- [ ] Verify existing unit tests pass (no regressions)

## Success Criteria

1. SQL script executes idempotently (safe to run twice)
2. `SELECT IsCompressed, CompressedSize, CompressionAlgorithm FROM dbo.Files` returns defaults for existing rows
3. `dotnet build` succeeds with zero errors
4. Existing unit tests pass without modification
5. FileEntity.StoredSize returns FileSize when IsCompressed=false
6. FileEntity.CompressionRatio returns 0 when IsCompressed=false

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| ALTER TABLE locks partitioned table | Very Low | High | ADD COLUMN with default is online in SQL Server 2012+; metadata-only operation |
| EF Core migration conflicts with raw SQL | Low | Medium | We don't use EF migrations — raw SQL scripts only (project convention) |
| Existing tests break from new properties | Very Low | Low | Properties have defaults; constructor unchanged |
| CompressedSize NULL confusion | Low | Medium | Clear convention: NULL = not compressed; StoredSize computed property handles it |

## Security Considerations
- No new sensitive data added
- Compression metadata is informational only
- No new indexes needed (compression columns are not query predicates)

## Next Steps
- Phase 3 (Storage Compression Core) is unblocked after this phase
- Phase 4 (Per-Service Policies) needs this phase + Phase 3
