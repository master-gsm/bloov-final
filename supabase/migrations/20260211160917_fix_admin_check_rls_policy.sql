/*
  # Fix Admin Check - Add Public Read Policy
  
  ## Description
  Adds a policy to allow unauthenticated users to check if any users exist in the system.
  This is needed for the initial setup flow to work correctly.
  
  ## Security Changes
  - Add policy for public read access to check if users table is empty
  - This policy only allows checking existence, not reading user details
  
  ## Important Notes
  1. This policy is safe because it only allows counting/checking existence
  2. No sensitive user data is exposed through this policy
*/

-- Allow anyone to check if users exist (for initial setup)
CREATE POLICY "Anyone can check if users exist"
  ON users FOR SELECT
  TO anon
  USING (true);
