/*
  # Add Cost of Goods Sold (COGS) and Profit Tracking

  ## Summary
  This migration adds proper cost tracking to enable accurate profit calculations.
  The Net Profit was previously calculated incorrectly because product costs (purchase_price) 
  were not being tracked at the time of sale.

  ## Changes

  ### 1. New Columns in sale_items
    - `purchase_price` (numeric) - The cost/buying price of the product at time of sale
    - This allows us to calculate: Item Profit = (unit_price - purchase_price) * quantity

  ### 2. New Columns in sales
    - `total_cost` (numeric) - Sum of all COGS for items in this sale
    - `gross_profit` (numeric) - Revenue minus COGS (total - total_cost)
    - `profit_margin` (numeric) - Percentage profit margin ((gross_profit / total) * 100)

  ## Calculations

  ### Item Level
  - Item Cost = purchase_price * quantity
  - Item Profit = (unit_price - purchase_price) * quantity (after discount)

  ### Invoice Level
  - Total Cost (COGS) = Sum of all item costs
  - Gross Profit = Total Revenue - Total Cost
  - Profit Margin % = (Gross Profit / Total Revenue) * 100

  ### Business Level (Dashboard)
  - Net Profit = Total Revenue - Total COGS - Operating Expenses

  ## Data Migration
  - Backfills purchase_price for existing sale_items using current product prices
  - Recalculates total_cost and gross_profit for existing sales
  - This provides historical profit data based on current product costs

  ## Security
  - RLS policies automatically apply to new columns
  - No new tables, so existing policies remain effective
*/

-- Step 1: Add purchase_price column to sale_items
ALTER TABLE sale_items 
ADD COLUMN IF NOT EXISTS purchase_price numeric DEFAULT 0 NOT NULL;

COMMENT ON COLUMN sale_items.purchase_price IS 'Cost/buying price of the product at time of sale (for COGS calculation)';

-- Step 2: Add profit tracking columns to sales table
ALTER TABLE sales 
ADD COLUMN IF NOT EXISTS total_cost numeric DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS gross_profit numeric DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS profit_margin numeric DEFAULT 0 NOT NULL;

COMMENT ON COLUMN sales.total_cost IS 'Total Cost of Goods Sold (COGS) for all items in this sale';
COMMENT ON COLUMN sales.gross_profit IS 'Gross profit (total revenue - total cost)';
COMMENT ON COLUMN sales.profit_margin IS 'Profit margin percentage ((gross_profit / total) * 100)';

-- Step 3: Backfill purchase_price for existing sale_items from current product prices
UPDATE sale_items si
SET purchase_price = COALESCE(p.purchase_price, 0)
FROM products p
WHERE si.product_id = p.id
AND si.purchase_price = 0;

-- Step 4: Create a function to calculate sale costs and profit
CREATE OR REPLACE FUNCTION calculate_sale_profit(sale_id_param uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_cost numeric;
  v_total_revenue numeric;
  v_gross_profit numeric;
  v_profit_margin numeric;
BEGIN
  -- Calculate total cost (COGS)
  SELECT COALESCE(SUM(purchase_price * quantity), 0)
  INTO v_total_cost
  FROM sale_items
  WHERE sale_id = sale_id_param;

  -- Get total revenue
  SELECT total
  INTO v_total_revenue
  FROM sales
  WHERE id = sale_id_param;

  -- Calculate gross profit
  v_gross_profit := v_total_revenue - v_total_cost;

  -- Calculate profit margin percentage
  IF v_total_revenue > 0 THEN
    v_profit_margin := (v_gross_profit / v_total_revenue) * 100;
  ELSE
    v_profit_margin := 0;
  END IF;

  -- Update the sales record
  UPDATE sales
  SET 
    total_cost = v_total_cost,
    gross_profit = v_gross_profit,
    profit_margin = v_profit_margin,
    updated_at = now()
  WHERE id = sale_id_param;
END;
$$;

COMMENT ON FUNCTION calculate_sale_profit IS 'Recalculates cost, gross profit, and profit margin for a sale';

-- Step 5: Backfill profit calculations for all existing sales
DO $$
DECLARE
  sale_record RECORD;
BEGIN
  FOR sale_record IN SELECT id FROM sales WHERE status != 'cancelled'
  LOOP
    PERFORM calculate_sale_profit(sale_record.id);
  END LOOP;
END $$;

-- Step 6: Create a trigger to automatically update profit when sale_items change
CREATE OR REPLACE FUNCTION update_sale_profit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Recalculate profit for the affected sale
  IF TG_OP = 'DELETE' THEN
    PERFORM calculate_sale_profit(OLD.sale_id);
  ELSE
    PERFORM calculate_sale_profit(NEW.sale_id);
  END IF;
  
  RETURN NULL;
END;
$$;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS sale_items_profit_update ON sale_items;

CREATE TRIGGER sale_items_profit_update
AFTER INSERT OR UPDATE OR DELETE ON sale_items
FOR EACH ROW
EXECUTE FUNCTION update_sale_profit_trigger();

COMMENT ON TRIGGER sale_items_profit_update ON sale_items IS 'Automatically recalculates profit when sale items are added, updated, or deleted';

-- Step 7: Create indexes for better performance on profit queries
CREATE INDEX IF NOT EXISTS idx_sale_items_purchase_price ON sale_items(purchase_price);
CREATE INDEX IF NOT EXISTS idx_sales_gross_profit ON sales(gross_profit);
CREATE INDEX IF NOT EXISTS idx_sales_profit_margin ON sales(profit_margin);
CREATE INDEX IF NOT EXISTS idx_sales_total_cost ON sales(total_cost);

-- Step 8: Create a view for easy profit reporting
CREATE OR REPLACE VIEW sales_profit_summary AS
SELECT 
  s.id,
  s.sale_number,
  s.sale_date,
  s.customer_id,
  c.name as customer_name,
  s.subtotal,
  s.discount,
  s.tax,
  s.total as total_revenue,
  s.total_cost,
  s.gross_profit,
  s.profit_margin,
  s.status,
  s.created_at
FROM sales s
LEFT JOIN customers c ON s.customer_id = c.id
WHERE s.status != 'cancelled'
ORDER BY s.sale_date DESC;

COMMENT ON VIEW sales_profit_summary IS 'Summary view of sales with profit calculations for reporting';

-- Grant access to authenticated users
GRANT SELECT ON sales_profit_summary TO authenticated;