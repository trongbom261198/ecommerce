-- ============================================================
-- TEST DATA: Orders, Inventory, Shipments
-- 9 đơn hàng ở tất cả trạng thái + luồng inventory đầy đủ
--
-- Chạy: psql -U postgres -d ecommerce -f seed-test-data.sql
-- ============================================================

-- Warehouse IDs (lấy từ DB, không dùng gen_random_uuid)
-- HN-01  : 6472070f-12c9-429e-b7d7-a878d94205b3
-- HCM-01 : 273c9f80-cb56-4553-8005-ed07ee2af6c6

-- User IDs
-- admin@ecommerce.com         : 8a369511-e1a1-4632-b6e6-08f6089e8145
-- customer@ecommerce.com      : 9aeaa6cc-eabc-4d49-8200-9d36604befd9
-- trongnguyen261198@gmail.com : 16fc417d-1aa6-4280-805e-1503bf608a43

BEGIN;

-- ============================================================
-- BƯỚC 1: SEED INVENTORY - tất cả SKUs trong 2 kho
-- ============================================================
-- Mỗi SKU: 50 đơn vị trong HN-01 + 50 trong HCM-01
-- quantity_reserved sẽ được điều chỉnh bên dưới theo đơn hàng

INSERT INTO inventory (sku_id, warehouse_id, quantity_on_hand, quantity_reserved, safety_stock)
SELECT s.id, w.id, 50, 0, 10
FROM skus s
CROSS JOIN warehouses w
ON CONFLICT (sku_id, warehouse_id) DO NOTHING;

-- ============================================================
-- BƯỚC 2: TẠO THÊM KHÁCH HÀNG TEST
-- Password tất cả: Admin@123
-- ============================================================
INSERT INTO users (id, email, phone, password_hash, full_name, role, enabled, email_verified)
VALUES
  ('aaaaaaaa-0001-0000-0000-000000000001', 'nguyen.van.a@test.com', '+84901111001',
   '$2a$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Nguyễn Văn A', 'CUSTOMER', true, true),
  ('aaaaaaaa-0001-0000-0000-000000000002', 'tran.thi.b@test.com',  '+84901111002',
   '$2a$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Trần Thị B',  'CUSTOMER', true, true),
  ('aaaaaaaa-0001-0000-0000-000000000003', 'le.minh.c@test.com',   '+84901111003',
   '$2a$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Lê Minh C',   'CUSTOMER', true, true)
ON CONFLICT (email) DO NOTHING;

-- ============================================================
-- BƯỚC 3: ĐƠN HÀNG #1 — PENDING
-- Khách vừa đặt, chờ xác nhận tồn kho
-- Sản phẩm: iPhone 15 Pro 128GB Black x1
-- Kho chưa được gán, chưa reserve tồn kho
-- ============================================================
INSERT INTO orders (id, user_id, order_number, status, subtotal, shipping_fee, discount_amount, total_amount,
                    shipping_address, payment_method, payment_status, notes)
VALUES (
  'cccc0001-0000-0000-0000-000000000001',
  'aaaaaaaa-0001-0000-0000-000000000001',
  'ORD-2026-00001', 'PENDING',
  29990000, 30000, 0, 30020000,
  '{"recipientName":"Nguyễn Văn A","phone":"0901111001","address":"12 Lý Thường Kiệt","district":"Hoàn Kiếm","province":"Hà Nội"}',
  'COD', 'PENDING', NULL
);

INSERT INTO order_items (id, order_id, sku_id, product_id, product_name, sku_code, variant_name, quantity, unit_price, subtotal)
VALUES ('dddd0001-0000-0000-0000-000000000001', 'cccc0001-0000-0000-0000-000000000001',
  'b1000001-0000-0000-0000-000000000001', 'a1000001-0000-0000-0000-000000000001',
  'iPhone 15 Pro', 'IP15P-128-BLK', '128GB Black Titanium', 1, 29990000, 29990000);

INSERT INTO order_events (order_id, event_type, from_status, to_status, description, actor_type)
VALUES ('cccc0001-0000-0000-0000-000000000001', 'ORDER_PLACED', NULL, 'PENDING',
  'Đơn hàng được tạo, đang chờ xác nhận tồn kho', 'CUSTOMER');

