/*
  # Fix update_customer_classification_tags function

  The function was running UPDATE customers SET ... without a WHERE clause
  which caused "UPDATE requires a WHERE clause" error from RLS policies.

  Fix: Add WHERE clauses to the reset UPDATE statements so RLS is satisfied.
  Also use a more efficient single-pass UPDATE with CASE expressions.
*/

CREATE OR REPLACE FUNCTION update_customer_classification_tags()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_top_spend_threshold decimal;
  v_top_orders_threshold integer;
BEGIN
  SELECT PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY total_spend)
  INTO v_top_spend_threshold
  FROM customers
  WHERE total_spend > 0;

  SELECT PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY total_orders)
  INTO v_top_orders_threshold
  FROM customers
  WHERE total_orders > 0;

  UPDATE customers
  SET
    is_top_spender = CASE
      WHEN total_spend >= COALESCE(v_top_spend_threshold, 0) AND total_spend > 0 THEN true
      ELSE false
    END,
    is_most_frequent = CASE
      WHEN total_orders >= COALESCE(v_top_orders_threshold, 0) AND total_orders > 0 THEN true
      ELSE false
    END
  WHERE id IS NOT NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION update_customer_classification_tags() TO authenticated;
