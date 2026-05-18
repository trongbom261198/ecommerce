# Phase 3: Storage Compression Core

## Context Links
- [Phase 2 — DB Schema](phase-02-database-schema-changes.md) — prerequisite: IsCompressed, CompressedSize, CompressionAlgorithm columns
- [DeduplicationService.cs](../../src/FIS.FileManager.Core/Services/DeduplicationService.cs) — 67 LOC, BufferAndHashAsync
- [FileService.cs](../../src/FIS.FileManager.Core/Services/FileService.cs) — 360 LOC, UploadAsync + StreamToOutputAsync
- [MinioStorageProvider.cs](../../src/FIS.FileManager.Infrastructure/Storage/MinioStorageProvider.cs) — 92 LOC
- [DependencyInjection.cs (Core)](../../src/FIS.FileManager.Core/DependencyInjection.cs) — 14 LOC
- [ASP.NET Compression Research](../reports/researcher-260407-1354-aspnet-compression-strategies.md)

## Overview
- **Priority:** High
- **Status:** Pending
- **Effort:** 5h
- **Depends on:** Phase 2 (DB columns must exist)
- **Description:** Create CompressionService to compress files before MinIO storage and decompress on download. Integrates into FileService upload/download flow. Hash raw bytes THEN compress — preserves dedup.

## Key Insights
- **Hash before compress**: DeduplicationService.BufferAndHashAsync stays unchanged. Compression happens AFTER hashing on the already-buffered stream. This preserves dedup consistency.
- **GZip for storage**: GZipStream has streaming support in System.IO.Compression. Brotli is better for transport but GZip is more universal for storage (any tool can decompress).
- **Skip incompressible types**: JPEG, PNG, GIF, MP4, ZIP, GZ, RAR — pre-compressed formats yield <5% ratio. Waste of CPU.
- **Streaming compression**: Compress into a temp file stream (not MemoryStream) for large files. Reuse the disk-spill pattern from DeduplicationService.
- **CompressionLevel.Fastest**: ~200 MB/s throughput, ~5MB memory overhead. Optimal is 2x slower for only ~3% better ratio. Not worth it.
- **Graceful degradation**: If compression fails (corrupted stream, OOM), catch exception, log warning, store uncompressed. Never fail an upload due to compression.

## Requirements

### Functional
- F1: New `ICompressionService` interface + `CompressionService` implementation
- F2: Compressible MIME types whitelist (configurable)
- F3: Upload flow: hash raw → check compressible → compress → upload compressed stream → save metadata
- F4: Download flow: if `IsCompressed`, wrap MinIO stream in GZipStream(decompress)
- F5: Configuration toggle: `Compression:StorageEnabled` (default: true)
- F6: Compression algorithm stored as `"gzip"` in FileEntity.CompressionAlgorithm

### Non-Functional
- NF1: Never buffer entire file in memory for compression — use streaming
- NF2: Compression failure = store uncompressed (graceful degradation)
- NF3: FileService.cs must stay under 200 LOC per method after changes
- NF4: CompressionService under 150 LOC

## Architecture

### Upload Flow (Modified)

```
FileService.UploadAsync
  |
  v
DeduplicationService.BufferAndHashAsync(input)
  --> returns (bufferedStream, hash, rawSize)       [UNCHANGED]
  |
  v
CompressionService.ShouldCompress(mimeType)
  --> checks whitelist + config toggle
  |
  +--> false: upload bufferedStream as-is (current behavior)
  |
  +--> true:
       |
       v
       CompressionService.CompressAsync(bufferedStream, ct)
         --> GZipStream into temp FileStream
         --> returns (compressedStream, compressedSize)
       |
       v
       MinIO.Upload(compressedStream, compressedSize, ...)
       |
       v
       FileEntity { IsCompressed=true, CompressedSize=X, CompressionAlgorithm="gzip" }
```

### Download Flow (Modified)

```
FilesController.Download
  |
  v
  if isCompressed AND client sends Accept-Encoding: gzip:
    Response.Headers["Content-Encoding"] = "gzip"
    MinIO.DownloadAsync(raw compressed bytes) --> Response.Body  [no decompression — F9 optimization]
  else if isCompressed:
    MinIO.DownloadDecompressedAsync(bucketName, objectKey, outputStream)
      --> GZipStream wraps MinIO callback stream inline --> Response.Body  [F3 fix]
  else:
    MinIO.DownloadAsync(bucketName, objectKey, outputStream)  [UNCHANGED]
```

