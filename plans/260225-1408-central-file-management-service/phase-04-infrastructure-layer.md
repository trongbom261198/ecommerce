---
phase: 4
title: "Infrastructure Layer"
priority: High
status: Pending
effort: 4h
depends_on: [2, 3]
---

# Phase 04 — Infrastructure Layer

## Context Links
- [Plan Overview](plan.md)
- [Phase 02 — Database Schema](phase-02-database-schema.md)
- [Phase 03 — Core Layer](phase-03-core-layer.md)
- [.NET 8 Patterns Research](../reports/researcher-260225-1408-dotnet8-file-service-patterns.md)

## Overview
Implement FIS.FileManager.Infrastructure: EF Core DbContext, MinIO storage provider, Redis distributed lock, audit service, and Polly resilience pipelines. This layer implements all interfaces from Core.

## Key Insights
- EF Core cannot model partition functions — use `HasNoKey()` or manual config for partition-aligned composite PKs
- MinioClient must be singleton (avoid 60K connections/day)
- Redis lock uses StackExchange.Redis LockTake/LockRelease (simpler than RedLock for single-instance Redis)
- Polly v8 uses ResiliencePipelineBuilder (not legacy PolicyBuilder)
- Dapper for perf-critical queries (cleanup, dedup lookup) via stored procedures

## Requirements

### Functional
- FileManagerDbContext with entity configurations for all 4 tables
- FileRepository implementing IFileRepository (EF Core + Dapper)
- MinioStorageProvider implementing IStorageProvider
- RedisService implementing IRedisService
- AuditService implementing IAuditService
- Polly resilience pipelines for MinIO and SQL

### Non-Functional
- Connection pooling for SQL and Redis
- MinIO client singleton
- Retry: 3 attempts, exponential backoff
- Circuit breaker: 5 failures → 30s break → half-open

## Architecture

```
FIS.FileManager.Infrastructure/
├── Data/
│   ├── FileManagerDbContext.cs
│   ├── Configurations/
│   │   ├── ServiceEntityConfiguration.cs
│   │   ├── FileEntityConfiguration.cs
│   │   ├── FileReferenceEntityConfiguration.cs
│   │   └── AuditLogEntityConfiguration.cs
│   └── Repositories/
│       └── FileRepository.cs
├── Storage/
│   └── MinioStorageProvider.cs
├── Cache/
│   └── RedisService.cs
├── Logging/
│   └── AuditService.cs
├── Resilience/
│   └── ResiliencePipelines.cs
└── DependencyInjection.cs
```

## Related Code Files

### Files to Create
All files listed in Architecture section above (~11 files).

### Files to Modify
- `src/FIS.FileManager.Infrastructure/FIS.FileManager.Infrastructure.csproj` — remove Class1.cs

## Implementation Steps

### 1. EF Core Entity Configurations

**`Data/Configurations/FileEntityConfiguration.cs`**
```csharp
public class FileEntityConfiguration : IEntityTypeConfiguration<FileEntity>
{
    public void Configure(EntityTypeBuilder<FileEntity> builder)
    {
        builder.ToTable("Files");
        builder.HasKey(e => new { e.FileId, e.CreatedAt });

        builder.Property(e => e.ContentHash).HasColumnType("char(64)").IsRequired();
        builder.Property(e => e.ObjectName).HasMaxLength(150).IsRequired();
        builder.Property(e => e.BucketName).HasMaxLength(63).IsRequired();
        builder.Property(e => e.MimeType).HasColumnType("varchar(100)").IsRequired();
        builder.Property(e => e.Status).HasColumnType("varchar(10)").IsRequired();
        builder.Property(e => e.CreatedAt).HasColumnType("datetime2(0)");
        builder.Property(e => e.ExpiresAt).HasColumnType("datetime2(0)");

        // Indexes managed by SQL scripts, not EF
    }
}
```

