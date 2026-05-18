import time
import duckdb
from models.execute_models import ExecuteResponse
from config import settings


def _new_conn() -> duckdb.DuckDBPyConnection:
    conn = duckdb.connect(":memory:")
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
    conn = _new_conn()
    try:
        rel = conn.execute(code)
        df = rel.df()
        ms = int((time.monotonic() - start) * 1000)
        truncated = len(df) > settings.max_result_rows
        df = df.head(settings.max_result_rows)
        # Convert NaN/NaT to None for JSON serialisation
        rows = df.where(df.notna(), other=None).values.tolist()
        return ExecuteResponse(
            columns=df.columns.tolist(),
            rows=rows,
            row_count=len(df),
            execution_ms=ms,
            truncated=truncated,
        )
    finally:
        conn.close()
