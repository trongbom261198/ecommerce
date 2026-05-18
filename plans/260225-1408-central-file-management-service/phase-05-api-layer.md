---
phase: 5
title: "API Layer"
priority: High
status: Pending
effort: 4h
depends_on: [3, 4]
---

# Phase 05 — API Layer

## Context Links
- [Plan Overview](plan.md)
- [Brainstorm Report — REST API](../reports/brainstorm-260225-1018-central-file-management-service.md)
- [Phase 03 — Core Layer](phase-03-core-layer.md)
- [Phase 04 — Infrastructure Layer](phase-04-infrastructure-layer.md)

## Overview
Implement FIS.FileManager.Api: controllers for all endpoints, authentication/correlation middleware, Program.cs with full DI setup, health checks, and Swagger. This is the entry point that ties Core + Infrastructure together.

## Key Insights
- API Key auth via custom middleware (not ASP.NET Identity — overkill for service-to-service)
- CorrelationId middleware: use from header or generate new GUID
- IFormFile for uploads (ASP.NET handles multipart parsing)
- For streaming downloads, use FileStreamResult to avoid loading full file in memory
- Batch endpoints use POST with JSON body (GET has URL length limits)

## Requirements

### Functional
- FilesController: upload, download, stream, info, release, promote, batch-upload, batch-info
- LegacyController: by-name download, by-name release
- MigrationController: register existing files
- ApiKeyAuthMiddleware: validates X-Api-Key, injects ServiceId into HttpContext.Items
- CorrelationIdMiddleware: reads/generates X-Correlation-Id
- Health checks: `/health` (liveness), `/health/ready` (DB + MinIO + Redis)
- Swagger/OpenAPI

### Non-Functional
- Request size limit: 100MB
- Multipart form data for uploads
- JSON responses with consistent error format
- Async all the way

## Architecture

```
FIS.FileManager.Api/
├── Controllers/
│   ├── FilesController.cs       # All /api/files/* endpoints
│   ├── LegacyController.cs      # /api/files/by-name/* endpoints
│   └── MigrationController.cs   # /api/migration/* endpoints
├── Middleware/
│   ├── ApiKeyAuthMiddleware.cs
│   ├── CorrelationIdMiddleware.cs
│   └── GlobalExceptionMiddleware.cs
├── Extensions/
│   └── HttpContextExtensions.cs
├── HealthChecks/
│   └── MinioHealthCheck.cs
├── Program.cs
├── appsettings.json
└── appsettings.Development.json
```

## Related Code Files

### Files to Create
All files listed above (~10 files).

### Files to Modify
- `src/FIS.FileManager.Api/Program.cs` — replace placeholder with full setup

## Implementation Steps

### 1. HttpContext Extensions

**`Extensions/HttpContextExtensions.cs`**
```csharp
namespace FIS.FileManager.Api.Extensions;

public static class HttpContextExtensions
{
    private const string ServiceIdKey = "ServiceId";
    private const string ServiceNameKey = "ServiceName";
    private const string CorrelationIdKey = "CorrelationId";

    public static Guid GetServiceId(this HttpContext ctx)
        => (Guid)ctx.Items[ServiceIdKey]!;

    public static void SetServiceId(this HttpContext ctx, Guid id)
        => ctx.Items[ServiceIdKey] = id;

    public static string GetServiceName(this HttpContext ctx)
        => (string)ctx.Items[ServiceNameKey]!;

    public static void SetServiceName(this HttpContext ctx, string name)
        => ctx.Items[ServiceNameKey] = name;

    public static Guid GetCorrelationId(this HttpContext ctx)
        => (Guid)ctx.Items[CorrelationIdKey]!;

    public static void SetCorrelationId(this HttpContext ctx, Guid id)
        => ctx.Items[CorrelationIdKey] = id;
}
```

### 2. ApiKeyAuthMiddleware

