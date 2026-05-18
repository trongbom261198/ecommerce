---
phase: 3
title: "Core Layer"
priority: High
status: Pending
effort: 2h
depends_on: [1]
---

# Phase 03 — Core Layer

## Context Links
- [Plan Overview](plan.md)
- [Brainstorm Report](../reports/brainstorm-260225-1018-central-file-management-service.md)
- [Phase 02 — Database Schema](phase-02-database-schema.md)

## Overview
Implement FIS.FileManager.Core (business logic) and FIS.FileManager.Shared (DTOs). Core contains entity models, service interfaces, enums, and service implementations. Shared contains request/response DTOs. No external dependencies except Microsoft.Extensions abstractions.

## Key Insights
- Core depends only on Shared (for DTOs) and Microsoft.Extensions abstractions
- Entity models mirror DB schema but use C# types (Guid, DateTime, enum)
- Interfaces defined in Core, implemented in Infrastructure
- FileService orchestrates the two-phase upload flow (buffer → hash → dedup → upload)
- All service methods are async

## Requirements

### Functional
- Entity models for all 4 tables
- Interfaces: IStorageProvider, IFileRepository, IRedisService, IAuditService
- FileService: upload (with dedup), download, release, promote, batch operations
- DeduplicationService: hash computation, duplicate check
- CleanupService: stale pending, temp, orphan, MinIO orphan scan
- DTOs for all API request/response payloads

### Non-Functional
- All methods async (Task/ValueTask)
- CancellationToken on all async methods
- Streaming support for large file downloads

## Architecture

```
FIS.FileManager.Core/
├── Entities/
│   ├── ServiceEntity.cs
│   ├── FileEntity.cs
│   ├── FileReferenceEntity.cs
│   └── AuditLogEntity.cs
├── Enums/
│   ├── FileStatus.cs
│   └── AuditAction.cs
├── Interfaces/
│   ├── IFileRepository.cs
│   ├── IStorageProvider.cs
│   ├── IRedisService.cs
│   └── IAuditService.cs
├── Services/
│   ├── FileService.cs
│   ├── DeduplicationService.cs
│   └── CleanupService.cs
└── DependencyInjection.cs

FIS.FileManager.Shared/
├── Requests/
│   ├── UploadFileRequest.cs
│   ├── BatchUploadRequest.cs
│   ├── BatchInfoRequest.cs
│   ├── ReleaseFileRequest.cs
│   ├── PromoteFileRequest.cs
│   └── RegisterMigrationRequest.cs
├── Responses/
│   ├── UploadFileResponse.cs
│   ├── FileInfoResponse.cs
│   ├── ReleaseFileResponse.cs
│   ├── PromoteFileResponse.cs
│   ├── BatchUploadResponse.cs
│   ├── BatchInfoResponse.cs
│   ├── RegisterMigrationResponse.cs
│   └── ErrorResponse.cs
└── Constants/
    └── FileManagerConstants.cs
```

## Related Code Files

### Files to Create
All files listed in Architecture section above (~25 files).

### Files to Modify
- `src/FIS.FileManager.Core/FIS.FileManager.Core.csproj` — remove default Class1.cs
- `src/FIS.FileManager.Shared/FIS.FileManager.Shared.csproj` — remove default Class1.cs

## Implementation Steps

### 1. Enums

**`Core/Enums/FileStatus.cs`**
```csharp
namespace FIS.FileManager.Core.Enums;

public enum FileStatus
{
    Pending,
    Confirmed,
    Deleted
}
```

**`Core/Enums/AuditAction.cs`**
```csharp
namespace FIS.FileManager.Core.Enums;

public enum AuditAction
{
    Upload,
    Download,
    Release,
    Promote,
    Delete,
    Cleanup,
    Register
}
```

### 2. Entity Models

**`Core/Entities/ServiceEntity.cs`**
```csharp
namespace FIS.FileManager.Core.Entities;

public class ServiceEntity
{
    public Guid ServiceId { get; set; }
    public string ServiceName { get; set; } = string.Empty;
    public string ApiKey { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; }
}
```

**`Core/Entities/FileEntity.cs`**
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

    // Computed: full MinIO object key
    public string GetFullObjectKey()
        => $"{CreatedAt:yyyy}/{CreatedAt:MM}/{CreatedAt:dd}/{CreatedAt:HH}/{CreatedAt:mm}/{ObjectName}";
}
```

**`Core/Entities/FileReferenceEntity.cs`**
```csharp
namespace FIS.FileManager.Core.Entities;

