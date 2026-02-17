/*
  # Moving Average Costing System

  ## Overview
  Implements a Moving Average Cost (MAC) system for inventory valuation.
  This system tracks the weighted average cost of each product as purchases occur.

  ## 1. New Tables
  
  ### product_costing
  - Tracks moving average cost for each product per branch
  - Fields:
    - product_id: Reference to products table
    - branch_id: Reference to branches table
    - quantity_on_hand: Current stock quantity
    - average_cost: Weighted average unit cost
    - total_value: quantity_on_hand * average_cost
    - last_purchase_date: Date of last purchase
    - updated_at: Last update timestamp

  ## 2. Trigger Functions
  
  ### update_moving_average_on_purchase()
  - Triggered AFTER INSERT OR UPDATE on purchase_items
  - Calculates new moving average cost using formula:
    New Avg = (Old Qty × Old Avg + Purchase Qty × Purchase Price) / (Old Qty + Purchase Qty)
  - Updates quantity_on_hand and average_cost in product_costing

  ## 3. Formula
  
  Moving Average Cost Formula:
  ```
  New Average Cost = (Existing Value + New Purchase Value) / (Existing Qty + New Purchase Qty)
  
  Where:
  - Existing Value = quantity_on_hand × average_cost
  - New Purchase Value = purchase_quantity × unit_price
  ```

  Example:
  - Initial: Qty=100, Avg=10 → Value=1000
  - Purchase: Qty=100, Price=20 → Value=2000
  - New: Qty=200, Avg=(1000+2000)/200=15

  ## 4. Integration Points
  
  - Purchases trigger MAC recalculation
  - Sales will deduct from quantity_on_hand (future)
  - Cost of goods sold uses current average_cost (future)

  ## 5. Security
  
  - RLS enabled on product_costing
  - Only authenticated users can view
  - System triggers handle updates automatically
*/

-- ═══════════════════════════════════════════════════════════
-- 1. CREATE product_costing TABLE
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS product_costing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  quantity_on_hand NUMERIC(15,4) NOT NULL DEFAULT 0,
  average_cost NUMERIC(15,4) NOT NULL DEFAULT 0,
  total_value NUMERIC(15,4) GENERATED ALWAYS AS (quantity_on_hand * average_cost) STORED,
  last_purchase_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_product_branch UNIQUE (product_id, branch_id),
  CONSTRAINT non_negative_quantity CHECK (quantity_on_hand >= 0),
  CONSTRAINT non_negative_cost CHECK (average_cost >= 0)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_product_costing_product ON product_costing(product_id);
CREATE INDEX IF NOT EXISTS idx_product_costing_branch ON product_costing(branch_id);

-- RLS
ALTER TABLE product_costing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view product costing" ON product_costing;
CREATE POLICY "Users can view product costing"
  ON product_costing FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "System can manage product costing" ON product_costing;
CREATE POLICY "System can manage product costing"
  ON product_costing FOR ALL
  TO authenticated
  USING (true);

-- ═══════════════════════════════════════════════════════════
-- 2. CREATE MOVING AVERAGE TRIGGER FUNCTION
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_moving_average_on_purchase()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_branch_id UUID;
  v_old_qty NUMERIC;
  v_old_avg NUMERIC;
  v_old_value NUMERIC;
  v_new_qty NUMERIC;
  v_new_avg NUMERIC;
  v_purchase_qty NUMERIC;
  v_purchase_price NUMERIC;
  v_purchase_value NUMERIC;
BEGIN
  -- Only process if not voided or deleted
  IF NEW.voided_at IS NOT NULL OR NEW.is_deleted = true THEN
    RETURN NEW;
  END IF;

  -- Get branch_id from purchase
  SELECT branch_id INTO v_branch_id
  FROM purchases
  WHERE id = NEW.purchase_id;

  -- Get purchase details
  v_purchase_qty := NEW.quantity;
  v_purchase_price := NEW.unit_price;
  v_purchase_value := v_purchase_qty * v_purchase_price;

  -- Get current costing data or initialize
  SELECT 
    quantity_on_hand,
    average_cost
  INTO v_old_qty, v_old_avg
  FROM product_costing
  WHERE product_id = NEW.product_id 
    AND branch_id = v_branch_id;

  -- If no record exists, create initial one
  IF NOT FOUND THEN
    INSERT INTO product_costing (
      product_id,
      branch_id,
      quantity_on_hand,
      average_cost,
      last_purchase_date
    ) VALUES (
      NEW.product_id,
      v_branch_id,
      v_purchase_qty,
      v_purchase_price,
      now()
    );
    RETURN NEW;
  END IF;

  -- Calculate old value
  v_old_value := v_old_qty * v_old_avg;

  -- Calculate new quantity and average
  v_new_qty := v_old_qty + v_purchase_qty;
  
  -- Moving Average Formula
  IF v_new_qty > 0 THEN
    v_new_avg := (v_old_value + v_purchase_value) / v_new_qty;
  ELSE
    v_new_avg := 0;
  END IF;

  -- Update product_costing
  UPDATE product_costing
  SET quantity_on_hand = v_new_qty,
      average_cost = v_new_avg,
      last_purchase_date = now(),
      updated_at = now()
  WHERE product_id = NEW.product_id
    AND branch_id = v_branch_id;

  RETURN NEW;
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 3. CREATE TRIGGER ON purchase_items
-- ═══════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trigger_update_moving_average ON purchase_items;

CREATE TRIGGER trigger_update_moving_average
  AFTER INSERT OR UPDATE OF quantity, unit_price
  ON purchase_items
  FOR EACH ROW
  EXECUTE FUNCTION update_moving_average_on_purchase();
