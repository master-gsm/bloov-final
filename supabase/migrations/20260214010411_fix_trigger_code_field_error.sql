/*
  # Fix Trigger Function - Code Field Error

  ## Changes
  
  Updates the `update_customer_metrics_on_sale()` function to use `sale_number` instead of `code`
  since the sales table uses `sale_number` as the field name, not `code`.
  
  ## Fix Applied
  - Changed reference from NEW.code to NEW.sale_number in the trigger function
*/

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

  -- Add loyalty points transaction with 365-day expiry (using sale_number instead of code)
  PERFORM add_loyalty_points_transaction(
    v_customer_id,
    NEW.id,
    v_loyalty_points_earned,
    'Points earned from sale #' || NEW.sale_number
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
