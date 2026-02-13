/*
  # Fix Partner Contribution Cascade Delete

  1. Changes
    - Update operating_expenses table to CASCADE delete when partner contribution is deleted
    - This ensures that when a partner payment is deleted, the linked expense is also removed
    - Maintains data consistency between partner_contributions and operating_expenses

  2. Security
    - No changes to RLS policies (already restricted to admin)
*/

-- Drop the existing foreign key constraint
ALTER TABLE operating_expenses 
DROP CONSTRAINT IF EXISTS operating_expenses_partner_contribution_id_fkey;

-- Recreate the foreign key with CASCADE delete
ALTER TABLE operating_expenses
ADD CONSTRAINT operating_expenses_partner_contribution_id_fkey
FOREIGN KEY (partner_contribution_id)
REFERENCES partner_contributions(id)
ON DELETE CASCADE;