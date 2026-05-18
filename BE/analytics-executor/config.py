from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    minio_endpoint: str = "http://minio:9000"
    minio_endpoint_internal: str = "minio:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    analytics_bucket: str = "analytics-data"
    max_result_rows: int = 10_000
    sql_timeout_sec: int = 60
    script_timeout_sec: int = 30
    postgres_host: str = "postgres"
    postgres_db: str = "ecommerce"
    postgres_user: str = "postgres"
    postgres_password: str = "postgres"

    model_config = {"env_file": ".env", "case_sensitive": False}


settings = Settings()