**`Data/Configurations/ServiceEntityConfiguration.cs`**
```csharp
public class ServiceEntityConfiguration : IEntityTypeConfiguration<ServiceEntity>
{
    public void Configure(EntityTypeBuilder<ServiceEntity> builder)
    {
        builder.ToTable("Services");
        builder.HasKey(e => e.ServiceId);

        builder.Property(e => e.ServiceName).HasMaxLength(63).IsRequired();
        builder.Property(e => e.ApiKey).HasColumnType("varchar(128)").IsRequired();
        builder.Property(e => e.CreatedAt).HasColumnType("datetime2(0)");

        builder.HasIndex(e => e.ServiceName).IsUnique();
        builder.HasIndex(e => e.ApiKey).IsUnique();
    }
}
```

**FileReferenceEntityConfiguration** and **AuditLogEntityConfiguration** — similar pattern with composite PKs.

### 2. DbContext

**`Data/FileManagerDbContext.cs`**
```csharp
public class FileManagerDbContext : DbContext
{
    public FileManagerDbContext(DbContextOptions<FileManagerDbContext> options) : base(options) { }

    public DbSet<ServiceEntity> Services => Set<ServiceEntity>();
    public DbSet<FileEntity> Files => Set<FileEntity>();
    public DbSet<FileReferenceEntity> FileReferences => Set<FileReferenceEntity>();
    public DbSet<AuditLogEntity> AuditLogs => Set<AuditLogEntity>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(FileManagerDbContext).Assembly);
    }
}
```

**Important:** Do NOT use EF migrations. Tables created by SQL scripts (Phase 02). Set `Database.EnsureCreated()` = false. Optionally use `MigrationsAssembly` only if needed later.

### 3. FileRepository (EF Core + Dapper hybrid)

**`Data/Repositories/FileRepository.cs`**
```csharp
public class FileRepository : IFileRepository
{
    private readonly FileManagerDbContext _db;
    private readonly IDbConnection _dapper; // Inject raw SqlConnection for Dapper

    // EF Core for standard CRUD
    public async Task<FileEntity?> GetByIdAsync(Guid fileId, CancellationToken ct)
        => await _db.Files.FirstOrDefaultAsync(f => f.FileId == fileId && f.Status != "Deleted", ct);

    public async Task<FileEntity?> GetByObjectNameAsync(string objectName, CancellationToken ct)
        => await _db.Files.FirstOrDefaultAsync(f => f.ObjectName == objectName && f.Status != "Deleted", ct);

    // Dapper for perf-critical queries (stored procs)
    public async Task<FileEntity?> FindDuplicateAsync(string contentHash, Guid serviceId, CancellationToken ct)
    {
        return await _dapper.QueryFirstOrDefaultAsync<FileEntity>(
            "dbo.usp_FindDuplicateFile",
            new { ContentHash = contentHash, ServiceId = serviceId },
            commandType: CommandType.StoredProcedure);
    }

    public async Task<List<FileEntity>> GetStalePendingAsync(int staleMinutes, CancellationToken ct)
    {
        var result = await _dapper.QueryAsync<FileEntity>(
            "dbo.usp_GetStalePendingFiles",
            new { StaleMinutes = staleMinutes },
            commandType: CommandType.StoredProcedure);
        return result.ToList();
    }

    // Reference operations
    public async Task<int> GetActiveReferenceCountAsync(Guid fileId, CancellationToken ct)
    {
        var result = await _dapper.QuerySingleAsync<int>(
            "dbo.usp_GetActiveReferenceCount",
            new { FileId = fileId },
            commandType: CommandType.StoredProcedure);
        return result;
    }

    public async Task ReleaseReferenceAsync(Guid refId, DateTime createdAt, CancellationToken ct)
    {
        var entity = await _db.FileReferences
            .FirstOrDefaultAsync(r => r.RefId == refId && r.CreatedAt == createdAt, ct);
        if (entity != null)
        {
            entity.IsActive = false;
            entity.ReleasedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(ct);
        }
    }

    // Service lookups (cached in Phase 05 middleware)
    public async Task<ServiceEntity?> GetServiceByApiKeyAsync(string apiKey, CancellationToken ct)
        => await _db.Services.FirstOrDefaultAsync(s => s.ApiKey == apiKey && s.IsActive, ct);
}
```

