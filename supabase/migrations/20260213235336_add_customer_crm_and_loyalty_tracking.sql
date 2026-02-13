/*
  # Add Customer CRM and Loyalty Tracking Features

  1. Changes to `customers` table
    - Add `total_spent` (numeric) - Total amount customer has spent
    - Add `order_count` (integer) - Number of completed orders
    - Add `tier` (text) - Customer tier: 'vip', 'frequent', 'regular', 'inactive'
    - Add `last_order_date` (date) - Date of most recent order
    - Add `tier_updated_at` (timestamp) - When tier was last calculated

  2. New Table: `loyalty_settings`
    - `id` (integer, singleton table with id=1)
    - `vip_threshold` (numeric) - Minimum spend for VIP tier (default 2000)
    - `frequent_threshold` (integer) - Minimum orders for Frequent tier (default 5)
    - `inactive_days` (integer) - Days without order to mark Inactive (default 60)
    - `points_to_currency_rate` (numeric) - Points to currency conversion (default 0.05, meaning 100 points = 5 SAR)

  3. Important Notes
    - Customer stats are updated automatically after each completed sale
    - Tier is recalculated based on total_spent, order_count, and last_order_date
    - Loyalty points redemption: 100 points = 5 SAR (configurable)
    - Phone number lookup enables instant customer recognition at POS
*/

-- Add new columns to customers table
ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_spent numeric DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS order_count integer DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tier text DEFAULT 'regular' CHECK (tier IN ('vip', 'frequent', 'regular', 'inactive'));
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_order_date date;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tier_updated_at timestamptz DEFAULT now();

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_tier ON customers(tier);
CREATE INDEX IF NOT EXISTS idx_customers_last_order_date ON customers(last_order_date);

-- Create loyalty settings table (singleton)
CREATE TABLE IF NOT EXISTS loyalty_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  vip_threshold numeric DEFAULT 2000,
  frequent_threshold integer DEFAULT 5,
  inactive_days integer DEFAULT 60,
  points_to_currency_rate numeric DEFAULT 0.05,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Insert default settings
INSERT INTO loyalty_settings (id, vip_threshold, frequent_threshold, inactive_days, points_to_currency_rate)
VALUES (1, 2000, 5, 60, 0.05)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on loyalty_settings
ALTER TABLE loyalty_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for loyalty_settings
DROP POLICY IF EXISTS "Users can view loyalty settings" ON loyalty_settings;
CREATE POLICY "Users can view loyalty settings"
  ON loyalty_settings FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can update loyalty settings" ON loyalty_settings;
CREATE POLICY "Admins can update loyalty settings"
  ON loyalty_settings FOR UPDATE
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

-- Function to calculate customer tier based on stats
CREATE OR REPLACE FUNCTION calculate_customer_tier(
  p_total_spent numeric,
  p_order_count integer,
  p_last_order_date date
)
RETURNS text AS $$
DECLARE
  v_settings loyalty_settings;
  v_days_since_order integer;
BEGIN
  -- Get settings
  SELECT * INTO v_settings FROM loyalty_settings WHERE id = 1;
  
  -- Calculate days since last order
  IF p_last_order_date IS NOT NULL THEN
    v_days_since_order := CURRENT_DATE - p_last_order_date;
  ELSE
    v_days_since_order := 999999; -- Very large number if never ordered
  END IF;
  
  -- Check if inactive first
  IF v_days_since_order > v_settings.inactive_days THEN
    RETURN 'inactive';
  END IF;
  
  -- Check VIP status
  IF p_total_spent >= v_settings.vip_threshold THEN
    RETURN 'vip';
  END IF;
  
  -- Check Frequent status
  IF p_order_count >= v_settings.frequent_threshold THEN
    RETURN 'frequent';
  END IF;
  
  -- Default to regular
  RETURN 'regular';
END;
$$ LANGUAGE plpgsql;

-- Function to update customer stats and tier after a sale
CREATE OR REPLACE FUNCTION update_customer_stats_after_sale()
RETURNS TRIGGER AS $$
DECLARE
  v_customer_id uuid;
  v_sale_total numeric;
  v_new_tier text;
BEGIN
  -- Only process for confirmed sales
  IF NEW.status != 'confirmed' THEN
    RETURN NEW;
  END IF;
  
  -- Get customer_id and sale total
  v_customer_id := NEW.customer_id;
  v_sale_total := NEW.total;
  
  -- Only update if we have a customer
  IF v_customer_id IS NOT NULL THEN
    -- Update customer stats
    UPDATE customers
    SET 
      total_spent = COALESCE(total_spent, 0) + v_sale_total,
      order_count = COALESCE(order_count, 0) + 1,
      last_order_date = CURRENT_DATE,
      tier_updated_at = now()
    WHERE id = v_customer_id;
    
    -- Recalculate tier
    SELECT calculate_customer_tier(
      COALESCE(total_spent, 0) + v_sale_total,
      COALESCE(order_count, 0) + 1,
      CURRENT_DATE
    ) INTO v_new_tier
    FROM customers
    WHERE id = v_customer_id;
    
    -- Update tier
    UPDATE customers
    SET tier = v_new_tier
    WHERE id = v_customer_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update customer stats
DROP TRIGGER IF EXISTS trigger_update_customer_stats ON sales;
CREATE TRIGGER trigger_update_customer_stats
  AFTER INSERT ON sales
  FOR EACH ROW
  EXECUTE FUNCTION update_customer_stats_after_sale();

-- Add helpful comments
COMMENT ON COLUMN customers.total_spent IS 'Total amount customer has spent (for VIP tier calculation)';
COMMENT ON COLUMN customers.order_count IS 'Number of completed orders (for Frequent tier calculation)';
COMMENT ON COLUMN customers.tier IS 'Customer tier: vip, frequent, regular, or inactive';
COMMENT ON COLUMN customers.last_order_date IS 'Date of most recent order (for Inactive tier calculation)';
COMMENT ON TABLE loyalty_settings IS 'Configurable thresholds for customer tier calculation and loyalty rewards';