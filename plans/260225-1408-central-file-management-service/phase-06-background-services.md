---
phase: 6
title: "Background Services"
priority: Medium
status: Pending
effort: 3h
depends_on: [4, 5]
---

# Phase 06 — Background Services

## Context Links
- [Plan Overview](plan.md)
- [Brainstorm Report — Cleanup Worker](../reports/brainstorm-260225-1018-central-file-management-service.md)
- [Phase 04 — Infrastructure Layer](phase-04-infrastructure-layer.md)

## Overview
Implement CleanupWorker as a .NET BackgroundService with PeriodicTimer. Runs 4 cleanup tasks hourly. Uses Redis distributed lock for leader election (multi-instance safe). CleanupService (Core) contains business logic; CleanupWorker (Api) handles scheduling.

## Key Insights
- PeriodicTimer (not `Task.Delay`) for accurate intervals without drift
- Redis lock for leader election: only 1 instance runs cleanup at a time
- Each cleanup task is independent — partial failure doesn't block others
- MinIO orphan scan is expensive — run weekly, not hourly
- All deletes are idempotent (safe to retry)
<!-- Red Team: Partition Maintenance Automation — 2026-02-25 -->
- **Add partition maintenance task** to CleanupWorker (monthly auto-extend partitions)

## Requirements

### Functional
- 4 cleanup tasks:
  1. Stale Pending (every run): files stuck in Pending > 15 min
  2. Expired Temp (every run): temp files past ExpiresAt
  3. Orphan Files (every run): confirmed files with 0 active refs + 7-day grace
  4. MinIO Orphan Scan (weekly): objects in MinIO not in DB + 30-day grace
- Redis leader lock prevents concurrent runs across instances
- Each task logs count of cleaned items to audit

### Non-Functional
- Graceful shutdown via CancellationToken
- Configurable intervals from appsettings.json
- Error in one task doesn't prevent others from running

## Architecture

```
FIS.FileManager.Api/
└── BackgroundServices/
    └── CleanupWorker.cs    ← schedules + leader election

FIS.FileManager.Core/
└── Services/
    └── CleanupService.cs   ← business logic (already in Phase 03)
```

### Task Execution Flow
```
CleanupWorker (hourly tick)
  → Try acquire Redis leader lock (TTL = interval + buffer)
  → If acquired:
      1. CleanStalePendingAsync()
      2. CleanExpiredTempAsync()
      3. CleanOrphanFilesAsync()
      4. IF weekly day: ScanMinioOrphansAsync()
  → Release lock
  → Log summary
  → If NOT acquired: skip (another instance is leader)
```

## Related Code Files

### Files to Create
- `src/FIS.FileManager.Api/BackgroundServices/CleanupWorker.cs`

### Files to Modify
- `src/FIS.FileManager.Api/Program.cs` — register `AddHostedService<CleanupWorker>()`
- `src/FIS.FileManager.Api/appsettings.json` — add CleanupWorker config section

## Implementation Steps

### 1. Add config section to appsettings.json

```json
{
  "CleanupWorker": {
    "IntervalMinutes": 60,
    "StalePendingMinutes": 15,
    "OrphanGraceDays": 7,
    "MinioOrphanGraceDays": 30,
    "MinioOrphanScanDayOfWeek": "Sunday",
    "LeaderLockKey": "cleanup:leader",
    "LeaderLockTtlMinutes": 70
  }
}
```

### 2. CleanupWorker Implementation

