CREATE SCHEMA IF NOT EXISTS analytics_metadata;

CREATE TABLE IF NOT EXISTS analytics_metadata.query_history (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL,
    language    VARCHAR(10) NOT NULL,
    code        TEXT NOT NULL,
    row_count   INTEGER,
    exec_ms     INTEGER,
    status      VARCHAR(10) NOT NULL DEFAULT 'success',
    error_msg   TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qh_user_id     ON analytics_metadata.query_history(user_id);
CREATE INDEX IF NOT EXISTS idx_qh_created_at  ON analytics_metadata.query_history(created_at DESC);

CREATE TABLE IF NOT EXISTS analytics_metadata.dataset_catalog (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         VARCHAR(255) NOT NULL UNIQUE,
    description  TEXT,
    minio_key    VARCHAR(500) NOT NULL,
    row_count    BIGINT,
    size_bytes   BIGINT,
    source_type  VARCHAR(20) NOT NULL DEFAULT 'upload',
    schema_json  TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
