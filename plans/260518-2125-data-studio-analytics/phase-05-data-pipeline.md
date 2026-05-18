---
phase: 5
title: "Data Pipeline — PostgreSQL → Parquet Export"
status: complete
effort: 6h
---

# Phase 5 — Data Pipeline (Parquet Export)

## Context Links
- Plan: [plan.md](plan.md)
- Phase 3 (analytics-service): [phase-03-analytics-service.md](phase-03-analytics-service.md)
- Phase 1 (MinIO bucket): [phase-01-infrastructure.md](phase-01-infrastructure.md)
- Existing scheduler pattern: `BE/order-service/` (Spring `@Scheduled`)

## Overview
- **Priority**: P2 — populates data lake từ existing PostgreSQL
- **Status**: pending

Scheduled job trong `analytics-service` export các bảng PostgreSQL → Parquet → upload MinIO `analytics-data/exports/` mỗi ngày lúc 02:00. Đồng thời cập nhật `dataset_catalog` trong DB.

**Tables export:** `orders`, `order_items`, `products`, `users`, `inventory_items`

## Requirements

**Functional:**
- `@Scheduled(cron = "0 0 2 * * *")` — chạy daily 02:00
- Export 5 tables từ PostgreSQL → Parquet format
- Upload lên MinIO `analytics-data/exports/{table}.parquet`
- Cập nhật `dataset_catalog`: row_count, size_bytes, schema_json, updated_at
- Manual trigger: `POST /analytics/admin/pipeline/run` (admin only, for testing)
- Export incremental cho `orders` (chỉ lấy records trong 90 ngày gần nhất — tránh file quá lớn)

**Non-functional:**
- Không block main thread — chạy trong `@Async` thread pool
- Log start/end + row count mỗi table
- Nếu 1 table fail → log error + tiếp tục export table khác (không dừng toàn bộ job)

## Architecture

```
analytics-service/
└── pipeline/
    ├── DataExportScheduler.java    # @Scheduled trigger
    ├── DataExportService.java      # core export logic
    ├── TableExportConfig.java      # config: table → query mapping
    └── MinioUploadService.java     # stream upload to MinIO
```

**Luồng xử lý:**
```
@Scheduled(02:00) → DataExportScheduler
    → DataExportService.exportAll()
        for each TableExportConfig:
            1. JDBC query PostgreSQL → ResultSet
            2. Convert to Arrow/Parquet bytes (via DuckDB COPY or parquet4j)
            3. Upload stream → MinIO analytics-data/exports/{name}.parquet
            4. Upsert dataset_catalog record
```

## Key Implementation Details

### Parquet generation — 2 options

**Option A (Recommended — KISS):** Dùng DuckDB trong FastAPI executor

Thay vì Java Parquet library (phức tạp), gọi FastAPI endpoint nội bộ:

```
analytics-service → POST http://analytics-executor:8000/pipeline/export-table
                     {table: "orders", query: "SELECT ...", dest_key: "exports/orders.parquet"}
analytics-executor (Python) → DuckDB COPY TO MinIO S3
```

FastAPI thêm endpoint:
```python
@router.post("/pipeline/export-table")
async def export_table(req: ExportTableRequest):
    conn = duckdb.connect(":memory:")
    # configure MinIO
    conn.execute("INSTALL postgres; LOAD postgres;")
    conn.execute(f"""
        COPY (
            SELECT * FROM postgres_scan('{pg_conn_str}', 'public', '{req.table}')
            WHERE {req.where_clause}
        )
        TO 's3://{bucket}/{req.dest_key}'
        (FORMAT PARQUET, COMPRESSION SNAPPY)
    """)
    row_count = conn.execute("SELECT COUNT(*) FROM ...").fetchone()[0]
    return {"rowCount": row_count, "key": req.dest_key}
```

DuckDB `postgres_scan` + `COPY TO S3` = single query, zero intermediate files.

**Option B (fallback):** Python pandas + pyarrow nếu DuckDB postgres_scan không available:
```python
import pandas as pd, pyarrow as pa, pyarrow.parquet as pq
df = pd.read_sql(query, psycopg2.connect(pg_conn))
buf = io.BytesIO()
pq.write_table(pa.Table.from_pandas(df), buf, compression='snappy')
buf.seek(0)
s3.upload_fileobj(buf, bucket, key)
```

