CREATE TABLE addresses (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label           VARCHAR(100),
    recipient_name  VARCHAR(255) NOT NULL,
    phone           VARCHAR(20)  NOT NULL,
    street_address  TEXT         NOT NULL,
    ward            VARCHAR(100),
    district        VARCHAR(100),
    province        VARCHAR(100) NOT NULL,
    country         VARCHAR(50)  NOT NULL DEFAULT 'VN',
    postal_code     VARCHAR(20),
    latitude        DECIMAL(10, 8),
    longitude       DECIMAL(11, 8),
    is_default      BOOLEAN      NOT NULL DEFAULT false,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_addresses_user_id ON addresses(user_id);