**Key insight (F3 fix)**: MinIO SDK's `WithCallbackStream` provides a forward-only read stream that CAN be wrapped directly by GZipStream — decompression is inline, no temp file needed. The previous plan was wrong to say buffering was required.

**Key insight (F9 fix)**: For clients that accept gzip, we skip decompression entirely — serve raw compressed bytes with `Content-Encoding: gzip`. Eliminates the decompress→recompress cycle from Phase 1 Response Compression middleware.

## Related Code Files

### Files to Create
| File | Location | LOC Est. |
|------|----------|----------|
| `ICompressionService.cs` | `src/FIS.FileManager.Core/Interfaces/` | ~15 |
| `CompressionService.cs` | `src/FIS.FileManager.Core/Services/` | ~120 |
| `CompressionOptions.cs` | `src/FIS.FileManager.Core/Options/` | ~25 |

### Files to Modify
| File | Change |
|------|--------|
| `src/FIS.FileManager.Core/Services/FileService.cs` | Inject ICompressionService; modify UploadAsync + StreamToOutputAsync |
| `src/FIS.FileManager.Core/DependencyInjection.cs` | Register CompressionService + CompressionOptions |
| `src/FIS.FileManager.Api/appsettings.json` | Add Compression section with storage settings |
| `src/FIS.FileManager.Core/Interfaces/IStorageProvider.cs` | Add DownloadDecompressedAsync method |
| `src/FIS.FileManager.Infrastructure/Storage/MinioStorageProvider.cs` | Implement DownloadDecompressedAsync (inline GZip decompression) |

### Files NOT Modified
| File | Reason |
|------|--------|
| `DeduplicationService.cs` | Hash on raw bytes — no change needed |
| `IFileRepository.cs` | No new queries — EF Core auto-maps new FileEntity properties |

## Implementation Steps

### Step 1: Create CompressionOptions.cs

Path: `src/FIS.FileManager.Core/Options/CompressionOptions.cs`

```csharp
namespace FIS.FileManager.Core.Options;

public class CompressionOptions
{
    public const string SectionName = "Compression";

    /// <summary>Enable storage compression for new uploads. Default: true.</summary>
    public bool StorageEnabled { get; set; } = true;

    /// <summary>MIME types that benefit from compression. Pre-compressed types (JPEG, PNG, ZIP) excluded.</summary>
    public string[] CompressibleMimeTypes { get; set; } =
    [
        "text/plain", "text/csv", "text/html", "text/xml",
        "application/json", "application/xml", "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        // Note: application/octet-stream intentionally excluded — unknown binary content
        // may already be compressed (e.g. zip, jpg uploaded without correct MIME type).
        // Compressing pre-compressed data wastes CPU and may expand size.
    ];

    /// <summary>MIME types to never compress (pre-compressed formats).</summary>
    public string[] IncompressibleMimeTypes { get; set; } =
    [
        "image/jpeg", "image/png", "image/gif", "image/webp",
        "video/mp4", "video/webm", "audio/mpeg", "audio/ogg",
        "application/zip", "application/gzip", "application/x-rar-compressed",
        "application/x-7z-compressed", "application/x-tar"
    ];

    /// <summary>Minimum file size to consider compression (bytes). Files smaller than this skip compression.</summary>
    public long MinFileSizeBytes { get; set; } = 1024; // 1KB — don't compress tiny files
}
```

### Step 2: Create ICompressionService.cs

Path: `src/FIS.FileManager.Core/Interfaces/ICompressionService.cs`

```csharp
namespace FIS.FileManager.Core.Interfaces;

public interface ICompressionService
{
    /// <summary>Check if a MIME type should be compressed based on config.</summary>
    bool ShouldCompress(string mimeType, long fileSize);

    /// <summary>Compress stream using GZip. Returns compressed stream and its size. Caller owns returned stream.</summary>
    Task<(Stream compressedStream, long compressedSize)> CompressAsync(Stream input, CancellationToken ct = default);

    /// <summary>Decompress a GZip-compressed stream and write to output.</summary>
    Task DecompressAsync(Stream compressedInput, Stream output, CancellationToken ct = default);
}
```

### Step 3: Create CompressionService.cs

Path: `src/FIS.FileManager.Core/Services/CompressionService.cs`

