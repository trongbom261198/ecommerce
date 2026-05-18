# Phase 4: Per-Service Compression Policies

## Context Links
- [Phase 2 — DB Schema](phase-02-database-schema-changes.md) — prerequisite
- [Phase 3 — Storage Compression Core](phase-03-storage-compression-core.md) — prerequisite (CompressionService)
- [ServiceEntity.cs](../../src/FIS.FileManager.Core/Entities/ServiceEntity.cs) — 9 LOC
- [ServiceEntityConfiguration.cs](../../src/FIS.FileManager.Infrastructure/Data/Configurations/ServiceEntityConfiguration.cs) — 17 LOC
- [CompressionOptions.cs](../../src/FIS.FileManager.Core/Options/CompressionOptions.cs) — created in Phase 3

## Overview
- **Priority:** Medium
- **Status:** Pending
- **Effort:** 3h
- **Depends on:** Phase 2 + Phase 3
- **Description:** Allow each service to override the global compression policy. Some services may want compression disabled (latency-sensitive) or may want different compressible MIME type lists. Policy stored in Services table, read during upload.

## Key Insights
- Current `CompressionService.ShouldCompress()` reads global config. This phase adds a per-service override.
- Keep it simple: a single `CompressionPolicy` column on Services table with 3 values: `Default`, `ForceOn`, `ForceOff`.
- `Default` = use global CompressionOptions. `ForceOn` = always compress (ignore MIME type). `ForceOff` = never compress.
- No need for per-service MIME type overrides — YAGNI. The 3-value policy covers real use cases.
- ServiceEntity is already loaded in FileService.UploadAsync (line 91: `_repo.GetServiceByIdAsync`), so no additional DB query.

## Requirements

### Functional
- F1: Services table gains `CompressionPolicy VARCHAR(10) NOT NULL DEFAULT 'Default'`
- F2: ServiceEntity gains `CompressionPolicy` property
- F3: CompressionService gains overloaded `ShouldCompress(mimeType, fileSize, policy)` accepting policy
- F4: FileService.UploadAsync reads service's policy and passes to CompressionService
- F5: SQL utility script for operators to update a service's policy

### Non-Functional
- NF1: Existing services default to `Default` policy (no behavior change)
- NF2: No new API endpoints — policy managed via SQL (same as service onboarding)
- NF3: No caching of policies — ServiceEntity is already fetched per-upload

## Architecture

### Decision Flow

```
FileService.UploadAsync
  |
  v
service = _repo.GetServiceByIdAsync(serviceId)  [already exists]
  |
  v
service.CompressionPolicy
  |
  +---> "ForceOff"  --> skip compression entirely
  |
  +---> "ForceOn"   --> compress regardless of MIME type (still skip if <1KB)
  |
  +---> "Default"   --> use CompressionService.ShouldCompress(mimeType, fileSize)
```

### Column Design

Single enum-like column vs JSON config blob:
- **Chosen: enum column** — `VARCHAR(10)` with CHECK constraint
- Rejected: JSON blob with per-service MIME overrides — YAGNI, adds parsing complexity
- If per-service MIME overrides needed later, add `CompressionConfig NVARCHAR(MAX) NULL` column then

## Related Code Files

### Files to Create
| File | Purpose |
|------|---------|
| `scripts/pre-deployment/004-add-service-compression-policy.sql` | ALTER TABLE Services |
| `scripts/utilities/update-service-compression-policy.sql` | Operator utility script |

### Files to Modify
| File | Change |
|------|--------|
| `src/FIS.FileManager.Core/Entities/ServiceEntity.cs` | Add CompressionPolicy property |
| `src/FIS.FileManager.Infrastructure/Data/Configurations/ServiceEntityConfiguration.cs` | Map new column |
| `src/FIS.FileManager.Core/Services/CompressionService.cs` | Add policy-aware ShouldCompress overload |
| `src/FIS.FileManager.Core/Interfaces/ICompressionService.cs` | Add overloaded method signature |
| `src/FIS.FileManager.Core/Services/FileService.cs` | Pass service.CompressionPolicy to ShouldCompress |

## Implementation Steps

### Step 1: Create SQL migration script

Path: `scripts/pre-deployment/004-add-service-compression-policy.sql`

```sql
USE [FILE];
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.Services') AND name = 'CompressionPolicy'
)
BEGIN
    ALTER TABLE dbo.Services ADD CompressionPolicy VARCHAR(10) NOT NULL
        CONSTRAINT DF_Services_CompressionPolicy DEFAULT 'Default';

    ALTER TABLE dbo.Services ADD
        CONSTRAINT CK_Services_CompressionPolicy
        CHECK (CompressionPolicy IN ('Default', 'ForceOn', 'ForceOff'));

    PRINT 'Added Services.CompressionPolicy';
END
GO
```

### Step 2: Create utility script

Path: `scripts/utilities/update-service-compression-policy.sql`