-- ============================================================
-- BƯỚC 4: ĐƠN HÀNG #2 — CONFIRMED
-- Tồn kho đã được reserve, đơn chờ kho xử lý
-- Sản phẩm: Samsung Galaxy S24 Ultra 256G x1 + MacBook Pro 14 M3 x1
-- Kho: HCM-01
-- ============================================================
INSERT INTO orders (id, user_id, order_number, status, subtotal, shipping_fee, discount_amount, total_amount,
                    shipping_address, payment_method, payment_status, warehouse_id)
VALUES (
  'cccc0002-0000-0000-0000-000000000001',
  'aaaaaaaa-0001-0000-0000-000000000002',
  'ORD-2026-00002', 'CONFIRMED',
  77980000, 0, 0, 77980000,
  '{"recipientName":"Trần Thị B","phone":"0901111002","address":"88 Nguyễn Huệ","district":"Quận 1","province":"TP.HCM"}',
  'BANK_TRANSFER', 'PAID',
  '273c9f80-cb56-4553-8005-ed07ee2af6c6'  -- HCM-01
);

INSERT INTO order_items (id, order_id, sku_id, product_id, product_name, sku_code, variant_name, quantity, unit_price, subtotal)
VALUES
  ('dddd0002-0000-0000-0000-000000000001', 'cccc0002-0000-0000-0000-000000000001',
   'b1000001-0000-0000-0000-000000000011', 'a1000001-0000-0000-0000-000000000002',
   'Samsung Galaxy S24 Ultra', 'S24U-256-BLK', '256GB Titanium Black', 1, 27990000, 27990000),
  ('dddd0002-0000-0000-0000-000000000002', 'cccc0002-0000-0000-0000-000000000001',
   'b1000002-0000-0000-0000-000000000001', 'a1000002-0000-0000-0000-000000000001',
   'MacBook Pro 14 M3', 'MBP14-M3-8-512', 'M3 / 8GB / 512GB', 1, 49990000, 49990000);

INSERT INTO order_events (order_id, event_type, from_status, to_status, description, actor_type)
VALUES
  ('cccc0002-0000-0000-0000-000000000001', 'ORDER_PLACED', NULL, 'PENDING', 'Đơn hàng được tạo', 'CUSTOMER'),
  ('cccc0002-0000-0000-0000-000000000001', 'PAYMENT_CONFIRMED', 'PENDING', 'CONFIRMED',
   'Tồn kho đã reserve thành công tại kho HCM-01, đơn hàng xác nhận', 'SYSTEM');

-- Reserve tồn kho HCM-01 cho đơn #2
UPDATE inventory SET quantity_reserved = quantity_reserved + 1
WHERE sku_id = 'b1000001-0000-0000-0000-000000000011'
  AND warehouse_id = '273c9f80-cb56-4553-8005-ed07ee2af6c6';

UPDATE inventory SET quantity_reserved = quantity_reserved + 1
WHERE sku_id = 'b1000002-0000-0000-0000-000000000001'
  AND warehouse_id = '273c9f80-cb56-4553-8005-ed07ee2af6c6';

-- ============================================================
-- BƯỚC 5: ĐƠN HÀNG #3 — PROCESSING
-- Kho đã tiếp nhận, chuẩn bị phân công nhặt hàng
-- Sản phẩm: iPhone 15 Pro 256GB x1 + Nike AF1 White 42 x2
-- Kho: HN-01
-- ============================================================
INSERT INTO orders (id, user_id, order_number, status, subtotal, shipping_fee, discount_amount, total_amount,
                    shipping_address, payment_method, payment_status, warehouse_id)
VALUES (
  'cccc0003-0000-0000-0000-000000000001',
  '16fc417d-1aa6-4280-805e-1503bf608a43',
  'ORD-2026-00003', 'PROCESSING',
  37970000, 30000, 0, 38000000,
  '{"recipientName":"Trong Nguyen","phone":"0901261198","address":"15 Đinh Tiên Hoàng","district":"Hoàn Kiếm","province":"Hà Nội"}',
  'COD', 'PENDING',
  '6472070f-12c9-429e-b7d7-a878d94205b3'  -- HN-01
);