```csharp
using System.IO.Compression;
using FIS.FileManager.Core.Interfaces;
using FIS.FileManager.Core.Options;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FIS.FileManager.Core.Services;

/// <summary>Handles GZip compression/decompression for storage optimization.</summary>
public class CompressionService : ICompressionService
{
    private readonly CompressionOptions _options;
    private readonly ILogger<CompressionService> _logger;
    private readonly HashSet<string> _compressible;
    private readonly HashSet<string> _incompressible;

    public CompressionService(IOptions<CompressionOptions> options, ILogger<CompressionService> logger)
    {
        _options = options.Value;
        _logger = logger;
        _compressible = new HashSet<string>(_options.CompressibleMimeTypes, StringComparer.OrdinalIgnoreCase);
        _incompressible = new HashSet<string>(_options.IncompressibleMimeTypes, StringComparer.OrdinalIgnoreCase);
    }

    public bool ShouldCompress(string mimeType, long fileSize)
    {
        if (!_options.StorageEnabled) return false;
        if (fileSize < _options.MinFileSizeBytes) return false;
        if (_incompressible.Contains(mimeType)) return false;

        // Whitelist approach: only compress known-compressible types
        // Also compress any text/* type not in incompressible list
        return _compressible.Contains(mimeType) || mimeType.StartsWith("text/", StringComparison.OrdinalIgnoreCase);
    }

    public async Task<(Stream compressedStream, long compressedSize)> CompressAsync(Stream input, CancellationToken ct)
    {
        // Compress to temp file (disk spill) — never hold entire compressed output in memory
        var tempPath = Path.GetTempFileName();
        var outputStream = new FileStream(tempPath, FileMode.Create, FileAccess.ReadWrite,
            FileShare.None, 4096, FileOptions.DeleteOnClose);

        try
        {
            await using (var gzip = new GZipStream(outputStream, CompressionLevel.Fastest, leaveOpen: true))
            {
                await input.CopyToAsync(gzip, ct);
            }
            // GZipStream.Dispose flushes final bytes

            var compressedSize = outputStream.Length;
            outputStream.Position = 0;

            _logger.LogDebug("Compressed {InputSize} -> {CompressedSize} bytes ({Ratio:F1}% saved)",
                input.Length, compressedSize,
                input.Length > 0 ? (1.0 - (double)compressedSize / input.Length) * 100 : 0);

            return (outputStream, compressedSize);
        }
        catch
        {
            await outputStream.DisposeAsync();
            throw;
        }
    }

    public async Task DecompressAsync(Stream compressedInput, Stream output, CancellationToken ct)
    {
        await using var gzip = new GZipStream(compressedInput, CompressionMode.Decompress, leaveOpen: true);
        await gzip.CopyToAsync(output, ct);
    }
}
```

### Step 4: Register in DependencyInjection.cs (Core)

Modify `src/FIS.FileManager.Core/DependencyInjection.cs`:

```csharp
using FIS.FileManager.Core.Interfaces;
using FIS.FileManager.Core.Options;
using FIS.FileManager.Core.Services;
using Microsoft.Extensions.DependencyInjection;
namespace FIS.FileManager.Core;

public static class DependencyInjection
{
    public static IServiceCollection AddCoreServices(this IServiceCollection services)
    {
        services.AddScoped<FileService>();
        services.AddScoped<DeduplicationService>();
        services.AddScoped<CleanupService>();
        services.AddScoped<ICompressionService, CompressionService>();
        return services;
    }
}
```

Also need to bind CompressionOptions. Add to `Program.cs` service registration (or DI extension):

```csharp
builder.Services.Configure<CompressionOptions>(
    builder.Configuration.GetSection(CompressionOptions.SectionName));
```

### Step 5: Modify FileService.cs — Constructor

Add `ICompressionService` dependency:

```csharp
private readonly ICompressionService _compression;

public FileService(IFileRepository repo, IStorageProvider storage, IRedisService redis,
    IAuditService audit, DeduplicationService dedup, ICompressionService compression,
    IConfiguration config, ILogger<FileService> logger)
{
    _repo = repo;
    _storage = storage;
    _redis = redis;
    _audit = audit;
    _dedup = dedup;
    _compression = compression;
    _logger = logger;
    _maxFileSizeBytes = config.GetValue<long>("FileService:MaxFileSizeBytes", 100 * 1024 * 1024);
}
```