```csharp
namespace FIS.FileManager.Api.BackgroundServices;

public class CleanupWorker : BackgroundService
{
    private readonly IServiceProvider _services;
    private readonly IRedisService _redis;
    private readonly ILogger<CleanupWorker> _logger;
    private readonly IConfiguration _config;

    public CleanupWorker(
        IServiceProvider services,
        IRedisService redis,
        ILogger<CleanupWorker> logger,
        IConfiguration config)
    {
        _services = services;
        _redis = redis;
        _logger = logger;
        _config = config;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var intervalMinutes = _config.GetValue("CleanupWorker:IntervalMinutes", 60);
        var leaderLockKey = _config.GetValue("CleanupWorker:LeaderLockKey", "cleanup:leader")!;
        var leaderTtl = TimeSpan.FromMinutes(
            _config.GetValue("CleanupWorker:LeaderLockTtlMinutes", 70));

        _logger.LogInformation("CleanupWorker starting. Interval: {Interval}min", intervalMinutes);

        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(intervalMinutes));

        // Initial delay (30s) to let app fully start
        await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);

        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                // Leader election via Redis lock
                var isLeader = await _redis.TryAcquireLeaderLockAsync(
                    leaderLockKey, leaderTtl, stoppingToken);

                if (!isLeader)
                {
                    _logger.LogDebug("CleanupWorker: another instance is leader, skipping");
                    continue;
                }

                try
                {
                    await RunCleanupTasksAsync(stoppingToken);
                }
                finally
                {
                    await _redis.ReleaseLeaderLockAsync(leaderLockKey, stoppingToken);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break; // graceful shutdown
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "CleanupWorker: unhandled error in tick");
            }
        }

        _logger.LogInformation("CleanupWorker stopped");
    }

    private async Task RunCleanupTasksAsync(CancellationToken ct)
    {
        using var scope = _services.CreateScope();
        var cleanup = scope.ServiceProvider.GetRequiredService<CleanupService>();
        var sw = System.Diagnostics.Stopwatch.StartNew();

        // Task 1: Stale Pending
        var staleCleaned = await SafeRunAsync(
            () => cleanup.CleanStalePendingAsync(ct), "StalePending", ct);

        // Task 2: Expired Temp
        var tempCleaned = await SafeRunAsync(
            () => cleanup.CleanExpiredTempAsync(ct), "ExpiredTemp", ct);

        // Task 3: Orphan Files
        var orphanCleaned = await SafeRunAsync(
            () => cleanup.CleanOrphanFilesAsync(ct), "OrphanFiles", ct);

        // <!-- Red Team: Partition Maintenance — 2026-02-25 -->
        // Task 4: Partition Maintenance (monthly — 1st of month)
        if (DateTime.UtcNow.Day == 1)
        {
            await SafeRunAsync(
                () => cleanup.ExtendPartitionsAsync(ct), "PartitionExtend", ct);
        }

        // Task 5: MinIO Orphan Scan (weekly)
        var minioOrphans = 0;
        var scanDay = _config.GetValue("CleanupWorker:MinioOrphanScanDayOfWeek", "Sunday");
        if (DateTime.UtcNow.DayOfWeek.ToString() == scanDay)
        {
            minioOrphans = await SafeRunAsync(
                () => cleanup.ScanMinioOrphansAsync(ct), "MinioOrphanScan", ct);
        }

        _logger.LogInformation(
            "Cleanup complete in {Duration}ms | StalePending={Stale} ExpiredTemp={Temp} Orphans={Orphan} MinioOrphans={Minio}",
            sw.ElapsedMilliseconds, staleCleaned, tempCleaned, orphanCleaned, minioOrphans);
    }

    private async Task<int> SafeRunAsync(
        Func<Task<int>> task, string taskName, CancellationToken ct)
    {
        try
        {
            var count = await task();
            if (count > 0)
                _logger.LogInformation("Cleanup {Task}: cleaned {Count} items", taskName, count);
            return count;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Cleanup {Task} failed", taskName);
            return 0;
        }
    }
}
```

### 3. Register in Program.cs

Add before `var app = builder.Build();`:
```csharp
builder.Services.AddHostedService<CleanupWorker>();
```

### 4. Complete CleanupService Implementation (Core)

Expand the CleanupService from Phase 03 with full logic:

