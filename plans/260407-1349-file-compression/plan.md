---
title: "File Compression Support"
description: "Transport + storage compression with per-service policies and analytics"
status: pending
priority: P2
effort: 18h
branch: feat/file-compression
tags: [compression, gzip, brotli, performance, storage-optimization]
created: 2026-04-07
---

# File Compression Support

Adds transport compression (response/request), storage compression (MinIO), per-service compression policies, and compression analytics to FIS File Manager.

## Architecture

```
Client Request (gzip/brotli body)
  |
  v
[Request Decompression Middleware]  <-- Phase 1
  |
  v
[FilesController] --> FileService --> CompressionService (new)  <-- Phase 3
  |                                    |
  |                              [Compress if MIME compressible]
  |                              [Hash RAW bytes, compress AFTER]
  |                                    |
  v                                    v
[Response Compression Middleware]    MinIO (stores .gz or raw)  <-- Phase 3
  |                                    |
  v                                    v
Client Response (gzip/brotli)      DB: Files.IsCompressed,
                                       Files.CompressedSize,
                                       Files.CompressionAlgorithm  <-- Phase 2
```

## Data Flow: Upload with Compression

```
Input Stream
  --> DeduplicationService.BufferAndHashAsync()  [hash RAW bytes - unchanged]
  --> CompressionService.ShouldCompress(mimeType, servicePolicy)
  --> if compressible: CompressionService.CompressStreamAsync(buffered)
      --> GZipStream wrapping, return (compressedStream, compressedSize)
  --> MinIO.Upload(compressedStream OR rawStream)
  --> DB: FileEntity { IsCompressed, CompressedSize, CompressionAlgorithm }
```

## Data Flow: Download with Decompression

```
MinIO.Download(objectKey) --> stream
  --> if file.IsCompressed: GZipStream(decompress) wrapping
  --> Response.Body (optionally further compressed by Response Compression middleware)
```

## Phases

| # | Phase | Priority | Effort | Status | File |
|---|-------|----------|--------|--------|------|
| 1 | Transport Compression | High | 2h | Pending | [phase-01](phase-01-transport-compression.md) |
| 2 | Database Schema Changes | High | 2h | Pending | [phase-02-database-schema-changes.md](phase-02-database-schema-changes.md) |
| 3 | Storage Compression Core | High | 5h | Pending | [phase-03](phase-03-storage-compression-core.md) |
| 4 | Per-Service Compression Policies | Medium | 3h | Pending | [phase-04](phase-04-per-service-compression-policies.md) |
| 5 | Compression Analytics | Low | 3h | Pending | [phase-05](phase-05-compression-analytics.md) |
| 6 | Testing | High | 3h | Pending | [phase-06](phase-06-testing.md) |

## Dependencies

```
Phase 1 (Transport)  ----+
                          |
Phase 2 (DB Schema) --+  |
                       |  |
                       v  |
Phase 3 (Storage) ----+--+
       |               |
       v               v
Phase 4 (Policies)  Phase 5 (Analytics)
       |               |
       +-------+-------+
               |
               v
         Phase 6 (Testing)
```

- Phase 1: Independent (middleware only, no DB changes)
- Phase 2: Independent (schema only)
- Phase 3: Blocked by Phase 2 (needs new columns)
- Phase 4: Blocked by Phase 2 + 3 (needs schema + CompressionService)
- Phase 5: Blocked by Phase 3 (needs compression metadata in DB)
- Phase 6: Blocked by all previous phases

## Key Decisions

1. **Hash before compress**: SHA-256 on raw bytes, then compress. Preserves dedup across compressed/uncompressed.
2. **GZip for storage** (not Brotli): GZip has native .NET streaming support, better for storage (decompression speed matters more). Brotli for transport only.
3. **Skip pre-compressed types**: JPEG, PNG, GIF, MP4, ZIP, GZ, RAR get no storage compression. Waste of CPU for <5% gain.
4. **Graceful degradation**: Compression failure = store uncompressed. Never fail an upload due to compression.
5. **Backward compatible**: Existing files have IsCompressed=false (default). No migration of existing data needed.
6. **Streaming compression**: Never buffer entire file to compress. Use streaming GZipStream piped through.

## Rollback Strategy

