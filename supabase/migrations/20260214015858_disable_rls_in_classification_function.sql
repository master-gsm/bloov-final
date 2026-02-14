/*
  # Fix Customer Classification Function - Bypass RLS

  ## Overview
  The customer classification function needs to update ALL customers to recalculate
  top 10% rankings. This requires bypassing RLS temporarily.

  ## Solution
  Use `SET LOCAL row_security = off` within the SECURITY DEFINER function to
  temporarily disable RLS for the duration of the transaction.

  ## Security Considerations
  - This is safe because:
    1. Function is SECURITY DEFINER (runs as owner, not caller)
    2. Only calculates statistical rankings (top 10% spenders/buyers)
    3. Does not expose sensitive data
    4. Sets RLS off locally (transaction-scoped only)
  
  ## Changes
  - Add SET LOCAL row_security = off at start of function
  - Simplify UPDATE to directly set all customer tags
  - More efficient than CASE expressions
*/

CREATE OR REPLACE FUNCTION public.update_customer_classification_tags()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_top_spend_threshold decimal;
  v_top_orders_threshold integer;
BEGIN
  -- Temporarily disable RLS for this function's transaction
  SET LOCAL row_security = off;

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

  -- Reset all tags first (safe now with RLS disabled)
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
$function$;
