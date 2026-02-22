/*
  # Auto-Create Product Costing on Product Insert

  ## Overview
  When a new product is created, it should automatically have a product_costing record
  initialized for all branches so inventory is always tracked and branch-isolated.

  ## Changes
  1. Create trigger function: create_product_costing_on_insert()
  2. For each new product, create product_costing records in all active branches
  3. Create AFTER INSERT trigger on products table
  4. Backfill existing products with missing records

  ## Security
  - RLS still applies to product_costing table
  - Trigger runs as system with full access
  - Ensures inventory is initialized per branch
*/

-- Create trigger function to auto-create product_costing for all branches
CREATE OR REPLACE FUNCTION create_product_costing_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_branch_id UUID;
  v_branch_count INT := 0;
BEGIN
  -- Create product_costing record for this product in each active branch
  FOR v_branch_id IN
    SELECT id FROM branches WHERE is_active = true
  LOOP
    INSERT INTO product_costing (product_id, branch_id, quantity_on_hand, average_cost)
    VALUES (NEW.id, v_branch_id, 0, 0)
    ON CONFLICT (product_id, branch_id) DO NOTHING;
    v_branch_count := v_branch_count + 1;
  END LOOP;

  IF v_branch_count > 0 THEN
    RAISE NOTICE 'Created product_costing for product % in % branches', NEW.id, v_branch_count;
  END IF;

  RETURN NEW;
END $$;

-- Create the trigger
DROP TRIGGER IF EXISTS trg_create_product_costing_on_insert ON products;
CREATE TRIGGER trg_create_product_costing_on_insert
  AFTER INSERT ON products
  FOR EACH ROW
  EXECUTE FUNCTION create_product_costing_on_insert();

-- Backfill: Create product_costing records for all existing products in all branches
DO $$
DECLARE
  v_product_id UUID;
  v_branch_id UUID;
  v_total_count INT := 0;
BEGIN
  -- For each active product
  FOR v_product_id IN
    SELECT p.id FROM products p WHERE p.is_active = true
  LOOP
    -- For each active branch
    FOR v_branch_id IN
      SELECT b.id FROM branches b WHERE b.is_active = true
    LOOP
      -- Create product_costing if it doesn't exist
      INSERT INTO product_costing (product_id, branch_id, quantity_on_hand, average_cost)
      VALUES (v_product_id, v_branch_id, 0, 0)
      ON CONFLICT (product_id, branch_id) DO NOTHING;
      v_total_count := v_total_count + 1;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Backfilled % product_costing records across all branches', v_total_count;
END $$;