### 4. MinioStorageProvider

**`Storage/MinioStorageProvider.cs`**
```csharp
public class MinioStorageProvider : IStorageProvider
{
    private readonly IMinioClient _client;
    private readonly ILogger<MinioStorageProvider> _logger;

    public MinioStorageProvider(IMinioClient client, ILogger<MinioStorageProvider> logger)
    {
        _client = client;
        _logger = logger;
    }

    public async Task EnsureBucketExistsAsync(string bucketName, CancellationToken ct)
    {
        var exists = await _client.BucketExistsAsync(
            new BucketExistsArgs().WithBucket(bucketName), ct);
        if (!exists)
        {
            await _client.MakeBucketAsync(
                new MakeBucketArgs().WithBucket(bucketName), ct);
            _logger.LogInformation("Created bucket: {Bucket}", bucketName);
        }
    }

    public async Task UploadAsync(string bucketName, string objectKey,
        Stream data, long size, string contentType, CancellationToken ct)
    {
        await _client.PutObjectAsync(new PutObjectArgs()
            .WithBucket(bucketName)
            .WithObject(objectKey)
            .WithStreamData(data)
            .WithObjectSize(size)
            .WithContentType(contentType), ct);
    }

    // <!-- Red Team: Download Streaming Fix — 2026-02-25 -->
    // CRITICAL: Never buffer entire file in MemoryStream (100MB = OOM)
    // Use callback to pipe directly to HTTP response stream
    public async Task DownloadAsync(string bucketName, string objectKey,
        Stream outputStream, CancellationToken ct)
    {
        await _client.GetObjectAsync(new GetObjectArgs()
            .WithBucket(bucketName)
            .WithObject(objectKey)
            .WithCallbackStream(async (stream, ct2) =>
                await stream.CopyToAsync(outputStream, ct2)), ct);
    }

    // Metadata-only stat (no download)
    public async Task<(long size, string contentType)> GetObjectInfoAsync(
        string bucketName, string objectKey, CancellationToken ct)
    {
        var stat = await _client.StatObjectAsync(new StatObjectArgs()
            .WithBucket(bucketName)
            .WithObject(objectKey), ct);
        return (stat.Size, stat.ContentType);
    }

    public async Task DeleteAsync(string bucketName, string objectKey, CancellationToken ct)
    {
        try
        {
            await _client.RemoveObjectAsync(new RemoveObjectArgs()
                .WithBucket(bucketName)
                .WithObject(objectKey), ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Delete failed (idempotent): {Bucket}/{Key}", bucketName, objectKey);
        }
    }

    public async Task<bool> ObjectExistsAsync(string bucketName, string objectKey, CancellationToken ct)
    {
        try
        {
            await _client.StatObjectAsync(new StatObjectArgs()
                .WithBucket(bucketName)
                .WithObject(objectKey), ct);
            return true;
        }
        catch { return false; }
    }

    public async IAsyncEnumerable<string> ListObjectsAsync(string bucketName,
        string? prefix, [EnumeratorCancellation] CancellationToken ct)
    {
        var observable = _client.ListObjectsAsync(new ListObjectsArgs()
            .WithBucket(bucketName)
            .WithPrefix(prefix ?? "")
            .WithRecursive(true), ct);

        await foreach (var item in observable.ToAsyncEnumerable().WithCancellation(ct))
            yield return item.Key;
    }
}
```

**Note for DownloadAsync:** For large files, use the streaming endpoint in the controller (Phase 05) that pipes MinIO stream directly to HTTP response — avoid loading into MemoryStream.

### 5. RedisService

