import io
import boto3
import pandas as pd
from config import settings


def _client():
    return boto3.client(
        "s3",
        endpoint_url=settings.minio_endpoint,
        aws_access_key_id=settings.minio_access_key,
        aws_secret_access_key=settings.minio_secret_key,
    )


def list_datasets() -> list[dict]:
    s3 = _client()
    resp = s3.list_objects_v2(Bucket=settings.analytics_bucket)
    return [
        {
            "key": o["Key"],
            "size": o["Size"],
            "lastModified": str(o["LastModified"]),
        }
        for o in resp.get("Contents", [])
        if o["Key"].endswith(".parquet")
    ]


def upload_csv_as_parquet(data: bytes, name: str) -> str:
    df = pd.read_csv(io.BytesIO(data))
    buf = io.BytesIO()
    df.to_parquet(buf, index=False, compression="snappy")
    buf.seek(0)
    key = f"uploads/{name}.parquet"
    _client().upload_fileobj(buf, settings.analytics_bucket, key)
    return key