```csharp
public class ApiKeyAuthMiddleware
{
    private readonly RequestDelegate _next;

    public async Task InvokeAsync(HttpContext context, IFileRepository repo)
    {
        // Skip health endpoints
        if (context.Request.Path.StartsWithSegments("/health"))
        {
            await _next(context);
            return;
        }

        if (!context.Request.Headers.TryGetValue("X-Api-Key", out var apiKey)
            || string.IsNullOrWhiteSpace(apiKey))
        {
            context.Response.StatusCode = 401;
            await context.Response.WriteAsJsonAsync(new ErrorResponse
            {
                Message = "Missing X-Api-Key header"
            });
            return;
        }

        // <!-- Red Team: API Key HMAC Hashing — 2026-02-25 -->
        // Client sends raw API key; middleware hashes with HMAC-SHA256 + per-service salt
        // Stored format: {salt}:{hmac_hash}
        var service = await repo.GetServiceByHashedApiKeyAsync(apiKey!, context.RequestAborted);
        if (service == null)
        {
            context.Response.StatusCode = 401;
            await context.Response.WriteAsJsonAsync(new ErrorResponse
            {
                Message = "Invalid API key"
            });
            return;
        }

        context.SetServiceId(service.ServiceId);
        context.SetServiceName(service.ServiceName);
        await _next(context);
    }
}
```

### 3. CorrelationIdMiddleware

```csharp
public class CorrelationIdMiddleware
{
    private readonly RequestDelegate _next;

    public async Task InvokeAsync(HttpContext context)
    {
        Guid correlationId;
        if (context.Request.Headers.TryGetValue("X-Correlation-Id", out var header)
            && Guid.TryParse(header, out var parsed))
        {
            correlationId = parsed;
        }
        else
        {
            correlationId = Guid.NewGuid();
        }

        context.SetCorrelationId(correlationId);
        context.Response.Headers["X-Correlation-Id"] = correlationId.ToString();
        await _next(context);
    }
}
```

### 4. GlobalExceptionMiddleware

```csharp
public class GlobalExceptionMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<GlobalExceptionMiddleware> _logger;

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (FileNotFoundException ex)
        {
            context.Response.StatusCode = 404;
            await context.Response.WriteAsJsonAsync(new ErrorResponse { Message = ex.Message });
        }
        catch (TimeoutException ex)
        {
            _logger.LogWarning(ex, "Lock timeout");
            context.Response.StatusCode = 503;
            await context.Response.WriteAsJsonAsync(new ErrorResponse
            {
                Message = "Service temporarily unavailable. Retry later."
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception");
            context.Response.StatusCode = 500;
            await context.Response.WriteAsJsonAsync(new ErrorResponse
            {
                Message = "Internal server error",
                Detail = context.RequestServices.GetRequiredService<IHostEnvironment>().IsDevelopment()
                    ? ex.ToString() : null
            });
        }
    }
}
```

### 5. FilesController

