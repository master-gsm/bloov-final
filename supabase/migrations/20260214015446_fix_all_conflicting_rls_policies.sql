/*
  # Fix All Conflicting RLS Policies

  ## Overview
  Removes old generic ALL policies that conflict with specific branch-based policies.
  
  ## Issue
  Several tables have generic "Authenticated users can modify X" ALL policies that
  conflict with branch-specific UPDATE policies, causing "UPDATE requires a WHERE clause" errors.
  
  When multiple policies exist for the same operation, PostgreSQL requires ALL to be
  satisfied using AND logic. Generic ALL policies conflict with branch-specific policies.

  ## Tables Fixed
  1. **sales** - Drop generic ALL policy, keep branch-specific UPDATE
  2. **purchases** - Drop generic ALL policy, keep branch-specific UPDATE
  
  ## Why This Is Safe
  - Each table still has proper INSERT, SELECT, UPDATE, DELETE policies
  - Branch isolation is maintained through specific policies
  - Super admins have appropriate access through role-based policies
  - Financial data remains properly isolated by branch

  ## Changes
  Drops conflicting ALL policies from:
  - sales
  - purchases
*/

-- Drop conflicting policies from sales
DROP POLICY IF EXISTS "Authenticated users can modify sales" ON sales;

-- Drop conflicting policies from purchases
DROP POLICY IF EXISTS "Authenticated users can modify purchases" ON purchases;
