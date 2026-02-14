/*
  # Remove Duplicate Sale Status Trigger

  ## Overview
  Remove the old/duplicate trigger that uses wrong column names (total_spent, order_count)
  and keep only the correct trigger that uses the right column names (total_spend, total_orders).

  ## Issue
  - Two triggers exist for the same purpose
  - Old trigger: `trigger_update_customer_stats_on_status_change` uses `total_spent`, `order_count`
  - New trigger: `trigger_sale_status_change` uses `total_spend`, `total_orders` (correct)
  - App uses `total_spend` and `total_orders`

  ## Solution
  - Drop the old trigger and its function
  - Keep the new correct trigger
*/

-- Drop the old duplicate trigger
DROP TRIGGER IF EXISTS trigger_update_customer_stats_on_status_change ON sales;

-- Drop the old function
DROP FUNCTION IF EXISTS update_customer_stats_on_status_change();

-- Add comment to document cleanup
COMMENT ON TRIGGER trigger_sale_status_change ON sales IS 
'Handles customer metric updates when sale status changes. Uses correct column names: total_spend and total_orders.';
