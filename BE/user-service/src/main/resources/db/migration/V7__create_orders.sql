CREATE TABLE orders (
    id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID          NOT NULL REFERENCES users(id),
    order_number     VARCHAR(50)   NOT NULL UNIQUE,
    status           VARCHAR(50)   NOT NULL DEFAULT 'PENDING',
    subtotal         DECIMAL(19,4) NOT NULL,
    shipping_fee     DECIMAL(19,4) NOT NULL DEFAULT 0,
    discount_amount  DECIMAL(19,4) NOT NULL DEFAULT 0,
    total_amount     DECIMAL(19,4) NOT NULL,
    shipping_address JSONB         NOT NULL,
    payment_method   VARCHAR(50),
    payment_status   VARCHAR(50)   NOT NULL DEFAULT 'PENDING',
    notes            TEXT,
    warehouse_id     UUID          REFERENCES warehouses(id),
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_orders_user_id      ON orders(user_id);
CREATE INDEX idx_orders_status       ON orders(status);
CREATE INDEX idx_orders_order_number ON orders(order_number);
CREATE INDEX idx_orders_created_at   ON orders(created_at DESC);
