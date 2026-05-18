# Phase 6: Testing

## Context Links
- [Phases 1-5](plan.md) — all prerequisite phases
- [UnitTests project](../../tests/FIS.FileManager.UnitTests/) — 38 existing tests
- [IntegrationTests project](../../tests/FIS.FileManager.IntegrationTests/) — 44 existing tests
- [Code Standards — Testing](../../docs/code-standards.md) — AAA pattern, TestContainers, naming conventions

## Overview
- **Priority:** High
- **Status:** Pending
- **Effort:** 3h
- **Depends on:** Phases 1-5 (all)
- **Description:** Unit tests for CompressionService, updated mocks for FileService tests, and integration tests for upload-with-compression and download-with-decompression flows.

## Key Insights
- Existing 38 unit tests will need mock updates: FileService constructor gained `ICompressionService` parameter (Phase 3)
- CompressionService is pure logic (no external deps) — ideal for unit testing
- Integration tests must verify round-trip: upload compressed → download decompressed → content matches original
- Test incompressible types (JPEG) to verify bypass path
- Test graceful degradation: compression disabled → store uncompressed
- Test backward compat: old files (IsCompressed=false) download correctly

## Requirements

### Functional
- F1: Unit tests for CompressionService (ShouldCompress, CompressAsync, DecompressAsync)
- F2: Unit tests for CompressionService policy overrides (ForceOn, ForceOff, Default)
- F3: Updated FileService unit tests with ICompressionService mock
- F4: Integration test: upload text file → verify compressed in DB → download → verify matches original
- F5: Integration test: upload JPEG → verify NOT compressed → download → verify matches
- F6: Integration test: compression-stats endpoint returns correct aggregates

### Non-Functional
- NF1: All 38 existing unit tests pass with updated mocks
- NF2: All 44 existing integration tests pass
- NF3: Test naming follows MethodName_Scenario_Expected convention
- NF4: No mocked compression in integration tests — real GZip

## Architecture

### Test Matrix

| Layer | What | How | Count Est. |
|-------|------|-----|-----------|
| Unit | CompressionService.ShouldCompress | Direct call, various MIME types | 8 |
| Unit | CompressionService.CompressAsync | Compress known data, verify smaller | 2 |
| Unit | CompressionService.DecompressAsync | Compress → decompress, verify round-trip | 2 |
| Unit | CompressionService policy overrides | ForceOn/ForceOff/Default paths | 4 |
| Unit | FileService.UploadAsync (updated mocks) | Verify compression called for text, skipped for JPEG | 3 |
| Unit | FileEntity.StoredSize / CompressionRatio | Computed property correctness | 3 |
| Integration | Upload text → download decompressed | Full HTTP round-trip | 1 |
| Integration | Upload JPEG → download raw | Full HTTP round-trip | 1 |
| Integration | Upload with compression disabled | Config toggle | 1 |
| Integration | Compression-stats endpoint | Aggregate query after uploads | 1 |
| Integration | Backward compat: old file download | Pre-existing IsCompressed=false file | 1 |
| **Total** | | | **~27** |

## Related Code Files

### Files to Create
| File | Location |
|------|----------|
| `CompressionServiceTests.cs` | `tests/FIS.FileManager.UnitTests/Services/` |
| `FileEntityCompressionTests.cs` | `tests/FIS.FileManager.UnitTests/Entities/` |
| `CompressionIntegrationTests.cs` | `tests/FIS.FileManager.IntegrationTests/` |

### Files to Modify
| File | Change |
|------|--------|
| Existing FileService unit tests | Add `Mock<ICompressionService>` to test setup |
| Existing integration test fixtures | No changes expected (new columns have defaults) |

## Implementation Steps

### Step 1: Create CompressionServiceTests.cs

Path: `tests/FIS.FileManager.UnitTests/Services/CompressionServiceTests.cs`

