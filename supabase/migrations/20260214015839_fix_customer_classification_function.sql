/*
  # Fix Customer Classification Tags Function

  ## Overview
  Fixes the `update_customer_classification_tags()` function that was causing
  "UPDATE requires a WHERE clause" error.

  ## Issue
  The function was performing:
  ```sql
  UPDATE customers
  SET is_top_spender = false, is_most_frequent = false;
  ```
  This UPDATE without WHERE clause violates RLS policies.

  ## Solution
  Rewrite the function to use a single UPDATE with CASE statements instead of
  reset-then-update pattern. This is more efficient and RLS-compliant.

  ## Changes
  - Remove reset UPDATE (no WHERE clause)
  - Use single UPDATE with CASE expressions
  - Maintains same logic for top 10% calculation
  - Keeps SECURITY DEFINER for performance
*/

CREATE OR REPLACE FUNCTION public.update_customer_classification_tags()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
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

  -- Update tags using CASE expressions (single UPDATE, no reset needed)
  UPDATE customers
  SET 
    is_top_spender = CASE 
      WHEN total_spend >= COALESCE(v_top_spend_threshold, 0) AND total_spend > 0 
      THEN true 
      ELSE false 
    END,
    is_most_frequent = CASE 
      WHEN total_orders >= COALESCE(v_top_orders_threshold, 0) AND total_orders > 0 
      THEN true 
      ELSE false 
    END
  WHERE id IN (SELECT id FROM customers);
END;
$function$;
