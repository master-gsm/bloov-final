/*
  # Add Loyalty Points Expiry and Customer Classification Tags

  ## Changes
  
  1. New Table: `loyalty_point_transactions`
     - Tracks individual loyalty point transactions with expiry dates
     - Each transaction expires 365 days from earning date
     - Linked to sales for traceability
  
  2. New Columns on `customers` table
     - `is_top_spender` (boolean) - Dynamically marked for highest spenders
     - `is_most_frequent` (boolean) - Dynamically marked for most orders
     - `valid_loyalty_points` (integer) - Only counts non-expired points
  
  3. New Functions
     - `calculate_valid_loyalty_points()` - Returns non-expired points for a customer
     - `update_customer_classification_tags()` - Marks top 10% spenders and frequent buyers
     - `add_loyalty_points_transaction()` - Adds points with auto-expiry
  
  4. Updated Triggers
     - Auto-add loyalty points transaction on sale
     - Auto-update customer classification tags
     - Auto-calculate valid (non-expired) points
  
  5. Indexes
     - Performance indexes for sorting by spend and order count
  
  ## Important Notes
  - Loyalty points expire exactly 365 days from transaction date
  - Top Spender = Top 10% by total_spend
  - Most Frequent = Top 10% by total_orders
  - Valid points are recalculated on every query
*/

-- Step 1: Create loyalty_point_transactions table
CREATE TABLE IF NOT EXISTS loyalty_point_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  sale_id uuid REFERENCES sales(id) ON DELETE SET NULL,
  points_earned integer NOT NULL DEFAULT 0,
  points_redeemed integer NOT NULL DEFAULT 0,
  earned_date timestamptz NOT NULL DEFAULT now(),
  expiry_date timestamptz NOT NULL DEFAULT (now() + INTERVAL '365 days'),
  description text,
  created_at timestamptz DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_customer ON loyalty_point_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_expiry ON loyalty_point_transactions(expiry_date);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_sale ON loyalty_point_transactions(sale_id);

-- Step 2: Add new columns to customers table
ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_top_spender boolean DEFAULT false;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_most_frequent boolean DEFAULT false;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS valid_loyalty_points integer DEFAULT 0;

-- Add indexes for sorting by spend and order count
CREATE INDEX IF NOT EXISTS idx_customers_total_spend_desc ON customers(total_spend DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_customers_total_orders_desc ON customers(total_orders DESC NULLS LAST);

-- Step 3: Enable RLS on loyalty_point_transactions
ALTER TABLE loyalty_point_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for loyalty_point_transactions
CREATE POLICY "Users can view loyalty transactions"
  ON loyalty_point_transactions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System can insert loyalty transactions"
  ON loyalty_point_transactions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can update loyalty transactions"
  ON loyalty_point_transactions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Step 4: Function to calculate valid (non-expired) loyalty points
CREATE OR REPLACE FUNCTION calculate_valid_loyalty_points(p_customer_id uuid)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_valid_points integer;
BEGIN
  -- Sum all non-expired points minus redeemed points
  SELECT COALESCE(SUM(points_earned - points_redeemed), 0)
  INTO v_valid_points
  FROM loyalty_point_transactions
  WHERE customer_id = p_customer_id
  AND expiry_date > now();
  
  RETURN v_valid_points;
END;
$$;

-- Step 5: Function to add loyalty points transaction
CREATE OR REPLACE FUNCTION add_loyalty_points_transaction(
  p_customer_id uuid,
  p_sale_id uuid,
  p_points integer,
  p_description text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_transaction_id uuid;
BEGIN
  -- Insert loyalty points transaction with 365-day expiry
  INSERT INTO loyalty_point_transactions (
    customer_id,
    sale_id,
    points_earned,
    points_redeemed,
    earned_date,
    expiry_date,
    description
  ) VALUES (
    p_customer_id,
    p_sale_id,
    p_points,
    0,
    now(),
    now() + INTERVAL '365 days',
    COALESCE(p_description, 'Points earned from sale')
  ) RETURNING id INTO v_transaction_id;
  
  -- Update customer's valid loyalty points
  UPDATE customers
  SET valid_loyalty_points = calculate_valid_loyalty_points(p_customer_id)
  WHERE id = p_customer_id;
  
  RETURN v_transaction_id;
END;
$$;

-- Step 6: Function to update customer classification tags (Top Spender & Most Frequent)
CREATE OR REPLACE FUNCTION update_customer_classification_tags()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_top_spend_threshold decimal;
  v_top_orders_threshold integer;
BEGIN
  -- Calculate the 90th percentile for total_spend (top 10%)
  SELECT PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY total_spend)
  INTO v_top_spend_threshold
  FROM customers
  WHERE total_spend > 0;
  
  -- Calculate the 90th percentile for total_orders (top 10%)
  SELECT PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY total_orders)
  INTO v_top_orders_threshold
  FROM customers
  WHERE total_orders > 0;
  
  -- Reset all tags first
  UPDATE customers
  SET 
    is_top_spender = false,
    is_most_frequent = false;
  
  -- Mark top spenders (top 10% by spend)
  UPDATE customers
  SET is_top_spender = true
  WHERE total_spend >= COALESCE(v_top_spend_threshold, 0)
  AND total_spend > 0;
  
  -- Mark most frequent buyers (top 10% by order count)
  UPDATE customers
  SET is_most_frequent = true
  WHERE total_orders >= COALESCE(v_top_orders_threshold, 0)
  AND total_orders > 0;