**`Cache/RedisService.cs`**
```csharp
public class RedisService : IRedisService
{
    private readonly IConnectionMultiplexer _redis;
    private readonly ILogger<RedisService> _logger;

    public async Task<IAsyncDisposable?> AcquireLockAsync(
        string key, TimeSpan expiry, TimeSpan wait, CancellationToken ct)
    {
        var db = _redis.GetDatabase();
        var lockValue = Guid.NewGuid().ToString();
        var deadline = DateTime.UtcNow + wait;

        while (DateTime.UtcNow < deadline)
        {
            ct.ThrowIfCancellationRequested();
            if (await db.LockTakeAsync(key, lockValue, expiry))
                return new RedisLockHandle(db, key, lockValue, expiry);

            await Task.Delay(200, ct); // retry interval
        }

        _logger.LogWarning("Failed to acquire lock: {Key} within {Wait}s", key, wait.TotalSeconds);
        return null;
    }

    public async Task<bool> TryAcquireLeaderLockAsync(string key, TimeSpan expiry, CancellationToken ct)
    {
        var db = _redis.GetDatabase();
        return await db.LockTakeAsync(key, Environment.MachineName, expiry);
    }

    public async Task ReleaseLeaderLockAsync(string key, CancellationToken ct)
    {
        var db = _redis.GetDatabase();
        await db.LockReleaseAsync(key, Environment.MachineName);
    }

    // Inner disposable handle for auto-release
    private class RedisLockHandle : IAsyncDisposable
    {
        private readonly IDatabase _db;
        private readonly string _key, _value;
        private readonly Timer _renewTimer;

        // <!-- Red Team: Redis Lock Async Renewal — 2026-02-25 -->
        // Use PeriodicTimer with awaited async loop instead of fire-and-forget Timer
        private readonly CancellationTokenSource _renewCts = new();
        private readonly Task _renewTask;

        public RedisLockHandle(IDatabase db, string key, string value, TimeSpan expiry)
        {
            _db = db; _key = key; _value = value;
            _renewTask = RenewLoopAsync(expiry);
        }

        private async Task RenewLoopAsync(TimeSpan expiry)
        {
            using var timer = new PeriodicTimer(expiry / 3);
            while (await timer.WaitForNextTickAsync(_renewCts.Token))
            {
                var renewed = await _db.LockExtendAsync(_key, _value, expiry);
                if (!renewed) break; // lock lost, stop renewing
            }
        }

        public async ValueTask DisposeAsync()
        {
            _renewCts.Cancel();
            try { await _renewTask; } catch (OperationCanceledException) { }
            _renewCts.Dispose();
            await _db.LockReleaseAsync(_key, _value);
        }
    }
}
```

### 6. AuditService

**`Logging/AuditService.cs`**
```csharp
public class AuditService : IAuditService
{
    private readonly FileManagerDbContext _db;
    private readonly ILogger<AuditService> _logger;

    public async Task LogAsync(Guid correlationId, Guid serviceId, Guid? fileId,
        AuditAction action, string? details, int? durationMs, short? statusCode,
        CancellationToken ct)
    {
        var entry = new AuditLogEntity
        {
            CorrelationId = correlationId,
            ServiceId = serviceId,
            FileId = fileId,
            Action = action.ToString(),
            Details = details,
            DurationMs = durationMs,
            StatusCode = statusCode,
            CreatedAt = DateTime.UtcNow
        };
        _db.AuditLogs.Add(entry);
        await _db.SaveChangesAsync(ct);

        _logger.LogInformation(
            "{Action} | CorrId={CorrelationId} | Service={ServiceId} | File={FileId} | Duration={Duration}ms | Status={Status}",
            action, correlationId, serviceId, fileId, durationMs, statusCode);
    }
}
```

### 7. Polly Resilience Pipelines