INSERT INTO order_items (id, order_id, sku_id, product_id, product_name, sku_code, variant_name, quantity, unit_price, subtotal)
VALUES
  ('dddd0003-0000-0000-0000-000000000001', 'cccc0003-0000-0000-0000-000000000001',
   'b1000001-0000-0000-0000-000000000002', 'a1000001-0000-0000-0000-000000000001',
   'iPhone 15 Pro', 'IP15P-256-BLK', '256GB Black Titanium', 1, 32990000, 32990000),
  ('dddd0003-0000-0000-0000-000000000002', 'cccc0003-0000-0000-0000-000000000001',
   'b1000004-0000-0000-0000-000000000003', 'a1000004-0000-0000-0000-000000000001',
   'Nike Air Force 1 Low', 'AF1-WHT-42', 'White / Size 42', 2, 2490000, 4980000);

INSERT INTO order_events (order_id, event_type, from_status, to_status, description, actor_type)
VALUES
  ('cccc0003-0000-0000-0000-000000000001', 'ORDER_PLACED', NULL, 'PENDING', 'Đơn hàng được tạo', 'CUSTOMER'),
  ('cccc0003-0000-0000-0000-000000000001', 'PAYMENT_CONFIRMED', 'PENDING', 'CONFIRMED',
   'Tồn kho reserve thành công tại HN-01', 'SYSTEM'),
  ('cccc0003-0000-0000-0000-000000000001', 'WAREHOUSE_ASSIGNED', 'CONFIRMED', 'PROCESSING',
   'Kho HN-01 tiếp nhận đơn, bắt đầu xử lý', 'SYSTEM');

-- Reserve tồn kho HN-01 cho đơn #3
UPDATE inventory SET quantity_reserved = quantity_reserved + 1
WHERE sku_id = 'b1000001-0000-0000-0000-000000000002'
  AND warehouse_id = '6472070f-12c9-429e-b7d7-a878d94205b3';

UPDATE inventory SET quantity_reserved = quantity_reserved + 2
WHERE sku_id = 'b1000004-0000-0000-0000-000000000003'
  AND warehouse_id = '6472070f-12c9-429e-b7d7-a878d94205b3';

-- ============================================================
-- BƯỚC 6: ĐƠN HÀNG #4 — PICKING
-- Nhân viên kho đang đi lấy hàng
-- Sản phẩm: Sony WH-1000XM5 Black x2
-- Kho: HCM-01
-- ============================================================
INSERT INTO orders (id, user_id, order_number, status, subtotal, shipping_fee, discount_amount, total_amount,
                    shipping_address, payment_method, payment_status, warehouse_id)
VALUES (
  'cccc0004-0000-0000-0000-000000000001',
  '9aeaa6cc-eabc-4d49-8200-9d36604befd9',
  'ORD-2026-00004', 'PICKING',
  16980000, 30000, 0, 17010000,
  '{"recipientName":"Sample Customer","phone":"0911111111","address":"20 Lê Lợi","district":"Quận 1","province":"TP.HCM"}',
  'COD', 'PENDING',
  '273c9f80-cb56-4553-8005-ed07ee2af6c6'  -- HCM-01
);

INSERT INTO order_items (id, order_id, sku_id, product_id, product_name, sku_code, variant_name, quantity, unit_price, subtotal)
VALUES ('dddd0004-0000-0000-0000-000000000001', 'cccc0004-0000-0000-0000-000000000001',
  'b1000003-0000-0000-0000-000000000001', 'a1000003-0000-0000-0000-000000000001',
  'Sony WH-1000XM5', 'SONYWH-BLK', 'Black', 2, 8490000, 16980000);

