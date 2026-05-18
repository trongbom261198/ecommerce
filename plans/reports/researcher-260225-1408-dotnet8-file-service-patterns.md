# Research Report: .NET 8 Central File Management Service Patterns
**Date:** 2026-02-25
**Focus:** Technical architecture, libraries, and implementation patterns for production-grade file service

---

## 1. .NET 8 Web API with Clean Architecture

### Project Structure (4 Layers)

```
Solution/
├── Domain/                    # Core business logic, entities
├── Application/               # Use cases, services, DTOs, mappers
├── Infrastructure/            # DB, logging, external integrations
└── Api/                        # Controllers, middleware, Program.cs
```

### Key Principles
- **Dependency Flow:** Outer layers → Inner layers (never reverse)
- **Domain/Core:** No external dependencies, business rules only
- **Application:** DTOs, use cases, service interfaces
- **Infrastructure:** EF Core DbContext, external clients (MinIO), repository implementations
- **Api:** Minimal controllers, dependency injection setup

### Setup Pattern (Program.cs)
```csharp
// Infrastructure DI
builder.Services
    .AddDbContext<AppDbContext>(opts => opts.UseSqlServer(connStr))
    .AddMinio(opts => opts.WithEndpoint(...))
    .AddSerilog();

// Application DI
builder.Services.AddApplicationServices();

// Host
app.MapControllers();
await app.RunAsync();
```