### pipeline/TableExportConfig.java

```java
public record TableExportConfig(
    String name,          // catalog name, e.g. "orders"
    String destKey,       // MinIO key, e.g. "exports/orders.parquet"
    String whereClause,   // SQL filter, e.g. "created_at > NOW() - INTERVAL '90 days'"
    String description
) {
    public static List<TableExportConfig> defaults() {
        return List.of(
            new TableExportConfig("orders", "exports/orders.parquet",
                "created_at > NOW() - INTERVAL '90 days'", "Đơn hàng 90 ngày gần nhất"),
            new TableExportConfig("order_items", "exports/order_items.parquet",
                "1=1", "Chi tiết đơn hàng"),
            new TableExportConfig("products", "exports/products.parquet",
                "deleted_at IS NULL", "Sản phẩm đang hoạt động"),
            new TableExportConfig("users", "exports/users.parquet",
                "role = 'CUSTOMER'", "Danh sách khách hàng"),
            new TableExportConfig("inventory_items", "exports/inventory_items.parquet",
                "1=1", "Tồn kho")
        );
    }
}
```

### pipeline/DataExportScheduler.java

```java
@Component
@RequiredArgsConstructor
@Slf4j
public class DataExportScheduler {

    private final DataExportService exportService;

    // Daily at 02:00
    @Scheduled(cron = "0 0 2 * * *")
    @Async("pipelineExecutor")
    public void scheduledExport() {
        log.info("Pipeline: starting daily export");
        exportService.exportAll();
    }
}
```

### pipeline/DataExportService.java

```java
@Service
@RequiredArgsConstructor
@Slf4j
public class DataExportService {

    private final RestTemplate restTemplate;
    private final DatasetCatalogRepository catalogRepo;
    @Value("${analytics.executor.url}")
    private String executorUrl;

    public void exportAll() {
        TableExportConfig.defaults().forEach(cfg -> {
            try {
                exportTable(cfg);
            } catch (Exception e) {
                log.error("Pipeline: failed to export table={}", cfg.name(), e);
            }
        });
    }

    private void exportTable(TableExportConfig cfg) {
        log.info("Pipeline: exporting table={}", cfg.name());
        long start = System.currentTimeMillis();

        var req = Map.of(
            "table", cfg.name(),
            "whereClause", cfg.whereClause(),
            "destKey", cfg.destKey()
        );

        var resp = restTemplate.postForObject(
            executorUrl + "/pipeline/export-table", req, Map.class);

        int rowCount = (int) resp.get("rowCount");
        long ms = System.currentTimeMillis() - start;
        log.info("Pipeline: exported table={} rows={} ms={}", cfg.name(), rowCount, ms);

        // Upsert dataset_catalog
        var catalog = catalogRepo.findByMinioKey(cfg.destKey())
            .orElse(new DatasetCatalog());
        catalog.setName(cfg.name());
        catalog.setDescription(cfg.description());
        catalog.setMinioKey(cfg.destKey());
        catalog.setRowCount((long) rowCount);
        catalog.setSourceType("export");
        catalog.setUpdatedAt(Instant.now());
        catalogRepo.save(catalog);
    }
}
```

### Manual trigger endpoint (thêm vào DatasetController.java)

```java
@PostMapping("/admin/pipeline/run")
public ResponseEntity<Map<String, String>> triggerPipeline(
        @RequestHeader("X-User-Role") String role) {
    if (!"ADMIN".equals(role)) return ResponseEntity.status(403).build();
    CompletableFuture.runAsync(exportService::exportAll);
    return ResponseEntity.ok(Map.of("message", "Pipeline started in background"));
}
```

### FastAPI — thêm pipeline router

