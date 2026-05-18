CREATE TABLE order_events (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id     UUID         NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    event_type   VARCHAR(100) NOT NULL,
    from_status  VARCHAR(50),
    to_status    VARCHAR(50),
    description  TEXT,
    actor_id     UUID,
    actor_type   VARCHAR(50),
    metadata     JSONB        DEFAULT '{}',
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_order_events_order_id   ON order_events(order_id);
CREATE INDEX idx_order_events_created_at ON order_events(created_at DESC);