public class FileReferenceEntity
{
    public Guid RefId { get; set; }
    public Guid FileId { get; set; }
    public Guid ServiceId { get; set; }
    public string OriginalFileName { get; set; } = string.Empty;
    public string? ReferenceKey { get; set; }
    public string? Tags { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; }
    public DateTime? ReleasedAt { get; set; }
}
```

**`Core/Entities/AuditLogEntity.cs`**
```csharp
namespace FIS.FileManager.Core.Entities;

public class AuditLogEntity
{
    public long LogId { get; set; }
    public Guid CorrelationId { get; set; }
    public Guid ServiceId { get; set; }
    public Guid? FileId { get; set; }
    public string Action { get; set; } = string.Empty;
    public string? Details { get; set; }
    public int? DurationMs { get; set; }
    public short? StatusCode { get; set; }
    public DateTime CreatedAt { get; set; }
}
```

### 3. Interfaces

**`Core/Interfaces/IFileRepository.cs`**
```csharp
namespace FIS.FileManager.Core.Interfaces;

public interface IFileRepository
{
    Task<FileEntity?> GetByIdAsync(Guid fileId, CancellationToken ct = default);
    Task<FileEntity?> GetByObjectNameAsync(string objectName, CancellationToken ct = default);
    Task<FileEntity?> FindDuplicateAsync(string contentHash, Guid serviceId, CancellationToken ct = default);
    Task<FileEntity> CreateAsync(FileEntity entity, CancellationToken ct = default);
    Task UpdateStatusAsync(Guid fileId, DateTime createdAt, string status, CancellationToken ct = default);
    // <!-- Red Team: Upload Atomicity — 2026-02-25 -->
    Task ConfirmAndCreateReferenceAsync(Guid fileId, DateTime createdAt, FileReferenceEntity reference, CancellationToken ct = default); // atomic transaction
    Task DeleteAsync(Guid fileId, DateTime createdAt, CancellationToken ct = default);
    Task<List<FileEntity>> GetStalePendingAsync(int staleMinutes, CancellationToken ct = default);
    Task<List<FileEntity>> GetExpiredTempAsync(CancellationToken ct = default);
    Task<List<FileEntity>> GetOrphanFilesAsync(int graceDays, CancellationToken ct = default);
    Task<List<FileEntity>> GetByIdsAsync(List<Guid> fileIds, CancellationToken ct = default);

    // FileReferences
    Task<FileReferenceEntity> CreateReferenceAsync(FileReferenceEntity entity, CancellationToken ct = default);
    Task<int> GetActiveReferenceCountAsync(Guid fileId, CancellationToken ct = default);
    Task<FileReferenceEntity?> GetActiveReferenceAsync(Guid fileId, Guid serviceId, CancellationToken ct = default);
    Task ReleaseReferenceAsync(Guid refId, DateTime createdAt, CancellationToken ct = default);

    // Services
    Task<ServiceEntity?> GetServiceByApiKeyAsync(string apiKey, CancellationToken ct = default);
    Task<ServiceEntity?> GetServiceByIdAsync(Guid serviceId, CancellationToken ct = default);
}
```

**`Core/Interfaces/IStorageProvider.cs`**
```csharp
namespace FIS.FileManager.Core.Interfaces;

public interface IStorageProvider
{
    Task EnsureBucketExistsAsync(string bucketName, CancellationToken ct = default);
    Task UploadAsync(string bucketName, string objectKey, Stream data, long size, string contentType, CancellationToken ct = default);
    <!-- Updated: Validation Session 1 - Match Phase 4 streaming implementation -->
    Task DownloadAsync(string bucketName, string objectKey, Stream outputStream, CancellationToken ct = default);
    Task DeleteAsync(string bucketName, string objectKey, CancellationToken ct = default);
    Task<bool> ObjectExistsAsync(string bucketName, string objectKey, CancellationToken ct = default);
    IAsyncEnumerable<string> ListObjectsAsync(string bucketName, string? prefix = null, CancellationToken ct = default);
}
```

**`Core/Interfaces/IRedisService.cs`**
```csharp
namespace FIS.FileManager.Core.Interfaces;

