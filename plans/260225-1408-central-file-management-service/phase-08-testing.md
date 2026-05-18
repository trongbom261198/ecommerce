---
phase: 8
title: "Testing"
priority: Medium
status: Pending
effort: 3h
depends_on: [5, 6]
---

# Phase 08 — Testing

## Context Links
- [Plan Overview](plan.md)
- [Phase 03 — Core Layer](phase-03-core-layer.md)
- [Phase 05 — API Layer](phase-05-api-layer.md)
- [Phase 06 — Background Services](phase-06-background-services.md)

## Overview
Unit tests for Core services (dedup, cleanup, file service logic). Integration tests for full upload-download-release cycle using real SQL Server + MinIO via Testcontainers. Test infrastructure uses Moq for unit tests, WebApplicationFactory for integration.

## Key Insights
- Unit tests: mock IFileRepository, IStorageProvider, IRedisService — test pure business logic
- Integration tests: use Testcontainers for MSSQL + Redis; real MinIO from docker-compose or Testcontainers
- EF Core InMemoryDatabase NOT suitable (no partition support, no stored procs) — use real SQL Server container
- Focus testing on critical paths: upload dedup flow, release + ref counting, cleanup logic

## Requirements

### Functional
- Unit tests covering:
  - FileService.UploadAsync (new file + dedup hit paths)
  - FileService.ReleaseAsync (decrement ref, trigger delete on 0 refs)
  - DeduplicationService.BufferAndHashAsync (correct SHA-256)
  - CleanupService (stale pending, expired temp, orphan identification)
- Integration tests covering:
  - Full upload → download → release cycle
  - Batch upload
  - Dedup detection (upload same file twice)
  - API key auth (valid, invalid, missing)
  - Health endpoints
  - Legacy by-name endpoints

### Non-Functional
- Tests run in CI (GitHub Actions compatible)
- Integration tests isolated (Testcontainers auto-cleanup)
- Test execution < 2 minutes

## Architecture

```
tests/
├── FIS.FileManager.UnitTests/
│   ├── Services/
│   │   ├── FileServiceUploadTests.cs
│   │   ├── FileServiceReleaseTests.cs
│   │   ├── DeduplicationServiceTests.cs
│   │   └── CleanupServiceTests.cs
│   └── FIS.FileManager.UnitTests.csproj
│
└── FIS.FileManager.IntegrationTests/
    ├── Infrastructure/
    │   ├── CustomWebApplicationFactory.cs
    │   └── TestContainerFixture.cs
    ├── Endpoints/
    │   ├── UploadEndpointTests.cs
    │   ├── DownloadEndpointTests.cs
    │   ├── ReleaseEndpointTests.cs
    │   ├── BatchEndpointTests.cs
    │   ├── LegacyEndpointTests.cs
    │   ├── AuthenticationTests.cs
    │   └── HealthEndpointTests.cs
    └── FIS.FileManager.IntegrationTests.csproj
```

## Related Code Files

### Files to Create
All files listed in Architecture section above (~13 files).

### Files to Modify
- `tests/FIS.FileManager.UnitTests/FIS.FileManager.UnitTests.csproj` — add project refs
- `tests/FIS.FileManager.IntegrationTests/FIS.FileManager.IntegrationTests.csproj` — add project refs

## Implementation Steps

### 1. Unit Test: FileService Upload (new file path)

