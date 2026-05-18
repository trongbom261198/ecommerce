CREATE TABLE products (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id   UUID          REFERENCES categories(id),
    name          VARCHAR(500)  NOT NULL,
    slug          VARCHAR(500)  NOT NULL UNIQUE,
    description   TEXT,
    brand         VARCHAR(255),
    base_price    DECIMAL(19,4) NOT NULL DEFAULT 0,
    status        VARCHAR(50)   NOT NULL DEFAULT 'ACTIVE',
    attributes    JSONB         DEFAULT '{}',
    images        JSONB         DEFAULT '[]',
    es_synced     BOOLEAN       NOT NULL DEFAULT false,
    es_synced_at  TIMESTAMP WITH TIME ZONE,
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_products_category_id ON products(category_id);
CREATE INDEX idx_products_slug        ON products(slug);
CREATE INDEX idx_products_status      ON products(status);
CREATE INDEX idx_products_attributes  ON products USING gin(attributes);

CREATE TABLE skus (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id    UUID          NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku_code      VARCHAR(100)  NOT NULL UNIQUE,
    variant_name  VARCHAR(255),
    attributes    JSONB         DEFAULT '{}',
    price         DECIMAL(19,4) NOT NULL,
    cost_price    DECIMAL(19,4),
    weight_grams  INT,
    active        BOOLEAN       NOT NULL DEFAULT true,
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_skus_product_id ON skus(product_id);
CREATE INDEX idx_skus_sku_code   ON skus(sku_code);