public interface IRedisService
{
    Task<IAsyncDisposable?> AcquireLockAsync(string key, TimeSpan expiry, TimeSpan wait, CancellationToken ct = default);
    Task<bool> TryAcquireLeaderLockAsync(string key, TimeSpan expiry, CancellationToken ct = default);
    Task ReleaseLeaderLockAsync(string key, CancellationToken ct = default);
}
```

**`Core/Interfaces/IAuditService.cs`**
```csharp
namespace FIS.FileManager.Core.Interfaces;

public interface IAuditService
{
    Task LogAsync(Guid correlationId, Guid serviceId, Guid? fileId,
        AuditAction action, string? details, int? durationMs, short? statusCode,
        CancellationToken ct = default);
}
```

### 4. Shared DTOs

**`Shared/Requests/UploadFileRequest.cs`**
```csharp
namespace FIS.FileManager.Shared.Requests;

public class UploadFileRequest
{
    public string OriginalFileName { get; set; } = string.Empty;
    public bool IsTemp { get; set; }
    public int? TtlMinutes { get; set; }
    public string? Tags { get; set; }         // JSON string
    public string? ReferenceKey { get; set; }
}
```

**`Shared/Responses/UploadFileResponse.cs`**
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
}
```

**Other DTOs** (follow same pattern — compact records):

- `BatchInfoRequest` — `List<Guid> FileIds`
- `RegisterMigrationRequest` — `string ObjectName, string BucketName, string? OriginalFileName, Guid ServiceId`
- `FileInfoResponse` — `Guid FileId, string ObjectName, string FileName, long FileSize, string MimeType, string ContentHash, DateTime CreatedAt, string? Tags`
- `ReleaseFileResponse` — `bool Released, int RemainingRefs`
- `PromoteFileResponse` — `bool Promoted`
- `ErrorResponse` — `string Message, string? Detail`

### 5. Constants

**`Shared/Constants/FileManagerConstants.cs`**
```csharp
namespace FIS.FileManager.Shared.Constants;

public static class FileManagerConstants
{
    public const string ApiKeyHeader = "X-Api-Key";
    public const string CorrelationIdHeader = "X-Correlation-Id";
    public const long MaxFileSizeBytes = 100 * 1024 * 1024; // 100MB
    public const long MemoryBufferThreshold = 10 * 1024 * 1024; // 10MB
    public const int DefaultTempTtlMinutes = 60;
}
```

### 6. FileService (Core Orchestrator)

**`Core/Services/FileService.cs`** — Key method pseudocode:

```csharp
public async Task<UploadFileResponse> UploadAsync(
    Stream fileStream, UploadFileRequest request, Guid serviceId,
    Guid correlationId, CancellationToken ct)
{
    var sw = Stopwatch.StartNew();

    // Phase 1: Buffer + Hash
    var (bufferedStream, hash, fileSize) = await BufferAndHashAsync(fileStream, ct);

    try
    {
        // Phase 2: Dedup check with Redis lock
        // <!-- Red Team: Redis Down Graceful Degradation — 2026-02-25 -->
        var lockKey = $"dedup:{serviceId}:{hash}";
        IAsyncDisposable? lockHandle = null;
        try
        {
            lockHandle = await _redis.AcquireLockAsync(lockKey,
                TimeSpan.FromMinutes(5), TimeSpan.FromSeconds(30), ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Redis unavailable, proceeding without dedup lock");
            // Fall through — DB-level optimistic concurrency as fallback
        }

        var existing = await _repo.FindDuplicateAsync(hash, serviceId, ct);
        if (existing != null)
        {
            // Dedup hit — create reference only
            await _repo.CreateReferenceAsync(new FileReferenceEntity { ... }, ct);
            await _audit.LogAsync(correlationId, serviceId, existing.FileId,
                AuditAction.Upload, "dedup=true", (int)sw.ElapsedMilliseconds, 200, ct);
            return new UploadFileResponse { IsDuplicate = true, ... };
        }

        // New file — outbox pattern
        var service = await _repo.GetServiceByIdAsync(serviceId, ct);
        // <!-- Red Team: Path Traversal Prevention — 2026-02-25 -->
        var objectName = $"{hash[..8]}_{SanitizeFileName(request.OriginalFileName)}";
        // SanitizeFileName: Path.GetFileName() + reject names containing "..", "/", "\"
        var entity = new FileEntity { Status = "Pending", ... };
        entity = await _repo.CreateAsync(entity, ct);

        await _storage.EnsureBucketExistsAsync(service.ServiceName, ct);
        await _storage.UploadAsync(service.ServiceName, entity.GetFullObjectKey(),
            bufferedStream, fileSize, DetectMimeType(request.OriginalFileName), ct);

        // <!-- Red Team: Upload Atomicity — 2026-02-25 -->
        // CRITICAL: Wrap confirm + reference in single DB transaction
        await _repo.ConfirmAndCreateReferenceAsync(entity.FileId, entity.CreatedAt,
            new FileReferenceEntity { ... }, ct); // single transaction

        await _audit.LogAsync(correlationId, serviceId, entity.FileId,
            AuditAction.Upload, "dedup=false", (int)sw.ElapsedMilliseconds, 200, ct);

        return new UploadFileResponse { IsDuplicate = false, ... };
    }
    finally
    {
        await bufferedStream.DisposeAsync();
    }
}
```