```csharp
using FIS.FileManager.Core.Options;
using FIS.FileManager.Core.Services;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace FIS.FileManager.UnitTests.Services;

public class CompressionServiceTests
{
    private readonly CompressionService _sut;
    private readonly CompressionOptions _options = new();

    public CompressionServiceTests()
    {
        _sut = new CompressionService(
            Options.Create(_options),
            NullLogger<CompressionService>.Instance);
    }

    // --- ShouldCompress ---

    [Theory]
    [InlineData("text/plain", true)]
    [InlineData("text/csv", true)]
    [InlineData("application/json", true)]
    [InlineData("application/pdf", true)]
    [InlineData("application/xml", true)]
    public void ShouldCompress_CompressibleMimeType_ReturnsTrue(string mimeType, bool expected)
    {
        _sut.ShouldCompress(mimeType, 10_000).Should().Be(expected);
    }

    [Theory]
    [InlineData("image/jpeg")]
    [InlineData("image/png")]
    [InlineData("application/zip")]
    [InlineData("application/gzip")]
    [InlineData("video/mp4")]
    public void ShouldCompress_IncompressibleMimeType_ReturnsFalse(string mimeType)
    {
        _sut.ShouldCompress(mimeType, 10_000).Should().BeFalse();
    }

    [Fact]
    public void ShouldCompress_FileSizeBelowMinimum_ReturnsFalse()
    {
        _sut.ShouldCompress("text/plain", 500).Should().BeFalse(); // default min is 1024
    }

    [Fact]
    public void ShouldCompress_StorageDisabled_ReturnsFalse()
    {
        var opts = new CompressionOptions { StorageEnabled = false };
        var svc = new CompressionService(Options.Create(opts), NullLogger<CompressionService>.Instance);
        svc.ShouldCompress("text/plain", 10_000).Should().BeFalse();
    }

    // --- Policy overrides ---

    [Fact]
    public void ShouldCompress_ForceOff_ReturnsFalse()
    {
        _sut.ShouldCompress("text/plain", 10_000, "ForceOff").Should().BeFalse();
    }

    [Fact]
    public void ShouldCompress_ForceOn_CompressesIncompressibleType()
    {
        _sut.ShouldCompress("image/jpeg", 10_000, "ForceOn").Should().BeTrue();
    }

    [Fact]
    public void ShouldCompress_ForceOn_StillRespectsMinFileSize()
    {
        _sut.ShouldCompress("image/jpeg", 500, "ForceOn").Should().BeFalse();
    }

    [Fact]
    public void ShouldCompress_Default_UsesGlobalLogic()
    {
        _sut.ShouldCompress("text/plain", 10_000, "Default").Should().BeTrue();
        _sut.ShouldCompress("image/jpeg", 10_000, "Default").Should().BeFalse();
    }

    // --- CompressAsync / DecompressAsync ---

    [Fact]
    public async Task CompressAsync_TextData_ProducesSmallOutput()
    {
        var data = new string('A', 10_000);
        using var input = new MemoryStream(System.Text.Encoding.UTF8.GetBytes(data));

        var (compressed, compressedSize) = await _sut.CompressAsync(input);

        compressedSize.Should().BeLessThan(input.Length);
        compressed.Should().NotBeNull();
        compressed.Length.Should().Be(compressedSize);
        await compressed.DisposeAsync();
    }

    [Fact]
    public async Task CompressAsync_ThenDecompressAsync_RoundTrip_MatchesOriginal()
    {
        var original = "Hello, compression round-trip test! " + new string('X', 5000);
        var originalBytes = System.Text.Encoding.UTF8.GetBytes(original);
        using var input = new MemoryStream(originalBytes);

        var (compressed, _) = await _sut.CompressAsync(input);
        using var decompressed = new MemoryStream();
        await _sut.DecompressAsync(compressed, decompressed);
        await compressed.DisposeAsync();

        decompressed.ToArray().Should().BeEquivalentTo(originalBytes);
    }
}
```

### Step 2: Create FileEntityCompressionTests.cs

Path: `tests/FIS.FileManager.UnitTests/Entities/FileEntityCompressionTests.cs`

