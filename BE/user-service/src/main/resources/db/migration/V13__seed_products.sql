-- =============================================================================
-- V13 - Seed data: sample products & SKUs
-- Depends on V12 categories (electronics, fashion, home-living, sports, books)
-- =============================================================================

-- ─── ELECTRONICS / SMARTPHONES ───────────────────────────────────────────────

INSERT INTO products (id, category_id, name, slug, description, brand, base_price, status, attributes, images)
VALUES
(
    'a1000001-0000-0000-0000-000000000001',
    (SELECT id FROM categories WHERE slug = 'smartphones'),
    'iPhone 15 Pro',
    'iphone-15-pro',
    'Apple iPhone 15 Pro with A17 Pro chip, titanium design, and 48MP camera system.',
    'Apple',
    29990000,
    'ACTIVE',
    '{"screen":"6.1 inch Super Retina XDR","chip":"A17 Pro","camera":"48MP + 12MP + 12MP","battery":"3274mAh","os":"iOS 17"}',
    '["/images/iphone15pro-1.jpg","/images/iphone15pro-2.jpg"]'
),
(
    'a1000001-0000-0000-0000-000000000002',
    (SELECT id FROM categories WHERE slug = 'smartphones'),
    'Samsung Galaxy S24 Ultra',
    'samsung-galaxy-s24-ultra',
    'Samsung Galaxy S24 Ultra with Snapdragon 8 Gen 3, built-in S Pen, and 200MP camera.',
    'Samsung',
    27990000,
    'ACTIVE',
    '{"screen":"6.8 inch Dynamic AMOLED 2X","chip":"Snapdragon 8 Gen 3","camera":"200MP + 12MP + 10MP + 10MP","battery":"5000mAh","os":"Android 14"}',
    '["/images/s24ultra-1.jpg","/images/s24ultra-2.jpg"]'
),
(
    'a1000001-0000-0000-0000-000000000003',
    (SELECT id FROM categories WHERE slug = 'smartphones'),
    'Xiaomi 14 Pro',
    'xiaomi-14-pro',
    'Xiaomi 14 Pro with Leica-tuned cameras, Snapdragon 8 Gen 3 and 120W fast charging.',
    'Xiaomi',
    19990000,
    'ACTIVE',
    '{"screen":"6.73 inch LTPO AMOLED","chip":"Snapdragon 8 Gen 3","camera":"50MP + 50MP + 50MP","battery":"4880mAh","os":"Android 14"}',
    '["/images/xiaomi14pro-1.jpg"]'
);

INSERT INTO skus (id, product_id, sku_code, variant_name, attributes, price, cost_price, weight_grams, active)
VALUES
-- iPhone 15 Pro SKUs
('b1000001-0000-0000-0000-000000000001','a1000001-0000-0000-0000-000000000001','IP15P-128-BLK','128GB Black Titanium','{"storage":"128GB","color":"Black Titanium"}',29990000,22000000,187,true),
('b1000001-0000-0000-0000-000000000002','a1000001-0000-0000-0000-000000000001','IP15P-256-BLK','256GB Black Titanium','{"storage":"256GB","color":"Black Titanium"}',32990000,24000000,187,true),
('b1000001-0000-0000-0000-000000000003','a1000001-0000-0000-0000-000000000001','IP15P-256-WHT','256GB White Titanium','{"storage":"256GB","color":"White Titanium"}',32990000,24000000,187,true),
('b1000001-0000-0000-0000-000000000004','a1000001-0000-0000-0000-000000000001','IP15P-512-BLK','512GB Black Titanium','{"storage":"512GB","color":"Black Titanium"}',38990000,28000000,187,true),
-- S24 Ultra SKUs
('b1000001-0000-0000-0000-000000000011','a1000001-0000-0000-0000-000000000002','S24U-256-BLK','256GB Titanium Black','{"storage":"256GB","color":"Titanium Black"}',27990000,20000000,232,true),
('b1000001-0000-0000-0000-000000000012','a1000001-0000-0000-0000-000000000002','S24U-512-BLK','512GB Titanium Black','{"storage":"512GB","color":"Titanium Black"}',32990000,23000000,232,true),
('b1000001-0000-0000-0000-000000000013','a1000001-0000-0000-0000-000000000002','S24U-256-GRY','256GB Titanium Gray','{"storage":"256GB","color":"Titanium Gray"}',27990000,20000000,232,true),
-- Xiaomi 14 Pro SKUs
('b1000001-0000-0000-0000-000000000021','a1000001-0000-0000-0000-000000000003','MI14P-256-BLK','256GB Black','{"storage":"256GB","color":"Black"}',19990000,14000000,223,true),
('b1000001-0000-0000-0000-000000000022','a1000001-0000-0000-0000-000000000003','MI14P-512-WHT','512GB White','{"storage":"512GB","color":"White"}',22990000,16000000,223,true);

