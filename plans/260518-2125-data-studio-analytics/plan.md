---
title: "Data Studio — Thống kê dữ liệu"
description: "Admin module cho phép truy vấn SQL/Python/R qua Monaco Editor trên nền DuckDB + Parquet + FastAPI sandbox + K8S"
status: complete
priority: P2
effort: 40h
branch: main
tags: [data-studio, duckdb, monaco, fastapi, python, r, parquet, minio, k8s, analytics]
created: 2026-05-18
completed: 2026-05-18
blockedBy: []
blocks: []
---

# Data Studio — Thống kê Dữ Liệu

Menu admin mới `/admin/data-studio` cho phép admin truy vấn dữ liệu thời gian thực qua Monaco Editor (SQL / Python / R), kết quả trả về dạng bảng + chart.

## Architecture Tổng Quan

```
Admin UI (Monaco Editor)
    │
    │ POST /api/analytics/execute
    ▼
API Gateway (Spring Cloud) → route /analytics/**
    │
    │ HTTP proxy (X-User-Role: ADMIN)
    ▼
analytics-service :8087 (Spring Boot)
    │ validate + rate-limit + cache (Redis)
    │ POST http://analytics-executor:8000/execute
    ▼
analytics-executor :8000 (FastAPI / Python)
    ├── SQL  → DuckDB reads MinIO Parquet (s3fs/httpfs)
    ├── Python → sandboxed exec subprocess (Docker/K8S Job)
    └── R     → Rscript subprocess (Docker/K8S Job)
    │
    ▼
MinIO  analytics-data/  bucket  (.parquet files)
PostgreSQL  analytics_metadata  schema  (dataset catalog)
```

## Phases

| # | Phase | Effort | Status |
|---|-------|--------|--------|
| 1 | [Infrastructure](phase-01-infrastructure.md) | 4h | complete |
| 2 | [FastAPI Executor](phase-02-fastapi-executor.md) | 10h | complete |
| 3 | [Analytics Service (Spring Boot)](phase-03-analytics-service.md) | 10h | complete |
| 4 | [FE Data Studio Page](phase-04-fe-data-studio.md) | 10h | complete |
| 5 | [Data Pipeline — Parquet Export](phase-05-data-pipeline.md) | 6h | complete |

## Key Decisions

1. **DuckDB trong FastAPI** (không phải Spring Boot) — Python bindings tự nhiên hơn, DuckDB + pandas + scipy cùng runtime.
2. **Execution mode**: dev = subprocess sandboxing; prod = K8S Job (isolate hoàn toàn).
3. **Spring Boot** chỉ làm orchestrator: authn/authz, rate-limit, Redis cache, proxy tới FastAPI.
4. **MinIO** reuse existing service, thêm bucket `analytics-data`.
5. **PostgreSQL** reuse existing DB, thêm schema `analytics_metadata` cho dataset catalog.
6. **Monaco Editor** qua package `@monaco-editor/react` — không cần cấu hình phức tạp.
7. **Parquet sources**: daily export từ PostgreSQL tables (orders, products, users) + upload manual.

## Dependency Graph

```
Phase 1 (Infra) ──► Phase 2 (FastAPI) ──► Phase 3 (Spring) ──► Phase 4 (FE)
                                                                     ▲
Phase 5 (Pipeline) ──────────────────────────────────────────────────┘
```

Phases 2, 3, 4, 5 có thể song song sau khi Phase 1 hoàn thành.

## File Ownership

| Phase | Files |
|-------|-------|
| 1 | `BE/docker-compose.yml`, `BE/analytics-executor/Dockerfile`, `BE/analytics-executor/requirements.txt` |
| 2 | `BE/analytics-executor/` (toàn bộ FastAPI service) |
| 3 | `BE/analytics-service/` (toàn bộ Spring Boot service) |
| 4 | `FE/src/pages/admin/AdminDataStudioPage.tsx`, `FE/src/components/data-studio/`, `FE/src/services/analyticsService.ts`, `FE/src/App.tsx`, `FE/src/components/layout/AdminLayout.tsx` |
| 5 | `BE/analytics-service/src/.../pipeline/` (scheduled jobs) |
