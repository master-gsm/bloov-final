/*
  # Fix Customer Tier Constraint Conflict
  
  ## Problem
  Two migrations created conflicting tier constraints:
  - Migration 1: lowercase values ('vip', 'frequent', 'regular', 'inactive')
  - Migration 2: capitalized values ('VIP', 'Frequent', 'Inactive') without 'regular'
  
  This causes insert failures when creating new customers.
  
  ## Solution
  1. Drop the conflicting constraint
  2. Normalize all existing tier values to lowercase
  3. Create a single consistent constraint with all 4 values (lowercase)
  4. Update default value to 'regular' for new customers
  
  ## Changes
  - Fixes tier constraint to accept: 'vip', 'frequent', 'regular', 'inactive' (lowercase only)
  - Updates any existing capitalized values to lowercase
  - Sets default to 'regular' for better UX (new customers start as regular, not inactive)
*/

-- Step 1: Drop the conflicting constraint
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_tier_check;

-- Step 2: Normalize all existing tier values to lowercase
UPDATE customers 
SET tier = LOWER(tier)
WHERE tier IS NOT NULL;

-- Step 3: Set a consistent default
ALTER TABLE customers ALTER COLUMN tier SET DEFAULT 'regular';

-- Step 4: Create a single, consistent constraint (lowercase, all 4 values)
ALTER TABLE customers 
ADD CONSTRAINT customers_tier_check 
CHECK (tier IN ('vip', 'frequent', 'regular', 'inactive'));

-- Step 5: Update the calculate_customer_tier function to return lowercase values
CREATE OR REPLACE FUNCTION calculate_customer_tier(
  p_total_spend decimal,
  p_total_orders integer,
  p_last_purchase_date timestamptz
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_days_since_purchase integer;
BEGIN
  -- Calculate days since last purchase
  IF p_last_purchase_date IS NOT NULL THEN
    v_days_since_purchase := EXTRACT(DAY FROM (CURRENT_TIMESTAMP - p_last_purchase_date));
  ELSE
    v_days_since_purchase := 999999;
  END IF;

  -- VIP: Total spend >= 5000 SAR OR 20+ orders
  IF p_total_spend >= 5000 OR p_total_orders >= 20 THEN
    RETURN 'vip';
  END IF;

  -- Inactive: No purchase in 60+ days
  IF v_days_since_purchase > 60 THEN
    RETURN 'inactive';
  END IF;

  -- Frequent: Total spend >= 1000 SAR OR 5+ orders
  IF p_total_spend >= 1000 OR p_total_orders >= 5 THEN
    RETURN 'frequent';
  END IF;

  -- Regular: Default tier for new/low-activity customers
  RETURN 'regular';
END;
$$;

-- Step 6: Recalculate all customer tiers with the fixed function
UPDATE customers
SET tier = calculate_customer_tier(
  COALESCE(total_spend, 0),
  COALESCE(total_orders, 0),
  last_purchase_date
)
WHERE tier IS NULL OR tier NOT IN ('vip', 'frequent', 'regular', 'inactive');

-- Step 7: Update comment for clarity
COMMENT ON COLUMN customers.tier IS 'Customer tier: vip (5000+ SAR or 20+ orders), frequent (1000+ SAR or 5+ orders and active), regular (default), inactive (60+ days without purchase)';
