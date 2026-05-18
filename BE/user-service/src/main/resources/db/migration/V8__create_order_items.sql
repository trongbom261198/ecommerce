CREATE TABLE order_items (
    id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id          UUID          NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    sku_id            UUID          NOT NULL REFERENCES skus(id),
    product_id        UUID          NOT NULL REFERENCES products(id),
    product_name      VARCHAR(500)  NOT NULL,
    sku_code          VARCHAR(100)  NOT NULL,
    variant_name      VARCHAR(255),
    quantity          INT           NOT NULL,
    unit_price        DECIMAL(19,4) NOT NULL,
    subtotal          DECIMAL(19,4) NOT NULL,
    product_snapshot  JSONB         DEFAULT '{}'
);

CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_sku_id   ON order_items(sku_id);