-- ─── ELECTRONICS / LAPTOPS ───────────────────────────────────────────────────

INSERT INTO products (id, category_id, name, slug, description, brand, base_price, status, attributes, images)
VALUES
(
    'a1000002-0000-0000-0000-000000000001',
    (SELECT id FROM categories WHERE slug = 'laptops'),
    'MacBook Pro 14 M3',
    'macbook-pro-14-m3',
    'Apple MacBook Pro 14-inch with M3 chip, Liquid Retina XDR display and up to 18 hours battery life.',
    'Apple',
    49990000,
    'ACTIVE',
    '{"screen":"14.2 inch Liquid Retina XDR","chip":"Apple M3","ram":"8GB","storage":"512GB SSD","battery":"70Wh","os":"macOS Sonoma"}',
    '["/images/mbp14m3-1.jpg","/images/mbp14m3-2.jpg"]'
),
(
    'a1000002-0000-0000-0000-000000000002',
    (SELECT id FROM categories WHERE slug = 'laptops'),
    'Dell XPS 15 2024',
    'dell-xps-15-2024',
    'Dell XPS 15 with Intel Core Ultra 9, OLED display, and NVIDIA GeForce RTX 4060.',
    'Dell',
    42990000,
    'ACTIVE',
    '{"screen":"15.6 inch OLED 3.5K","chip":"Intel Core Ultra 9 185H","ram":"16GB DDR5","storage":"512GB SSD","gpu":"NVIDIA RTX 4060","os":"Windows 11"}',
    '["/images/xps15-1.jpg"]'
),
(
    'a1000002-0000-0000-0000-000000000003',
    (SELECT id FROM categories WHERE slug = 'laptops'),
    'ASUS ROG Zephyrus G14 2024',
    'asus-rog-zephyrus-g14-2024',
    'ASUS ROG Zephyrus G14 gaming laptop with AMD Ryzen 9 and RX 7600S.',
    'ASUS',
    34990000,
    'ACTIVE',
    '{"screen":"14 inch OLED 2.8K 120Hz","chip":"AMD Ryzen 9 8945HS","ram":"16GB LPDDR5","storage":"1TB SSD","gpu":"AMD RX 7600S","os":"Windows 11"}',
    '["/images/rog-g14-1.jpg"]'
);

INSERT INTO skus (id, product_id, sku_code, variant_name, attributes, price, cost_price, weight_grams, active)
VALUES
-- MacBook Pro 14 M3
('b1000002-0000-0000-0000-000000000001','a1000002-0000-0000-0000-000000000001','MBP14-M3-8-512','M3 / 8GB / 512GB','{"chip":"M3","ram":"8GB","storage":"512GB"}',49990000,37000000,1600,true),
('b1000002-0000-0000-0000-000000000002','a1000002-0000-0000-0000-000000000001','MBP14-M3-16-512','M3 / 16GB / 512GB','{"chip":"M3","ram":"16GB","storage":"512GB"}',57990000,43000000,1600,true),
('b1000002-0000-0000-0000-000000000003','a1000002-0000-0000-0000-000000000001','MBP14-M3P-18-1T','M3 Pro / 18GB / 1TB','{"chip":"M3 Pro","ram":"18GB","storage":"1TB"}',69990000,52000000,1600,true),
-- Dell XPS 15
('b1000002-0000-0000-0000-000000000011','a1000002-0000-0000-0000-000000000002','XPS15-16-512','16GB / 512GB','{"ram":"16GB","storage":"512GB"}',42990000,32000000,1860,true),
('b1000002-0000-0000-0000-000000000012','a1000002-0000-0000-0000-000000000002','XPS15-32-1T','32GB / 1TB','{"ram":"32GB","storage":"1TB"}',52990000,39000000,1860,true),
-- ROG Zephyrus G14
('b1000002-0000-0000-0000-000000000021','a1000002-0000-0000-0000-000000000003','ROG-G14-16-512','16GB / 512GB','{"ram":"16GB","storage":"512GB"}',34990000,26000000,1650,true),
('b1000002-0000-0000-0000-000000000022','a1000002-0000-0000-0000-000000000003','ROG-G14-32-1T','32GB / 1TB','{"ram":"32GB","storage":"1TB"}',39990000,30000000,1650,true);