INSERT INTO order_events (order_id, event_type, from_status, to_status, description, actor_type)
VALUES
  ('cccc0004-0000-0000-0000-000000000001', 'ORDER_PLACED', NULL, 'PENDING', 'Đơn hàng được tạo', 'CUSTOMER'),
  ('cccc0004-0000-0000-0000-000000000001', 'PAYMENT_CONFIRMED', 'PENDING', 'CONFIRMED',
   'Tồn kho reserve tại HCM-01', 'SYSTEM'),
  ('cccc0004-0000-0000-0000-000000000001', 'WAREHOUSE_ASSIGNED', 'CONFIRMED', 'PROCESSING',
   'Kho HCM-01 tiếp nhận đơn', 'SYSTEM'),
  ('cccc0004-0000-0000-0000-000000000001', 'PICKING_STARTED', 'PROCESSING', 'PICKING',
   'Nhân viên kho bắt đầu nhặt hàng', 'STAFF');

-- Reserve tồn kho HCM-01 cho đơn #4
UPDATE inventory SET quantity_reserved = quantity_reserved + 2
WHERE sku_id = 'b1000003-0000-0000-0000-000000000001'
  AND warehouse_id = '273c9f80-cb56-4553-8005-ed07ee2af6c6';

-- ============================================================
-- BƯỚC 7: ĐƠN HÀNG #5 — PACKED
-- Hàng đã đóng gói, chờ vận chuyển đến lấy
-- Sản phẩm: AirPods Pro 2 x1 + Garmin Forerunner 265 Black x1
-- Kho: HN-01
-- ============================================================
INSERT INTO orders (id, user_id, order_number, status, subtotal, shipping_fee, discount_amount, total_amount,
                    shipping_address, payment_method, payment_status, warehouse_id)
VALUES (
  'cccc0005-0000-0000-0000-000000000001',
  'aaaaaaaa-0001-0000-0000-000000000003',
  'ORD-2026-00005', 'PACKED',
  16480000, 0, 0, 16480000,
  '{"recipientName":"Lê Minh C","phone":"0901111003","address":"55 Trần Phú","district":"Cầu Giấy","province":"Hà Nội"}',
  'BANK_TRANSFER', 'PAID',
  '6472070f-12c9-429e-b7d7-a878d94205b3'  -- HN-01
);

INSERT INTO order_items (id, order_id, sku_id, product_id, product_name, sku_code, variant_name, quantity, unit_price, subtotal)
VALUES
  ('dddd0005-0000-0000-0000-000000000001', 'cccc0005-0000-0000-0000-000000000001',
   'b1000003-0000-0000-0000-000000000011', 'a1000003-0000-0000-0000-000000000002',
   'Apple AirPods Pro 2', 'APP2-WHT', 'White', 1, 6490000, 6490000),
  ('dddd0005-0000-0000-0000-000000000002', 'cccc0005-0000-0000-0000-000000000001',
   'b1000006-0000-0000-0000-000000000001', 'a1000006-0000-0000-0000-000000000001',
   'Garmin Forerunner 265', 'GF265-BLK', 'Black', 1, 9990000, 9990000);

INSERT INTO order_events (order_id, event_type, from_status, to_status, description, actor_type)
VALUES
  ('cccc0005-0000-0000-0000-000000000001', 'ORDER_PLACED', NULL, 'PENDING', 'Đơn hàng được tạo', 'CUSTOMER'),
  ('cccc0005-0000-0000-0000-000000000001', 'PAYMENT_CONFIRMED', 'PENDING', 'CONFIRMED',
   'Thanh toán thành công, tồn kho reserve tại HN-01', 'SYSTEM'),
  ('cccc0005-0000-0000-0000-000000000001', 'WAREHOUSE_ASSIGNED', 'CONFIRMED', 'PROCESSING',
   'Kho HN-01 tiếp nhận', 'SYSTEM'),
  ('cccc0005-0000-0000-0000-000000000001', 'PICKING_STARTED', 'PROCESSING', 'PICKING',
   'Nhân viên bắt đầu nhặt hàng', 'STAFF'),
  ('cccc0005-0000-0000-0000-000000000001', 'PACKING_DONE', 'PICKING', 'PACKED',
   'Đóng gói hoàn tất, chờ vận chuyển đến lấy', 'STAFF');