### Step 6: Modify FileService.UploadAsync — Compression Integration

After the existing `BufferAndHashAsync` call and before `_storage.UploadAsync`, add compression logic. Replace the MinIO upload block (lines ~114-117 in current code) with:

```csharp
// Compress if MIME type is compressible (after hashing raw bytes)
Stream uploadStream = bufferedStream;
long uploadSize = fileSize;
bool isCompressed = false;
long? compressedSize = null;

if (_compression.ShouldCompress(mimeType, fileSize))
{
    try
    {
        (uploadStream, var cSize) = await _compression.CompressAsync(bufferedStream, ct);
        compressedSize = cSize;
        uploadSize = cSize;
        isCompressed = true;
        _logger.LogInformation("Compressed {FileName}: {RawSize} -> {CompressedSize} bytes",
            sanitizedName, fileSize, cSize);
    }
    catch (Exception ex)
    {
        _logger.LogWarning(ex, "Compression failed for {FileName}, storing uncompressed", sanitizedName);
        bufferedStream.Position = 0; // Reset for raw upload
        uploadStream = bufferedStream;
        uploadSize = fileSize;
    }

    // Expansion guard: if compression didn't help, discard and store raw
    if (isCompressed && compressedSize >= fileSize)
    {
        _logger.LogDebug("Compression expanded {FileName}: {RawSize} -> {CompressedSize}, storing raw",
            sanitizedName, fileSize, compressedSize);
        await uploadStream.DisposeAsync();
        bufferedStream.Position = 0;
        uploadStream = bufferedStream;
        uploadSize = fileSize;
        isCompressed = false;
        compressedSize = null;
    }
}

await _storage.EnsureBucketExistsAsync(service.ServiceName, ct);

// When storing compressed, set Content-Type to application/gzip so MinIO metadata is accurate
var uploadContentType = isCompressed ? "application/gzip" : mimeType;
await _storage.UploadAsync(service.ServiceName, entity.GetFullObjectKey(),
    uploadStream, uploadSize, uploadContentType, ct);
// Note: original MIME type is preserved in FileEntity.MimeType for API responses.

// Dispose compressed stream if it's a different stream than buffered
if (isCompressed && uploadStream != bufferedStream)
    await uploadStream.DisposeAsync();
```

Update the FileEntity creation to include compression metadata:

```csharp
var entity = new FileEntity
{
    FileId = Guid.NewGuid(),
    ContentHash = hash,
    ObjectName = objectName,
    BucketName = service.ServiceName,
    FileSize = fileSize,          // Always raw size
    MimeType = mimeType,
    Status = "Pending",
    IsTemp = request.IsTemp,
    ExpiresAt = request.IsTemp && request.TtlMinutes.HasValue
        ? Now.AddMinutes(request.TtlMinutes.Value) : null,
    CreatedAt = Now,
    CreatedByServiceId = serviceId,
    IsCompressed = isCompressed,
    CompressedSize = compressedSize,
    CompressionAlgorithm = isCompressed ? "gzip" : null
};
```

**Correct ordering (mandatory):**
1. `BufferAndHashAsync` → get buffered stream, hash, raw size
2. Compress if applicable → get compressed stream, compressed size (or skip)
3. Expansion guard → discard compressed if larger
4. Create `FileEntity` with final compression metadata
5. `_repo.CreateAsync(entity)` → persist to DB
6. `_storage.UploadAsync(...)` → upload to MinIO
7. `_repo.ConfirmAndCreateReferenceAsync(...)` → atomic confirm

The entity creation (step 5) uses compression fields determined in steps 2-3. If MinIO upload (step 6) fails, the entity stays in "Pending" status and is cleaned by the stale-pending worker. The dedup SP now filters `Status='Confirmed'` (Phase 2 fix), preventing orphaned Pending records from being returned as duplicates.

### Step 7: Modify FileService.StreamToOutputAsync — Decompression

Current signature:
```csharp
public async Task StreamToOutputAsync(string bucketName, string objectKey, Stream outputStream, CancellationToken ct)
    => await _storage.DownloadAsync(bucketName, objectKey, outputStream, ct);
```

Change to accept IsCompressed flag and decompress inline using the new `DownloadDecompressedAsync` method:

