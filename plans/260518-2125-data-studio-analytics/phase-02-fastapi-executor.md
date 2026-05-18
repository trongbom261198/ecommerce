---
phase: 2
title: "FastAPI Analytics Executor — DuckDB + Python/R Sandbox"
status: complete
effort: 10h
---

# Phase 2 — FastAPI Analytics Executor

## Context Links
- Plan: [plan.md](plan.md)
- Phase 1 (infra required): [phase-01-infrastructure.md](phase-01-infrastructure.md)
- Service dir: `BE/analytics-executor/`

## Overview
- **Priority**: P0 — core execution engine
- **Status**: pending

FastAPI service nhận request execute từ analytics-service (Spring Boot), chạy:
- **SQL mode**: DuckDB query trên MinIO Parquet files
- **Python mode**: sandboxed `exec()` với pandas/numpy/scipy
- **R mode**: `Rscript` subprocess

## Requirements

**Functional:**
- `POST /execute` nhận `{language, code, datasets?, timeout?}`
- SQL: DuckDB `SELECT * FROM read_parquet('s3://...')` + PostgreSQL direct query
- Python: exec với restricted builtins, pandas/numpy available
- R: Rscript subprocess với timeout
- Kết quả: `{columns, rows, rowCount, executionMs, truncated}`
- Max 10.000 rows trả về (truncate + flag `truncated: true`)
- `GET /datasets` — list Parquet files từ MinIO
- `GET /health` — health check endpoint
- `POST /datasets/upload` — upload CSV → convert → store as Parquet trong MinIO

**Non-functional:**
- Timeout: SQL 60s, Python/R 30s (env configurable)
- Memory cap: process-level (`resource` module, Linux only; Docker limit fallback)
- Thread-safe: multiple concurrent requests (FastAPI async + executor threadpool)

## Architecture

```
BE/analytics-executor/
├── main.py                    # FastAPI app entry point
├── routers/
│   ├── execute_router.py      # POST /execute, GET /health
│   └── dataset_router.py      # GET /datasets, POST /datasets/upload
├── services/
│   ├── duckdb_service.py      # SQL execution via DuckDB
│   ├── python_sandbox.py      # Python exec sandbox
│   ├── r_executor.py          # R subprocess executor
│   └── minio_service.py       # MinIO S3 client helpers
├── models/
│   └── execute_models.py      # Pydantic request/response models
├── config.py                  # env-based config (pydantic-settings)
├── requirements.txt
└── Dockerfile
```

## Key Implementation Details

### main.py

```python
from fastapi import FastAPI
from routers.execute_router import router as execute_router
from routers.dataset_router import router as dataset_router
from config import Settings

settings = Settings()
app = FastAPI(title="Analytics Executor", docs_url=None, redoc_url=None)

app.include_router(execute_router)
app.include_router(dataset_router)

@app.get("/health")
def health():
    return {"status": "ok"}
```

### models/execute_models.py

```python
from pydantic import BaseModel, Field
from typing import Literal, Optional, Any

class ExecuteRequest(BaseModel):
    language: Literal["sql", "python", "r"]
    code: str = Field(max_length=50_000)
    timeout: Optional[int] = None  # seconds, uses server default if None

class ExecuteResponse(BaseModel):
    columns: list[str]
    rows: list[list[Any]]
    row_count: int
    execution_ms: int
    truncated: bool
    error: Optional[str] = None
```

### services/duckdb_service.py — SQL mode

