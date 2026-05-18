-- Track which users have purchased (and received) which products
CREATE TABLE purchased_products (
    user_id            UUID      NOT NULL,
    product_id         UUID      NOT NULL,
    first_delivered_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, product_id)
);
CREATE INDEX idx_purchased_user ON purchased_products(user_id);

-- Product reviews: one review per user per product
CREATE TABLE reviews (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID         NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id    UUID         NOT NULL,
    user_name  VARCHAR(255) NOT NULL,
    rating     SMALLINT     NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment    TEXT,
    created_at TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP    NOT NULL DEFAULT NOW(),
    UNIQUE (product_id, user_id)
);
CREATE INDEX idx_reviews_product ON reviews(product_id, created_at DESC);

-- Denormalised aggregates on products table
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS avg_rating   NUMERIC(3,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS review_count INTEGER       NOT NULL DEFAULT 0;
