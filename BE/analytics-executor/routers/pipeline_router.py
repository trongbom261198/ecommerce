import duckdb
from fastapi import APIRouter, HTTPException

from models.execute_models import ExportTableRequest
from config import settings

router = APIRouter(prefix="/pipeline")

_PG_CONN_STR = (
    "host={host} dbname={db} user={user} password={pwd}"
)


def _pg_conn() -> str:
    return _PG_CONN_STR.format(
        host=settings.postgres_host,
        db=settings.postgres_db,
        user=settings.postgres_user,
        pwd=settings.postgres_password,
    )


@router.post("/export-table")
def export_table(req: ExportTableRequest):
    dest = f"s3://{settings.analytics_bucket}/{req.dest_key}"
    conn = duckdb.connect(":memory:")
    try:
        conn.execute(f"""
            INSTALL httpfs; LOAD httpfs;
            INSTALL postgres; LOAD postgres;
            SET s3_endpoint='{settings.minio_endpoint_internal}';
            SET s3_access_key_id='{settings.minio_access_key}';
            SET s3_secret_access_key='{settings.minio_secret_key}';
            SET s3_use_ssl=false;
            SET s3_url_style='path';
        """)
        conn.execute(f"""
            COPY (
                SELECT * FROM postgres_scan('{_pg_conn()}', 'public', '{req.table}')
                WHERE {req.where_clause}
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
