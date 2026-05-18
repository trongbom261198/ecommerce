-- =============================================================================
-- V12 - Seed data: sample categories and default admin user
-- Admin password: Admin@123
-- BCrypt hash generated with strength 12
-- =============================================================================

-- Root categories
INSERT INTO categories (id, parent_id, name, slug, description, sort_order, active)
VALUES
    (gen_random_uuid(), NULL, 'Electronics',    'electronics',    'Electronic devices and accessories',      1, true),
    (gen_random_uuid(), NULL, 'Fashion',         'fashion',        'Clothing, shoes, and accessories',        2, true),
    (gen_random_uuid(), NULL, 'Home & Living',   'home-living',    'Furniture, decor, and household items',   3, true),
    (gen_random_uuid(), NULL, 'Sports',          'sports',         'Sporting goods and outdoor equipment',    4, true),
    (gen_random_uuid(), NULL, 'Books',           'books',          'Books, e-books, and educational material',5, true);

-- Sub-categories for Electronics
INSERT INTO categories (id, parent_id, name, slug, description, sort_order, active)
SELECT
    gen_random_uuid(),
    c.id,
    sub.name,
    sub.slug,
    sub.description,
    sub.sort_order,
    true
FROM categories c,
    (VALUES
        ('Smartphones',  'smartphones',  'Mobile phones and accessories', 1),
        ('Laptops',      'laptops',      'Notebook and laptop computers', 2),
        ('Headphones',   'headphones',   'Wired and wireless headphones', 3),
        ('Cameras',      'cameras',      'Digital cameras and lenses',    4)
    ) AS sub(name, slug, description, sort_order)
WHERE c.slug = 'electronics';

-- Sub-categories for Fashion
INSERT INTO categories (id, parent_id, name, slug, description, sort_order, active)
SELECT
    gen_random_uuid(),
    c.id,
    sub.name,
    sub.slug,
    sub.description,
    sub.sort_order,
    true
FROM categories c,
    (VALUES
        ('Men Clothing',   'mens-clothing',   'Shirts, trousers, and jackets for men', 1),
        ('Women Clothing', 'womens-clothing', 'Dresses, blouses, and skirts',          2),
        ('Shoes',            'shoes',           'Sneakers, boots, and sandals',           3),
        ('Bags',             'bags',            'Handbags, backpacks, and wallets',       4)
    ) AS sub(name, slug, description, sort_order)
WHERE c.slug = 'fashion';

-- =============================================================================
-- Default admin user
-- Email   : admin@ecommerce.com
-- Password: Admin@123
-- BCrypt  : $2a$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi
-- =============================================================================
INSERT INTO users (id, email, phone, password_hash, full_name, role, enabled, email_verified)
VALUES (
    gen_random_uuid(),
    'admin@ecommerce.com',
    '+84900000000',
    '$2a$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
    'System Administrator',
    'ADMIN',
    true,
    true
);

-- =============================================================================
-- Sample customer user
-- Email   : customer@ecommerce.com
-- Password: Admin@123
-- =============================================================================
INSERT INTO users (id, email, phone, password_hash, full_name, role, enabled, email_verified)
VALUES (
    gen_random_uuid(),
    'customer@ecommerce.com',
    '+84911111111',
    '$2a$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
    'Sample Customer',
    'CUSTOMER',
    true,
    true
);

-- Sample pricing rule: free shipping over 500k VND
INSERT INTO pricing_rules (id, name, rule_type, priority, conditions, actions, active)
VALUES (
    gen_random_uuid(),
    'Free Shipping Over 500k',
    'SHIPPING_DISCOUNT',
    10,
    '{"minOrderAmount": 500000, "currency": "VND"}',
    '{"discountType": "FIXED", "discountValue": 0, "shippingFee": 0}',
    true
);
