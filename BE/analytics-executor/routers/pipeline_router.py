import duckdb
from fastapi import APIRouter, Depends, HTTPException

from auth import require_internal_key
from models.execute_models import ExportTableRequest
from config import settings

router = APIRouter(prefix="/pipeline", dependencies=[Depends(require_internal_key)])


def _pg_dsn() -> str:
    return (
        f"host={settings.postgres_host} "
        f"dbname={settings.postgres_db} "
        f"user={settings.postgres_user} "
        f"password={settings.postgres_password}"
    )


def _setup_conn() -> duckdb.DuckDBPyConnection:
    """Create DuckDB connection with httpfs + postgres + S3/MinIO config."""
    conn = duckdb.connect(":memory:")
    # Each statement separate — multi-statement execute() is unreliable
    conn.execute("INSTALL httpfs")
    conn.execute("LOAD httpfs")
    conn.execute("INSTALL postgres")
    conn.execute("LOAD postgres")
    conn.execute(f"SET s3_endpoint='{settings.minio_endpoint_internal}'")
    conn.execute(f"SET s3_access_key_id='{settings.minio_access_key}'")
    conn.execute(f"SET s3_secret_access_key='{settings.minio_secret_key}'")
    conn.execute("SET s3_use_ssl=false")
    conn.execute("SET s3_url_style='path'")
    # Attach PostgreSQL as alias 'pg' — postgres_query uses this alias
    dsn_escaped = _pg_dsn().replace("'", "''")
    conn.execute(f"ATTACH '{dsn_escaped}' AS pg (TYPE POSTGRES, READ_ONLY)")
    return conn


@router.post("/export-table")
def export_table(req: ExportTableRequest):
    dest = f"s3://{settings.analytics_bucket}/{req.dest_key}"
    conn = _setup_conn()
    try:
        # postgres_query(alias, sql) — sends raw SQL to PostgreSQL via the attached alias
        # Escape single quotes in the SQL for DuckDB string literal embedding
        pg_sql = f"SELECT * FROM public.{req.table} WHERE {req.where_clause}"
        pg_sql_escaped = pg_sql.replace("'", "''")
        conn.execute(f"""
            COPY (
                FROM postgres_query('pg', '{pg_sql_escaped}')
            ) TO '{dest}' (FORMAT PARQUET, COMPRESSION SNAPPY)
        """)
        row_count = conn.execute(
            f"SELECT COUNT(*) FROM read_parquet('{dest}')"
        ).fetchone()[0]
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    finally:
        conn.close()

    return {"rowCount": row_count, "key": req.dest_key}
