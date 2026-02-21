/*
  # Allow admins to update any user profile

  1. Changes
    - Drop existing restrictive UPDATE policy on `users` table
    - Create new UPDATE policy that allows:
      - Admins to update any user
      - Non-admins to update only their own profile

  2. Security
    - Admin check uses a subquery on `users` table
    - Non-admins remain restricted to self-update only
*/

DROP POLICY IF EXISTS "Users can update own profile only" ON public.users;

CREATE POLICY "Users can update own profile or admin updates any"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  )
  WITH CHECK (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );
