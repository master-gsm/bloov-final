/*
  # Add 'deducted' Type to Loyalty Transactions

  ## Overview
  Add 'deducted' as a valid type for loyalty_transactions to track
  points removed when sales are cancelled or returned.

  ## Current Constraint
  type IN ('earned', 'redeemed')

  ## New Constraint
  type IN ('earned', 'redeemed', 'deducted')

  ## Usage
  - 'earned': Points earned from confirmed sales
  - 'redeemed': Points redeemed/used by customer
  - 'deducted': Points removed when sale is cancelled/returned
*/

-- Drop the old constraint
ALTER TABLE loyalty_transactions
DROP CONSTRAINT IF EXISTS loyalty_transactions_type_check;

-- Add the new constraint with 'deducted' type
ALTER TABLE loyalty_transactions
ADD CONSTRAINT loyalty_transactions_type_check
CHECK (type IN ('earned', 'redeemed', 'deducted'));

-- Add helpful comment
COMMENT ON COLUMN loyalty_transactions.type IS 
'Transaction type: earned (from sales), redeemed (used by customer), or deducted (cancelled/returned sales)';