```python
import duckdb, time, os
from models.execute_models import ExecuteResponse
from config import Settings

settings = Settings()

def _make_conn() -> duckdb.DuckDBPyConnection:
    conn = duckdb.connect(":memory:")
    # Configure S3/MinIO access
    conn.execute(f"""
        INSTALL httpfs; LOAD httpfs;
        SET s3_endpoint='{settings.minio_endpoint_internal}';
        SET s3_access_key_id='{settings.minio_access_key}';
        SET s3_secret_access_key='{settings.minio_secret_key}';
        SET s3_use_ssl=false;
        SET s3_url_style='path';
    """)
    return conn

def execute_sql(code: str, timeout: int) -> ExecuteResponse:
    start = time.monotonic()
    conn = _make_conn()
    try:
        rel = conn.execute(code)
        df = rel.df()
        ms = int((time.monotonic() - start) * 1000)
        truncated = len(df) > settings.max_result_rows
        df = df.head(settings.max_result_rows)
        return ExecuteResponse(
            columns=df.columns.tolist(),
            rows=df.values.tolist(),
            row_count=len(df),
            execution_ms=ms,
            truncated=truncated,
        )
    except Exception as e:
        raise RuntimeError(str(e))
    finally:
        conn.close()
```

**DuckDB có thể đọc trực tiếp:**
```sql
-- Ví dụ queries mà user có thể viết
SELECT * FROM read_parquet('s3://analytics-data/exports/orders.parquet') LIMIT 100;
SELECT category, COUNT(*) FROM read_parquet('s3://analytics-data/exports/products.parquet') GROUP BY category;
-- DuckDB cũng hỗ trợ query nhiều files
SELECT * FROM read_parquet('s3://analytics-data/exports/*.parquet');
```

### services/python_sandbox.py — Python sandbox

```python
import sys, io, time, traceback
import pandas as pd
import numpy as np
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from models.execute_models import ExecuteResponse

# Restricted builtins — block dangerous calls
BLOCKED_BUILTINS = {
    '__import__', 'open', 'exec', 'eval', 'compile',
    'input', 'print',  # print redirect handled separately
}

def _safe_builtins():
    safe = {k: v for k, v in __builtins__.items()
            if k not in BLOCKED_BUILTINS}
    safe['print'] = _capture_print  # redirect to buffer
    return safe

_print_buffer = []

def _capture_print(*args, **kwargs):
    _print_buffer.append(' '.join(str(a) for a in args))

def execute_python(code: str, timeout: int) -> ExecuteResponse:
    start = time.monotonic()
    _print_buffer.clear()

    local_ns = {
        '__builtins__': _safe_builtins(),
        'pd': pd, 'pandas': pd,
        'np': np, 'numpy': np,
        '_result': None,  # user sets _result = df
    }

    def _run():
        exec(compile(code, '<user_code>', 'exec'), local_ns)

    with ThreadPoolExecutor(max_workers=1) as pool:
        fut = pool.submit(_run)
        try:
            fut.result(timeout=timeout)
        except TimeoutError:
            raise RuntimeError(f"Execution timed out after {timeout}s")
        except Exception as e:
            raise RuntimeError(traceback.format_exc())

    ms = int((time.monotonic() - start) * 1000)
    result = local_ns.get('_result')

    if result is None:
        # Return print output as single-column table
        lines = _print_buffer or ['(no output — assign result to `_result`)']
        return ExecuteResponse(
            columns=['output'], rows=[[l] for l in lines],
            row_count=len(lines), execution_ms=ms, truncated=False
        )

    if isinstance(result, pd.DataFrame):
        truncated = len(result) > 10_000
        df = result.head(10_000)
        return ExecuteResponse(
            columns=df.columns.tolist(),
            rows=df.values.tolist(),
            row_count=len(df),
            execution_ms=ms, truncated=truncated
        )

    # Scalar result
    return ExecuteResponse(
        columns=['result'], rows=[[str(result)]],
        row_count=1, execution_ms=ms, truncated=False
    )
```

**Hướng dẫn cho user Python:**
```python
# User code example — phải gán _result = DataFrame
import pandas as pd
df = pd.read_parquet("s3://analytics-data/exports/orders.parquet")
_result = df.groupby('status')['total_amount'].sum().reset_index()
```

### services/r_executor.py — R subprocess

