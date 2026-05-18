CREATE TABLE payments (
    id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id            UUID          NOT NULL REFERENCES orders(id),
    vnp_txn_ref         VARCHAR(100)  NOT NULL UNIQUE,
    amount              DECIMAL(19,2) NOT NULL,
    status              VARCHAR(20)   NOT NULL DEFAULT 'PENDING',
    vnp_response_code   VARCHAR(10),
    vnp_transaction_no  VARCHAR(50),
    vnp_bank_code       VARCHAR(20),
    vnp_pay_date        VARCHAR(20),
    raw_response        TEXT,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_payments_order_id    ON payments(order_id);
CREATE INDEX idx_payments_vnp_txn_ref ON payments(vnp_txn_ref);
CREATE INDEX idx_payments_status      ON payments(status);