-- ─── ELECTRONICS / HEADPHONES ────────────────────────────────────────────────

INSERT INTO products (id, category_id, name, slug, description, brand, base_price, status, attributes, images)
VALUES
(
    'a1000003-0000-0000-0000-000000000001',
    (SELECT id FROM categories WHERE slug = 'headphones'),
    'Sony WH-1000XM5',
    'sony-wh-1000xm5',
    'Sony WH-1000XM5 wireless noise-cancelling headphones with 30-hour battery life.',
    'Sony',
    8490000,
    'ACTIVE',
    '{"type":"Over-ear","connectivity":"Bluetooth 5.2","noiseCancelling":true,"battery":"30h","foldable":false}',
    '["/images/wh1000xm5-1.jpg"]'
),
(
    'a1000003-0000-0000-0000-000000000002',
    (SELECT id FROM categories WHERE slug = 'headphones'),
    'Apple AirPods Pro 2',
    'apple-airpods-pro-2',
    'AirPods Pro 2nd generation with H2 chip, Adaptive Transparency, and Personalized Spatial Audio.',
    'Apple',
    6490000,
    'ACTIVE',
    '{"type":"In-ear","connectivity":"Bluetooth 5.3","noiseCancelling":true,"battery":"6h (30h with case)","waterResistance":"IPX4"}',
    '["/images/airpods-pro2-1.jpg"]'
);

INSERT INTO skus (id, product_id, sku_code, variant_name, attributes, price, cost_price, weight_grams, active)
VALUES
('b1000003-0000-0000-0000-000000000001','a1000003-0000-0000-0000-000000000001','SONYWH-BLK','Black','{"color":"Black"}',8490000,5500000,250,true),
('b1000003-0000-0000-0000-000000000002','a1000003-0000-0000-0000-000000000001','SONYWH-SLV','Silver','{"color":"Silver"}',8490000,5500000,250,true),
('b1000003-0000-0000-0000-000000000011','a1000003-0000-0000-0000-000000000002','APP2-WHT','White','{"color":"White"}',6490000,4200000,51,true);

-- ─── FASHION / SHOES ─────────────────────────────────────────────────────────

INSERT INTO products (id, category_id, name, slug, description, brand, base_price, status, attributes, images)
VALUES
(
    'a1000004-0000-0000-0000-000000000001',
    (SELECT id FROM categories WHERE slug = 'shoes'),
    'Nike Air Force 1 Low',
    'nike-air-force-1-low',
    'Classic Nike Air Force 1 Low with padded collar and Air-Sole unit for lightweight cushioning.',
    'Nike',
    2490000,
    'ACTIVE',
    '{"type":"Sneaker","material":"Leather","closure":"Lace-up","sole":"Rubber"}',
    '["/images/af1-white-1.jpg","/images/af1-white-2.jpg"]'
),
(
    'a1000004-0000-0000-0000-000000000002',
    (SELECT id FROM categories WHERE slug = 'shoes'),
    'Adidas Ultraboost 23',
    'adidas-ultraboost-23',
    'Adidas Ultraboost 23 running shoes with responsive BOOST midsole and Primeknit upper.',
    'Adidas',
    3690000,
    'ACTIVE',
    '{"type":"Running","material":"Primeknit","sole":"BOOST midsole","technology":"Continental rubber outsole"}',
    '["/images/ultraboost23-1.jpg"]'
),
(
    'a1000004-0000-0000-0000-000000000003',
    (SELECT id FROM categories WHERE slug = 'shoes'),
    'Converse Chuck Taylor All Star',
    'converse-chuck-taylor-all-star',
    'The iconic Converse Chuck Taylor All Star canvas sneaker.',
    'Converse',
    1290000,
    'ACTIVE',
    '{"type":"Sneaker","material":"Canvas","closure":"Lace-up","sole":"Rubber"}',
    '["/images/converse-1.jpg"]'
);