**Reference:** [How to Build a Clean Architecture Web API with .NET Core 8](https://www.c-sharpcorner.com/article/how-to-build-a-clean-architecture-web-api-with-net-core-8/)

---

## 2. EF Core 8 with SQL Server

### Composite Primary Keys

**Using [PrimaryKey] Data Annotation (EF Core 7+):**
```csharp
[PrimaryKey(nameof(BucketId), nameof(ObjectId))]
public class FileObject
{
    public string BucketId { get; set; }
    public string ObjectId { get; set; }
}
```

**Using Fluent API (OnModelCreating):**
```csharp
modelBuilder.Entity<FileObject>()
    .HasKey(f => new { f.BucketId, f.ObjectId });
```

### Migrations for Partitioned Tables

**Current Limitation:** EF Core 8 has no first-class support for SQL Server table partitioning.

**Workaround Pattern:**
1. Define partition function/scheme in raw SQL migration:
```csharp
migrationBuilder.Sql(@"
    CREATE PARTITION FUNCTION PF_FilesByDate(DATETIME2)
    AS RANGE RIGHT FOR VALUES ('2025-01-01', '2025-02-01');

    CREATE PARTITION SCHEME PS_FilesByDate
    AS PARTITION PF_FilesByDate TO ([PRIMARY], [PRIMARY], [PRIMARY]);
");
```

2. Subclass `SqlServerMigrationsSqlGenerator` to inject `ON PS_FilesByDate` into CREATE TABLE:
```csharp
protected override void Generate(CreateTableOperation operation, IModel model, MigrationCommandListBuilder builder)
{
    // Inject partition scheme before base.Generate()
    base.Generate(operation, model, builder);
}
```

**Best Practices:**
- Create partition function/scheme BEFORE applying partition-related migration
- Backup DB before applying schema changes
- Use meaningful migration names: `AddFilePartitioningByDate`
- Handle duplicate key values before applying composite key migrations (data cleanup required)

**References:**
- [EF Core - Creating a Composite Primary Key](https://foxlearn.com/entity-framework/how-to-create-a-composite-primary-key-in-ef-core-8706.html)
- [EF Core Migrations: A Detailed Guide](https://www.milanjovanovic.tech/blog/efcore-migrations-a-detailed-guide)
- [GitHub Issue #33505: Partitioned tables support](https://github.com/dotnet/efcore/issues/33505)

---

## 3. MinIO .NET SDK

### NuGet Package
```
Minio v7.0.0+ (latest stable)
```

### Singleton Client Setup
```csharp
// DI registration (recommended)
builder.Services.AddMinio(configureClient: minioclient => minioclient
    .WithEndpoint("minio.example.com", 9000)
    .WithCredentials("minioadmin", "minioadmin")
    .WithSSL(false)
    .Build());

// Or manual singleton
services.AddSingleton<IMinioClient>(sp => new MinioClient()
    .WithEndpoint("minio.example.com")
    .WithCredentials("minioadmin", "minioadmin")
    .Build());
```

### Bucket Creation
```csharp
await minioClient.MakeBucketAsync(new MakeBucketArgs()
    .WithBucket("files")
    .WithLocation("us-east-1"));
```

### Streaming Upload (PutObjectAsync)
```csharp
using var stream = File.OpenRead(filePath);
await minioClient.PutObjectAsync(new PutObjectArgs()
    .WithBucket("files")
    .WithObject($"{userId}/document.pdf")
    .WithStreamData(stream)
    .WithObjectSize(stream.Length)
    .WithContentType("application/pdf")
    .WithProgress(new Progress<ProgressReport>(report =>
        Console.WriteLine($"Progress: {report.Percentage}%")))
);
```

### Streaming Download (GetObjectAsync)
```csharp
var statObject = await minioClient.StatObjectAsync(new StatObjectArgs()
    .WithBucket("files")
    .WithObject("path/to/object"));

await minioClient.GetObjectAsync(new GetObjectArgs()
    .WithBucket("files")
    .WithObject("path/to/object")
    .WithFile("local/path.pdf")
    .WithCallbackStream(async stream => {
        // Process stream chunks as they arrive
        using var reader = new StreamReader(stream);
        var chunk = await reader.ReadLineAsync();
    }));
```

### Key Patterns
- **WithFileName():** Auto-streams from file path
- **WithStreamData():** Requires explicit WithObjectSize()
- **WithProgress():** IProgress<ProgressReport> for monitoring
- **WithServerSideEncryption():** Built-in SSE support
- **ConfigureAwait(false):** Always use for proper async context

**References:**
- [GitHub: minio/minio-dotnet](https://github.com/minio/minio-dotnet)
- [MinIO .NET SDK Documentation](https://docs.min.io/enterprise/aistor-object-store/developers/sdk/dotnet/)
- [PutObject Example](https://github.com/minio/minio-dotnet/blob/master/Minio.Examples/Cases/PutObject.cs)

---

## 4. Redis Distributed Locks

### Library Options

| Library | Auto-Renewal | Best For | Maturity |
|---------|--------------|----------|----------|
| **RedLock.net** | Yes (timer) | Redlock algorithm, multi-node | Stable |
| **DistributedLock** | Yes (background thread) | Generic locking, long-running jobs | Production-ready |
| **StackExchange.Redis** | Manual | Direct Redis, low-level control | Very stable |

### RedLock.net Pattern (Simple & Robust)

```csharp
// NuGet: RedLock.net v2.2.0+
using var redlockFactory = new RedLockFactory(new[] {
    new RedLockEndPoint { EndPoint = new DnsEndPoint("redis.example.com", 6379) }
});

try {
    using var redlock = await redlockFactory.CreateLockAsync(
        "file:upload:123",      // Resource identifier
        TimeSpan.FromMinutes(5) // TTL
    );

    if (!redlock.IsAcquired)
        throw new LockAcquisitionException("Could not acquire lock");

    // Auto-renewal happens automatically in background
    // Safe for long-running operations
    await ProcessFileUploadAsync();

} finally {
    // Lock released automatically when disposed
}
```

### DistributedLock Pattern (Long-Running Jobs)

```csharp
// NuGet: DistributedLock.Redis v1.1.1+
using var cache = new StackExchange.Redis.ConnectionMultiplexer
    .Connect("redis.example.com:6379");

using var handle = await new RedisDistributedLock(
    cache.GetDatabase(),
    "cleanup:job",
    TimeSpan.FromHours(2)
).AcquireAsync();

// Background thread auto-renews lock before expiry
await RunCleanupJobAsync();
```

### Key Features
- **Auto-Renewal:** Both libraries maintain lock TTL automatically
- **Expiration Safety:** Lock auto-expires after TTL if process crashes
- **Thread-Safe:** Safe for concurrent access from multiple threads
- **Replication Support:** RedLock.net supports master/slave instances

**References:**
- [GitHub: samcook/RedLock.net](https://github.com/samcook/RedLock.net)
- [GitHub: madelson/DistributedLock](https://github.com/madelson/DistributedLock)
- [Redis Distributed Locking Patterns](https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/)

---

## 5. Polly v8 Resilience Patterns

### NuGet Package
```
Polly v8.0.0+
Microsoft.Extensions.Resilience (for deep integration)
```

### Core Concepts
- **Strategy:** Single resilience behavior (Retry, CircuitBreaker, Timeout)
- **Pipeline:** Composed combination of multiple strategies
- **Built-in .NET Integration:** HttpClientFactory, AddPolicyHandler()

### Retry Strategy with Exponential Backoff

```csharp
var retryPolicy = new ResiliencePipelineBuilder<HttpResponseMessage>()
    .AddRetry(new RetryStrategyOptions<HttpResponseMessage>
    {
        ShouldHandle = new PredicateBuilder<HttpResponseMessage>()
            .Handle<HttpRequestException>()
            .HandleResult(r => !r.IsSuccessStatusCode),
        MaxRetryAttempts = 3,
        Delay = TimeSpan.FromMilliseconds(100),
        BackoffType = DelayBackoffType.Exponential,
        UseJitter = true // Randomize to avoid thundering herd
    })
    .Build();

var response = await retryPolicy.ExecuteAsync(async ct =>
    await httpClient.GetAsync("https://api.example.com/files", ct)
);
```

### Circuit Breaker Strategy

```csharp
var circuitBreakerPolicy = new ResiliencePipelineBuilder<HttpResponseMessage>()
    .AddCircuitBreaker(new CircuitBreakerStrategyOptions<HttpResponseMessage>
    {
        FailureRatio = 0.5,           // 50% failure threshold
        SamplingDuration = TimeSpan.FromSeconds(10),
        MinimumThroughput = 4,        // Need 4+ requests in window
        BreakDuration = TimeSpan.FromSeconds(5),
        ShouldHandle = new PredicateBuilder<HttpResponseMessage>()
            .HandleResult(r => r.StatusCode == System.Net.HttpStatusCode.InternalServerError)
    })
    .Build();
```

### Pipeline Composition

```csharp
// Retry → Circuit Breaker → Timeout
var resilientPipeline = new ResiliencePipelineBuilder<HttpResponseMessage>()
    .AddRetry(retryOpts)
    .AddCircuitBreaker(cbOpts)
    .AddTimeout(TimeSpan.FromSeconds(30))
    .Build();

// HttpClientFactory integration
services.AddHttpClient("FileService")
    .AddResilienceHandler("FilePolicy", builder =>
        builder
        .AddRetry(new RetryStrategyOptions { MaxRetryAttempts = 3 })
        .AddCircuitBreaker(new CircuitBreakerStrategyOptions { FailureRatio = 0.5 })
    );
```

### DB Call Resilience

```csharp
var dbPolicy = new ResiliencePipelineBuilder()
    .AddRetry(new RetryStrategyOptions
    {
        ShouldHandle = new PredicateBuilder()
            .Handle<TimeoutException>()
            .Handle<InvalidOperationException>(e => e.Message.Contains("connection")),
        MaxRetryAttempts = 2,
        Delay = TimeSpan.FromMilliseconds(200)
    })
    .AddTimeout(TimeSpan.FromSeconds(10))
    .Build();

await dbPolicy.ExecuteAsync(async () =>
    await dbContext.Files.ToListAsync()
);
```

**References:**
- [Polly Circuit Breaker Strategy](https://www.pollydocs.org/strategies/circuit-breaker.html)
- [Build Robust Middleware with Polly v8](https://www.c-sharpcorner.com/article/build-robust-middleware-in-net-retry-and-circuit-breaker-with-polly-v8/)
- [Building Resilient Cloud Services with .NET 8](https://devblogs.microsoft.com/dotnet/building-resilient-cloud-services-with-dotnet-8/)

---

## 6. Serilog Structured Logging

### NuGet Packages
```
Serilog 4.0.0+
Serilog.AspNetCore 8.0.0+
Serilog.Sinks.Console
Serilog.Sinks.File
Serilog.Sinks.MSSqlServer
```

### appsettings.json Configuration (Recommended)

```json
{
  "Serilog": {
    "Using": ["Serilog.Sinks.Console", "Serilog.Sinks.File", "Serilog.Sinks.MSSqlServer"],
    "MinimumLevel": {
      "Default": "Information",
      "Override": {
        "Microsoft": "Warning",
        "System": "Warning"
      }
    },
    "WriteTo": [
      {
        "Name": "Console",
        "Args": {
          "theme": "Serilog.Sinks.SystemConsole.Themes.AnsiConsoleTheme::Code, Serilog.Sinks.Console"
        }
      },
      {
        "Name": "File",
        "Args": {
          "path": "logs/app-.txt",
          "rollingInterval": "Day",
          "retainedFileCountLimit": 30,
          "outputTemplate": "{Timestamp:o} [{Level:u3}] {Message:lj}{NewLine}{Exception}"
        }
      },
      {
        "Name": "MSSqlServer",
        "Args": {
          "connectionString": "Data Source=sql.example.com;Initial Catalog=Logs;...",
          "sinkOptions": {
            "tableName": "Logs",
            "autoCreateSqlTable": true
          }
        }
      }
    ],
    "Enrich": [
      "FromLogContext",
      "WithMachineName",
      "WithThreadId",
      "WithProperty"
    ],
    "Properties": {
      "Application": "FileService",
      "Environment": "Production"
    }
  }
}
```

### Program.cs Setup

```csharp
Log.Logger = new LoggerConfiguration()
    .ReadFrom.Configuration(configuration)
    .CreateLogger();

try {
    Log.Information("Starting application");

    builder
        .Host.UseSerilog()
        .Build()
        .Run();
} catch (Exception ex) {
    Log.Fatal(ex, "Application terminated unexpectedly");
} finally {
    Log.CloseAndFlush();
}
```

### Structured Logging Usage

```csharp
// Add context data
using (LogContext.PushProperty("FileId", fileId))
using (LogContext.PushProperty("UserId", userId))
{
    _logger.Information(
        "Uploading file {FileName} to bucket {Bucket}",
        fileName, bucketName
    );

    // Automatic cleanup on scope exit
}

// Exceptions with context
_logger.LogError(ex,
    "File upload failed for {FileId} after {RetryCount} attempts",
    fileId, retryCount
);
```

### Multiple Sinks Pattern
- **Console:** Development, real-time monitoring
- **File:** Local disk backup, log rotation
- **MSSqlServer:** Long-term storage, structured querying
- **Optional:** CloudWatch (AWS), Seq (remote), Datadog

**References:**
- [Serilog Official Site](https://serilog.net/)
- [Structured Logging with Serilog in ASP.NET Core](https://codewithmukesh.com/blog/structured-logging-with-serilog-in-aspnet-core/)
- [5 Serilog Best Practices](https://www.milanjovanovic.tech/blog/5-serilog-best-practices-for-better-structured-logging)

---

## 7. .NET BackgroundService for Periodic Cleanup

### NuGet
```
Microsoft.Extensions.Hosting (included in WebApplicationBuilder)
```

### Implementation Pattern

```csharp
public class FileCleanupService : BackgroundService
{
    private readonly ILogger<FileCleanupService> _logger;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly TimeSpan _period = TimeSpan.FromHours(1);

    public FileCleanupService(
        ILogger<FileCleanupService> logger,
        IServiceScopeFactory scopeFactory)
    {
        _logger = logger;
        _scopeFactory = scopeFactory;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(_period);

        try {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                await CleanupOrphanedFilesAsync(stoppingToken);
            }
        } catch (OperationCanceledException) {
            _logger.LogInformation("Cleanup service stopping gracefully");
        }
    }

    private async Task CleanupOrphanedFilesAsync(CancellationToken ct)
    {
        try {
            using var scope = _scopeFactory.CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var minioClient = scope.ServiceProvider.GetRequiredService<IMinioClient>();

            var orphanedFiles = await dbContext.Files
                .Where(f => f.IsOrphaned && f.CreatedAt < DateTime.UtcNow.AddDays(-7))
                .ToListAsync(ct);

            foreach (var file in orphanedFiles) {
                try {
                    // Delete from MinIO
                    await minioClient.RemoveObjectAsync(new RemoveObjectArgs()
                        .WithBucket(file.BucketId)
                        .WithObject(file.ObjectId));

                    // Delete from DB
                    dbContext.Files.Remove(file);
                    await dbContext.SaveChangesAsync(ct);

                    _logger.LogInformation("Cleaned up orphaned file {FileId}", file.Id);
                } catch (Exception ex) {
                    _logger.LogError(ex, "Error cleaning file {FileId}", file.Id);
                    // Don't stop entire cleanup process
                }
            }

            _logger.LogInformation("Cleanup cycle completed. Processed {Count} files", orphanedFiles.Count);

        } catch (Exception ex) {
            _logger.LogError(ex, "Critical error in cleanup service");
        }
    }
}
```

### DI Registration

```csharp
builder.Services.AddHostedService<FileCleanupService>();
```

### Key Patterns
- **PeriodicTimer:** Non-blocking, efficient (not Thread.Sleep)
- **IServiceScopeFactory:** Create new scope for each iteration (scoped services)
- **Try-Catch Per Item:** Prevent one failure from stopping entire process
- **CancellationToken:** Graceful shutdown on app stop
- **Logging:** Info-level for normal cycles, Error for failures

**References:**
- [Efficient Background Jobs in .NET 8 with Hosted Services](https://dev.to/leandroveiga/efficient-background-jobs-scheduled-tasks-in-net-8-with-hosted-services-50pk)
- [Background Tasks in ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/host/hosted-services)
- [How to Implement BackgroundService for Long-Running Tasks](https://okyrylchuk.dev/blog/how-to-use-backgroundservice-in-dotnet-for-long-running-tasks)

---

## 8. Two-Phase File Upload Pattern

### Architecture Overview
```
Client sends file chunks
    ↓
[Phase 1] Buffer → Temp file + Incremental SHA-256
    ↓
SHA-256 Hash computed
    ↓
[Dedup Check] Query DB for existing file with same hash
    ├─ Found → Return existing file reference (incremental savings)
    └─ Not found → Continue to Phase 2
    ↓
[Phase 2] Stream temp file to MinIO → Delete temp file
    ↓
Store file metadata (hash, size, location) in DB
```

### Phase 1: Buffering & Hashing

```csharp
public class FileUploadService
{
    private readonly string _tempDir = Path.Combine(Path.GetTempPath(), "file-uploads");

    public async Task<string> BufferAndHashFileAsync(
        Stream uploadStream,
        CancellationToken ct)
    {
        var tempFile = Path.Combine(_tempDir, Guid.NewGuid().ToString());
        Directory.CreateDirectory(_tempDir);

        using (var sha256 = System.Security.Cryptography.SHA256.Create())
        using (var tempFileStream = new FileStream(
            tempFile, FileMode.Create, FileAccess.Write, FileShare.None))
        {
            var buffer = new byte[81920]; // 80KB chunks
            int bytesRead;

            while ((bytesRead = await uploadStream.ReadAsync(buffer, 0, buffer.Length, ct)) > 0)
            {
                // Incremental hash computation (constant memory)
                sha256.TransformBlock(buffer, 0, bytesRead, null, 0);

                // Write to temp file
                await tempFileStream.WriteAsync(buffer, 0, bytesRead, ct);
            }

            // Finalize hash
            sha256.TransformFinalBlock(buffer, 0, 0);
            var hash = Convert.ToHexString(sha256.Hash);

            return hash;
        }
    }
}
```

### Deduplication Check

```csharp
public async Task<(bool IsDuplicate, FileMetadata Metadata)> CheckAndUploadAsync(
    string tempFilePath,
    string sha256Hash,
    string userId,
    string fileName,
    CancellationToken ct)
{
    // 1. Check for existing file with same hash
    var existingFile = await _dbContext.Files
        .FirstOrDefaultAsync(f => f.Sha256Hash == sha256Hash, ct);

    if (existingFile != null) {
        // Dedup: Just reference existing file, no re-upload needed
        _logger.LogInformation(
            "File deduplication hit for hash {Hash}. Using existing file {FileId}",
            sha256Hash, existingFile.Id);

        File.Delete(tempFilePath); // Clean up temp
        return (true, existingFile);
    }

    // 2. Not found, proceed to MinIO upload
    return (false, null);
}
```

### Phase 2: MinIO Upload

```csharp
public async Task<FileMetadata> UploadToMinioAsync(
    string tempFilePath,
    string sha256Hash,
    string userId,
    string fileName,
    CancellationToken ct)
{
    var fileInfo = new FileInfo(tempFilePath);
    var objectName = $"{userId}/files/{sha256Hash[:16]}/{fileName}";

    try {
        using (var fileStream = new FileStream(
            tempFilePath, FileMode.Open, FileAccess.Read, FileShare.Read))
        {
            await _minioClient.PutObjectAsync(new PutObjectArgs()
                .WithBucket("files")
                .WithObject(objectName)
                .WithStreamData(fileStream)
                .WithObjectSize(fileStream.Length)
                .WithContentType("application/octet-stream")
                .WithMetadata(new Dictionary<string, string>
                {
                    { "sha256", sha256Hash },
                    { "uploaded-by", userId },
                    { "original-name", fileName }
                }),
                ct);
        }

        // Store in DB
        var metadata = new FileMetadata
        {
            Id = Guid.NewGuid(),
            Sha256Hash = sha256Hash,
            FileName = fileName,
            Size = fileInfo.Length,
            BucketId = "files",
            ObjectId = objectName,
            OwnerId = userId,
            UploadedAt = DateTime.UtcNow
        };

        _dbContext.Files.Add(metadata);
        await _dbContext.SaveChangesAsync(ct);

        return metadata;

    } finally {
        // Always cleanup temp file
        if (File.Exists(tempFilePath))
            File.Delete(tempFilePath);
    }
}
```

### End-to-End Flow

```csharp
[HttpPost("upload")]
public async Task<IActionResult> UploadFile(
    IFormFile file,
    CancellationToken ct)
{
    if (file == null || file.Length == 0)
        return BadRequest("File required");

    try {
        // Phase 1: Buffer + Hash
        var sha256 = await _uploadService.BufferAndHashFileAsync(
            file.OpenReadStream(), ct);

        _logger.LogInformation("File buffered: Hash={Hash}, Size={Size}",
            sha256, file.Length);

        // Dedup check
        var (isDuplicate, existing) = await _uploadService
            .CheckAndUploadAsync(tempFile, sha256, userId, file.FileName, ct);

        if (isDuplicate) {
            return Ok(new { message = "Duplicate file", fileId = existing.Id });
        }

        // Phase 2: Upload to MinIO
        var uploaded = await _uploadService.UploadToMinioAsync(
            tempFile, sha256, userId, file.FileName, ct);

        return Created($"/files/{uploaded.Id}", uploaded);

    } catch (Exception ex) {
        _logger.LogError(ex, "Upload failed");
        return StatusCode(500, "Upload failed");
    }
}
```

### Benefits of Two-Phase Pattern
- **Memory Efficient:** Constant memory usage (no buffering entire file)
- **Incremental Hashing:** SHA-256 computed while writing, no second pass
- **Deduplication:** Detect duplicates before expensive S3/MinIO upload
- **Atomic Storage:** Only write to MinIO if dedup check passes
- **Temp Cleanup:** Guaranteed deletion in finally block

**References:**
- [Efficient File Deduplication with SHA-256](https://transloadit.com/devtips/efficient-file-deduplication-with-sha-256-and-node-js/)
- [Efficient File Deduplication in Go Using SHA-256](https://medium.com/@srivastavashivang/efficient-file-deduplication-in-go-using-sha-256-hashing-2f5acca0a40c)

---

## Summary Table: NuGet Versions & Compatibility

| Feature | NuGet Package | Min Version | .NET 8 Compatible |
|---------|---------------|-------------|-------------------|
| Web API | ASP.NET Core | 8.0.0 | ✅ |
| EF Core | EntityFrameworkCore.SqlServer | 8.0.0 | ✅ |
| MinIO | Minio | 7.0.0+ | ✅ |
| RedLock | RedLock.net | 2.2.0+ | ✅ |
| Polly | Polly | 8.0.0+ | ✅ |
| Serilog | Serilog.AspNetCore | 8.0.0+ | ✅ |
| BackgroundService | Microsoft.Extensions.Hosting | Included | ✅ |
| Redis | StackExchange.Redis | 2.7.0+ | ✅ |

---

## Unresolved Questions

1. **Partitioned Table Automation:** Should custom migration generator be abstracted into reusable library?
2. **MinIO Bucket Isolation:** Multi-tenant bucket naming strategy (per-user vs. per-workspace)?
3. **Temp File Location:** Should temp buffer location be configurable per environment?
4. **Lock Timeout:** What's appropriate TTL for file upload locks in production (5min? 30min?)?
5. **Cleanup Frequency:** Should orphan cleanup be hourly, daily, or configurable?
6. **Serilog Sink Selection:** Which sink is priority for production (File/DB/CloudWatch)?

---

**Report Date:** 2026-02-25
**Context:** Preparing implementation plan for Central File Management Service
**Next Step:** Use findings to create detailed phase-by-phase implementation plan
