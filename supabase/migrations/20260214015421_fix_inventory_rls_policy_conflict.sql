/*
  # Fix Conflicting Inventory RLS Policies

  ## Overview
  Removes old conflicting RLS policy from inventory table that was preventing updates.
  
  ## Issue
  The "Authenticated users can modify inventory" ALL policy conflicts with the more
  specific branch-based UPDATE policy, causing UPDATE failures with "UPDATE requires a WHERE clause" error.
  
  When multiple policies exist, PostgreSQL requires ALL to be satisfied (AND logic).
  The generic ALL policy conflicts with the branch-specific UPDATE policy.

  ## Changes
  1. Drop the old generic ALL policy
  2. Keep the specific branch-based UPDATE policy
  3. This allows inventory updates to work properly with branch isolation

  ## Security Impact
  - Maintains branch isolation for inventory updates
  - Users can only update inventory in their assigned branch
  - Super admins can update all inventory (through the specific policy)
*/

-- Drop the old conflicting policy
DROP POLICY IF EXISTS "Authenticated users can modify inventory" ON inventory;
