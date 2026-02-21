/*
  # Add INSERT policy for sales table

  1. Security Changes
    - Add INSERT policy on `sales` table allowing admin users to create sales
    - Policy checks that the user's role is 'admin' using get_my_role()

  2. Important Notes
    - Previously only SELECT and UPDATE policies existed on `sales`
    - Without an INSERT policy, all insert operations were blocked by RLS
*/

CREATE POLICY "Admin can insert sales"
  ON public.sales
  FOR INSERT
  TO authenticated
  WITH CHECK (
    get_my_role() = 'admin'
  );
