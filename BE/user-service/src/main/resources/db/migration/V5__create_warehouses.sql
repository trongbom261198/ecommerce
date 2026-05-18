CREATE TABLE warehouses (
    id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255)  NOT NULL,
    code        VARCHAR(50)   NOT NULL UNIQUE,
    address     TEXT          NOT NULL,
    province    VARCHAR(100),
    latitude    DECIMAL(10,8),
    longitude   DECIMAL(11,8),
    active      BOOLEAN       NOT NULL DEFAULT true,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO warehouses (id, name, code, address, province, latitude, longitude)
VALUES
    (gen_random_uuid(), N'Kho Hà Nội',  'HN-01',  N'123 Nguyễn Văn Linh, Hà Nội',     N'Hà Nội',  21.0245, 105.8412),
    (gen_random_uuid(), N'Kho TP.HCM', 'HCM-01', N'456 Điện Biên Phủ, TP.HCM',       N'TP.HCM',  10.7769, 106.7009);
