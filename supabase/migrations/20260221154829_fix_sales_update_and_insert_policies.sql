/*
  # Fix sales UPDATE and INSERT RLS policies

  1. Problem
    - The `sales` table had no permissive UPDATE policy, only a restrictive soft-delete filter
    - The INSERT policy only allowed 'admin' role, excluding 'super_admin' and 'accountant'
    - This caused "UPDATE requires a WHERE clause" errors during the sale creation flow
      because downstream triggers and frontend code need to update sales records

  2. Changes
    - Add a permissive UPDATE policy for admin, super_admin, and accountant roles
    - Replace the INSERT policy to also allow super_admin and accountant
    
  3. Security
    - UPDATE restricted to authenticated users with admin/super_admin/accountant roles
    - INSERT restricted to authenticated users with admin/super_admin/accountant roles
    - Both policies use get_my_role() for consistent role checking
*/

-- Add UPDATE policy for sales (admin, super_admin, accountant)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'sales' AND policyname = 'Admin and accountant can update sales'
  ) THEN
    CREATE POLICY "Admin and accountant can update sales"
      ON public.sales
      FOR UPDATE
      TO authenticated
      USING (get_my_role() IN ('admin', 'super_admin', 'accountant'))
      WITH CHECK (get_my_role() IN ('admin', 'super_admin', 'accountant'));
  END IF;
END $$;

-- Drop the old INSERT policy that only allowed admin
DROP POLICY IF EXISTS "Admin can insert sales" ON public.sales;

-- Create expanded INSERT policy
CREATE POLICY "Admin and accountant can insert sales"
  ON public.sales
  FOR INSERT
  TO authenticated
  WITH CHECK (
    get_my_role() IN ('admin', 'super_admin', 'accountant')
  );
