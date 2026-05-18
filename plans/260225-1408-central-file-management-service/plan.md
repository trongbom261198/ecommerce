---
title: "Central File Management Service"
description: ".NET 8 Web API centralizing MinIO file operations with dedup, cleanup, and audit"
status: in-progress
priority: P1
effort: 27h
branch: TBD
tags: [dotnet8, minio, sqlserver, redis, file-management]
created: 2026-02-25
---

# Central File Management Service

Centralized .NET 8 Web API replacing direct MinIO calls across 5-10 services. Handles upload/download, SHA-256 dedup, reference counting, automated cleanup, and audit logging. SQL Server (partitioned monthly) for metadata, Redis for distributed locks, MinIO for object storage.

## Architecture

```
Services A/B/C  →  HTTP/REST (API Key)  →  File Central Service (.NET 8)
                                             ├── REST API (upload/download/release/info)
                                             ├── Dedup Service (SHA-256, per-service)
                                             ├── Cleanup Worker (stale/temp/orphan)
                                             ├── SQL Server 10.14.142.30\BTP [FILE db]
                                             ├── MinIO 10.14.142.32:9000 (1 bucket/service, existing: btp)
                                             └── Redis (locks, dedup cache)
```

## Tech Stack

| Component | Technology | Package |
|-----------|-----------|---------|
| Framework | .NET 8 Web API | - |
| ORM | EF Core 8 + Dapper | Microsoft.EntityFrameworkCore.SqlServer 8.0.x, Dapper 2.1.x |
| Storage | MinIO | Minio 6.0.x |
| Cache/Lock | Redis | StackExchange.Redis 2.8.x |
| Resilience | Polly v8 | Microsoft.Extensions.Http.Polly 8.0.x |
| Logging | Serilog | Serilog.AspNetCore 8.0.x |
| Health | AspNetCore.Diagnostics | built-in |

## Phases

| # | Phase | Priority | Effort | Status | File |
|---|-------|----------|--------|--------|------|
| 1 | Project Setup | High | 2h | ✅ Complete | [phase-01](phase-01-project-setup.md) |
| 2 | Database Schema | High | 3h | ✅ Complete | [phase-02](phase-02-database-schema.md) |
| 3 | Core Layer | High | 2h | ✅ Complete | [phase-03](phase-03-core-layer.md) |
| 4 | Infrastructure Layer | High | 4h | ✅ Complete | [phase-04](phase-04-infrastructure-layer.md) |
| 5 | API Layer | High | 4h | ✅ Complete | [phase-05](phase-05-api-layer.md) |
| 6 | Background Services | Medium | 3h | ✅ Complete | [phase-06](phase-06-background-services.md) |
| 7 | Docker & Deployment | Medium | 2h | ✅ Complete | [phase-07](phase-07-docker-deployment.md) |
| 8 | Testing | Medium | 3h | Pending | [phase-08](phase-08-testing.md) |
| 9 | Performance & Stress Testing | Medium | 4h | Pending | [phase-09](phase-09-performance-testing.md) |

## Dependencies

- Phase 2 depends on Phase 1 (solution must exist for scripts/ folder)
- Phase 3 depends on Phase 1 (project references)
- Phase 4 depends on Phase 2 + 3 (schema + interfaces)
- Phase 5 depends on Phase 3 + 4 (services + infrastructure)
- Phase 6 depends on Phase 4 + 5 (infrastructure + DI)
- Phase 7 depends on Phase 5 (runnable API)
- Phase 8 depends on Phase 5 + 6 (full implementation)
- Phase 9 depends on Phase 5 + 7 (runnable API + Docker environment)

## Key Reports

- [Brainstorm](../reports/brainstorm-260225-1018-central-file-management-service.md) - all architectural decisions
- [.NET 8 Patterns Research](../reports/researcher-260225-1408-dotnet8-file-service-patterns.md)
- [SQL Server Partitioning Research](../reports/researcher-260225-1408-sqlserver-partitioning-scripts.md)

## Red Team Review

### Session — 2026-02-25
**Reviewers:** Security Adversary, Failure Mode Analyst, Assumption Destroyer, Scope & Complexity Critic
**Findings:** 15 (12 accepted, 3 rejected)
**Severity breakdown:** 3 Critical, 7 High, 5 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Upload atomicity (confirm+ref not transactional) | Critical | Accept | Phase 3, 4 |
| 2 | Download loads entire file into MemoryStream | Critical | Accept | Phase 4, 5 |
| 3 | API key auth broken (wrong hash, no salt) | Critical | Accept | Phase 2, 5 |
| 4 | SA password committed to git | High | Accept | Phase 1 |
| 5 | No authorization (cross-service file access) | High | Accept | Phase 5 |
| 6 | Dedup query scans all partitions | High | Accept | Phase 2 |
| 7 | Path traversal via unsanitized filename | High | Accept | Phase 3 |
| 8 | Redis lock auto-renew fire-and-forget | High | Accept | Phase 4 |
| 9 | No partition maintenance automation | High | Accept | Phase 6 |
| 10 | Redis down = total upload outage | High | Accept | Phase 3 |
| 11 | Integration tests missing MinIO | Medium | Accept | Phase 8 |
| 12 | Migration endpoint cross-service | Medium | Accept | Phase 5 |
| 13 | Shared project is unnecessary | Medium | Reject | — |
| 14 | Dual ORM (EF Core + Dapper) | Medium | Reject | — |
| 15 | Monthly partitioning premature | Medium | Reject | — |

**Rejected rationale:**
- F13: Clean Architecture convention; Shared becomes NuGet package for client SDK
- F14: Dapper for stored procs is standard .NET; cleanup/dedup queries need direct SQL
- F15: Brainstorm architectural decision; AuditLogs SWITCH purge justifies it alone