```csharp
public async Task StreamToOutputAsync(string bucketName, string objectKey,
    Stream outputStream, bool isCompressed, CancellationToken ct)
{
    if (!isCompressed)
    {
        await _storage.DownloadAsync(bucketName, objectKey, outputStream, ct);
        return;
    }

    // Decompress inline during MinIO download — no temp file needed
    // MinIO's WithCallbackStream provides a forward-only readable stream;
    // GZipStream wraps it for inline decompression directly to outputStream
    await _storage.DownloadDecompressedAsync(bucketName, objectKey, outputStream, ct);
}
```

### New: Add DownloadDecompressedAsync to IStorageProvider

Add to `src/FIS.FileManager.Core/Interfaces/IStorageProvider.cs`:
```csharp
Task DownloadDecompressedAsync(string bucketName, string objectKey, Stream outputStream, CancellationToken ct = default);
```

Implement in `src/FIS.FileManager.Infrastructure/Storage/MinioStorageProvider.cs`:
```csharp
/// <summary>Downloads and decompresses gzip-compressed object inline — no temp file buffering.</summary>
public async Task DownloadDecompressedAsync(string bucketName, string objectKey,
    Stream outputStream, CancellationToken ct = default)
{
    await _client.GetObjectAsync(new GetObjectArgs()
        .WithBucket(bucketName).WithObject(objectKey)
        .WithCallbackStream(async (stream, ct2) =>
        {
            await using var gzip = new System.IO.Compression.GZipStream(
                stream, System.IO.Compression.CompressionMode.Decompress);
            await gzip.CopyToAsync(outputStream, ct2);
        }), ct);
}
```
```

### Step 8: Update FilesController.Download to pass IsCompressed

The controller currently calls:
```csharp
await _fileService.StreamToOutputAsync(bucketName, objectKey, Response.Body, ct);
```

Options:
- **Option A**: Change `GetDownloadInfoAsync` to also return `isCompressed` flag
- **Option B**: Change `StreamToOutputAsync` to accept the full tuple

**Choose Option A** — minimal change. Update the return tuple:

In `FileService.GetDownloadInfoAsync`, change return type:
```csharp
public async Task<(string contentType, string fileName, string bucketName, string objectKey, bool isCompressed)> GetDownloadInfoAsync(...)
```

Add `file.IsCompressed` to the return tuple.

In `FilesController.Download`:
```csharp
var (contentType, fileName, bucketName, objectKey, isCompressed) = await _fileService.GetDownloadInfoAsync(...);
// ...
await _fileService.StreamToOutputAsync(bucketName, objectKey, Response.Body, isCompressed, ct);
```

### Step 8b: Disable Response Compression for Compressed File Downloads

When serving a file that was stored compressed, we decompress it to raw content. If the Response Compression middleware (Phase 1) then re-compresses it, we waste CPU on a decompress→recompress cycle.

**Fix:** For compressed file downloads, serve raw gzip bytes directly with `Content-Encoding: gzip` header, bypassing both storage decompression AND response compression. The client's browser/HTTP library handles gzip decompression natively.

In `FilesController.Download`, when `isCompressed=true`:
```csharp
if (isCompressed)
{
    Response.Headers["Content-Encoding"] = "gzip";
    Response.ContentType = contentType; // Original MIME type
    // Stream raw compressed bytes from MinIO — no decompression needed
    await _fileService.StreamToOutputAsync(bucketName, objectKey, Response.Body, false, ct);
    return new EmptyResult();
}
```

This is strictly more efficient: no decompression, no recompression. The client receives gzip-encoded response that any HTTP client can decode.

**Note:** Only apply this optimization for gzip-compressed files. If the client does NOT send `Accept-Encoding: gzip`, fall back to decompressing server-side (using `StreamToOutputAsync` with `isCompressed=true`).

### Step 9: Update DownloadByNameAsync

This method already buffers to MemoryStream. Add decompression:

```csharp
public async Task<(Stream stream, string contentType, string fileName)> DownloadByNameAsync(...)
{
    // ... existing lookup code ...
    var ms = new MemoryStream();
    await _storage.DownloadAsync(file.BucketName, file.GetFullObjectKey(), ms, ct);
    ms.Position = 0;

    if (file.IsCompressed)
    {
        var tempPath = Path.GetTempFileName();
        var decompressed = new FileStream(tempPath, FileMode.Create, FileAccess.ReadWrite,
            FileShare.None, 4096, FileOptions.DeleteOnClose);
        await _compression.DecompressAsync(ms, decompressed, ct);
        await ms.DisposeAsync();
        decompressed.Position = 0;
        return (decompressed, file.MimeType, file.ObjectName);
    }

    return (ms, file.MimeType, file.ObjectName);
}
```

### Step 10: Update appsettings.json

Add/update the Compression section:

```json
"Compression": {
    "StorageEnabled": true,
    "MinFileSizeBytes": 1024,
    "CompressibleMimeTypes": [
        "text/plain", "text/csv", "text/html", "text/xml",
        "application/json", "application/xml", "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ],
    "IncompressibleMimeTypes": [
        "image/jpeg", "image/png", "image/gif", "image/webp",
        "video/mp4", "video/webm", "audio/mpeg", "audio/ogg",
        "application/zip", "application/gzip",
        "application/x-rar-compressed", "application/x-7z-compressed"
    ]
}
```

### Step 11: Verify build + existing tests

```bash
dotnet build
dotnet test tests/FIS.FileManager.UnitTests
```

## Todo List

- [ ] Create `src/FIS.FileManager.Core/Options/CompressionOptions.cs` (exclude application/octet-stream — F4)
- [ ] Create `src/FIS.FileManager.Core/Interfaces/ICompressionService.cs`
- [ ] Create `src/FIS.FileManager.Core/Services/CompressionService.cs`
- [ ] Register ICompressionService in `Core/DependencyInjection.cs`
- [ ] Bind CompressionOptions in Program.cs
- [ ] Add ICompressionService to FileService constructor
- [ ] Modify FileService.UploadAsync: compress after hash, before MinIO upload
- [ ] Add expansion guard: discard compressed stream if compressedSize >= fileSize (F4)
- [ ] Set Content-Type to application/gzip when uploading compressed to MinIO (F5)
- [ ] Update FileEntity creation to include IsCompressed, CompressedSize, CompressionAlgorithm
- [ ] Add DownloadDecompressedAsync to IStorageProvider interface (F3)
- [ ] Implement DownloadDecompressedAsync in MinioStorageProvider with inline GZipStream (F3)
- [ ] Modify FileService.StreamToOutputAsync: use DownloadDecompressedAsync for compressed files (F3)
- [ ] Update FileService.GetDownloadInfoAsync return tuple to include isCompressed
- [ ] Update FilesController.Download: short-circuit with Content-Encoding: gzip for compressed files (F9)
- [ ] Update FileService.DownloadByNameAsync to use disk-spill FileStream instead of MemoryStream (F7)
- [ ] Update appsettings.json Compression section
- [ ] Verify dotnet build succeeds
- [ ] Verify existing tests pass (update mocks for new constructor parameter)

## Success Criteria

1. Upload a .txt file: stored compressed in MinIO, FileEntity.IsCompressed=true, CompressedSize < FileSize
2. Upload a .jpg file: stored uncompressed, FileEntity.IsCompressed=false, CompressedSize=null
3. Download a compressed file: response body is decompressed, matches original content
4. Download an old (pre-compression) file: works unchanged (IsCompressed=false)
5. Set `Compression:StorageEnabled=false`: new uploads store raw (same as before)
6. Compression failure: file stored uncompressed, warning logged, upload succeeds
7. `dotnet build` succeeds; existing unit tests pass (with updated mocks)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Corrupted compressed file in MinIO | Very Low | Critical | Hash raw bytes BEFORE compression; download verifies decompression succeeds |
| Memory pressure from compression buffers | Low | Medium | Disk-spill pattern (temp FileStream with DeleteOnClose) |
| Decompression failure on download | Very Low | High | Log error, return 500; consider fallback to raw stream |
| FileService.cs exceeds 200 LOC | Medium | Low | Extract compression orchestration into private helper method |
| Breaking change: StreamToOutputAsync signature | Medium | Medium | Update all callers (controller + DownloadByNameAsync) |
| Existing unit tests fail due to new constructor param | High | Low | Add ICompressionService mock to test setup |

## Security Considerations
- Decompression bomb: Not a concern for storage decompression because we compressed it ourselves (known safe). For transport decompression, Kestrel's MaxRequestBodySize applies.
- No new external dependencies — System.IO.Compression is in .NET BCL
- Temp files use FileOptions.DeleteOnClose — no leftover artifacts

## Next Steps
- Phase 4 (Per-Service Policies) can start after this phase
- Phase 5 (Analytics) can start after this phase
- Phase 6 (Testing) waits for all phases
