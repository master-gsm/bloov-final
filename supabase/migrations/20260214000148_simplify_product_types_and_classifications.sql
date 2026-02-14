/*
  # Simplify Product Types and Classifications

  1. Changes to `products` table
    - Update `type` column with new Arabic-focused values:
      * natural_flowers (ورد طبيعي)
      * artificial_flowers (ورد صناعي)
      * vases (فازات)
      * wrapping (تغليف)
      * ribbons (شرائط)
      * additions_gifts (إضافات وهدايا)
      * services (خدمات)
    
    - Update `classification` column to support conditional values:
      * For flowers: bouquet (باقة), single (حبة), branch (غصن)
      * For vases: glass (زجاج), ceramic (سيراميك), marble (رخام), metal (معدن), wood (خشب)
      * For wrapping/ribbons: paper (ورق), plastic (بلاستيك), fabric (قماش), satin (ستان), burlap (خيش)

  2. Important Notes
    - Removes all origin-related constraints (Dutch, Kenyan, etc.)
    - Simplifies the dropdown logic for better UX
    - Classification is now optional and context-dependent
*/

-- Drop existing constraints and type definitions
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_type_check;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_classification_check;

-- Temporarily allow all text values
ALTER TABLE products ALTER COLUMN type TYPE text;
ALTER TABLE products ALTER COLUMN classification TYPE text;

-- Migrate existing data to new values
UPDATE products SET type = 'natural_flowers' WHERE type IN ('natural', 'preserved', 'greenery', 'dried');
UPDATE products SET type = 'artificial_flowers' WHERE type = 'artificial';
UPDATE products SET type = 'vases' WHERE classification IN ('vases', 'vases_glass');
UPDATE products SET type = 'wrapping' WHERE classification IN ('wrapping', 'wrapping_paper');
UPDATE products SET type = 'ribbons' WHERE classification = 'ribbons';
UPDATE products SET type = 'additions_gifts' WHERE classification IN ('gifts', 'gift_boxes', 'floral_tools');
UPDATE products SET type = 'services' WHERE classification IN ('services', 'cards');

-- Migrate classifications
UPDATE products SET classification = 'bouquet' WHERE classification = 'ready_bouquets' AND type IN ('natural_flowers', 'artificial_flowers');
UPDATE products SET classification = 'glass' WHERE classification IN ('vases_glass', 'vases') AND type = 'vases';
UPDATE products SET classification = 'paper' WHERE classification = 'wrapping_paper' AND type = 'wrapping';
UPDATE products SET classification = NULL WHERE classification IN ('cards', 'services', 'gifts', 'gift_boxes', 'floral_tools');

-- Add new constraints with updated values
ALTER TABLE products ADD CONSTRAINT products_type_check 
  CHECK (type IN (
    'natural_flowers',
    'artificial_flowers', 
    'vases',
    'wrapping',
    'ribbons',
    'additions_gifts',
    'services'
  ));

ALTER TABLE products ADD CONSTRAINT products_classification_check 
  CHECK (
    classification IS NULL OR
    classification IN (
      -- For flowers
      'bouquet', 'single', 'branch',
      -- For vases
      'glass', 'ceramic', 'marble', 'metal', 'wood',
      -- For wrapping/ribbons
      'paper', 'plastic', 'fabric', 'satin', 'burlap'
    )
  );

-- Add helpful comments
COMMENT ON COLUMN products.type IS 'Product type: natural_flowers, artificial_flowers, vases, wrapping, ribbons, additions_gifts, services';
COMMENT ON COLUMN products.classification IS 'Context-dependent classification based on type (optional)';

-- Create index for better filtering
CREATE INDEX IF NOT EXISTS idx_products_type_classification ON products(type, classification) WHERE classification IS NOT NULL;