```sql
-- Update a service's compression policy
-- Usage: Replace @ServiceName and @Policy values, then execute
-- Policies: 'Default' (use global config), 'ForceOn' (always compress), 'ForceOff' (never compress)

DECLARE @ServiceName NVARCHAR(63) = N'<service-name-here>';
DECLARE @Policy VARCHAR(10) = 'Default';  -- Change to 'ForceOn' or 'ForceOff'

UPDATE dbo.Services
SET CompressionPolicy = @Policy
WHERE ServiceName = @ServiceName;

IF @@ROWCOUNT = 0
    PRINT 'ERROR: Service not found: ' + @ServiceName;
ELSE
    PRINT 'Updated compression policy for ' + @ServiceName + ' to ' + @Policy;
GO
```

### Step 3: Update ServiceEntity.cs

```csharp
namespace FIS.FileManager.Core.Entities;
public class ServiceEntity
{
    public Guid ServiceId { get; set; }
    public string ServiceName { get; set; } = string.Empty;
    public string ApiKey { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; }
    public string CompressionPolicy { get; set; } = "Default";
}
```

### Step 4: Update ServiceEntityConfiguration.cs

Add after the existing `HasIndex` calls:

```csharp
builder.Property(e => e.CompressionPolicy)
    .HasColumnType("varchar(10)")
    .HasDefaultValue("Default")
    .IsRequired();
```

### Step 5: Update ICompressionService.cs

Add overloaded method:

```csharp
/// <summary>Check if compression should apply, considering per-service policy override.</summary>
bool ShouldCompress(string mimeType, long fileSize, string compressionPolicy);
```

### Step 6: Update CompressionService.cs

Add the policy-aware overload:

```csharp
public bool ShouldCompress(string mimeType, long fileSize, string compressionPolicy)
{
    // Per-service policy overrides
    if (string.Equals(compressionPolicy, "ForceOff", StringComparison.OrdinalIgnoreCase))
        return false;

    if (string.Equals(compressionPolicy, "ForceOn", StringComparison.OrdinalIgnoreCase))
        return _options.StorageEnabled && fileSize >= _options.MinFileSizeBytes;

    // "Default" — use global MIME-type-based logic
    return ShouldCompress(mimeType, fileSize);
}
```

Note: `ForceOn` still respects `StorageEnabled` global kill switch and minimum file size. This prevents compressing 10-byte files even when forced.

### Step 7: Update FileService.UploadAsync

Change the compression check (from Phase 3) to use the service policy:

```csharp
// Before (Phase 3):
if (_compression.ShouldCompress(mimeType, fileSize))

// After (Phase 4):
if (_compression.ShouldCompress(mimeType, fileSize, service.CompressionPolicy))
```

The `service` variable is already loaded at line ~91 (`_repo.GetServiceByIdAsync`), so this is a one-line change.

### Step 8: Verify build + tests

```bash
dotnet build
dotnet test tests/FIS.FileManager.UnitTests
```

### Step 9: Execute SQL script

```bash
sqlcmd -S "10.14.142.30\BTP" -d FILE -i scripts/pre-deployment/004-add-service-compression-policy.sql
```

## Todo List

- [ ] Create `scripts/pre-deployment/004-add-service-compression-policy.sql`
- [ ] Create `scripts/utilities/update-service-compression-policy.sql`
- [ ] Add CompressionPolicy property to ServiceEntity.cs
- [ ] Update ServiceEntityConfiguration.cs with column mapping
- [ ] Add policy-aware `ShouldCompress` overload to ICompressionService
- [ ] Implement policy-aware `ShouldCompress` in CompressionService
- [ ] Update FileService.UploadAsync to pass service.CompressionPolicy
- [ ] Verify dotnet build succeeds
- [ ] Execute SQL script on dev database
- [ ] Verify existing tests pass

## Success Criteria

1. SQL script adds column with default `'Default'` and CHECK constraint
2. Existing services have `CompressionPolicy = 'Default'` — no behavior change
3. Service with `ForceOff` policy: uploads always store uncompressed
4. Service with `ForceOn` policy: text AND image files both get compressed (images may have <5% gain but that's the admin's choice)
5. Global `StorageEnabled=false` still overrides `ForceOn` (kill switch)
6. `dotnet build` succeeds; existing tests pass

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Invalid policy value in DB | Low | Medium | CHECK constraint prevents bad data; default handles unknown values |
| ForceOn compresses images wastefully | Low | Low | Admin's explicit choice; MinFileSizeBytes still applies |
| Extra complexity for simple feature | Low | Low | Single column, 3 values, one-line change in FileService |

## Security Considerations
- CompressionPolicy is internal metadata — not exposed in API responses
- Only operators with DB access can change policies (no admin API)
- No elevation of privilege — policy affects storage format only

## Next Steps
- Phase 5 (Analytics) can run after this phase
- Phase 6 (Testing) needs all previous phases complete
