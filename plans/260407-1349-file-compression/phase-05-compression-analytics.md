# Phase 5: Compression Analytics

## Context Links
- [Phase 3 — Storage Compression Core](phase-03-storage-compression-core.md) — prerequisite (compression metadata in DB)
- [FileInfoResponse.cs](../../src/FIS.FileManager.Shared/Responses/FileInfoResponse.cs) — 12 LOC
- [UploadFileResponse.cs](../../src/FIS.FileManager.Shared/Responses/UploadFileResponse.cs) — 10 LOC
- [FilesController.cs](../../src/FIS.FileManager.Api/Controllers/FilesController.cs) — 148 LOC
- [IFileRepository.cs](../../src/FIS.FileManager.Core/Interfaces/IFileRepository.cs) — 29 LOC

## Overview
- **Priority:** Low
- **Status:** Pending
- **Effort:** 3h
- **Depends on:** Phase 3 (needs IsCompressed/CompressedSize in DB)
- **Description:** Expose compression metadata in existing API responses and add a new analytics endpoint for aggregate compression stats per service.

## Key Insights
- FileInfoResponse and UploadFileResponse already exist — just add fields
- Aggregate stats query is a simple SQL GROUP BY on Files table — no new stored procedure needed, Dapper query suffices
- Stats endpoint is read-only, scoped to calling service (same auth model)
- No caching needed for MVP — query is fast on indexed columns

## Requirements

### Functional
- F1: `GET /api/files/{fileId}/info` response includes IsCompressed, CompressedSize, CompressionRatio
- F2: `POST /api/files/upload` response includes IsCompressed, CompressedSize
- F3: New endpoint `GET /api/files/compression-stats` returns aggregate stats for calling service
- F4: Stats include: total files, compressed files, total raw size, total stored size, overall savings %

### Non-Functional
- NF1: Existing API consumers unaffected — new fields are additive (JSON backward compatible)
- NF2: Stats query must not full-scan — use indexed columns
- NF3: No caching for MVP

## Architecture

### Stats Query

```sql
SELECT
    COUNT(*)                                    AS TotalFiles,
    SUM(CASE WHEN IsCompressed = 1 THEN 1 ELSE 0 END) AS CompressedFiles,
    SUM(FileSize)                               AS TotalRawBytes,
    SUM(CASE WHEN IsCompressed = 1 THEN CompressedSize ELSE FileSize END) AS TotalStoredBytes
FROM dbo.Files
WHERE CreatedByServiceId = @ServiceId
  AND Status = 'Confirmed'
  AND CreatedAt >= DATEADD(DAY, -90, GETDATE());
```
Note: `CreatedAt` filter enables partition elimination on the partitioned Files table. 90-day default covers the most relevant compression activity.

Compression savings = `1 - (TotalStoredBytes / TotalRawBytes)` computed in C#.

### Response Models

**FileInfoResponse** (enriched):
```json
{
    "fileId": "...",
    "objectName": "...",
    "fileName": "...",
    "fileSize": 102400,
    "mimeType": "text/plain",
    "contentHash": "abc123...",
    "createdAt": "2026-04-07T10:00:00Z",
    "tags": null,
    "isCompressed": true,
    "compressedSize": 12800,
    "compressionRatio": 87.5
}
```

**CompressionStatsResponse** (new):
```json
{
    "totalFiles": 1500,
    "compressedFiles": 980,
    "totalRawBytes": 5368709120,
    "totalStoredBytes": 2147483648,
    "savingsPercent": 60.0,
    "compressionCoverage": 65.3
}
```

## Related Code Files

### Files to Create
| File | Location | LOC Est. |
|------|----------|----------|
| `CompressionStatsResponse.cs` | `src/FIS.FileManager.Shared/Responses/` | ~12 |

### Files to Modify
| File | Change |
|------|--------|
| `src/FIS.FileManager.Shared/Responses/FileInfoResponse.cs` | Add 3 compression fields |
| `src/FIS.FileManager.Shared/Responses/UploadFileResponse.cs` | Add 2 compression fields |
| `src/FIS.FileManager.Shared/Responses/BatchUploadItemResponse.cs` | Add IsCompressed, CompressedSize fields |
| `src/FIS.FileManager.Core/Services/FileService.cs` | Populate compression fields in responses; add GetCompressionStatsAsync |
| `src/FIS.FileManager.Core/Interfaces/IFileRepository.cs` | Add GetCompressionStatsAsync method |
| `src/FIS.FileManager.Infrastructure/Data/Repositories/FileRepository.cs` | Implement stats query via Dapper |
| `src/FIS.FileManager.Api/Controllers/FilesController.cs` | Add compression-stats endpoint |
| `src/FIS.FileManager.Api/Controllers/LegacyController.cs` | Verify decompression works for by-name downloads |

