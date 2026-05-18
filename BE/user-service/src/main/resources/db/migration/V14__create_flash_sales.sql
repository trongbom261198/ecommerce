-- Flash sale campaign
CREATE TABLE flash_sales (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    status          VARCHAR(20)  NOT NULL DEFAULT 'DRAFT',  -- DRAFT|SCHEDULED|ACTIVE|ENDED|CANCELLED
    discount_type   VARCHAR(20)  NOT NULL,                  -- PERCENTAGE|FIXED
    discount_value  NUMERIC(19,4) NOT NULL,
    max_quantity    INT,                                     -- NULL = unlimited (across all items)
    sold_quantity   INT          NOT NULL DEFAULT 0,
    start_time      TIMESTAMPTZ  NOT NULL,
    end_time        TIMESTAMPTZ  NOT NULL,
    created_by      UUID,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_flash_sale_times CHECK (end_time > start_time),
    CONSTRAINT chk_discount_value    CHECK (discount_value > 0)
);

-- Per-SKU quota within a flash sale
CREATE TABLE flash_sale_items (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    flash_sale_id   UUID         NOT NULL REFERENCES flash_sales(id) ON DELETE CASCADE,
    sku_id          UUID         NOT NULL,
    product_id      UUID         NOT NULL,
    product_name    VARCHAR(500),
    original_price  NUMERIC(19,4) NOT NULL,
    sale_price      NUMERIC(19,4) NOT NULL,
    quota           INT          NOT NULL,    -- max units available for this SKU
    sold            INT          NOT NULL DEFAULT 0,
    CONSTRAINT uq_flash_sale_sku    UNIQUE (flash_sale_id, sku_id),
    CONSTRAINT chk_quota_positive   CHECK (quota > 0),
    CONSTRAINT chk_sold_non_neg     CHECK (sold >= 0),
    CONSTRAINT chk_sale_price       CHECK (sale_price >= 0)
);

CREATE INDEX idx_flash_sales_status       ON flash_sales(status);
CREATE INDEX idx_flash_sales_active_time  ON flash_sales(start_time, end_time) WHERE status = 'ACTIVE';
CREATE INDEX idx_flash_sale_items_sale    ON flash_sale_items(flash_sale_id);
CREATE INDEX idx_flash_sale_items_sku     ON flash_sale_items(sku_id);