```python
import subprocess, json, time, tempfile, os
from models.execute_models import ExecuteResponse

R_WRAPPER = """
suppressPackageStartupMessages({{
  library(jsonlite)
  library(dplyr)
}})
{user_code}
# Auto-detect last assignment as _result
if (exists("_result")) {{
  cat(toJSON(as.data.frame(_result), na="null"))
}} else {{
  cat(toJSON(list(output="No _result variable found"), na="null"))
}}
"""

def execute_r(code: str, timeout: int) -> ExecuteResponse:
    start = time.monotonic()
    wrapped = R_WRAPPER.format(user_code=code)

    with tempfile.NamedTemporaryFile(suffix='.R', mode='w', delete=False) as f:
        f.write(wrapped)
        script_path = f.name

    try:
        proc = subprocess.run(
            ['Rscript', '--vanilla', script_path],
            capture_output=True, text=True, timeout=timeout
        )
        ms = int((time.monotonic() - start) * 1000)

        if proc.returncode != 0:
            raise RuntimeError(proc.stderr.strip())

        data = json.loads(proc.stdout)
        # data is list of dicts from toJSON(as.data.frame(...))
        if not data:
            return ExecuteResponse(columns=[], rows=[], row_count=0,
                                   execution_ms=ms, truncated=False)

        columns = list(data[0].keys())
        rows = [[row.get(c) for c in columns] for row in data]
        truncated = len(rows) > 10_000
        rows = rows[:10_000]

        return ExecuteResponse(
            columns=columns, rows=rows, row_count=len(rows),
            execution_ms=ms, truncated=truncated
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"R execution timed out after {timeout}s")
    finally:
        os.unlink(script_path)
```

### routers/execute_router.py

```python
from fastapi import APIRouter, HTTPException
from models.execute_models import ExecuteRequest, ExecuteResponse
from services.duckdb_service import execute_sql
from services.python_sandbox import execute_python
from services.r_executor import execute_r
from config import Settings

router = APIRouter()
settings = Settings()

@router.post("/execute", response_model=ExecuteResponse)
async def execute(req: ExecuteRequest):
    timeout = req.timeout or (
        settings.sql_timeout_sec if req.language == "sql"
        else settings.script_timeout_sec
    )
    try:
        if req.language == "sql":
            return execute_sql(req.code, timeout)
        elif req.language == "python":
            return execute_python(req.code, timeout)
        elif req.language == "r":
            return execute_r(req.code, timeout)
    except RuntimeError as e:
        raise HTTPException(status_code=422, detail=str(e))
```

### routers/dataset_router.py

```python
from fastapi import APIRouter, UploadFile, File
from services.minio_service import list_datasets, upload_csv_as_parquet

router = APIRouter(prefix="/datasets")

@router.get("")
async def list_all_datasets():
    return {"datasets": list_datasets()}

@router.post("/upload")
async def upload_dataset(file: UploadFile = File(...)):
    name = file.filename.replace('.csv', '')
    key = await upload_csv_as_parquet(await file.read(), name)
    return {"key": key, "message": "Uploaded and converted to Parquet"}
```

### services/minio_service.py

```python
import boto3, io, pandas as pd
from config import Settings

settings = Settings()

def _client():
    return boto3.client(
        's3',
        endpoint_url=settings.minio_endpoint,
        aws_access_key_id=settings.minio_access_key,
        aws_secret_access_key=settings.minio_secret_key,
    )

def list_datasets() -> list[dict]:
    s3 = _client()
    resp = s3.list_objects_v2(Bucket=settings.analytics_bucket)
    return [
        {"key": o['Key'], "size": o['Size'], "lastModified": str(o['LastModified'])}
        for o in resp.get('Contents', [])
        if o['Key'].endswith('.parquet')
    ]

async def upload_csv_as_parquet(data: bytes, name: str) -> str:
    df = pd.read_csv(io.BytesIO(data))
    buf = io.BytesIO()
    df.to_parquet(buf, index=False)
    buf.seek(0)
    key = f"uploads/{name}.parquet"
    _client().upload_fileobj(buf, settings.analytics_bucket, key)
    return key
```

### config.py

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    minio_endpoint: str = "http://minio:9000"
    minio_endpoint_internal: str = "minio:9000"  # for DuckDB httpfs
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    analytics_bucket: str = "analytics-data"
    max_result_rows: int = 10_000
    sql_timeout_sec: int = 60
    script_timeout_sec: int = 30

    class Config:
        env_prefix = ""
        env_file = ".env"