## Implementation Steps

### Step 1: Create CompressionStatsResponse.cs

Path: `src/FIS.FileManager.Shared/Responses/CompressionStatsResponse.cs`

```csharp
namespace FIS.FileManager.Shared.Responses;
public class CompressionStatsResponse
{
    public int TotalFiles { get; set; }
    public int CompressedFiles { get; set; }
    public long TotalRawBytes { get; set; }
    public long TotalStoredBytes { get; set; }
    /// <summary>Percentage of storage saved via compression. 0-100.</summary>
    public double SavingsPercent { get; set; }
    /// <summary>Percentage of files that are compressed. 0-100.</summary>
    public double CompressionCoverage { get; set; }
}
```

### Step 2: Update FileInfoResponse.cs

Add 3 fields after `Tags`:

```csharp
namespace FIS.FileManager.Shared.Responses;
public class FileInfoResponse
{
    public Guid FileId { get; set; }
    public string ObjectName { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public long FileSize { get; set; }
    public string MimeType { get; set; } = string.Empty;
    public string ContentHash { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public string? Tags { get; set; }
    // Compression metadata
    public bool IsCompressed { get; set; }
    public long? CompressedSize { get; set; }
    public double CompressionRatio { get; set; }
}
```

### Step 3: Update UploadFileResponse.cs

Add compression fields:

```csharp
namespace FIS.FileManager.Shared.Responses;
public class UploadFileResponse
{
    public Guid FileId { get; set; }
    public string ObjectName { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public long FileSize { get; set; }
    public string ContentHash { get; set; } = string.Empty;
    public bool IsDuplicate { get; set; }
    public bool IsCompressed { get; set; }
    public long? CompressedSize { get; set; }
}
```

### Step 3b: Update BatchUploadItemResponse

In `FilesController.BatchUpload`, the response mapping explicitly lists fields. Add compression fields:
```csharp
results.Add(new BatchUploadItemResponse
{
    Index = i, FileId = upload.FileId, ObjectName = upload.ObjectName,
    FileName = upload.FileName, FileSize = upload.FileSize,
    ContentHash = upload.ContentHash, IsDuplicate = upload.IsDuplicate,
    IsCompressed = upload.IsCompressed, CompressedSize = upload.CompressedSize
});
```

### Step 4: Update FileService response mappings

In `UploadAsync`, update the two return statements to include compression fields:

**New file return (around line ~135):**
```csharp
return new UploadFileResponse
{
    FileId = entity.FileId, ObjectName = entity.ObjectName,
    FileName = request.OriginalFileName, FileSize = fileSize,
    ContentHash = hash, IsDuplicate = false,
    IsCompressed = entity.IsCompressed,
    CompressedSize = entity.CompressedSize
};
```

**Duplicate return (around line ~83):**
```csharp
return new UploadFileResponse
{
    FileId = existing.FileId, ObjectName = existing.ObjectName,
    FileName = request.OriginalFileName, FileSize = existing.FileSize,
    ContentHash = hash, IsDuplicate = true,
    IsCompressed = existing.IsCompressed,
    CompressedSize = existing.CompressedSize
};
```

In `GetInfoAsync` and `GetBatchInfoAsync`, update the FileInfoResponse mapping:

```csharp
return new FileInfoResponse
{
    FileId = file.FileId, ObjectName = file.ObjectName, FileName = file.ObjectName,
    FileSize = file.FileSize, MimeType = file.MimeType, ContentHash = file.ContentHash,
    CreatedAt = file.CreatedAt, Tags = null,
    IsCompressed = file.IsCompressed,
    CompressedSize = file.CompressedSize,
    CompressionRatio = file.CompressionRatio
};
```

### Step 5: Add repository method for stats

In `IFileRepository.cs`, add:

```csharp
Task<CompressionStatsResponse> GetCompressionStatsAsync(Guid serviceId, CancellationToken ct = default);
```

### Step 6: Implement stats query in FileRepository

Use Dapper for the aggregate query. Add to `FileRepository.cs`:

