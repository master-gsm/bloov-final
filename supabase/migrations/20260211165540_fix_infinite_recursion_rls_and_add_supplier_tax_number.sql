/*
  # Fix infinite recursion in RLS policies and add supplier tax number

  1. Changes
    - Replace all RLS policies on `users` table that self-reference with `get_my_role()` function
    - Replace all RLS policies on `partner_contributions` that reference `users` table with `get_my_role()` function
    - Add `tax_number` column to `suppliers` table

  2. Security
    - All policies now use the SECURITY DEFINER function `get_my_role()` to avoid infinite recursion
    - Same access control logic is preserved (admin-only for admin operations)

  3. New Columns
    - `suppliers.tax_number` (text, nullable) - Supplier tax identification number
*/

-- Drop problematic policies on users table
DROP POLICY IF EXISTS "Admins can view all users" ON users;
DROP POLICY IF EXISTS "Admins can insert users" ON users;
DROP POLICY IF EXISTS "Admins can update any user" ON users;
DROP POLICY IF EXISTS "Admins can delete users" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;

-- Recreate users policies using get_my_role() to avoid recursion
CREATE POLICY "Admins can view all users"
  ON users FOR SELECT
  TO authenticated
  USING (get_my_role() = 'admin');

CREATE POLICY "Admins can insert users"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (get_my_role() = 'admin');

CREATE POLICY "Admins can update any user"
  ON users FOR UPDATE
  TO authenticated
  USING (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');

CREATE POLICY "Admins can delete users"
  ON users FOR DELETE
  TO authenticated
  USING (get_my_role() = 'admin');

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Drop problematic policies on partner_contributions
DROP POLICY IF EXISTS "Admins can manage partner contributions" ON partner_contributions;
DROP POLICY IF EXISTS "Admins can insert partner contributions" ON partner_contributions;
DROP POLICY IF EXISTS "Admins can update partner contributions" ON partner_contributions;
DROP POLICY IF EXISTS "Admins can delete partner contributions" ON partner_contributions;

-- Recreate partner_contributions policies using get_my_role()
CREATE POLICY "Admins can view partner contributions"
  ON partner_contributions FOR SELECT
  TO authenticated
  USING (get_my_role() = 'admin');

CREATE POLICY "Admins can insert partner contributions"
  ON partner_contributions FOR INSERT
  TO authenticated
  WITH CHECK (get_my_role() = 'admin');

CREATE POLICY "Admins can update partner contributions"
  ON partner_contributions FOR UPDATE
  TO authenticated
  USING (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');

CREATE POLICY "Admins can delete partner contributions"
  ON partner_contributions FOR DELETE
  TO authenticated
  USING (get_my_role() = 'admin');

-- Add tax_number to suppliers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'suppliers' AND column_name = 'tax_number'
  ) THEN
    ALTER TABLE suppliers ADD COLUMN tax_number text;
  END IF;
END $$;