```csharp
using FIS.FileManager.Core.Entities;
using FluentAssertions;

namespace FIS.FileManager.UnitTests.Entities;

public class FileEntityCompressionTests
{
    [Fact]
    public void StoredSize_NotCompressed_ReturnsFileSize()
    {
        var entity = new FileEntity { FileSize = 10000, IsCompressed = false };
        entity.StoredSize.Should().Be(10000);
    }

    [Fact]
    public void StoredSize_Compressed_ReturnsCompressedSize()
    {
        var entity = new FileEntity { FileSize = 10000, IsCompressed = true, CompressedSize = 2000 };
        entity.StoredSize.Should().Be(2000);
    }

    [Fact]
    public void CompressionRatio_Compressed_ReturnsCorrectPercentage()
    {
        var entity = new FileEntity { FileSize = 10000, IsCompressed = true, CompressedSize = 2000 };
        entity.CompressionRatio.Should().Be(80.0); // (1 - 2000/10000) * 100 = 80%
    }

    [Fact]
    public void CompressionRatio_NotCompressed_ReturnsZero()
    {
        var entity = new FileEntity { FileSize = 10000, IsCompressed = false };
        entity.CompressionRatio.Should().Be(0);
    }

    [Fact]
    public void CompressionRatio_ZeroFileSize_ReturnsZero()
    {
        var entity = new FileEntity { FileSize = 0, IsCompressed = true, CompressedSize = 0 };
        entity.CompressionRatio.Should().Be(0);
    }
}
```

### Step 3: Update existing FileService unit tests

