/*
  # Add 'returned' Status to Sales Table

  ## Overview
  Add 'returned' as a valid status for sales to track returned/refunded orders.

  ## Current Constraint
  status IN ('draft', 'confirmed', 'cancelled')

  ## New Constraint
  status IN ('draft', 'confirmed', 'cancelled', 'returned')

  ## Usage
  - 'draft': Sale is being created
  - 'confirmed': Sale is complete and confirmed
  - 'cancelled': Sale was cancelled before completion
  - 'returned': Customer returned the goods (refunded)
*/

-- Drop the old constraint
ALTER TABLE sales
DROP CONSTRAINT IF EXISTS sales_status_check;

-- Add the new constraint with 'returned' status
ALTER TABLE sales
ADD CONSTRAINT sales_status_check
CHECK (status IN ('draft', 'confirmed', 'cancelled', 'returned'));

-- Add helpful comment
COMMENT ON COLUMN sales.status IS 
'Sale status: draft (being created), confirmed (complete), cancelled (cancelled before completion), or returned (customer returned goods)';