```csharp
public class FileServiceUploadTests
{
    private readonly Mock<IFileRepository> _repoMock = new();
    private readonly Mock<IStorageProvider> _storageMock = new();
    private readonly Mock<IRedisService> _redisMock = new();
    private readonly Mock<IAuditService> _auditMock = new();
    private readonly FileService _sut;

    public FileServiceUploadTests()
    {
        _sut = new FileService(
            _repoMock.Object, _storageMock.Object,
            _redisMock.Object, _auditMock.Object,
            Options.Create(new FileServiceOptions { ... }));
    }

    [Fact]
    public async Task Upload_NewFile_CreatesFileAndReference()
    {
        // Arrange
        var stream = new MemoryStream("test content"u8.ToArray());
        var request = new UploadFileRequest { OriginalFileName = "test.pdf" };
        var serviceId = Guid.NewGuid();
        var correlationId = Guid.NewGuid();

        _redisMock.Setup(r => r.AcquireLockAsync(It.IsAny<string>(),
            It.IsAny<TimeSpan>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Mock.Of<IAsyncDisposable>());

        _repoMock.Setup(r => r.FindDuplicateAsync(It.IsAny<string>(), serviceId, default))
            .ReturnsAsync((FileEntity?)null); // No duplicate

        _repoMock.Setup(r => r.GetServiceByIdAsync(serviceId, default))
            .ReturnsAsync(new ServiceEntity { ServiceId = serviceId, ServiceName = "test-svc" });

        _repoMock.Setup(r => r.CreateAsync(It.IsAny<FileEntity>(), default))
            .ReturnsAsync((FileEntity e, CancellationToken _) => e);

        // Act
        var result = await _sut.UploadAsync(stream, request, serviceId, correlationId, default);

        // Assert
        result.IsDuplicate.Should().BeFalse();
        result.FileId.Should().NotBeEmpty();
        result.ContentHash.Should().NotBeNullOrEmpty();
        _storageMock.Verify(s => s.UploadAsync(
            "test-svc", It.IsAny<string>(), It.IsAny<Stream>(),
            It.IsAny<long>(), It.IsAny<string>(), default), Times.Once);
        _repoMock.Verify(r => r.UpdateStatusAsync(
            It.IsAny<Guid>(), It.IsAny<DateTime>(), "Confirmed", default), Times.Once);
    }

    [Fact]
    public async Task Upload_DuplicateFile_ReturnsDuplicateTrue()
    {
        // Arrange
        var stream = new MemoryStream("test content"u8.ToArray());
        var existing = new FileEntity
        {
            FileId = Guid.NewGuid(), ObjectName = "abc_test.pdf",
            BucketName = "test-svc", Status = "Confirmed"
        };

        _redisMock.Setup(r => r.AcquireLockAsync(It.IsAny<string>(),
            It.IsAny<TimeSpan>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Mock.Of<IAsyncDisposable>());

        _repoMock.Setup(r => r.FindDuplicateAsync(It.IsAny<string>(), It.IsAny<Guid>(), default))
            .ReturnsAsync(existing);

        // Act
        var result = await _sut.UploadAsync(stream, new UploadFileRequest { OriginalFileName = "test.pdf" },
            Guid.NewGuid(), Guid.NewGuid(), default);

        // Assert
        result.IsDuplicate.Should().BeTrue();
        result.FileId.Should().Be(existing.FileId);
        _storageMock.Verify(s => s.UploadAsync(
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<Stream>(),
            It.IsAny<long>(), It.IsAny<string>(), default), Times.Never);
    }
}
```

### 2. Unit Test: DeduplicationService

```csharp
public class DeduplicationServiceTests
{
    [Fact]
    public async Task BufferAndHash_ReturnsCorrectSha256()
    {
        var content = "Hello, World!"u8.ToArray();
        var stream = new MemoryStream(content);
        var sut = new DeduplicationService(Options.Create(new FileServiceOptions
        {
            MemoryBufferThresholdBytes = 10 * 1024 * 1024
        }));

        var (buffered, hash, size) = await sut.BufferAndHashAsync(stream, default);

        size.Should().Be(content.Length);
        hash.Should().Be(SHA256.HashData(content).ToHexString().ToLowerInvariant());
        buffered.Should().BeOfType<MemoryStream>(); // < 10MB threshold
    }

    [Fact]
    public async Task BufferAndHash_LargeFile_UseDiskBuffer()
    {
        // Generate >10MB stream
        var content = new byte[11 * 1024 * 1024];
        Random.Shared.NextBytes(content);
        var stream = new MemoryStream(content);
        var sut = new DeduplicationService(Options.Create(new FileServiceOptions
        {
            MemoryBufferThresholdBytes = 10 * 1024 * 1024
        }));

        var (buffered, hash, size) = await sut.BufferAndHashAsync(stream, default);

        size.Should().Be(content.Length);
        buffered.Should().BeOfType<FileStream>(); // switched to disk
    }
}
```

### 3. Unit Test: CleanupService