**`Resilience/ResiliencePipelines.cs`**
```csharp
public static class ResiliencePipelines
{
    public static IServiceCollection AddResiliencePipelines(this IServiceCollection services)
    {
        services.AddResiliencePipeline("minio", builder =>
        {
            builder
                .AddRetry(new RetryStrategyOptions
                {
                    MaxRetryAttempts = 3,
                    Delay = TimeSpan.FromMilliseconds(500),
                    BackoffType = DelayBackoffType.Exponential,
                    ShouldHandle = new PredicateBuilder().Handle<Exception>()
                })
                .AddCircuitBreaker(new CircuitBreakerStrategyOptions
                {
                    FailureRatio = 0.5,
                    MinimumThroughput = 5,
                    SamplingDuration = TimeSpan.FromSeconds(30),
                    BreakDuration = TimeSpan.FromSeconds(30)
                });
        });

        services.AddResiliencePipeline("sql", builder =>
        {
            builder
                .AddRetry(new RetryStrategyOptions
                {
                    MaxRetryAttempts = 2,
                    Delay = TimeSpan.FromMilliseconds(200),
                    BackoffType = DelayBackoffType.Exponential,
                    ShouldHandle = new PredicateBuilder().Handle<SqlException>()
                });
        });

        return services;
    }
}
```

### 8. DI Registration

**`DependencyInjection.cs`**
```csharp
public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services, IConfiguration config)
    {
        // EF Core
        services.AddDbContext<FileManagerDbContext>(opts =>
            opts.UseSqlServer(config.GetConnectionString("SqlServer")));

        // Dapper connection
        services.AddScoped<IDbConnection>(_ =>
            new SqlConnection(config.GetConnectionString("SqlServer")));

        // MinIO (singleton)
        services.AddSingleton<IMinioClient>(_ =>
            new MinioClient()
                .WithEndpoint(config["MinIO:Endpoint"])
                .WithCredentials(config["MinIO:AccessKey"], config["MinIO:SecretKey"])
                .WithSSL(config.GetValue<bool>("MinIO:UseSSL"))
                .Build());

        // Redis
        services.AddSingleton<IConnectionMultiplexer>(_ =>
            ConnectionMultiplexer.Connect(config.GetConnectionString("Redis")!));

        // Repositories & Services
        services.AddScoped<IFileRepository, FileRepository>();
        services.AddScoped<IStorageProvider, MinioStorageProvider>();
        services.AddScoped<IRedisService, RedisService>();
        services.AddScoped<IAuditService, AuditService>();

        // Resilience
        services.AddResiliencePipelines();

        return services;
    }
}
```

## Todo List
- [ ] Create entity configurations (4 files)
- [ ] Create FileManagerDbContext
- [ ] Implement FileRepository (EF Core + Dapper)
- [ ] Implement MinioStorageProvider
- [ ] Implement RedisService (lock + auto-renew)
- [ ] Implement AuditService
- [ ] Configure Polly resilience pipelines
- [ ] Create DI registration extension
- [ ] Delete Class1.cs
- [ ] Verify `dotnet build` succeeds

## Success Criteria
- DbContext correctly maps all 4 entities with composite PKs
- MinioStorageProvider can upload/download/delete/list objects
- RedisService acquires and auto-renews locks
- AuditService persists to DB and logs to Serilog
- Polly pipelines configured for MinIO and SQL
- `dotnet build` succeeds

## Risk Assessment
| Risk | Mitigation |
|------|-----------|
| EF Core composite PK + partition mismatch | Entity config mirrors SQL scripts exactly |
| MinIO SDK breaking changes | Pin version 6.0.3 |
| Redis single point of failure | Graceful degradation (skip lock, log warning) |
| Dapper SQL injection in dynamic queries | Use stored procedures only |

## Security Considerations
- Connection strings from appsettings.json (env vars in prod)
- Redis connection optionally secured with password
- MinIO credentials in config, not hardcoded

## Next Steps
→ Phase 05: API Layer (controllers use these services via DI)
