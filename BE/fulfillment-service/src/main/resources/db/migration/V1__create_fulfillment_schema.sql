-- =============================================================================
-- V1 - Fulfillment service schema: fulfillment_tasks + fulfillment_task_items
-- =============================================================================

CREATE TABLE IF NOT EXISTS fulfillment_tasks (
    id              UUID PRIMARY KEY,
    order_id        VARCHAR(255) NOT NULL,
    shipment_id     VARCHAR(255),
    status          VARCHAR(50)  NOT NULL DEFAULT 'PENDING',
    warehouse_id    UUID,
    sla_deadline    TIMESTAMP,
    assigned_at     TIMESTAMP,
    picked_at       TIMESTAMP,
    packed_at       TIMESTAMP,
    assigned_to     UUID,
    created_at      TIMESTAMP,
    updated_at      TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fulfillment_task_items (
    task_id          UUID         NOT NULL REFERENCES fulfillment_tasks(id),
    sku_id           UUID,
    sku_code         VARCHAR(255),
    quantity         INTEGER      NOT NULL,
    picked_quantity  INTEGER      NOT NULL DEFAULT 0
);