-- Reserve tồn kho HN-01 cho đơn #5
UPDATE inventory SET quantity_reserved = quantity_reserved + 1
WHERE sku_id = 'b1000003-0000-0000-0000-000000000011'
  AND warehouse_id = '6472070f-12c9-429e-b7d7-a878d94205b3';

UPDATE inventory SET quantity_reserved = quantity_reserved + 1
WHERE sku_id = 'b1000006-0000-0000-0000-000000000001'
  AND warehouse_id = '6472070f-12c9-429e-b7d7-a878d94205b3';

-- ============================================================
-- BƯỚC 8: ĐƠN HÀNG #6 — SHIPPED
-- Đã giao cho vận chuyển, đang trên đường
-- Sản phẩm: Xiaomi 14 Pro 256GB Black x1
-- Kho: HCM-01 — Có bản ghi shipment
-- ============================================================
INSERT INTO orders (id, user_id, order_number, status, subtotal, shipping_fee, discount_amount, total_amount,
                    shipping_address, payment_method, payment_status, warehouse_id)
VALUES (
  'cccc0006-0000-0000-0000-000000000001',
  '16fc417d-1aa6-4280-805e-1503bf608a43',
  'ORD-2026-00006', 'SHIPPED',
  19990000, 0, 0, 19990000,
  '{"recipientName":"Trong Nguyen","phone":"0901261198","address":"200 Võ Thị Sáu","district":"Quận 3","province":"TP.HCM"}',
  'COD', 'PENDING',
  '273c9f80-cb56-4553-8005-ed07ee2af6c6'  -- HCM-01
);

INSERT INTO order_items (id, order_id, sku_id, product_id, product_name, sku_code, variant_name, quantity, unit_price, subtotal)
VALUES ('dddd0006-0000-0000-0000-000000000001', 'cccc0006-0000-0000-0000-000000000001',
  'b1000001-0000-0000-0000-000000000021', 'a1000001-0000-0000-0000-000000000003',
  'Xiaomi 14 Pro', 'MI14P-256-BLK', '256GB Black', 1, 19990000, 19990000);

INSERT INTO order_events (order_id, event_type, from_status, to_status, description, actor_type)
VALUES
  ('cccc0006-0000-0000-0000-000000000001', 'ORDER_PLACED', NULL, 'PENDING', 'Đơn hàng được tạo', 'CUSTOMER'),
  ('cccc0006-0000-0000-0000-000000000001', 'PAYMENT_CONFIRMED', 'PENDING', 'CONFIRMED',
   'Tồn kho reserve tại HCM-01', 'SYSTEM'),
  ('cccc0006-0000-0000-0000-000000000001', 'WAREHOUSE_ASSIGNED', 'CONFIRMED', 'PROCESSING',
   'Kho HCM-01 tiếp nhận', 'SYSTEM'),
  ('cccc0006-0000-0000-0000-000000000001', 'PICKING_STARTED', 'PROCESSING', 'PICKING',
   'Bắt đầu nhặt hàng', 'STAFF'),
  ('cccc0006-0000-0000-0000-000000000001', 'PACKING_DONE', 'PICKING', 'PACKED',
   'Đóng gói xong', 'STAFF'),
  ('cccc0006-0000-0000-0000-000000000001', 'CARRIER_PICKED_UP', 'PACKED', 'SHIPPED',
   'GHTK đã lấy hàng — mã vận đơn GHTK20260001', 'SYSTEM');

INSERT INTO shipments (id, order_id, tracking_number, carrier, carrier_tracking_url, status,
                       from_warehouse_id, estimated_delivery, sla_deadline)
VALUES (
  'eeee0006-0000-0000-0000-000000000001',
  'cccc0006-0000-0000-0000-000000000001',
  'GHTK20260001', 'GHTK',
  'https://track.ghtk.vn/GHTK20260001',
  'IN_TRANSIT',
  '273c9f80-cb56-4553-8005-ed07ee2af6c6',
  NOW() + INTERVAL '2 days',
  NOW() + INTERVAL '3 days'
);

