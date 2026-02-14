/*
  # Fix Conflicting Customer RLS Policies

  ## Overview
  Removes old conflicting RLS policy from customers table that was preventing updates.
  
  ## Issue
  The "Authenticated users can modify customers" ALL policy conflicts with the more
  specific branch-based policies, causing UPDATE failures.

  ## Changes
  1. Drop the old generic ALL policy
  2. Keep the specific branch-based policies
*/

-- Drop the old conflicting policy
DROP POLICY IF EXISTS "Authenticated users can modify customers" ON customers;
