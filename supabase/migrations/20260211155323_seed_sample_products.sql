/*
  # Seed Sample Products for Testing
  
  ## Description
  This migration adds sample flower products (natural and artificial) to demonstrate the system.
  
  ## New Data
  - Sample natural flowers (roses, tulips, lilies, orchids)
  - Sample artificial flowers
  - Initial inventory records for each product
  
  ## Important Notes
  - Products are created with realistic pricing
  - Inventory levels are set for demonstration
  - All products are marked as active
*/

-- Insert sample natural flowers
INSERT INTO products (sku, name, name_ar, type, category_id, unit, unit_ar, purchase_price, sale_price, min_stock_level, is_active)
SELECT 'NF-ROSE-RED-001', 'Red Roses', 'ورد جوري أحمر', 'natural', id, 'piece', 'قطعة', 5.00, 15.00, 20, true
FROM categories WHERE name = 'Roses' LIMIT 1
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (sku, name, name_ar, type, category_id, unit, unit_ar, purchase_price, sale_price, min_stock_level, is_active)
SELECT 'NF-ROSE-WHITE-001', 'White Roses', 'ورد جوري أبيض', 'natural', id, 'piece', 'قطعة', 5.00, 15.00, 20, true
FROM categories WHERE name = 'Roses' LIMIT 1
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (sku, name, name_ar, type, category_id, unit, unit_ar, purchase_price, sale_price, min_stock_level, is_active)
SELECT 'NF-TULIP-RED-001', 'Red Tulips', 'توليب أحمر', 'natural', id, 'piece', 'قطعة', 3.00, 10.00, 30, true
FROM categories WHERE name = 'Tulips' LIMIT 1
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (sku, name, name_ar, type, category_id, unit, unit_ar, purchase_price, sale_price, min_stock_level, is_active)
SELECT 'NF-LILY-WHITE-001', 'White Lilies', 'زنبق أبيض', 'natural', id, 'piece', 'قطعة', 8.00, 20.00, 15, true
FROM categories WHERE name = 'Lilies' LIMIT 1
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (sku, name, name_ar, type, category_id, unit, unit_ar, purchase_price, sale_price, min_stock_level, is_active)
SELECT 'NF-ORCHID-PURPLE-001', 'Purple Orchids', 'أوركيد بنفسجي', 'natural', id, 'piece', 'قطعة', 12.00, 30.00, 10, true
FROM categories WHERE name = 'Orchids' LIMIT 1
ON CONFLICT (sku) DO NOTHING;

-- Insert sample artificial flowers
INSERT INTO products (sku, name, name_ar, type, category_id, unit, unit_ar, purchase_price, sale_price, min_stock_level, is_active)
SELECT 'AF-SILK-ROSE-001', 'Silk Red Roses', 'ورد حرير أحمر', 'artificial', id, 'piece', 'قطعة', 8.00, 20.00, 15, true
FROM categories WHERE name = 'Silk Flowers' LIMIT 1
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (sku, name, name_ar, type, category_id, unit, unit_ar, purchase_price, sale_price, min_stock_level, is_active)
SELECT 'AF-SILK-TULIP-001', 'Silk Tulips Mix', 'توليب حرير متنوع', 'artificial', id, 'piece', 'قطعة', 6.00, 15.00, 20, true
FROM categories WHERE name = 'Silk Flowers' LIMIT 1
ON CONFLICT (sku) DO NOTHING;

INSERT INTO products (sku, name, name_ar, type, category_id, unit, unit_ar, purchase_price, sale_price, min_stock_level, is_active)
SELECT 'AF-PLASTIC-ROSE-001', 'Plastic Roses', 'ورد بلاستيك', 'artificial', id, 'piece', 'قطعة', 3.00, 8.00, 50, true
FROM categories WHERE name = 'Plastic Flowers' LIMIT 1
ON CONFLICT (sku) DO NOTHING;

-- Insert initial inventory for products
INSERT INTO inventory (product_id, quantity)
SELECT id, 100 FROM products WHERE sku = 'NF-ROSE-RED-001'
ON CONFLICT (product_id) DO UPDATE SET quantity = 100;

INSERT INTO inventory (product_id, quantity)
SELECT id, 80 FROM products WHERE sku = 'NF-ROSE-WHITE-001'
ON CONFLICT (product_id) DO UPDATE SET quantity = 80;

INSERT INTO inventory (product_id, quantity)
SELECT id, 150 FROM products WHERE sku = 'NF-TULIP-RED-001'
ON CONFLICT (product_id) DO UPDATE SET quantity = 150;

INSERT INTO inventory (product_id, quantity)
SELECT id, 60 FROM products WHERE sku = 'NF-LILY-WHITE-001'
ON CONFLICT (product_id) DO UPDATE SET quantity = 60;

INSERT INTO inventory (product_id, quantity)
SELECT id, 40 FROM products WHERE sku = 'NF-ORCHID-PURPLE-001'
ON CONFLICT (product_id) DO UPDATE SET quantity = 40;

INSERT INTO inventory (product_id, quantity)
SELECT id, 200 FROM products WHERE sku = 'AF-SILK-ROSE-001'
ON CONFLICT (product_id) DO UPDATE SET quantity = 200;

INSERT INTO inventory (product_id, quantity)
SELECT id, 150 FROM products WHERE sku = 'AF-SILK-TULIP-001'
ON CONFLICT (product_id) DO UPDATE SET quantity = 150;

INSERT INTO inventory (product_id, quantity)
SELECT id, 300 FROM products WHERE sku = 'AF-PLASTIC-ROSE-001'
ON CONFLICT (product_id) DO UPDATE SET quantity = 300;