```python
# BE/analytics-executor/routers/pipeline_router.py
from fastapi import APIRouter
from pydantic import BaseModel
import duckdb, os
from config import Settings

router = APIRouter(prefix="/pipeline")
settings = Settings()

PG_CONN = (
    f"host={os.getenv('POSTGRES_HOST','postgres')} "
    f"dbname={os.getenv('POSTGRES_DB','ecommerce')} "
    f"user={os.getenv('POSTGRES_USER','postgres')} "
    f"password={os.getenv('POSTGRES_PASSWORD','postgres')}"
)

class ExportTableRequest(BaseModel):
    table: str
    where_clause: str = "1=1"
    dest_key: str

@router.post("/export-table")
def export_table(req: ExportTableRequest):
    conn = duckdb.connect(":memory:")
    # Setup S3
    conn.execute(f"""
        INSTALL httpfs; LOAD httpfs;
        INSTALL postgres; LOAD postgres;
        SET s3_endpoint='{settings.minio_endpoint_internal}';
        SET s3_access_key_id='{settings.minio_access_key}';
        SET s3_secret_access_key='{settings.minio_secret_key}';
        SET s3_use_ssl=false;
        SET s3_url_style='path';
    """)
    dest = f"s3://{settings.analytics_bucket}/{req.dest_key}"
    conn.execute(f"""
        COPY (
            SELECT * FROM postgres_scan('{PG_CONN}', 'public', '{req.table}')
            WHERE {req.where_clause}
        ) TO '{dest}' (FORMAT PARQUET, COMPRESSION SNAPPY)
    """)
    row_count = conn.execute(
        f"SELECT COUNT(*) FROM read_parquet('{dest}')"
    ).fetchone()[0]
    conn.close()
    return {"rowCount": row_count, "key": req.dest_key}
```

Đăng ký router trong `main.py`:
```python
from routers.pipeline_router import router as pipeline_router
app.include_router(pipeline_router)
```

Thêm env vars vào analytics-executor trong docker-compose:
```yaml
environment:
  POSTGRES_HOST: postgres
  POSTGRES_DB: ecommerce
  POSTGRES_USER: postgres
  POSTGRES_PASSWORD: postgres
```

## Schema JSON (auto-detect từ DuckDB)

Sau khi export, DuckDB có thể query Parquet để lấy schema:
```sql
DESCRIBE SELECT * FROM read_parquet('s3://analytics-data/exports/orders.parquet') LIMIT 0;
```
Kết quả lưu vào `dataset_catalog.schema_json` → FE hiển thị column hints trong Monaco.

## Todo List
- [ ] Tạo `BE/analytics-executor/routers/pipeline_router.py`
- [ ] Đăng ký `pipeline_router` trong `main.py`
- [ ] Thêm POSTGRES env vars vào analytics-executor docker-compose
- [ ] Tạo `BE/analytics-service/pipeline/TableExportConfig.java`
- [ ] Tạo `BE/analytics-service/pipeline/DataExportService.java`
- [ ] Tạo `BE/analytics-service/pipeline/DataExportScheduler.java`
- [ ] Thêm `POST /admin/pipeline/run` vào DatasetController
- [ ] Thêm `@EnableScheduling` + `@EnableAsync` vào `AnalyticsServiceApplication.java`
- [ ] Test: `POST /analytics/admin/pipeline/run` → job chạy → MinIO có file `.parquet`
- [ ] Test: `GET /analytics/datasets` → list exports/orders.parquet
- [ ] Test: SQL query `SELECT * FROM read_parquet('s3://...') LIMIT 5`

## Success Criteria
- Manual trigger → 5 Parquet files xuất hiện trong MinIO `analytics-data/exports/`
- `dataset_catalog` có 5 records với row_count đúng
- DuckDB query trên Parquet file trả kết quả trong < 2s (10k rows)
- Scheduled job log hiển thị đúng lúc 02:00

## Risk Assessment
- **DuckDB `postgres_scan` cần `INSTALL postgres`** — Docker image cần internet hoặc pre-install; thêm vào Dockerfile: `RUN python -c "import duckdb; conn=duckdb.connect(); conn.execute('INSTALL httpfs; INSTALL postgres;')"`
- **Large tables** (order_items): dùng WHERE clause filter để giới hạn size
- **Parquet file overwrite**: COPY TO overwrite existing file — idempotent, OK

## Security
- Pipeline endpoint chỉ cho ADMIN role
- PostgreSQL credentials qua env vars, không hardcode
- Parquet files trong MinIO private bucket — chỉ DuckDB (nội bộ) và analytics-service được đọc