### 7. DeduplicationService

```csharp
public class DeduplicationService
{
    // Incremental SHA-256 during buffering
    public async Task<(Stream buffered, string hash, long size)> BufferAndHashAsync(
        Stream input, CancellationToken ct)
    {
        using var sha256 = SHA256.Create();
        var size = 0L;
        Stream buffer = size <= _memoryThreshold
            ? new MemoryStream() : File.Create(Path.GetTempFileName());

        var chunk = new byte[81920]; // 80KB chunks
        int bytesRead;
        while ((bytesRead = await input.ReadAsync(chunk, ct)) > 0)
        {
            sha256.TransformBlock(chunk, 0, bytesRead, null, 0);
            await buffer.WriteAsync(chunk.AsMemory(0, bytesRead), ct);
            size += bytesRead;

            // Switch to disk if exceeds memory threshold
            if (buffer is MemoryStream ms && size > _memoryThreshold)
                buffer = await SwitchToDiskAsync(ms);
        }
        sha256.TransformFinalBlock([], 0, 0);

        buffer.Position = 0;
        var hash = Convert.ToHexString(sha256.Hash!).ToLowerInvariant();
        return (buffer, hash, size);
    }
}
```

### 8. CleanupService (business logic only, no scheduling)

```csharp
public class CleanupService : ICleanupService
{
    public Task<int> CleanStalePendingAsync(CancellationToken ct);
    public Task<int> CleanExpiredTempAsync(CancellationToken ct);
    public Task<int> CleanOrphanFilesAsync(CancellationToken ct);
    public Task<int> ScanMinioOrphansAsync(CancellationToken ct);
}
```

Each method: query DB → delete from MinIO → update/delete DB record → audit log.

### 9. DI Registration

**`Core/DependencyInjection.cs`**
```csharp
public static class DependencyInjection
{
    public static IServiceCollection AddCoreServices(this IServiceCollection services)
    {
        services.AddScoped<FileService>();
        services.AddScoped<DeduplicationService>();
        services.AddScoped<CleanupService>();
        return services;
    }
}
```

## Todo List
- [ ] Create Enums (FileStatus, AuditAction)
- [ ] Create Entity models (4 entities)
- [ ] Create Interfaces (IFileRepository, IStorageProvider, IRedisService, IAuditService)
- [ ] Create Shared DTOs — Requests (6 files)
- [ ] Create Shared DTOs — Responses (7 files)
- [ ] Create Constants
- [ ] Implement FileService (upload, download, release, promote, batch, by-name)
- [ ] Implement DeduplicationService (buffer + hash)
- [ ] Implement CleanupService (4 cleanup tasks)
- [ ] Create DI registration extension
- [ ] Delete Class1.cs from Core and Shared projects
- [ ] Verify `dotnet build` succeeds

## Success Criteria
- All entity models match DB schema columns exactly
- All interfaces define async methods with CancellationToken
- FileService implements complete upload flow (buffer → hash → dedup → upload → confirm)
- DTOs cover all API endpoints from brainstorm
- `dotnet build` succeeds

## Risk Assessment
| Risk | Mitigation |
|------|-----------|
| Entity/DB column mismatch | Cross-reference Phase 02 schema during implementation |
| Missing DTO fields | Cross-reference brainstorm API section |
| Large file memory pressure in BufferAndHashAsync | Threshold-based disk/memory switch |

## Security Considerations
- No secrets in Core layer
- SHA-256 for content hashing (not security-critical, just dedup)
- Input validation in service methods (file size, mime type)

## Next Steps
→ Phase 04: Infrastructure Layer (implements these interfaces)