```csharp
public class CleanupServiceTests
{
    [Fact]
    public async Task CleanStalePending_DeletesFromMinioAndDb()
    {
        var repoMock = new Mock<IFileRepository>();
        var storageMock = new Mock<IStorageProvider>();
        var staleFile = new FileEntity
        {
            FileId = Guid.NewGuid(), BucketName = "svc",
            ObjectName = "test.pdf", CreatedAt = DateTime.UtcNow.AddMinutes(-20),
            CreatedByServiceId = Guid.NewGuid()
        };

        repoMock.Setup(r => r.GetStalePendingAsync(15, default))
            .ReturnsAsync(new List<FileEntity> { staleFile });

        var sut = new CleanupService(repoMock.Object, storageMock.Object,
            Mock.Of<IAuditService>(), Options.Create(new CleanupOptions()));

        var cleaned = await sut.CleanStalePendingAsync(default);

        cleaned.Should().Be(1);
        storageMock.Verify(s => s.DeleteAsync("svc", It.IsAny<string>(), default), Times.Once);
        repoMock.Verify(r => r.DeleteAsync(staleFile.FileId, staleFile.CreatedAt, default), Times.Once);
    }
}
```

### 4. Integration Test: WebApplicationFactory

```csharp
public class CustomWebApplicationFactory : WebApplicationFactory<Program>
{
    private readonly MsSqlContainer _sqlContainer;
    private readonly RedisContainer _redisContainer;
    // <!-- Red Team: MinIO Testcontainer — 2026-02-25 -->
    private readonly IContainer _minioContainer;

    public CustomWebApplicationFactory()
    {
        _sqlContainer = new MsSqlBuilder()
            .WithImage("mcr.microsoft.com/mssql/server:2022-latest")
            .Build();
        _redisContainer = new RedisBuilder().Build();
        _minioContainer = new ContainerBuilder()
            .WithImage("minio/minio:latest")
            .WithCommand("server", "/data")
            .WithPortBinding(9000, true)
            .WithEnvironment("MINIO_ROOT_USER", "minioadmin")
            .WithEnvironment("MINIO_ROOT_PASSWORD", "minioadmin")
            .WithWaitStrategy(Wait.ForUnixContainer().UntilPortIsAvailable(9000))
            .Build();
    }

    public async Task InitializeAsync()
    {
        await Task.WhenAll(
            _sqlContainer.StartAsync(),
            _redisContainer.StartAsync(),
            _minioContainer.StartAsync()
        );

        // Run SQL scripts against container
        // Execute pre-deployment and post-deployment scripts
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureServices(services =>
        {
            // Replace connection strings with container endpoints
            services.RemoveAll<DbContextOptions<FileManagerDbContext>>();
            services.AddDbContext<FileManagerDbContext>(opts =>
                opts.UseSqlServer(_sqlContainer.GetConnectionString()));

            services.RemoveAll<IConnectionMultiplexer>();
            services.AddSingleton<IConnectionMultiplexer>(_ =>
                ConnectionMultiplexer.Connect(_redisContainer.GetConnectionString()));
        });
    }

    public override async ValueTask DisposeAsync()
    {
        await _sqlContainer.DisposeAsync();
        await _redisContainer.DisposeAsync();
        await base.DisposeAsync();
    }
}
```

### 5. Integration Test: Upload-Download-Release Cycle