INSERT INTO skus (id, product_id, sku_code, variant_name, attributes, price, cost_price, weight_grams, active)
VALUES
-- Nike AF1
('b1000004-0000-0000-0000-000000000001','a1000004-0000-0000-0000-000000000001','AF1-WHT-40','White / Size 40','{"color":"White","size":"40"}',2490000,1400000,900,true),
('b1000004-0000-0000-0000-000000000002','a1000004-0000-0000-0000-000000000001','AF1-WHT-41','White / Size 41','{"color":"White","size":"41"}',2490000,1400000,900,true),
('b1000004-0000-0000-0000-000000000003','a1000004-0000-0000-0000-000000000001','AF1-WHT-42','White / Size 42','{"color":"White","size":"42"}',2490000,1400000,900,true),
('b1000004-0000-0000-0000-000000000004','a1000004-0000-0000-0000-000000000001','AF1-WHT-43','White / Size 43','{"color":"White","size":"43"}',2490000,1400000,900,true),
('b1000004-0000-0000-0000-000000000005','a1000004-0000-0000-0000-000000000001','AF1-BLK-42','Black / Size 42','{"color":"Black","size":"42"}',2490000,1400000,900,true),
-- Adidas Ultraboost
('b1000004-0000-0000-0000-000000000011','a1000004-0000-0000-0000-000000000002','UB23-WHT-40','White / Size 40','{"color":"White","size":"40"}',3690000,2200000,310,true),
('b1000004-0000-0000-0000-000000000012','a1000004-0000-0000-0000-000000000002','UB23-WHT-42','White / Size 42','{"color":"White","size":"42"}',3690000,2200000,310,true),
('b1000004-0000-0000-0000-000000000013','a1000004-0000-0000-0000-000000000002','UB23-BLK-42','Black / Size 42','{"color":"Black","size":"42"}',3690000,2200000,310,true),
-- Converse
('b1000004-0000-0000-0000-000000000021','a1000004-0000-0000-0000-000000000003','CT-WHT-39','White / Size 39','{"color":"White","size":"39"}',1290000,700000,420,true),
('b1000004-0000-0000-0000-000000000022','a1000004-0000-0000-0000-000000000003','CT-WHT-41','White / Size 41','{"color":"White","size":"41"}',1290000,700000,420,true),
('b1000004-0000-0000-0000-000000000023','a1000004-0000-0000-0000-000000000003','CT-BLK-41','Black / Size 41','{"color":"Black","size":"41"}',1290000,700000,420,true);

-- ─── FASHION / MEN CLOTHING ──────────────────────────────────────────────────

INSERT INTO products (id, category_id, name, slug, description, brand, base_price, status, attributes, images)
VALUES
(
    'a1000005-0000-0000-0000-000000000001',
    (SELECT id FROM categories WHERE slug = 'mens-clothing'),
    'Uniqlo Ultra Light Down Jacket',
    'uniqlo-ultra-light-down-jacket',
    'Uniqlo Ultra Light Down Jacket — packable, windproof, and incredibly warm.',
    'Uniqlo',
    890000,
    'ACTIVE',
    '{"material":"90% Down 10% Feather","feature":"Packable","fit":"Regular"}',
    '["/images/uniqlo-down-1.jpg"]'
),
(
    'a1000005-0000-0000-0000-000000000002',
    (SELECT id FROM categories WHERE slug = 'mens-clothing'),
    'Levi''s 511 Slim Fit Jeans',
    'levis-511-slim-fit-jeans',
    'Classic Levi''s 511 slim fit jeans with stretch denim for all-day comfort.',
    'Levi''s',
    1290000,
    'ACTIVE',
    '{"material":"99% Cotton 1% Elastane","fit":"Slim","rise":"Mid-rise","closure":"Button fly"}',
    '["/images/levis511-1.jpg"]'
);

INSERT INTO skus (id, product_id, sku_code, variant_name, attributes, price, cost_price, weight_grams, active)
VALUES
-- Uniqlo Down Jacket
('b1000005-0000-0000-0000-000000000001','a1000005-0000-0000-0000-000000000001','UQDJ-NVY-S','Navy / S','{"color":"Navy","size":"S"}',890000,450000,210,true),
('b1000005-0000-0000-0000-000000000002','a1000005-0000-0000-0000-000000000001','UQDJ-NVY-M','Navy / M','{"color":"Navy","size":"M"}',890000,450000,230,true),
('b1000005-0000-0000-0000-000000000003','a1000005-0000-0000-0000-000000000001','UQDJ-NVY-L','Navy / L','{"color":"Navy","size":"L"}',890000,450000,250,true),
('b1000005-0000-0000-0000-000000000004','a1000005-0000-0000-0000-000000000001','UQDJ-BLK-M','Black / M','{"color":"Black","size":"M"}',890000,450000,230,true),
-- Levi's 511
('b1000005-0000-0000-0000-000000000011','a1000005-0000-0000-0000-000000000002','LV511-IND-30','Indigo / 30x32','{"color":"Indigo","waist":"30","length":"32"}',1290000,700000,600,true),
('b1000005-0000-0000-0000-000000000012','a1000005-0000-0000-0000-000000000002','LV511-IND-32','Indigo / 32x32','{"color":"Indigo","waist":"32","length":"32"}',1290000,700000,620,true),
('b1000005-0000-0000-0000-000000000013','a1000005-0000-0000-0000-000000000002','LV511-BLK-32','Black / 32x32','{"color":"Black","waist":"32","length":"32"}',1290000,700000,620,true);

