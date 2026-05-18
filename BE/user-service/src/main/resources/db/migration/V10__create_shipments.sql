CREATE TABLE shipments (
    id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id              UUID         NOT NULL REFERENCES orders(id),
    tracking_number       VARCHAR(100) UNIQUE,
    carrier               VARCHAR(100),
    carrier_tracking_url  VARCHAR(500),
    status                VARCHAR(50)  NOT NULL DEFAULT 'PENDING',
    from_warehouse_id     UUID         REFERENCES warehouses(id),
    estimated_delivery    TIMESTAMP WITH TIME ZONE,
    actual_delivery       TIMESTAMP WITH TIME ZONE,
    route_data            JSONB        DEFAULT '{}',
    sla_deadline          TIMESTAMP WITH TIME ZONE,
    created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_shipments_order_id         ON shipments(order_id);
CREATE INDEX idx_shipments_status           ON shipments(status);
CREATE INDEX idx_shipments_tracking_number  ON shipments(tracking_number);
