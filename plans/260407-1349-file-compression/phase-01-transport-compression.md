# Phase 1: Transport Compression

## Context Links
- [ASP.NET Compression Research](../reports/researcher-260407-1354-aspnet-compression-strategies.md)
- [Program.cs](../../src/FIS.FileManager.Api/Program.cs) — middleware pipeline
- [appsettings.json](../../src/FIS.FileManager.Api/appsettings.json)

## Overview
- **Priority:** High
- **Status:** Pending
- **Effort:** 2h
- **Description:** Add ASP.NET Core Response Compression (gzip + brotli) for downloads and Request Decompression for uploads. Transport-layer only — no storage changes.

## Key Insights
- Response Compression is chunk-based and safe for streaming downloads
- Brotli is 38% faster with 3% better ratio than GZip for transport
- `EnableForHttps = false` initially to avoid BREACH risk (safe for file downloads but conservative default)
- Request Decompression is native in .NET 7+; transparently handles gzip/brotli/deflate request bodies
- Must place `UseResponseCompression()` BEFORE `UseCors()` — ASP.NET Core requires it early in pipeline
- Must place `UseRequestDecompression()` BEFORE controllers read the body

## Requirements

### Functional
- F1: HTTP responses with `Accept-Encoding: gzip` or `br` get compressed on the wire
- F2: HTTP requests with `Content-Encoding: gzip`, `br`, or `deflate` get transparently decompressed
- F3: File downloads (GET /api/files/{id}) benefit from response compression
- F4: Compression only applies when client sends Accept-Encoding header

### Non-Functional
- NF1: No change to existing API contracts or response schemas
- NF2: No change to storage layer — transport only
- NF3: Configurable compression level via appsettings

## Architecture

```
Client
  |  Content-Encoding: gzip (upload)
  v
[UseRequestDecompression]  -- decompresses request body transparently
  |
  v
[UseResponseCompression]   -- compresses response body if Accept-Encoding present
  |
  v
[UseCors]
[GlobalExceptionMiddleware]
[CorrelationIdMiddleware]
[ApiKeyAuthMiddleware]
  |
  v
[FilesController]  -- reads decompressed stream, writes raw response
  |
  v
Response flows back through ResponseCompression → client gets compressed body
```

## Related Code Files

### Files to Modify
| File | Change |
|------|--------|
| `src/FIS.FileManager.Api/Program.cs` | Add service registration + middleware |

### Files NOT Modified
- Controllers, services, repositories — no changes needed
- Transport compression is transparent to application code

## Implementation Steps

### Step 1: Add NuGet package (if needed)
`Microsoft.AspNetCore.ResponseCompression` is included in the ASP.NET Core shared framework for .NET 8 — no additional NuGet needed.

### Step 2: Update Program.cs — Service Registration
Add after the `AddCors()` block (around line 29), before `AddControllers()`:

```csharp
// Transport compression: Brotli + GZip for responses, decompression for requests
builder.Services.AddResponseCompression(opts =>
{
    opts.EnableForHttps = false; // BREACH mitigation — enable later if needed
    opts.Providers.Add<Microsoft.AspNetCore.ResponseCompression.BrotliCompressionProvider>();
    opts.Providers.Add<Microsoft.AspNetCore.ResponseCompression.GzipCompressionProvider>();
    opts.MimeTypes = Microsoft.AspNetCore.ResponseCompression.ResponseCompressionDefaults
        .MimeTypes.Concat(new[]
        {
            "application/pdf",
            "application/json",
            "application/xml",
            "text/csv",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        });
});
builder.Services.Configure<Microsoft.AspNetCore.ResponseCompression.BrotliCompressionProviderOptions>(opts =>
    opts.Level = System.IO.Compression.CompressionLevel.Fastest);
builder.Services.Configure<Microsoft.AspNetCore.ResponseCompression.GzipCompressionProviderOptions>(opts =>
    opts.Level = System.IO.Compression.CompressionLevel.Fastest);

builder.Services.AddRequestDecompression(opts =>
    opts.SizeLimit = 104_857_600); // Match Kestrel MaxRequestBodySize to prevent decompression bombs
```

### Step 3: Update Program.cs — Middleware Pipeline
Add BEFORE `app.UseCors()` (line 76). Order matters:

```csharp
// Transport compression (must be before other middleware that reads/writes body)
app.UseRequestDecompression();
app.UseResponseCompression();

// Existing pipeline
app.UseCors();
app.UseMiddleware<GlobalExceptionMiddleware>();
// ... rest unchanged
```

### Step 4: Configuration (deferred)
Transport compression config is handled by Phase 3's `Compression` section in appsettings.json. No separate config for Phase 1 — transport compression is always active once middleware is registered (controlled by client's Accept-Encoding header). If a kill switch is needed, remove the middleware registration.

### Step 5: Verify compilation
```bash
dotnet build src/FIS.FileManager.Api
```

## Todo List

- [ ] Add ResponseCompression service registration to Program.cs
- [ ] Add RequestDecompression service registration to Program.cs
- [ ] Add UseResponseCompression() + UseRequestDecompression() to middleware pipeline (before UseCors)
- [ ] Verify build succeeds
- [ ] Manual test: curl with Accept-Encoding: gzip header, verify Content-Encoding in response

## Success Criteria

1. `dotnet build` succeeds with zero warnings related to compression
2. Download endpoint returns `Content-Encoding: gzip` or `br` when client sends `Accept-Encoding`
3. Upload endpoint accepts `Content-Encoding: gzip` request body and processes correctly
4. Existing tests pass without modification (compression is transparent)
5. No change to response JSON schema

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| BREACH attack via HTTPS compression | Low | Medium | `EnableForHttps = false` default; file content is not secret HTML |
| Middleware order wrong → compression not applied | Medium | Low | Explicit ordering in comments; integration test verifies Content-Encoding header |
| Response Compression interferes with streaming download | Low | Medium | ASP.NET Core ResponseCompression is chunk-based; tested with streaming endpoints |
| Large file compression causes timeout | Low | Medium | CompressionLevel.Fastest; client can omit Accept-Encoding to skip |

## Security Considerations
- BREACH mitigation: `EnableForHttps = false` by default
- No new attack surface — ASP.NET Core built-in middleware
- Request decompression configured with explicit SizeLimit (104MB) matching Kestrel MaxRequestBodySize to prevent decompression bombs
- Kestrel MaxRequestBodySize only limits wire bytes, NOT decompressed size — SizeLimit is critical

## Next Steps
- Phase 2 (DB Schema) can run in parallel
- Phase 3 depends on Phase 2 but NOT on Phase 1 — transport and storage compression are independent
