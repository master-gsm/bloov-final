/*
  # Update Customer Metrics on Sale Status Change

  ## Overview
  When a sale status changes (confirmed → returned/cancelled or vice versa),
  customer metrics (total_spend, total_orders, loyalty_points) need to be recalculated.

  ## Problem
  Currently, customer metrics are only updated when a sale is INSERT-ed.
  When sale status changes to "returned" or "cancelled", the customer's metrics
  are not adjusted, leading to incorrect spending and loyalty points.

  ## Solution
  1. Create a function to handle sale status changes
  2. Add trigger on UPDATE of sales table
  3. When status changes:
     - FROM confirmed TO returned/cancelled: Subtract from customer metrics
     - FROM returned/cancelled TO confirmed: Add to customer metrics
     - Only count sales with status = 'confirmed' in metrics

  ## Changes
  - New function: `handle_sale_status_change()`
  - New trigger: `trigger_sale_status_change` on sales table UPDATE
  - Only confirmed sales count towards customer metrics

  ## Security
  - Function uses SECURITY DEFINER to bypass RLS for metric updates
  - Safe because it only updates customer's own metrics based on their sales
*/

-- Step 1: Create function to handle sale status changes
CREATE OR REPLACE FUNCTION handle_sale_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
  v_sale_total decimal;
  v_loyalty_points integer;
  v_old_status text;
  v_new_status text;
BEGIN
  -- Get customer ID
  v_customer_id := NEW.customer_id;
  
  -- Skip if no customer (walk-in sales)
  IF v_customer_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get old and new status
  v_old_status := OLD.status;
  v_new_status := NEW.status;
  
  -- Skip if status didn't change
  IF v_old_status = v_new_status THEN
    RETURN NEW;
  END IF;

  -- Get sale total and calculate loyalty points
  v_sale_total := NEW.total;
  v_loyalty_points := FLOOR(v_sale_total);

  -- Case 1: Changed FROM confirmed TO returned/cancelled
  -- Subtract metrics
  IF v_old_status = 'confirmed' AND v_new_status IN ('returned', 'cancelled') THEN
    UPDATE customers
    SET 
      total_spend = GREATEST(COALESCE(total_spend, 0) - v_sale_total, 0),
      total_orders = GREATEST(COALESCE(total_orders, 0) - 1, 0),
      loyalty_points = GREATEST(COALESCE(loyalty_points, 0) - v_loyalty_points, 0)
    WHERE id = v_customer_id;

    -- Add negative loyalty points transaction for audit trail
    INSERT INTO loyalty_transactions (customer_id, sale_id, points, description, expires_at)
    VALUES (
      v_customer_id,
      NEW.id,
      -v_loyalty_points,
      CASE 
        WHEN v_new_status = 'returned' THEN 'Points deducted - Sale returned #' || NEW.sale_number
        ELSE 'Points deducted - Sale cancelled #' || NEW.sale_number
      END,
      NULL
    );

  -- Case 2: Changed FROM returned/cancelled TO confirmed
  -- Add metrics
  ELSIF v_old_status IN ('returned', 'cancelled') AND v_new_status = 'confirmed' THEN
    UPDATE customers
    SET 
      total_spend = COALESCE(total_spend, 0) + v_sale_total,
      total_orders = COALESCE(total_orders, 0) + 1,
      loyalty_points = COALESCE(loyalty_points, 0) + v_loyalty_points,
      last_purchase_date = NEW.sale_date
    WHERE id = v_customer_id;

    -- Add loyalty points transaction
    INSERT INTO loyalty_transactions (customer_id, sale_id, points, description, expires_at)
    VALUES (
      v_customer_id,
      NEW.id,
      v_loyalty_points,
      'Points restored - Sale reactivated #' || NEW.sale_number,
      CURRENT_DATE + INTERVAL '365 days'
    );
  END IF;

  -- Update tier based on new metrics
  UPDATE customers
  SET tier = calculate_customer_tier(total_spend, total_orders, last_purchase_date)
  WHERE id = v_customer_id;

  -- Update valid loyalty points
  UPDATE customers
  SET valid_loyalty_points = calculate_valid_loyalty_points(id)
  WHERE id = v_customer_id;

  -- Update classification tags
  PERFORM update_customer_classification_tags();

  RETURN NEW;
END;
$$;

-- Step 2: Create trigger on sales UPDATE
DROP TRIGGER IF EXISTS trigger_sale_status_change ON sales;
CREATE TRIGGER trigger_sale_status_change
  AFTER UPDATE ON sales
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION handle_sale_status_change();

-- Step 3: Add helpful comments
COMMENT ON FUNCTION handle_sale_status_change() IS 
'Automatically adjusts customer metrics (spend, orders, loyalty points) when sale status changes between confirmed/returned/cancelled';

COMMENT ON TRIGGER trigger_sale_status_change ON sales IS 
'Triggers customer metric updates when sale status changes';

-- Step 4: Update the existing insert trigger function to only count confirmed sales
CREATE OR REPLACE FUNCTION update_customer_metrics_on_sale()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Only process if status is 'confirmed'
  -- Draft, returned, or cancelled sales should not count
  IF NEW.status != 'confirmed' THEN
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
  INSERT INTO loyalty_transactions (customer_id, sale_id, points, description, expires_at)
  VALUES (
    v_customer_id,
    NEW.id,
    v_loyalty_points_earned,
    'Points earned from sale #' || NEW.sale_number,
    CURRENT_DATE + INTERVAL '365 days'
  );

  -- Update tier based on new metrics
  UPDATE customers
  SET tier = calculate_customer_tier(total_spend, total_orders, last_purchase_date)
  WHERE id = v_customer_id;
  
  -- Update valid loyalty points
  UPDATE customers
  SET valid_loyalty_points = calculate_valid_loyalty_points(id)
  WHERE id = v_customer_id;

  -- Update classification tags (Top Spender, Most Frequent)
  PERFORM update_customer_classification_tags();

  RETURN NEW;
END;
$$;

-- Step 5: Create function to fix existing customer metrics
-- This will recalculate metrics based ONLY on confirmed sales
CREATE OR REPLACE FUNCTION fix_customer_metrics_for_existing_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Temporarily disable RLS
  SET LOCAL row_security = off;

  -- Recalculate all customer metrics based on confirmed sales only
  UPDATE customers c
  SET 
    total_spend = COALESCE(
      (SELECT SUM(s.total) FROM sales s 
       WHERE s.customer_id = c.id AND s.status = 'confirmed'),
      0
    ),
    total_orders = COALESCE(
      (SELECT COUNT(*) FROM sales s 
       WHERE s.customer_id = c.id AND s.status = 'confirmed'),
      0
    ),
    last_purchase_date = (
      SELECT MAX(s.sale_date) FROM sales s 
      WHERE s.customer_id = c.id AND s.status = 'confirmed'
    );

  -- Update tiers
  UPDATE customers
  SET tier = calculate_customer_tier(total_spend, total_orders, last_purchase_date);

  -- Recalculate loyalty points from transactions
  UPDATE customers c
  SET 
    loyalty_points = COALESCE(
      (SELECT SUM(lt.points) FROM loyalty_transactions lt WHERE lt.customer_id = c.id),
      0
    ),
    valid_loyalty_points = calculate_valid_loyalty_points(c.id);

  -- Update classification tags
  PERFORM update_customer_classification_tags();
END;
$$;

COMMENT ON FUNCTION fix_customer_metrics_for_existing_data() IS 
'One-time function to recalculate customer metrics based on confirmed sales only. Run this to fix historical data.';