| Phase | Rollback |
|-------|----------|
| 1 | Remove middleware registration from Program.cs. Zero data impact. |
| 2 | ALTER TABLE DROP COLUMN. Existing data unaffected (new columns have defaults). |
| 3 | Set `Compression:Enabled=false` in config. New uploads store raw. Existing compressed files still readable (CompressionService.DecompressStreamAsync still works). |
| 4 | Remove policy columns from Services table. Falls back to global config. |
| 5 | Remove analytics endpoint. No data loss. |
| 6 | Tests only, no rollback needed. |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Compression corrupts file | Low | Critical | Hash raw bytes before compress; verify on download |
| CPU overhead on upload | Medium | Medium | Skip incompressible types; use CompressionLevel.Fastest |
| Memory pressure from compression buffers | Medium | Medium | Streaming compression, never buffer entire file |
| Breaking change in download for existing clients | Low | High | Response Compression is opt-in (Accept-Encoding header); storage decompression is transparent |
| Existing stored procs break from new columns | Low | Medium | New columns have defaults; SPs select explicit columns, not SELECT * |

## File Ownership Matrix

| File | Phase | Action |
|------|-------|--------|
| Program.cs | 1 | Modify (add middleware) |
| appsettings.json | 1, 3 | Modify (add config sections) |
| FileEntity.cs | 2 | Modify (add 3 properties) |
| FileEntityConfiguration.cs | 2 | Modify (add column mappings) |
| ServiceEntity.cs | 4 | Modify (add policy properties) |
| ServiceEntityConfiguration.cs | 4 | Modify (add column mappings) |
| scripts/pre-deployment/003-add-compression-columns.sql | 2 | Create |
| CompressionService.cs (new) | 3 | Create |
| ICompressionService.cs (new) | 3 | Create |
| CompressionOptions.cs (new) | 3 | Create |
| DeduplicationService.cs | 3 | NO CHANGE (hash stays on raw bytes) |
| FileService.cs | 3, 4 | Modify (compress after hash, decompress on download) |
| MinioStorageProvider.cs | 3 | NO CHANGE (just receives compressed stream) |
| IStorageProvider.cs | 3 | Modify (add DownloadDecompressedAsync) |
| FileInfoResponse.cs | 5 | Modify (add compression fields) |
| UploadFileResponse.cs | 5 | Modify (add compression fields) |
| CompressionStatsResponse.cs (new) | 5 | Create |
| DependencyInjection.cs (Core) | 3 | Modify (register CompressionService) |
| `scripts/post-deployment/002-create-stored-procedures.sql` | Phase 2 | Modify (add compression columns to usp_FindDuplicateFile) |
| `src/FIS.FileManager.Api/Controllers/LegacyController.cs` | Phase 3 | Modify (verify decompression works for by-name downloads) |
| `src/FIS.FileManager.Shared/Responses/BatchUploadItemResponse.cs` | Phase 5 | Modify (add compression fields) |

## Red Team Review

### Session — 2026-04-07
**Reviewers:** Security Adversary, Failure Mode Analyst, Assumption Destroyer, Scope & Complexity Critic
**Findings:** 15 (12 accepted, 3 rejected)
**Severity breakdown:** 3 Critical, 6 High, 3 Medium (accepted)

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Request decompression bomb — no SizeLimit | Critical | Accept | Phase 1 |
| 2 | usp_FindDuplicateFile omits compression columns | Critical | Accept | Phase 2 |
| 3 | Download decompression buffers entire file (breaks streaming) | Critical | Accept | Phase 3 |
| 4 | application/octet-stream catch-all + no expansion guard | High | Accept | Phase 3 |
| 5 | Content-Type to MinIO misrepresents compressed bytes | High | Accept | Phase 3 |
| 6 | BatchUploadItemResponse + LegacyController missed | High | Accept | Phase 5 |
| 7 | DownloadByNameAsync double-buffers in MemoryStream | High | Accept | Phase 3 |
| 8 | Phase 3 Step 6 ordering contradictory | High | Accept | Phase 3 |
| 9 | Decompress-then-recompress via Phase 1 middleware | High | Accept | Phase 3 |
| 10 | GetInfoAsync lacks authz (pre-existing) | High | Reject | — |
| 11 | Stats query no partition elimination | Medium | Accept | Phase 5 |
| 12 | Phase 1 config is dead code | Medium | Accept | Phase 1 |
| 13 | String policy enum | Medium | Reject | — |
| 14 | RegisterExistingFileAsync gap | Medium | Accept | Phase 5 |
| 15 | IFileRepository returns response DTO | Medium | Reject | — |

**Rejected rationale:**
- F10: Pre-existing auth bug on GetInfoAsync, not introduced by compression. Separate task.
- F13: SQL CHECK constraint + case-insensitive string comparison is sufficient. YAGNI.
- F15: Pragmatic shortcut for simple aggregate pass-through. Minimal layer violation.

## Reports

- [ASP.NET Compression Research](../reports/researcher-260407-1354-aspnet-compression-strategies.md)