-- Reserve tồn kho HCM-01 cho đơn #6
UPDATE inventory SET quantity_reserved = quantity_reserved + 1
WHERE sku_id = 'b1000001-0000-0000-0000-000000000021'
  AND warehouse_id = '273c9f80-cb56-4553-8005-ed07ee2af6c6';

-- ============================================================
-- BƯỚC 9: ĐƠN HÀNG #7 — DELIVERED
-- Giao thành công, hàng đã xuất kho thực tế
-- Sản phẩm: MacBook Pro M3 Pro 18GB/1TB x1
-- Kho: HN-01 — Tồn kho đã bị trừ (quantity_on_hand - 1)
-- ============================================================
INSERT INTO orders (id, user_id, order_number, status, subtotal, shipping_fee, discount_amount, total_amount,
                    shipping_address, payment_method, payment_status, warehouse_id)
VALUES (
  'cccc0007-0000-0000-0000-000000000001',
  '9aeaa6cc-eabc-4d49-8200-9d36604befd9',
  'ORD-2026-00007', 'DELIVERED',
  69990000, 0, 0, 69990000,
  '{"recipientName":"Sample Customer","phone":"0911111111","address":"30 Nguyễn Trãi","district":"Thanh Xuân","province":"Hà Nội"}',
  'BANK_TRANSFER', 'PAID',
  '6472070f-12c9-429e-b7d7-a878d94205b3'  -- HN-01
);

INSERT INTO order_items (id, order_id, sku_id, product_id, product_name, sku_code, variant_name, quantity, unit_price, subtotal)
VALUES ('dddd0007-0000-0000-0000-000000000001', 'cccc0007-0000-0000-0000-000000000001',
  'b1000002-0000-0000-0000-000000000003', 'a1000002-0000-0000-0000-000000000001',
  'MacBook Pro 14 M3', 'MBP14-M3P-18-1T', 'M3 Pro / 18GB / 1TB', 1, 69990000, 69990000);

INSERT INTO order_events (order_id, event_type, from_status, to_status, description, actor_type)
VALUES
  ('cccc0007-0000-0000-0000-000000000001', 'ORDER_PLACED', NULL, 'PENDING', 'Đơn hàng được tạo', 'CUSTOMER'),
  ('cccc0007-0000-0000-0000-000000000001', 'PAYMENT_CONFIRMED', 'PENDING', 'CONFIRMED',
   'Thanh toán online thành công, tồn kho reserve tại HN-01', 'SYSTEM'),
  ('cccc0007-0000-0000-0000-000000000001', 'WAREHOUSE_ASSIGNED', 'CONFIRMED', 'PROCESSING',
   'Kho HN-01 tiếp nhận', 'SYSTEM'),
  ('cccc0007-0000-0000-0000-000000000001', 'PICKING_STARTED', 'PROCESSING', 'PICKING',
   'Bắt đầu nhặt hàng', 'STAFF'),
  ('cccc0007-0000-0000-0000-000000000001', 'PACKING_DONE', 'PICKING', 'PACKED',
   'Đóng gói xong', 'STAFF'),
  ('cccc0007-0000-0000-0000-000000000001', 'CARRIER_PICKED_UP', 'PACKED', 'SHIPPED',
   'ViettelPost đã lấy hàng — mã VTP20260001', 'SYSTEM'),
  ('cccc0007-0000-0000-0000-000000000001', 'DELIVERY_CONFIRMED', 'SHIPPED', 'DELIVERED',
   'Giao hàng thành công, khách đã nhận', 'DRIVER');

INSERT INTO shipments (id, order_id, tracking_number, carrier, status, from_warehouse_id,
                       estimated_delivery, actual_delivery, sla_deadline)
VALUES (
  'eeee0007-0000-0000-0000-000000000001',
  'cccc0007-0000-0000-0000-000000000001',
  'VTP20260001', 'ViettelPost', 'DELIVERED',
  '6472070f-12c9-429e-b7d7-a878d94205b3',
  NOW() - INTERVAL '1 day',
  NOW() - INTERVAL '2 hours',
  NOW() + INTERVAL '2 days'
);