```csharp
[ApiController]
[Route("api/files")]
public class FilesController : ControllerBase
{
    private readonly FileService _fileService;

    // POST /api/files/upload
    [HttpPost("upload")]
    [RequestSizeLimit(104_857_600)] // 100MB
    public async Task<IActionResult> Upload(IFormFile file, [FromForm] UploadFileRequest request, CancellationToken ct)
    {
        if (file == null || file.Length == 0)
            return BadRequest(new ErrorResponse { Message = "No file provided" });

        request.OriginalFileName ??= file.FileName;
        var serviceId = HttpContext.GetServiceId();
        var correlationId = HttpContext.GetCorrelationId();

        await using var stream = file.OpenReadStream();
        var result = await _fileService.UploadAsync(stream, request, serviceId, correlationId, ct);
        return Ok(result);
    }

    // <!-- Red Team: Download Streaming + Authorization — 2026-02-25 -->
    // Stream MinIO directly to HTTP response (never buffer in MemoryStream)
    // Authorization: verify file belongs to calling service
    // GET /api/files/{fileId}
    [HttpGet("{fileId:guid}")]
    public async Task<IActionResult> Download(Guid fileId, CancellationToken ct)
    {
        var serviceId = HttpContext.GetServiceId();
        var correlationId = HttpContext.GetCorrelationId();
        // Service-scoped check: file must belong to calling service
        var (contentType, fileName, bucketName, objectKey) =
            await _fileService.GetDownloadInfoAsync(fileId, serviceId, correlationId, ct);

        Response.Headers["Content-Disposition"] = $"attachment; filename=\"{fileName}\"";
        Response.ContentType = contentType;
        // Pipe MinIO stream directly to response
        await _fileService.StreamToOutputAsync(bucketName, objectKey, Response.Body, ct);
        return new EmptyResult();
    }

    // GET /api/files/{fileId}/stream (with range support)
    [HttpGet("{fileId:guid}/stream")]
    public async Task<IActionResult> StreamDownload(Guid fileId, CancellationToken ct)
    {
        // Same as Download but with EnableRangeProcessing
        return await Download(fileId, ct); // reuse — both stream now
    }

    // GET /api/files/{fileId}/info
    [HttpGet("{fileId:guid}/info")]
    public async Task<IActionResult> GetInfo(Guid fileId, CancellationToken ct)
    {
        var result = await _fileService.GetInfoAsync(fileId, HttpContext.GetCorrelationId(), ct);
        return result != null ? Ok(result) : NotFound();
    }

    // POST /api/files/{fileId}/release
    [HttpPost("{fileId:guid}/release")]
    public async Task<IActionResult> Release(Guid fileId, CancellationToken ct)
    {
        var result = await _fileService.ReleaseAsync(fileId,
            HttpContext.GetServiceId(), HttpContext.GetCorrelationId(), ct);
        return Ok(result);
    }

    // POST /api/files/{fileId}/promote
    [HttpPost("{fileId:guid}/promote")]
    public async Task<IActionResult> Promote(Guid fileId, CancellationToken ct)
    {
        var result = await _fileService.PromoteAsync(fileId,
            HttpContext.GetServiceId(), HttpContext.GetCorrelationId(), ct);
        return Ok(result);
    }

    // POST /api/files/batch-upload
    [HttpPost("batch-upload")]
    [RequestSizeLimit(524_288_000)] // 500MB total for batch
    public async Task<IActionResult> BatchUpload(
        List<IFormFile> files, [FromForm] string? tags, CancellationToken ct)
    {
        var results = new List<UploadFileResponse>();
        var serviceId = HttpContext.GetServiceId();
        var correlationId = HttpContext.GetCorrelationId();

        foreach (var file in files)
        {
            await using var stream = file.OpenReadStream();
            var request = new UploadFileRequest
            {
                OriginalFileName = file.FileName,
                Tags = tags
            };
            results.Add(await _fileService.UploadAsync(stream, request, serviceId, correlationId, ct));
        }
        return Ok(results);
    }

    // POST /api/files/batch-info
    [HttpPost("batch-info")]
    public async Task<IActionResult> BatchInfo([FromBody] BatchInfoRequest request, CancellationToken ct)
    {
        var results = await _fileService.GetBatchInfoAsync(request.FileIds, HttpContext.GetCorrelationId(), ct);
        return Ok(results);
    }
}
```

### 6. LegacyController

```csharp
[ApiController]
[Route("api/files/by-name")]
public class LegacyController : ControllerBase
{
    private readonly FileService _fileService;

    // GET /api/files/by-name?name={objectName}
    [HttpGet]
    public async Task<IActionResult> DownloadByName([FromQuery] string name, CancellationToken ct)
    {
        var (stream, contentType, fileName) = await _fileService.DownloadByNameAsync(name,
            HttpContext.GetServiceId(), HttpContext.GetCorrelationId(), ct);
        return File(stream, contentType, fileName);
    }

    // POST /api/files/by-name/release?name={objectName}
    [HttpPost("release")]
    public async Task<IActionResult> ReleaseByName([FromQuery] string name, CancellationToken ct)
    {
        var result = await _fileService.ReleaseByNameAsync(name,
            HttpContext.GetServiceId(), HttpContext.GetCorrelationId(), ct);
        return Ok(result);
    }
}
```

### 7. MigrationController

