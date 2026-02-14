/*
  # Fix Loyalty Transactions for Cancelled/Returned Sales (v2)

  ## Overview
  When sales status changes to cancelled/returned, corresponding loyalty points
  should be deducted. This migration fixes historical data where loyalty transactions
  still exist for cancelled/returned sales.

  ## Problem
  - loyalty_transactions table has points for cancelled/returned sales
  - These points should not count towards customer loyalty
  - Need to add negative transactions to offset the points

  ## Solution
  1. Find all cancelled/returned sales that have positive loyalty transactions
  2. Add negative transactions to offset them
  3. Recalculate customer loyalty_points from transactions
  4. Update triggers to handle this correctly going forward

  ## Changes
  - Add deduction transactions for cancelled/returned sales
  - Update insert trigger to only add points for confirmed sales
  - Recalculate customer loyalty points
*/

-- Step 1: Add negative transactions for cancelled/returned sales
INSERT INTO loyalty_transactions (customer_id, sale_id, points, type, description)
SELECT 
  s.customer_id,
  s.id as sale_id,
  -FLOOR(s.total) as points,
  'deducted' as type,
  CASE 
    WHEN s.status = 'returned' THEN 'Points deducted - Sale returned #' || s.sale_number
    WHEN s.status = 'cancelled' THEN 'Points deducted - Sale cancelled #' || s.sale_number
  END as description
FROM sales s
WHERE s.customer_id IS NOT NULL
  AND s.status IN ('returned', 'cancelled')
  AND EXISTS (
    SELECT 1 FROM loyalty_transactions lt 
    WHERE lt.sale_id = s.id 
      AND lt.points > 0
  )
  AND NOT EXISTS (
    SELECT 1 FROM loyalty_transactions lt 
    WHERE lt.sale_id = s.id 
      AND lt.points < 0
  );

-- Step 2: Recalculate customer loyalty points from transactions
UPDATE customers c
SET loyalty_points = COALESCE(
  (SELECT SUM(lt.points) FROM loyalty_transactions lt WHERE lt.customer_id = c.id),
  0
);

-- Step 3: Update the insert trigger to only add transactions for confirmed sales
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
  -- Draft, returned, or cancelled sales should not add points or count
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

  -- Add loyalty points transaction (no expiry since table doesn't have that column)
  INSERT INTO loyalty_transactions (customer_id, sale_id, points, type, description)
  VALUES (
    v_customer_id,
    NEW.id,
    v_loyalty_points_earned,
    'earned',
    'Points earned from sale #' || NEW.sale_number
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

-- Step 4: Update the status change trigger to use correct table structure
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
  -- Subtract metrics and add negative transaction
  IF v_old_status = 'confirmed' AND v_new_status IN ('returned', 'cancelled') THEN
    UPDATE customers
    SET 
      total_spend = GREATEST(COALESCE(total_spend, 0) - v_sale_total, 0),
      total_orders = GREATEST(COALESCE(total_orders, 0) - 1, 0),
      loyalty_points = GREATEST(COALESCE(loyalty_points, 0) - v_loyalty_points, 0)
    WHERE id = v_customer_id;

    -- Add negative loyalty points transaction for audit trail
    INSERT INTO loyalty_transactions (customer_id, sale_id, points, type, description)
    VALUES (
      v_customer_id,
      NEW.id,
      -v_loyalty_points,
      'deducted',
      CASE 
        WHEN v_new_status = 'returned' THEN 'Points deducted - Sale returned #' || NEW.sale_number
        ELSE 'Points deducted - Sale cancelled #' || NEW.sale_number
      END
    );

  -- Case 2: Changed FROM returned/cancelled TO confirmed
  -- Add metrics and add positive transaction
  ELSIF v_old_status IN ('returned', 'cancelled') AND v_new_status = 'confirmed' THEN
    UPDATE customers
    SET 
      total_spend = COALESCE(total_spend, 0) + v_sale_total,
      total_orders = COALESCE(total_orders, 0) + 1,
      loyalty_points = COALESCE(loyalty_points, 0) + v_loyalty_points,
      last_purchase_date = NEW.sale_date
    WHERE id = v_customer_id;

    -- Add loyalty points transaction
    INSERT INTO loyalty_transactions (customer_id, sale_id, points, type, description)
    VALUES (
      v_customer_id,
      NEW.id,
      v_loyalty_points,
      'earned',
      'Points restored - Sale reactivated #' || NEW.sale_number
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

COMMENT ON FUNCTION handle_sale_status_change() IS 
'Handles customer metric updates when sale status changes. Adds/removes loyalty points via transactions table.';
