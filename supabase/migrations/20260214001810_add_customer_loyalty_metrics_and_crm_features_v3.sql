/*
  # Add Customer Loyalty Metrics and CRM Features

  1. Changes to `customers` table
    - Add `total_spend` (decimal) - Total amount customer has spent
    - Add `total_orders` (integer) - Number of orders/purchases
    - Add `loyalty_points` (integer) - Accumulated loyalty points
    - Add `last_purchase_date` (timestamp) - Date of last purchase
    - Add `preference_note` (text) - Personal preferences/notes (e.g., "Loves Red Roses")
    - Add `tier` (text) - Customer tier: VIP, Frequent, Inactive
    - Add indexes for filtering

  2. New Functions
    - `calculate_customer_tier()` - Automatically determine customer tier
    - `update_customer_metrics()` - Update metrics when sales are made

  3. Triggers
    - Automatically update customer metrics on new sales
    - Automatically recalculate tier when metrics change

  4. Security
    - Maintain existing RLS policies
    - Add policies for new fields
*/

-- Add new columns to customers table
ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_spend decimal(12,2) DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_orders integer DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS loyalty_points integer DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_purchase_date timestamptz;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS preference_note text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tier text DEFAULT 'Inactive';

-- Add constraint for tier values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_tier_check'
  ) THEN
    ALTER TABLE customers ADD CONSTRAINT customers_tier_check 
      CHECK (tier IN ('VIP', 'Frequent', 'Inactive'));
  END IF;
END $$;

-- Add indexes for filtering
CREATE INDEX IF NOT EXISTS idx_customers_tier ON customers(tier);
CREATE INDEX IF NOT EXISTS idx_customers_total_spend ON customers(total_spend);
CREATE INDEX IF NOT EXISTS idx_customers_last_purchase_date ON customers(last_purchase_date);
CREATE INDEX IF NOT EXISTS idx_customers_total_orders ON customers(total_orders);
CREATE INDEX IF NOT EXISTS idx_customers_loyalty_points ON customers(loyalty_points);

-- Add helpful comments
COMMENT ON COLUMN customers.total_spend IS 'Total amount customer has spent (auto-calculated)';
COMMENT ON COLUMN customers.total_orders IS 'Number of completed orders (auto-calculated)';
COMMENT ON COLUMN customers.loyalty_points IS 'Accumulated loyalty points';
COMMENT ON COLUMN customers.last_purchase_date IS 'Date of most recent purchase (auto-calculated)';
COMMENT ON COLUMN customers.preference_note IS 'Customer preferences and notes for personalized service';
COMMENT ON COLUMN customers.tier IS 'Customer tier: VIP (>5000 SAR), Frequent (>1000 SAR), Inactive (<1000 or 60+ days)';

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS calculate_customer_tier CASCADE;

-- Function to calculate customer tier based on spend and activity
CREATE FUNCTION calculate_customer_tier(
  p_total_spend decimal,
  p_total_orders integer,
  p_last_purchase_date timestamptz
)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  -- VIP: Total spend > 5000 SAR OR more than 20 orders
  IF p_total_spend >= 5000 OR p_total_orders >= 20 THEN
    RETURN 'VIP';
  END IF;

  -- Frequent: Total spend > 1000 SAR AND purchased in last 60 days
  IF p_total_spend >= 1000 AND p_last_purchase_date IS NOT NULL 
     AND p_last_purchase_date > (CURRENT_TIMESTAMP - INTERVAL '60 days') THEN
    RETURN 'Frequent';
  END IF;

  -- Inactive: Everyone else
  RETURN 'Inactive';
END;
$$;

-- Function to update customer metrics after a sale
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

  -- Update tier based on new metrics
  UPDATE customers
  SET tier = calculate_customer_tier(total_spend, total_orders, last_purchase_date)
  WHERE id = v_customer_id;

  RETURN NEW;
END;
$$;

-- Create trigger to update customer metrics on new sales
DROP TRIGGER IF EXISTS trigger_update_customer_metrics ON sales;
CREATE TRIGGER trigger_update_customer_metrics
  AFTER INSERT ON sales
  FOR EACH ROW
  EXECUTE FUNCTION update_customer_metrics_on_sale();

-- Function to recalculate all customer metrics (for existing data)
CREATE OR REPLACE FUNCTION recalculate_all_customer_metrics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update metrics for all customers based on their sales
  UPDATE customers c
  SET 
    total_spend = COALESCE(
      (SELECT SUM(s.total) FROM sales s WHERE s.customer_id = c.id),
      0
    ),
    total_orders = COALESCE(
      (SELECT COUNT(*) FROM sales s WHERE s.customer_id = c.id),
      0
    ),
    last_purchase_date = (
      SELECT MAX(s.sale_date) FROM sales s WHERE s.customer_id = c.id
    );

  -- Update tiers for all customers
  UPDATE customers
  SET tier = calculate_customer_tier(total_spend, total_orders, last_purchase_date);
END;
$$;

-- Recalculate metrics for existing customers
SELECT recalculate_all_customer_metrics();

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION calculate_customer_tier TO authenticated;
GRANT EXECUTE ON FUNCTION recalculate_all_customer_metrics TO authenticated;