```csharp
public class UploadEndpointTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient _client;

    public UploadEndpointTests(CustomWebApplicationFactory factory)
    {
        _client = factory.CreateClient();
        _client.DefaultRequestHeaders.Add("X-Api-Key", "test-api-key-hash");
    }

    [Fact]
    public async Task FullCycle_Upload_Download_Release()
    {
        // Upload
        var content = new MultipartFormDataContent();
        content.Add(new ByteArrayContent("test"u8.ToArray()), "file", "test.txt");
        content.Add(new StringContent("test.txt"), "originalFileName");

        var uploadResponse = await _client.PostAsync("/api/files/upload", content);
        uploadResponse.StatusCode.Should().Be(HttpStatusCode.OK);

        var upload = await uploadResponse.Content.ReadFromJsonAsync<UploadFileResponse>();
        upload!.FileId.Should().NotBeEmpty();
        upload.IsDuplicate.Should().BeFalse();

        // Download
        var downloadResponse = await _client.GetAsync($"/api/files/{upload.FileId}");
        downloadResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var bytes = await downloadResponse.Content.ReadAsByteArrayAsync();
        bytes.Should().BeEquivalentTo("test"u8.ToArray());

        // Info
        var infoResponse = await _client.GetAsync($"/api/files/{upload.FileId}/info");
        infoResponse.StatusCode.Should().Be(HttpStatusCode.OK);

        // Release
        var releaseResponse = await _client.PostAsync($"/api/files/{upload.FileId}/release", null);
        releaseResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var release = await releaseResponse.Content.ReadFromJsonAsync<ReleaseFileResponse>();
        release!.Released.Should().BeTrue();
        release.RemainingRefs.Should().Be(0);
    }

    [Fact]
    public async Task Upload_SameFileTwice_DeduplicatesSecond()
    {
        var fileContent = "dedup test content"u8.ToArray();

        // First upload
        var content1 = new MultipartFormDataContent();
        content1.Add(new ByteArrayContent(fileContent), "file", "first.txt");
        var r1 = await _client.PostAsync("/api/files/upload", content1);
        var upload1 = await r1.Content.ReadFromJsonAsync<UploadFileResponse>();

        // Second upload (same content)
        var content2 = new MultipartFormDataContent();
        content2.Add(new ByteArrayContent(fileContent), "file", "second.txt");
        var r2 = await _client.PostAsync("/api/files/upload", content2);
        var upload2 = await r2.Content.ReadFromJsonAsync<UploadFileResponse>();

        upload2!.IsDuplicate.Should().BeTrue();
        upload2.FileId.Should().Be(upload1!.FileId);
        upload2.ContentHash.Should().Be(upload1.ContentHash);
    }
}
```

### 6. Integration Test: Authentication

```csharp
public class AuthenticationTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;

    [Fact]
    public async Task Request_WithoutApiKey_Returns401()
    {
        var client = _factory.CreateClient();
        // No X-Api-Key header
        var response = await client.GetAsync("/api/files/00000000-0000-0000-0000-000000000000/info");
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Request_WithInvalidApiKey_Returns401()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Api-Key", "invalid-key");
        var response = await client.GetAsync("/api/files/00000000-0000-0000-0000-000000000000/info");
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task HealthEndpoint_NoApiKeyRequired_Returns200()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/health");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }
}
```

### 7. Run Tests

```bash
# Unit tests
dotnet test tests/FIS.FileManager.UnitTests --verbosity normal

# Integration tests (requires Docker running for Testcontainers)
dotnet test tests/FIS.FileManager.IntegrationTests --verbosity normal

# All tests
dotnet test FIS.FileManager.sln --verbosity normal
```

## Todo List
- [ ] Implement FileServiceUploadTests (new file + dedup paths)
- [ ] Implement FileServiceReleaseTests (release + ref counting)
- [ ] Implement DeduplicationServiceTests (SHA-256 correctness, disk/memory switch)
- [ ] Implement CleanupServiceTests (stale, temp, orphan)
- [ ] Create CustomWebApplicationFactory (Testcontainers)
- [ ] Implement UploadEndpointTests (full cycle + dedup)
- [ ] Implement DownloadEndpointTests
- [ ] Implement ReleaseEndpointTests
- [ ] Implement BatchEndpointTests
- [ ] Implement LegacyEndpointTests (by-name)
- [ ] Implement AuthenticationTests
- [ ] Implement HealthEndpointTests
- [ ] Run all tests, verify green

## Success Criteria
- All unit tests pass (mock-based, no external deps)
- All integration tests pass (Testcontainers for SQL + Redis)
- Upload dedup verified (same content → same FileId)
- Release ref counting verified (0 refs after release)
- Auth middleware verified (401 without key)
- Health endpoints verified (200 without auth)
- `dotnet test` exits with code 0

## Risk Assessment
| Risk | Mitigation |
|------|-----------|
| Testcontainers requires Docker Desktop | Document prerequisite, fallback to external test DB |
| Flaky integration tests (timing) | Use polling/retry for async operations |
| MSSQL container slow to start | Use `WaitStrategy` in Testcontainers |
<!-- Red Team: Integration Tests MinIO Fix — 2026-02-25 -->
| MinIO in Testcontainers | Use `minio/minio:latest` as GenericContainer — critical path must be tested with real storage |

## Security Considerations
- Test API keys are disposable (only in test DB)
- Testcontainers auto-cleanup prevents data leakage
- No production credentials in test code

## Next Steps
→ After all tests pass: ready for code review and deployment
→ Load testing (future): simulate 60K uploads/day