```csharp
public async Task<CompressionStatsResponse> GetCompressionStatsAsync(Guid serviceId, CancellationToken ct)
{
    const string sql = @"
        SELECT
            COUNT(*)                                                         AS TotalFiles,
            SUM(CASE WHEN IsCompressed = 1 THEN 1 ELSE 0 END)              AS CompressedFiles,
            ISNULL(SUM(FileSize), 0)                                        AS TotalRawBytes,
            ISNULL(SUM(CASE WHEN IsCompressed = 1 AND CompressedSize IS NOT NULL
                        THEN CompressedSize ELSE FileSize END), 0)          AS TotalStoredBytes
        FROM dbo.Files
        WHERE CreatedByServiceId = @ServiceId
          AND Status = 'Confirmed'
          AND CreatedAt >= DATEADD(DAY, -90, GETDATE());";
        // 90-day default for partition elimination. Add optional date range parameters later if needed.

    using var conn = new SqlConnection(_connectionString);
    var row = await conn.QuerySingleAsync<(int TotalFiles, int CompressedFiles, long TotalRawBytes, long TotalStoredBytes)>(
        sql, new { ServiceId = serviceId });

    return new CompressionStatsResponse
    {
        TotalFiles = row.TotalFiles,
        CompressedFiles = row.CompressedFiles,
        TotalRawBytes = row.TotalRawBytes,
        TotalStoredBytes = row.TotalStoredBytes,
        SavingsPercent = row.TotalRawBytes > 0
            ? Math.Round((1.0 - (double)row.TotalStoredBytes / row.TotalRawBytes) * 100, 1) : 0,
        CompressionCoverage = row.TotalFiles > 0
            ? Math.Round((double)row.CompressedFiles / row.TotalFiles * 100, 1) : 0
    };
}
```

Note: The connection string is already available in FileRepository via the injected `IDbConnection` or connection string. Check existing implementation for the pattern used.

### Step 7: Add FileService method

```csharp
public async Task<CompressionStatsResponse> GetCompressionStatsAsync(Guid serviceId, CancellationToken ct)
    => await _repo.GetCompressionStatsAsync(serviceId, ct);
```

### Step 8: Add controller endpoint

In `FilesController.cs`, add before the closing brace:

```csharp
// GET /api/files/compression-stats
[HttpGet("compression-stats")]
public async Task<IActionResult> GetCompressionStats(CancellationToken ct)
{
    var stats = await _fileService.GetCompressionStatsAsync(HttpContext.GetServiceId(), ct);
    return Ok(stats);
}
```

### Step 9: Verify build + tests

```bash
dotnet build
dotnet test tests/FIS.FileManager.UnitTests
```

## Todo List

- [ ] Create `src/FIS.FileManager.Shared/Responses/CompressionStatsResponse.cs`
- [ ] Add IsCompressed, CompressedSize, CompressionRatio to FileInfoResponse.cs
- [ ] Add IsCompressed, CompressedSize to UploadFileResponse.cs
- [ ] Add IsCompressed, CompressedSize to BatchUploadItemResponse.cs (F6)
- [ ] Update FilesController.BatchUpload response mapping to include compression fields (F6)
- [ ] Verify LegacyController by-name download works with decompression (F6)
- [ ] Update FileService response mappings in UploadAsync (both return paths)
- [ ] Update FileService response mappings in GetInfoAsync and GetBatchInfoAsync
- [ ] Add GetCompressionStatsAsync to IFileRepository
- [ ] Implement GetCompressionStatsAsync in FileRepository (Dapper, with 90-day CreatedAt filter for partition elimination — F11)
- [ ] Add GetCompressionStatsAsync to FileService
- [ ] Add GET /api/files/compression-stats endpoint to FilesController
- [ ] Verify dotnet build succeeds
- [ ] Verify existing tests pass (update assertions for new response fields)

## Success Criteria

1. `GET /api/files/{id}/info` returns IsCompressed, CompressedSize, CompressionRatio fields
2. `POST /api/files/upload` response includes IsCompressed, CompressedSize
3. `GET /api/files/compression-stats` returns valid aggregate stats for calling service
4. Stats show 0% savings when no files are compressed
5. Existing API consumers unaffected (additive JSON fields)
6. `dotnet build` succeeds; tests pass

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Stats query slow on large Files table | Low | Medium | Query filters on CreatedByServiceId (indexed) + Status; partition elimination on CreatedAt if WHERE clause added |
| New JSON fields break strict client deserialization | Very Low | Medium | JSON deserialization ignores unknown fields by default; documented in changelog |
| Dapper tuple mapping fails | Low | Low | Use anonymous type or dedicated DTO instead of value tuple |

## Security Considerations
- Stats endpoint is scoped to calling service's ServiceId (extracted from API key auth)
- No cross-service data leakage — WHERE clause filters by ServiceId
- Read-only endpoint — no mutation risk

### Known Limitation: Migration Endpoint
`RegisterExistingFileAsync` creates files with `IsCompressed=false` and `FileSize=0`. These migrated files are excluded from compression analytics. If migration of pre-compressed files is needed, add optional `IsCompressed`/`CompressedSize` parameters to `RegisterMigrationRequest` in a future phase.

## Next Steps
- Phase 6 (Testing) is the final phase — depends on all previous phases
- Consider adding stats to health/ready endpoint in future iteration
