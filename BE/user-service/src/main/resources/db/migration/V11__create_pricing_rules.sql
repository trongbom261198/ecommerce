CREATE TABLE pricing_rules (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    rule_type   VARCHAR(100) NOT NULL,
    priority    INT          NOT NULL DEFAULT 0,
    conditions  JSONB        NOT NULL DEFAULT '{}',
    actions     JSONB        NOT NULL DEFAULT '{}',
    active      BOOLEAN      NOT NULL DEFAULT true,
    valid_from  TIMESTAMP WITH TIME ZONE,
    valid_until TIMESTAMP WITH TIME ZONE,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_pricing_rules_rule_type ON pricing_rules(rule_type);
CREATE INDEX idx_pricing_rules_active    ON pricing_rules(active);