```csharp
[ApiController]
[Route("api/migration")]
public class MigrationController : ControllerBase
{
    private readonly FileService _fileService;

    // <!-- Red Team: Migration Endpoint Authorization — 2026-02-25 -->
    // Use authenticated ServiceId from context, not from request body
    // Verify MinIO object exists in the service's own bucket
    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterMigrationRequest request, CancellationToken ct)
    {
        var serviceId = HttpContext.GetServiceId();
        var result = await _fileService.RegisterExistingFileAsync(request, serviceId,
            HttpContext.GetCorrelationId(), ct);
        return Ok(result);
    }
}
```

### 8. MinIO Health Check

```csharp
public class MinioHealthCheck : IHealthCheck
{
    private readonly IMinioClient _client;

    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context, CancellationToken ct)
    {
        try
        {
            // List buckets as health probe
            await _client.ListBucketsAsync(ct);
            return HealthCheckResult.Healthy();
        }
        catch (Exception ex)
        {
            return HealthCheckResult.Unhealthy("MinIO unreachable", ex);
        }
    }
}
```

### 9. Program.cs

```csharp
using Serilog;
using FIS.FileManager.Core;
using FIS.FileManager.Infrastructure;
using FIS.FileManager.Api.Middleware;
using FIS.FileManager.Api.HealthChecks;

var builder = WebApplication.CreateBuilder(args);

// Serilog
builder.Host.UseSerilog((ctx, cfg) => cfg.ReadFrom.Configuration(ctx.Configuration));

// Services
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new() { Title = "FIS File Manager API", Version = "v1" });
    c.AddSecurityDefinition("ApiKey", new()
    {
        In = ParameterLocation.Header,
        Name = "X-Api-Key",
        Type = SecuritySchemeType.ApiKey
    });
});

// Core + Infrastructure DI
builder.Services.AddCoreServices();
builder.Services.AddInfrastructure(builder.Configuration);

// Health checks
builder.Services.AddHealthChecks()
    .AddSqlServer(builder.Configuration.GetConnectionString("SqlServer")!)
    .AddRedis(builder.Configuration.GetConnectionString("Redis")!)
    .AddCheck<MinioHealthCheck>("minio");

// Request size limit
builder.WebHost.ConfigureKestrel(opts =>
    opts.Limits.MaxRequestBodySize = 104_857_600); // 100MB

var app = builder.Build();

// Middleware pipeline (order matters)
app.UseMiddleware<GlobalExceptionMiddleware>();
app.UseMiddleware<CorrelationIdMiddleware>();
app.UseMiddleware<ApiKeyAuthMiddleware>();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.MapControllers();
app.MapHealthChecks("/health", new() { Predicate = _ => false }); // liveness
app.MapHealthChecks("/health/ready"); // readiness (all checks)

app.Run();
```

## Todo List
- [ ] Create HttpContextExtensions
- [ ] Implement ApiKeyAuthMiddleware
- [ ] Implement CorrelationIdMiddleware
- [ ] Implement GlobalExceptionMiddleware
- [ ] Implement FilesController (8 endpoints)
- [ ] Implement LegacyController (2 endpoints)
- [ ] Implement MigrationController (1 endpoint)
- [ ] Implement MinioHealthCheck
- [ ] Write complete Program.cs with DI + middleware + health checks
- [ ] Configure Swagger with API key auth
- [ ] Verify `dotnet build` succeeds
- [ ] Test with `dotnet run` — Swagger accessible at /swagger

## Success Criteria
- All 11 endpoints implemented and reachable
- API Key auth blocks requests without valid key
- CorrelationId flows through request/response headers
- Health endpoints respond: `/health` (liveness) and `/health/ready` (readiness)
- Swagger UI accessible in Development mode
- 100MB upload limit enforced

## Risk Assessment
| Risk | Mitigation |
|------|-----------|
| Large upload timeout | Kestrel body size + request timeout config |
| Middleware order wrong | Exception > Correlation > Auth (strictly ordered) |
| Swagger in production | Only enabled in Development environment |

## Security Considerations
- API Key validated on every request (except /health)
- No anonymous access
- Error details hidden in production (GlobalExceptionMiddleware)
- Request size limit prevents abuse
- HTTPS enforced in production (Kestrel or IIS)

## Next Steps
→ Phase 06: Background Services (CleanupWorker registered in Program.cs)
→ Phase 07: Docker Deployment (containerize the API)