END;
$$;

-- Step 7: Updated trigger function for customer metrics with loyalty points expiry
CREATE OR REPLACE FUNCTION update_customer_metrics_on_sale()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_customer_id uuid;
  v_sale_total decimal;
  v_loyalty_points_earned integer;
BEGIN
  -- Get customer ID and sale total
  v_customer_id := NEW.customer_id;
  v_sale_total := NEW.total;

  -- Skip if no customer (walk-in sales)
  IF v_customer_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Calculate loyalty points (1 point per SAR spent)
  v_loyalty_points_earned := FLOOR(v_sale_total);

  -- Update customer metrics
  UPDATE customers
  SET 
    total_spend = COALESCE(total_spend, 0) + v_sale_total,
    total_orders = COALESCE(total_orders, 0) + 1,
    loyalty_points = COALESCE(loyalty_points, 0) + v_loyalty_points_earned,
    last_purchase_date = NEW.sale_date
  WHERE id = v_customer_id;

  -- Add loyalty points transaction with 365-day expiry
  PERFORM add_loyalty_points_transaction(
    v_customer_id,
    NEW.id,
    v_loyalty_points_earned,
    'Points earned from sale #' || NEW.code
  );

  -- Update tier based on new metrics
  UPDATE customers
  SET tier = calculate_customer_tier(total_spend, total_orders, last_purchase_date)
  WHERE id = v_customer_id;
  
  -- Update classification tags (Top Spender, Most Frequent)
  PERFORM update_customer_classification_tags();

  RETURN NEW;
END;
$$;

-- Recreate the trigger with updated function
DROP TRIGGER IF EXISTS trigger_update_customer_metrics ON sales;
CREATE TRIGGER trigger_update_customer_metrics
  AFTER INSERT ON sales
  FOR EACH ROW
  EXECUTE FUNCTION update_customer_metrics_on_sale();

-- Step 8: Function to recalculate valid points for all customers
CREATE OR REPLACE FUNCTION recalculate_all_valid_loyalty_points()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update valid_loyalty_points for all customers
  UPDATE customers c
  SET valid_loyalty_points = calculate_valid_loyalty_points(c.id);
END;
$$;

-- Step 9: Add helpful comments
COMMENT ON TABLE loyalty_point_transactions IS 'Tracks individual loyalty point transactions with 365-day expiry from earned date';
COMMENT ON COLUMN customers.is_top_spender IS 'Dynamically marked - Top 10% customers by total spend';
COMMENT ON COLUMN customers.is_most_frequent IS 'Dynamically marked - Top 10% customers by order count';
COMMENT ON COLUMN customers.valid_loyalty_points IS 'Only counts non-expired loyalty points (365-day expiry)';
COMMENT ON COLUMN loyalty_point_transactions.expiry_date IS 'Points expire 365 days from earned_date';

-- Step 10: Grant execute permissions
GRANT EXECUTE ON FUNCTION calculate_valid_loyalty_points TO authenticated;
GRANT EXECUTE ON FUNCTION add_loyalty_points_transaction TO authenticated;
GRANT EXECUTE ON FUNCTION update_customer_classification_tags TO authenticated;
GRANT EXECUTE ON FUNCTION recalculate_all_valid_loyalty_points TO authenticated;

-- Step 11: Initialize classification tags for existing customers
SELECT update_customer_classification_tags();