-- Xuất kho thực tế sau khi giao thành công (on_hand - 1, reserved không tăng vì đã về 0)
UPDATE inventory SET quantity_on_hand = quantity_on_hand - 1
WHERE sku_id = 'b1000002-0000-0000-0000-000000000003'
  AND warehouse_id = '6472070f-12c9-429e-b7d7-a878d94205b3';

-- ============================================================
-- BƯỚC 10: ĐƠN HÀNG #8 — CANCELLED
-- Khách hủy đơn ở trạng thái CONFIRMED
-- Sản phẩm: Adidas Ultraboost 23 White Size 40 x2
-- Tồn kho đã được release (không còn reserved)
-- ============================================================
INSERT INTO orders (id, user_id, order_number, status, subtotal, shipping_fee, discount_amount, total_amount,
                    shipping_address, payment_method, payment_status, notes)
VALUES (
  'cccc0008-0000-0000-0000-000000000001',
  'aaaaaaaa-0001-0000-0000-000000000001',
  'ORD-2026-00008', 'CANCELLED',
  7380000, 30000, 0, 7410000,
  '{"recipientName":"Nguyễn Văn A","phone":"0901111001","address":"12 Lý Thường Kiệt","district":"Hoàn Kiếm","province":"Hà Nội"}',
  'COD', 'REFUNDED',
  'Khách đổi ý, yêu cầu hủy đơn'
);

INSERT INTO order_items (id, order_id, sku_id, product_id, product_name, sku_code, variant_name, quantity, unit_price, subtotal)
VALUES ('dddd0008-0000-0000-0000-000000000001', 'cccc0008-0000-0000-0000-000000000001',
  'b1000004-0000-0000-0000-000000000011', 'a1000004-0000-0000-0000-000000000002',
  'Adidas Ultraboost 23', 'UB23-WHT-40', 'White / Size 40', 2, 3690000, 7380000);

INSERT INTO order_events (order_id, event_type, from_status, to_status, description, actor_type)
VALUES
  ('cccc0008-0000-0000-0000-000000000001', 'ORDER_PLACED', NULL, 'PENDING', 'Đơn hàng được tạo', 'CUSTOMER'),
  ('cccc0008-0000-0000-0000-000000000001', 'PAYMENT_CONFIRMED', 'PENDING', 'CONFIRMED',
   'Tồn kho reserve thành công', 'SYSTEM'),
  ('cccc0008-0000-0000-0000-000000000001', 'CANCEL', 'CONFIRMED', 'CANCELLED',
   'Khách yêu cầu hủy đơn: đổi ý', 'CUSTOMER');

-- (Tồn kho đã được release khi hủy → không cần update)

-- ============================================================
-- BƯỚC 11: ĐƠN HÀNG #9 — REFUNDED
-- Đã giao thành công → khách yêu cầu hoàn hàng → hoàn tiền
-- Sản phẩm: Atomic Habits x2 + Clean Code x1
-- Kho: HCM-01 — Tồn kho đã xuất (trước khi refund)
-- ============================================================
INSERT INTO orders (id, user_id, order_number, status, subtotal, shipping_fee, discount_amount, total_amount,
                    shipping_address, payment_method, payment_status, warehouse_id)
VALUES (
  'cccc0009-0000-0000-0000-000000000001',
  'aaaaaaaa-0001-0000-0000-000000000003',
  'ORD-2026-00009', 'REFUNDED',
  677000, 30000, 0, 707000,
  '{"recipientName":"Lê Minh C","phone":"0901111003","address":"55 Trần Phú","district":"Cầu Giấy","province":"Hà Nội"}',
  'BANK_TRANSFER', 'REFUNDED',
  '273c9f80-cb56-4553-8005-ed07ee2af6c6'  -- HCM-01
);

INSERT INTO order_items (id, order_id, sku_id, product_id, product_name, sku_code, variant_name, quantity, unit_price, subtotal)
VALUES
  ('dddd0009-0000-0000-0000-000000000001', 'cccc0009-0000-0000-0000-000000000001',
   'b1000007-0000-0000-0000-000000000001', 'a1000007-0000-0000-0000-000000000001',
   'Atomic Habits', 'BOOK-ATHMB-PB', 'Paperback', 2, 189000, 378000),
  ('dddd0009-0000-0000-0000-000000000002', 'cccc0009-0000-0000-0000-000000000001',
   'b1000007-0000-0000-0000-000000000002', 'a1000007-0000-0000-0000-000000000002',
   'Clean Code', 'BOOK-CLNCD-PB', 'Paperback', 1, 299000, 299000);