```csharp
public class CleanupService
{
    private readonly IFileRepository _repo;
    private readonly IStorageProvider _storage;
    private readonly IAuditService _audit;
    private readonly IConfiguration _config;

    public async Task<int> CleanStalePendingAsync(CancellationToken ct)
    {
        var staleMinutes = _config.GetValue("CleanupWorker:StalePendingMinutes", 15);
        var staleFiles = await _repo.GetStalePendingAsync(staleMinutes, ct);
        var cleaned = 0;

        foreach (var file in staleFiles)
        {
            // MinIO delete is idempotent — safe even if object doesn't exist
            await _storage.DeleteAsync(file.BucketName, file.GetFullObjectKey(), ct);
            await _repo.DeleteAsync(file.FileId, file.CreatedAt, ct);
            await _audit.LogAsync(Guid.Empty, file.CreatedByServiceId, file.FileId,
                AuditAction.Cleanup, "stale_pending", null, null, ct);
            cleaned++;
        }
        return cleaned;
    }

    public async Task<int> CleanExpiredTempAsync(CancellationToken ct)
    {
        var expired = await _repo.GetExpiredTempAsync(ct);
        var cleaned = 0;

        foreach (var file in expired)
        {
            await _storage.DeleteAsync(file.BucketName, file.GetFullObjectKey(), ct);
            await _repo.UpdateStatusAsync(file.FileId, file.CreatedAt, "Deleted", ct);
            await _audit.LogAsync(Guid.Empty, file.CreatedByServiceId, file.FileId,
                AuditAction.Cleanup, "expired_temp", null, null, ct);
            cleaned++;
        }
        return cleaned;
    }

    public async Task<int> CleanOrphanFilesAsync(CancellationToken ct)
    {
        var graceDays = _config.GetValue("CleanupWorker:OrphanGraceDays", 7);
        var orphans = await _repo.GetOrphanFilesAsync(graceDays, ct);
        var cleaned = 0;

        foreach (var file in orphans)
        {
            await _storage.DeleteAsync(file.BucketName, file.GetFullObjectKey(), ct);
            await _repo.UpdateStatusAsync(file.FileId, file.CreatedAt, "Deleted", ct);
            await _audit.LogAsync(Guid.Empty, file.CreatedByServiceId, file.FileId,
                AuditAction.Cleanup, "orphan_no_refs", null, null, ct);
            cleaned++;
        }
        return cleaned;
    }

    public async Task<int> ScanMinioOrphansAsync(CancellationToken ct)
    {
        // List all buckets, scan each for objects not in DB
        // Only delete if object is older than 30 days
        // This is expensive — only run weekly
        var graceDays = _config.GetValue("CleanupWorker:MinioOrphanGraceDays", 30);
        var cleaned = 0;
        // Implementation: iterate MinIO objects, check against DB, delete orphans
        // (Full implementation in code, pseudocode here for brevity)
        return cleaned;
    }
}
```

## Todo List
- [ ] Add CleanupWorker config section to appsettings.json
- [ ] Implement CleanupWorker (BackgroundService + PeriodicTimer + Redis leader lock)
- [ ] Complete CleanupService implementation (4 cleanup methods)
- [ ] Register `AddHostedService<CleanupWorker>()` in Program.cs
- [ ] Test graceful shutdown (CancellationToken propagation)
- [ ] Verify cleanup tasks run independently (one failure doesn't block others)

## Success Criteria
- CleanupWorker starts with application
- Only 1 instance runs cleanup (Redis leader lock)
- Stale pending files (>15 min) cleaned
- Expired temp files cleaned
- Orphan files (0 refs + 7-day grace) cleaned
- MinIO orphan scan runs weekly
- Audit logs record all cleanup operations
- Graceful shutdown works (no orphan locks)

## Risk Assessment
| Risk | Mitigation |
|------|-----------|
| Redis unavailable → no cleanup runs | Log warning, retry next tick. Cleanup is non-critical. |
| Cleanup deletes actively uploading file | 15-min stale threshold >> max upload time (~2 min for 100MB) |
| MinIO scan timeout on large buckets | Paginated listing, configurable timeout |
| Leader lock stuck (process crash) | TTL-based auto-expiry (70 min > interval 60 min) |

## Security Considerations
- Cleanup worker uses same DB/MinIO credentials as API
- Audit trail for all deletions (recovery possible within grace period)
- No external access — runs internally only

## Next Steps
→ Phase 07: Docker Deployment (compose includes Redis for cleanup worker)