### Session 2 — 2026-02-25 (Phase 9 only)
**Reviewers:** Security Adversary, Assumption Destroyer
**Findings:** 11 (9 accepted, 2 rejected)
**Severity breakdown:** 1 Critical, 8 High, 2 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Test API key not provisioned + no fallback | Critical | Accept | Phase 9 |
| 2 | No test data cleanup/teardown in any script | High | Accept | Phase 9 |
| 3 | Unix commands (dd/urandom) on Windows | High | Accept | Phase 9 |
| 4 | Soak test cannot detect memory leaks (k6 external) | High | Accept | Phase 9 |
| 5 | Dedup test doesn't measure lock contention latency | High | Accept | Phase 9 |
| 6 | Stress test accepts 401 as pass | High | Accept | Phase 9 |
| 7 | No environment isolation guard in run-all.sh | High | Accept | Phase 9 |
| 8 | API key in CLI arguments (process table) | High | Reject | — |
| 9 | Internal IPs in plan document | High | Reject | — |
| 10 | Missing 50MB in concurrent download test | Medium | Accept | Phase 9 |
| 11 | run-all.sh relative path failure | Medium | Accept | Phase 9 |

**Rejected rationale:**
- F8: Standard k6 practice; CI systems mask secrets; test API key is low-value
- F9: IPs already in Phases 1-8, docker-compose, appsettings; plan docs are internal; removing from Phase 9 alone is pointless

## Validation Log

### Session 1 — 2026-02-25
**Trigger:** Initial plan validation after red team review (--hard mode)
**Questions asked:** 4

#### Questions & Answers

1. **[Architecture]** The plan has a contradiction: appsettings.json sets DefaultBucket=btp (existing bucket), but upload code uses service.ServiceName as bucket (e.g., 'default-service'). Which bucket strategy should we use?
   - Options: Single shared bucket (btp) | Per-service bucket | Configurable per service
   - **Answer:** Per-service bucket
   - **Rationale:** Each service gets its own MinIO bucket for isolation. Existing `btp` bucket maps to the existing BTP service. `DefaultBucket` config value is only used as fallback/initial bucket, not the universal bucket. Upload code correctly uses `service.ServiceName` as bucket name.

2. **[Scope]** There's no admin API for registering new services or generating HMAC API keys. Seed data has a placeholder. How should new services be onboarded?
   - Options: SQL scripts only | Admin API endpoint | Both SQL + simple CLI tool
   - **Answer:** SQL scripts only
   - **Rationale:** Service registration via SQL INSERT in `scripts/utilities/`. Reduces attack surface — no admin API to protect. HMAC key generation documented in seed script comments. Operational simplicity over programmatic access.

3. **[Assumptions]** Dedup is per-service: if Service A and Service B upload identical files, both are stored separately in MinIO. This doubles storage but provides service isolation. Is per-service dedup correct?
   - Options: Per-service dedup | Cross-service global dedup
   - **Answer:** Per-service dedup
   - **Rationale:** Trades storage for isolation. Each service owns its files independently. No cross-service dependency in cleanup/deletion. Reference counting stays simple — single owner per file copy.

4. **[Architecture]** Partition boundaries start at 2026-03-01. Today is 2026-02-25 — any data created before March goes into the catch-all partition 1. Should we add 2026-02-01 as a boundary?
   - Options: Start from 2026-02-01 | Keep 2026-03-01 start | Start from 2026-01-01
   - **Answer:** Start from 2026-02-01
   - **Rationale:** February data gets its own partition instead of going to catch-all. Deployment may happen before March — avoids accumulating unbounded data in partition 1.

#### Confirmed Decisions
- **Bucket strategy**: Per-service buckets — upload code using `service.ServiceName` is correct
- **Service onboarding**: SQL scripts in `scripts/utilities/` — no admin API
- **Dedup scope**: Per-service — same file from different services stored separately
- **Partition start**: Add 2026-02-01 boundary to partition function

#### Action Items
- [ ] Fix Phase 2: Add 2026-02-01 as first partition boundary value
- [ ] Fix Phase 3: Update IStorageProvider.DownloadAsync signature to match Phase 4 streaming implementation (outputStream parameter)
- [ ] Add scripts/utilities/add-service.sql template to Phase 2

#### Impact on Phases
- Phase 2: Add 2026-02-01 boundary to partition function; add service registration SQL template
- Phase 3: Fix IStorageProvider.DownloadAsync signature mismatch (returns Stream vs takes outputStream)

### Session 2 — 2026-02-25
**Trigger:** Re-validation after Phase 9 addition and red team Session 2
**Questions asked:** 2

#### Questions & Answers

1. **[Scope]** Phase 9 soak test runs 30 min with docker stats monitoring. Should we also monitor temp-uploads/ disk usage during soak, or is memory-only sufficient?
   - Options: Memory only | Memory + disk | Skip soak entirely
   - **Answer:** Memory only
   - **Rationale:** docker stats for memory growth sufficient for MVP. Soak test's release cycle already cleans temp files.

2. **[Architecture]** k6 test results accumulate in tests/k6/results/. Should results be committed to git or gitignored?
   - Options: Gitignore results | Commit baseline only | Commit all results
   - **Answer:** Gitignore results
   - **Rationale:** Results are ephemeral. Compare manually or via CI artifacts. Avoids repo bloat.

#### Confirmed Decisions
- **Soak monitoring**: Memory only via docker stats — no disk monitoring needed
- **Test results**: Gitignore tests/k6/results/

#### Action Items
- [ ] Add `tests/k6/results/` to .gitignore (Phase 1)

#### Impact on Phases
- Phase 1: Add `tests/k6/results/` to .gitignore
- Phase 9: No changes needed (already uses docker stats for soak)