INSERT INTO order_events (order_id, event_type, from_status, to_status, description, actor_type)
VALUES
  ('cccc0009-0000-0000-0000-000000000001', 'ORDER_PLACED', NULL, 'PENDING', 'Đơn hàng được tạo', 'CUSTOMER'),
  ('cccc0009-0000-0000-0000-000000000001', 'PAYMENT_CONFIRMED', 'PENDING', 'CONFIRMED',
   'Thanh toán thành công, reserve tồn kho HCM-01', 'SYSTEM'),
  ('cccc0009-0000-0000-0000-000000000001', 'WAREHOUSE_ASSIGNED', 'CONFIRMED', 'PROCESSING',
   'Kho HCM-01 tiếp nhận', 'SYSTEM'),
  ('cccc0009-0000-0000-0000-000000000001', 'PICKING_STARTED', 'PROCESSING', 'PICKING',
   'Nhân viên nhặt hàng', 'STAFF'),
  ('cccc0009-0000-0000-0000-000000000001', 'PACKING_DONE', 'PICKING', 'PACKED',
   'Đóng gói hoàn tất', 'STAFF'),
  ('cccc0009-0000-0000-0000-000000000001', 'CARRIER_PICKED_UP', 'PACKED', 'SHIPPED',
   'ViettelPost lấy hàng — VTP20260009', 'SYSTEM'),
  ('cccc0009-0000-0000-0000-000000000001', 'DELIVERY_CONFIRMED', 'SHIPPED', 'DELIVERED',
   'Giao thành công', 'DRIVER'),
  ('cccc0009-0000-0000-0000-000000000001', 'REFUND_APPROVED', 'DELIVERED', 'REFUNDED',
   'Khách phản ánh sách bị lỗi trang, đã duyệt hoàn tiền 707,000đ', 'ADMIN');

INSERT INTO shipments (id, order_id, tracking_number, carrier, status, from_warehouse_id,
                       estimated_delivery, actual_delivery, sla_deadline)
VALUES (
  'eeee0009-0000-0000-0000-000000000001',
  'cccc0009-0000-0000-0000-000000000001',
  'VTP20260009', 'ViettelPost', 'DELIVERED',
  '273c9f80-cb56-4553-8005-ed07ee2af6c6',
  NOW() - INTERVAL '5 days',
  NOW() - INTERVAL '4 days',
  NOW() - INTERVAL '3 days'
);

-- Xuất kho thực tế (đã giao thành công trước khi refund)
UPDATE inventory SET quantity_on_hand = quantity_on_hand - 2
WHERE sku_id = 'b1000007-0000-0000-0000-000000000001'
  AND warehouse_id = '273c9f80-cb56-4553-8005-ed07ee2af6c6';

UPDATE inventory SET quantity_on_hand = quantity_on_hand - 1
WHERE sku_id = 'b1000007-0000-0000-0000-000000000002'
  AND warehouse_id = '273c9f80-cb56-4553-8005-ed07ee2af6c6';

COMMIT;

-- ============================================================
-- KIỂM TRA KẾT QUẢ
-- ============================================================
SELECT status, COUNT(*) as total,
       SUM(total_amount) as doanh_thu
FROM orders
GROUP BY status
ORDER BY status;

SELECT
  w.code as kho,
  p.name as san_pham,
  s.sku_code,
  i.quantity_on_hand as ton_kho,
  i.quantity_reserved as da_giu_cho,
  (i.quantity_on_hand - i.quantity_reserved) as kha_dung
FROM inventory i
JOIN warehouses w ON w.id = i.warehouse_id
JOIN skus s ON s.id = i.sku_id
JOIN products p ON p.id = s.product_id
WHERE i.quantity_reserved > 0 OR i.quantity_on_hand < 50
ORDER BY w.code, p.name;