Find all existing test files that instantiate `FileService`. Add `Mock<ICompressionService>` to test setup. The mock should default to:
- `ShouldCompress` returns `false` (most existing tests don't care about compression)
- This ensures existing tests pass unchanged

```csharp
// Add to existing test class fields:
private readonly Mock<ICompressionService> _mockCompression = new();

// Update FileService instantiation:
var fileService = new FileService(
    _mockRepo.Object, _mockStorage.Object, _mockRedis.Object,
    _mockAudit.Object, _dedup, _mockCompression.Object, _config, _logger);
```

Search for all FileService constructor calls in unit tests:
```bash
grep -rn "new FileService" tests/FIS.FileManager.UnitTests/
```

### Step 4: Add FileService compression unit tests

Add to existing FileService test file or create `FileServiceCompressionTests.cs`:

```csharp
[Fact]
public async Task UploadAsync_CompressibleMimeType_SetsIsCompressedTrue()
{
    // Arrange
    _mockCompression.Setup(c => c.ShouldCompress(It.IsAny<string>(), It.IsAny<long>(), It.IsAny<string>()))
        .Returns(true);
    _mockCompression.Setup(c => c.CompressAsync(It.IsAny<Stream>(), It.IsAny<CancellationToken>()))
        .ReturnsAsync((new MemoryStream(new byte[50]), 50L));
    // ... setup repo mocks ...

    // Act
    var result = await _fileService.UploadAsync(stream, request, serviceId, correlationId, ct);

    // Assert
    result.IsCompressed.Should().BeTrue();
    result.CompressedSize.Should().Be(50);
}

[Fact]
public async Task UploadAsync_IncompressibleMimeType_SetsIsCompressedFalse()
{
    _mockCompression.Setup(c => c.ShouldCompress(It.IsAny<string>(), It.IsAny<long>(), It.IsAny<string>()))
        .Returns(false);
    // ... setup repo mocks ...

    var result = await _fileService.UploadAsync(stream, request, serviceId, correlationId, ct);

    result.IsCompressed.Should().BeFalse();
    result.CompressedSize.Should().BeNull();
    _mockCompression.Verify(c => c.CompressAsync(It.IsAny<Stream>(), It.IsAny<CancellationToken>()), Times.Never);
}

[Fact]
public async Task UploadAsync_CompressionFails_StoresUncompressed()
{
    _mockCompression.Setup(c => c.ShouldCompress(It.IsAny<string>(), It.IsAny<long>(), It.IsAny<string>()))
        .Returns(true);
    _mockCompression.Setup(c => c.CompressAsync(It.IsAny<Stream>(), It.IsAny<CancellationToken>()))
        .ThrowsAsync(new IOException("Disk full"));
    // ... setup repo mocks ...

    var result = await _fileService.UploadAsync(stream, request, serviceId, correlationId, ct);

    result.IsCompressed.Should().BeFalse(); // Graceful degradation
}
```

### Step 5: Create CompressionIntegrationTests.cs

Path: `tests/FIS.FileManager.IntegrationTests/CompressionIntegrationTests.cs`

These tests use the existing TestContainers infrastructure (SQL Server + MinIO + Redis). Check existing integration test base class for setup pattern.

```csharp
public class CompressionIntegrationTests : IntegrationTestBase
{
    [Fact]
    public async Task UploadTextFile_CompressedInStorage_DownloadMatchesOriginal()
    {
        // Arrange
        var client = CreateAuthenticatedClient();
        var originalContent = new string('A', 50_000); // 50KB of text — very compressible
        var fileContent = new ByteArrayContent(System.Text.Encoding.UTF8.GetBytes(originalContent));
        var formData = new MultipartFormDataContent();
        formData.Add(fileContent, "file", "test-compression.txt");

        // Act — Upload
        var uploadResponse = await client.PostAsync("/api/files/upload", formData);
        uploadResponse.StatusCode.Should().Be(System.Net.HttpStatusCode.OK);
        var uploadResult = await uploadResponse.Content.ReadFromJsonAsync<UploadFileResponse>();

        // Assert — Compression metadata
        uploadResult!.IsCompressed.Should().BeTrue();
        uploadResult.CompressedSize.Should().BeLessThan(uploadResult.FileSize);

        // Act — Download
        var downloadResponse = await client.GetAsync($"/api/files/{uploadResult.FileId}");
        var downloadedBytes = await downloadResponse.Content.ReadAsByteArrayAsync();

        // Assert — Content matches original (decompressed transparently)
        System.Text.Encoding.UTF8.GetString(downloadedBytes).Should().Be(originalContent);
    }

    [Fact]
    public async Task UploadJpegFile_NotCompressed_DownloadMatchesOriginal()
    {
        var client = CreateAuthenticatedClient();
        // Create fake JPEG header (just needs MIME detection to return image/jpeg)
        var fakeJpeg = new byte[5000];
        fakeJpeg[0] = 0xFF; fakeJpeg[1] = 0xD8; // JPEG magic bytes
        var formData = new MultipartFormDataContent();
        formData.Add(new ByteArrayContent(fakeJpeg), "file", "test-image.jpg");

        var uploadResponse = await client.PostAsync("/api/files/upload", formData);
        var uploadResult = await uploadResponse.Content.ReadFromJsonAsync<UploadFileResponse>();

        uploadResult!.IsCompressed.Should().BeFalse();
        uploadResult.CompressedSize.Should().BeNull();

        var downloadResponse = await client.GetAsync($"/api/files/{uploadResult.FileId}");
        var downloadedBytes = await downloadResponse.Content.ReadAsByteArrayAsync();
        downloadedBytes.Should().BeEquivalentTo(fakeJpeg);
    }

    [Fact]
    public async Task GetCompressionStats_AfterUploads_ReturnsCorrectAggregates()
    {
        var client = CreateAuthenticatedClient();

        // Upload one compressible file
        var textData = new MultipartFormDataContent();
        textData.Add(new ByteArrayContent(System.Text.Encoding.UTF8.GetBytes(new string('B', 20_000))), "file", "stats-test.txt");
        await client.PostAsync("/api/files/upload", textData);

        // Upload one incompressible file
        var jpegData = new MultipartFormDataContent();
        jpegData.Add(new ByteArrayContent(new byte[5000]), "file", "stats-test.jpg");
        await client.PostAsync("/api/files/upload", jpegData);

        // Get stats
        var statsResponse = await client.GetAsync("/api/files/compression-stats");
        var stats = await statsResponse.Content.ReadFromJsonAsync<CompressionStatsResponse>();

        stats!.TotalFiles.Should().BeGreaterOrEqualTo(2);
        stats.CompressedFiles.Should().BeGreaterOrEqualTo(1);
        stats.TotalStoredBytes.Should().BeLessThan(stats.TotalRawBytes);
        stats.SavingsPercent.Should().BeGreaterThan(0);
    }

    [Fact]
    public async Task DownloadOldUncompressedFile_StillWorks()
    {
        // Upload with compression disabled to simulate old file
        // (or use config override in test to disable compression)
        var client = CreateAuthenticatedClient();
        // This tests that IsCompressed=false files download without decompression
        // Implementation: upload small file (<1KB threshold) which won't be compressed
        var smallContent = "tiny";
        var formData = new MultipartFormDataContent();
        formData.Add(new ByteArrayContent(System.Text.Encoding.UTF8.GetBytes(smallContent)), "file", "tiny.txt");

        var uploadResponse = await client.PostAsync("/api/files/upload", formData);
        var uploadResult = await uploadResponse.Content.ReadFromJsonAsync<UploadFileResponse>();
        uploadResult!.IsCompressed.Should().BeFalse(); // Below MinFileSizeBytes

        var downloadResponse = await client.GetAsync($"/api/files/{uploadResult.FileId}");
        var content = await downloadResponse.Content.ReadAsStringAsync();
        content.Should().Be(smallContent);
    }
}
```

Note: Adapt `IntegrationTestBase` and `CreateAuthenticatedClient` to match existing test infrastructure. Check existing integration test files for the actual base class name and helper methods.

### Step 6: Run all tests

```bash
dotnet test tests/FIS.FileManager.UnitTests --verbosity normal
dotnet test tests/FIS.FileManager.IntegrationTests --verbosity normal
```

## Todo List

- [ ] Create `CompressionServiceTests.cs` — ShouldCompress tests (8 tests)
- [ ] Create `CompressionServiceTests.cs` — CompressAsync/DecompressAsync tests (2 tests)
- [ ] Create `CompressionServiceTests.cs` — Policy override tests (4 tests)
- [ ] Create `FileEntityCompressionTests.cs` — StoredSize + CompressionRatio tests (5 tests)
- [ ] Update existing FileService test setup — add Mock<ICompressionService>
- [ ] Add FileService compression-specific unit tests (3 tests)
- [ ] Create `CompressionIntegrationTests.cs` — round-trip upload/download (4 tests)
- [ ] Verify all 38 existing unit tests pass
- [ ] Verify all 44 existing integration tests pass
- [ ] Verify all new tests pass
- [ ] Total test count target: 82 existing + ~27 new = ~109

## Success Criteria

1. All 38 existing unit tests pass (with mock updates)
2. All 44 existing integration tests pass (schema changes are backward compatible)
3. ~27 new compression tests pass
4. Integration round-trip: upload text → DB shows compressed → download matches original
5. Integration round-trip: upload JPEG → DB shows uncompressed → download matches original
6. No flaky tests — compression behavior is deterministic

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Existing tests fail from constructor change | High | Low | Simple fix: add mock to setup. Grep for all `new FileService` in tests |
| Integration tests flaky from timing | Low | Medium | Compression is synchronous in upload flow — no race conditions |
| Test containers not supporting new schema | Very Low | Low | Schema change is ALTER TABLE ADD COLUMN — compatible with existing TestContainers SQL setup |
| Mock compression hides real bugs | Medium | Medium | Integration tests use REAL compression — mocks only in unit tests per code standards |

## Security Considerations
- Test data contains no secrets
- Fake JPEG data in tests does not constitute harmful content
- Test API keys follow existing test infrastructure patterns

## Next Steps
- After all tests pass, the compression feature is ready for code review
- Update `docs/system-architecture.md` to document compression flow
- Update `docs/project-roadmap.md` to mark compression as complete
