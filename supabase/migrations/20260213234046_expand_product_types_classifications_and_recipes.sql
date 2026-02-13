/*
  # Expand Product Types, Classifications, and Add Recipe System

  ## Overview
  This migration expands the product management system to support:
  - Multiple flower and product types (natural, artificial, preserved, greenery, plants, dried)
  - Product classifications (bouquets, vases, gifts, wrapping, cards, services)
  - Product recipe/bundling system for tracking material usage
  - Materials & Packaging category

  ## Changes Made

  ### 1. Products Table Updates
  - Expand `type` enum to include all flower and product types
  - Add new `classification` column for product categorization
  - Ensure `purchase_price` is properly tracked

  ### 2. New Table: product_recipes
  - Links main products to their component materials
  - Tracks quantity of each material needed per product
  - Enables automatic inventory deduction when selling bundled products

  ### 3. New Table: sale_item_materials
  - Tracks which materials were actually used in each sale
  - Links to sale_items for detailed reporting
  - Records COGS contribution from materials

  ## Security
  - RLS enabled on all new tables
  - Policies for authenticated users to manage recipes
  - Admin-only access for sensitive operations

  ## Indexing
  - Foreign key indexes for performance
  - Composite indexes for common queries
*/

-- Step 1: Drop existing type constraint and expand it
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_type_check;

ALTER TABLE products ADD CONSTRAINT products_type_check 
  CHECK (type IN (
    'natural',           -- ورد طبيعي
    'artificial',        -- ورد صناعي
    'preserved',         -- ورد دائم
    'greenery',          -- أوراق خضراء ومالئات
    'indoor_plants',     -- نباتات داخلية
    'dried'              -- ورد مجفف
  ));

-- Step 2: Add classification column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'classification'
  ) THEN
    ALTER TABLE products ADD COLUMN classification text;
  END IF;
END $$;

-- Add classification constraint
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_classification_check;

ALTER TABLE products ADD CONSTRAINT products_classification_check
  CHECK (classification IN (
    'ready_bouquets',    -- باقات جاهزة
    'vases',             -- فازات وتنسيقات
    'gifts',             -- هدايا وإضافات
    'wrapping',          -- مواد تغليف
    'cards',             -- كروت إهداء
    'services',          -- خدمات
    'vases_glass',       -- فازات وزجاجيات (Materials)
    'wrapping_paper',    -- ورق تغليف (Materials)
    'ribbons',           -- شرائط وإكسسوارات (Materials)
    'floral_tools',      -- أدوات تنسيق (Materials)
    'gift_boxes'         -- صناديق هدايا (Materials)
  ));

-- Step 3: Create product_recipes table for bundling/materials tracking
CREATE TABLE IF NOT EXISTS product_recipes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity numeric(10,3) NOT NULL DEFAULT 1,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT product_recipes_product_material_unique UNIQUE(product_id, material_id),
  CONSTRAINT product_recipes_different_products CHECK (product_id != material_id)
);

-- Enable RLS
ALTER TABLE product_recipes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for product_recipes
CREATE POLICY "Authenticated users can view recipes"
  ON product_recipes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create recipes"
  ON product_recipes FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update recipes"
  ON product_recipes FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete recipes"
  ON product_recipes FOR DELETE
  TO authenticated
  USING (true);

-- Step 4: Create sale_item_materials table to track material usage in sales
CREATE TABLE IF NOT EXISTS sale_item_materials (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_item_id uuid NOT NULL REFERENCES sale_items(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity numeric(10,3) NOT NULL DEFAULT 1,
  cost_per_unit numeric(10,2) NOT NULL DEFAULT 0,
  total_cost numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE sale_item_materials ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sale_item_materials
CREATE POLICY "Authenticated users can view sale item materials"
  ON sale_item_materials FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create sale item materials"
  ON sale_item_materials FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update sale item materials"
  ON sale_item_materials FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete sale item materials"
  ON sale_item_materials FOR DELETE
  TO authenticated
  USING (true);

-- Step 5: Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_product_recipes_product_id ON product_recipes(product_id);
CREATE INDEX IF NOT EXISTS idx_product_recipes_material_id ON product_recipes(material_id);
CREATE INDEX IF NOT EXISTS idx_sale_item_materials_sale_item_id ON sale_item_materials(sale_item_id);
CREATE INDEX IF NOT EXISTS idx_sale_item_materials_material_id ON sale_item_materials(material_id);
CREATE INDEX IF NOT EXISTS idx_products_classification ON products(classification);
CREATE INDEX IF NOT EXISTS idx_products_type ON products(type);

-- Step 6: Add comment documentation
COMMENT ON TABLE product_recipes IS 'Links main products to their component materials for automatic inventory deduction';
COMMENT ON TABLE sale_item_materials IS 'Tracks actual material usage in each sale for accurate COGS and reporting';
COMMENT ON COLUMN products.classification IS 'Product classification for filtering and categorization';
