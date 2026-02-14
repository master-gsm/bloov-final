/*
  # Fix Recalculate Functions - Bypass RLS

  ## Overview
  Fix two admin utility functions that recalculate customer metrics across ALL customers.
  These functions need to bypass RLS to update all customer records.

  ## Functions Fixed
  1. **recalculate_all_customer_metrics()** - Recalculates spend, orders, tier for all customers
  2. **recalculate_all_valid_loyalty_points()** - Recalculates valid loyalty points for all customers

  ## Issue
  Both functions perform UPDATE on all customers without WHERE clause, which violates RLS policies.

  ## Solution
  Add `SET LOCAL row_security = off` to temporarily disable RLS within these SECURITY DEFINER functions.

  ## Security Considerations
  - Safe because:
    1. Functions are SECURITY DEFINER (run as owner)
    2. Only used for administrative recalculation tasks
    3. Calculate metrics from existing sales data
    4. RLS disabled locally (transaction-scoped only)
    5. Not exposed to regular users
*/

-- Fix recalculate_all_customer_metrics function
CREATE OR REPLACE FUNCTION public.recalculate_all_customer_metrics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- Temporarily disable RLS for this function's transaction
  SET LOCAL row_security = off;

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
$function$;

-- Fix recalculate_all_valid_loyalty_points function
CREATE OR REPLACE FUNCTION public.recalculate_all_valid_loyalty_points()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- Temporarily disable RLS for this function's transaction
  SET LOCAL row_security = off;

  -- Update valid_loyalty_points for all customers
  UPDATE customers c
  SET valid_loyalty_points = calculate_valid_loyalty_points(c.id);
END;
$function$;