```

## K8S Sandbox (Production Mode — Optional)

Thay vì subprocess, production dùng K8S Job:

```python
# services/k8s_job_executor.py (prod alternative)
from kubernetes import client, config as k8s_config
import uuid, time, json

def execute_in_k8s_job(language: str, code: str, timeout: int) -> dict:
    k8s_config.load_incluster_config()
    batch_v1 = client.BatchV1Api()

    job_name = f"analytics-job-{uuid.uuid4().hex[:8]}"
    job = client.V1Job(
        metadata=client.V1ObjectMeta(name=job_name),
        spec=client.V1JobSpec(
            template=client.V1PodTemplateSpec(
                spec=client.V1PodSpec(
                    containers=[client.V1Container(
                        name="executor",
                        image="ecommerce/analytics-sandbox:latest",
                        command=["python", "/sandbox/run.py"],
                        env=[
                            client.V1EnvVar(name="LANGUAGE", value=language),
                            client.V1EnvVar(name="CODE", value=code),
                        ],
                        resources=client.V1ResourceRequirements(
                            limits={"cpu": "1", "memory": "512Mi"},
                            requests={"cpu": "100m", "memory": "128Mi"},
                        ),
                    )],
                    restart_policy="Never",
                )
            ),
            backoff_limit=0,
            active_deadline_seconds=timeout,
        )
    )
    batch_v1.create_namespaced_job("analytics", job)
    # ... poll for completion, read result from Job logs
    # cleanup: batch_v1.delete_namespaced_job(job_name, "analytics")
```

> **Dev mode**: dùng subprocess sandbox (trong container đã isolated).
> **Prod mode**: toggle qua env `EXECUTION_MODE=k8s`.

## Todo List
- [ ] Tạo `BE/analytics-executor/config.py`
- [ ] Tạo `BE/analytics-executor/models/execute_models.py`
- [ ] Tạo `BE/analytics-executor/services/duckdb_service.py`
- [ ] Tạo `BE/analytics-executor/services/python_sandbox.py`
- [ ] Tạo `BE/analytics-executor/services/r_executor.py`
- [ ] Tạo `BE/analytics-executor/services/minio_service.py`
- [ ] Tạo `BE/analytics-executor/routers/execute_router.py`
- [ ] Tạo `BE/analytics-executor/routers/dataset_router.py`
- [ ] Tạo `BE/analytics-executor/main.py`
- [ ] Test local: `uvicorn main:app` → POST /execute với SQL query
- [ ] Test: DuckDB đọc được MinIO Parquet file
- [ ] Test: Python sandbox với pandas
- [ ] Test: R subprocess với dplyr

## Success Criteria
- `POST /execute {"language":"sql","code":"SELECT 1+1 as result"}` → `{columns:["result"],rows:[[2]]}`
- `POST /execute {"language":"python","code":"_result = pd.DataFrame({'x':[1,2,3]})"}` → rows returned
- `POST /execute {"language":"r","code":"_result <- data.frame(x=1:3)"}` → rows returned
- `GET /datasets` → list Parquet files từ MinIO
- Timeout: query quá 30s → 422 error

## Risk Assessment
- **DuckDB httpfs MinIO path style**: phải set `s3_url_style='path'` (MinIO không support virtual-hosted style)
- **R không available trong container**: Dockerfile phải cài `r-base` trước
- **Python sandbox escape**: dùng `__builtins__` whitelist, block `__import__`. Với K8S hoàn toàn isolated.
- **Concurrent exec**: ThreadPoolExecutor với max_workers để tránh DoS

## Security
- Python `exec()`: block `open`, `__import__`, `os`, `sys` — chỉ cho pandas/numpy
- R subprocess: chạy trong container đã isolated, không có network access ra ngoài
- SQL injection trong DuckDB: DuckDB parameterized query nếu cần — với admin-only access, mức độ rủi ro thấp
- Mọi execution trong Docker container → blast radius giới hạn
