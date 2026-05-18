CREATE TABLE inventory (
    id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    sku_id              UUID    NOT NULL REFERENCES skus(id),
    warehouse_id        UUID    NOT NULL REFERENCES warehouses(id),
    quantity_on_hand    INT     NOT NULL DEFAULT 0,
    quantity_reserved   INT     NOT NULL DEFAULT 0,
    safety_stock        INT     NOT NULL DEFAULT 10,
    version             BIGINT  NOT NULL DEFAULT 0,
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (sku_id, warehouse_id),
    CONSTRAINT chk_quantity_non_negative CHECK (quantity_on_hand  >= 0),
    CONSTRAINT chk_reserved_non_negative CHECK (quantity_reserved >= 0)
);

CREATE INDEX idx_inventory_sku_id       ON inventory(sku_id);
CREATE INDEX idx_inventory_warehouse_id ON inventory(warehouse_id);
