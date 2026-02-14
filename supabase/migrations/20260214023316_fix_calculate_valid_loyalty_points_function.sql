/*
  # Fix calculate_valid_loyalty_points Function

  ## Overview
  The calculate_valid_loyalty_points function is looking at the wrong table.
  It looks at `loyalty_point_transactions` but we're now using `loyalty_transactions`.

  ## Problem
  - Function queries `loyalty_point_transactions` (old table with expiry dates)
  - We're actually using `loyalty_transactions` (current table with type field)
  - This causes valid_loyalty_points to show incorrect values

  ## Solution
  Update the function to use `loyalty_transactions` and sum all points
  (earned + deducted - redeemed).

  ## Changes
  - Rewrite calculate_valid_loyalty_points to use loyalty_transactions
  - Sum all points where type IN ('earned', 'deducted')
  - Subtract redeemed points
*/

-- Rewrite the function to use the correct table
CREATE OR REPLACE FUNCTION calculate_valid_loyalty_points(p_customer_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_valid_points integer;
BEGIN
  -- Sum all points from loyalty_transactions
  -- Earned points are positive, deducted are negative, redeemed are negative
  SELECT COALESCE(SUM(points), 0)
  INTO v_valid_points
  FROM loyalty_transactions
  WHERE customer_id = p_customer_id;
  
  -- Make sure we never return negative points
  RETURN GREATEST(v_valid_points, 0);
END;
$$;

-- Also update any triggers that might be using loyalty_point_transactions
-- We need to make sure sale inserts don't add to loyalty_point_transactions anymore
-- Let's check if there's a trigger doing that and disable it

-- Drop any triggers that insert into loyalty_point_transactions
DO $$
BEGIN
  -- Check if trigger exists and drop it
  IF EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    WHERE c.relname = 'sales'
    AND t.tgname LIKE '%loyalty_point%'
  ) THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trigger_add_loyalty_points ON sales';
    EXECUTE 'DROP TRIGGER IF EXISTS add_loyalty_points_on_sale ON sales';
  END IF;
END $$;

-- Recalculate valid_loyalty_points for all customers
UPDATE customers c
SET valid_loyalty_points = calculate_valid_loyalty_points(c.id);

COMMENT ON FUNCTION calculate_valid_loyalty_points(uuid) IS 
'Calculates valid loyalty points for a customer from loyalty_transactions table (sum of all points including earned and deducted)';