-- ─── SPORTS ──────────────────────────────────────────────────────────────────

INSERT INTO products (id, category_id, name, slug, description, brand, base_price, status, attributes, images)
VALUES
(
    'a1000006-0000-0000-0000-000000000001',
    (SELECT id FROM categories WHERE slug = 'sports'),
    'Garmin Forerunner 265',
    'garmin-forerunner-265',
    'Garmin Forerunner 265 GPS running smartwatch with AMOLED display and training readiness.',
    'Garmin',
    9990000,
    'ACTIVE',
    '{"display":"AMOLED 1.3 inch","gps":true,"heartRate":true,"battery":"13 days smartwatch mode","waterResistance":"5ATM"}',
    '["/images/garmin265-1.jpg"]'
),
(
    'a1000006-0000-0000-0000-000000000002',
    (SELECT id FROM categories WHERE slug = 'sports'),
    'Yonex Nanoray 900',
    'yonex-nanoray-900',
    'Yonex Nanoray 900 badminton racket — ultra-thin frame for superior repulsion power.',
    'Yonex',
    2990000,
    'ACTIVE',
    '{"weight":"83g","balance":"Head Light","flex":"Stiff","shaft":"HM Graphite + Tungsten"}',
    '["/images/nanoray900-1.jpg"]'
);

INSERT INTO skus (id, product_id, sku_code, variant_name, attributes, price, cost_price, weight_grams, active)
VALUES
-- Garmin 265
('b1000006-0000-0000-0000-000000000001','a1000006-0000-0000-0000-000000000001','GF265-BLK','Black','{"color":"Black"}',9990000,7000000,47,true),
('b1000006-0000-0000-0000-000000000002','a1000006-0000-0000-0000-000000000001','GF265-WHT','White','{"color":"White"}',9990000,7000000,47,true),
-- Yonex NR900
('b1000006-0000-0000-0000-000000000011','a1000006-0000-0000-0000-000000000002','NR900-4U','4U (80-84g)','{"weight":"4U","grip":"G5"}',2990000,1800000,83,true),
('b1000006-0000-0000-0000-000000000012','a1000006-0000-0000-0000-000000000002','NR900-3U','3U (85-89g)','{"weight":"3U","grip":"G4"}',2990000,1800000,87,true);

-- ─── BOOKS ───────────────────────────────────────────────────────────────────

INSERT INTO products (id, category_id, name, slug, description, brand, base_price, status, attributes, images)
VALUES
(
    'a1000007-0000-0000-0000-000000000001',
    (SELECT id FROM categories WHERE slug = 'books'),
    'Atomic Habits',
    'atomic-habits',
    'James Clear''s #1 New York Times bestseller about building good habits and breaking bad ones.',
    'Random House',
    189000,
    'ACTIVE',
    '{"author":"James Clear","publisher":"Random House","pages":320,"language":"English","isbn":"978-0735211292"}',
    '["/images/atomic-habits-1.jpg"]'
),
(
    'a1000007-0000-0000-0000-000000000002',
    (SELECT id FROM categories WHERE slug = 'books'),
    'Clean Code',
    'clean-code',
    'Robert C. Martin''s handbook of agile software craftsmanship.',
    'Prentice Hall',
    299000,
    'ACTIVE',
    '{"author":"Robert C. Martin","publisher":"Prentice Hall","pages":431,"language":"English","isbn":"978-0132350884"}',
    '["/images/clean-code-1.jpg"]'
);

INSERT INTO skus (id, product_id, sku_code, variant_name, attributes, price, cost_price, weight_grams, active)
VALUES
('b1000007-0000-0000-0000-000000000001','a1000007-0000-0000-0000-000000000001','BOOK-ATHMB-PB','Paperback','{"format":"Paperback"}',189000,90000,300,true),
('b1000007-0000-0000-0000-000000000002','a1000007-0000-0000-0000-000000000002','BOOK-CLNCD-PB','Paperback','{"format":"Paperback"}',299000,140000,500,true);
