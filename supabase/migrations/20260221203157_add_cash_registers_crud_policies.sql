/*
  # Add CRUD policies to cash_registers table

  ## Summary
  Adds INSERT and UPDATE policies to allow authenticated users to create and update cash registers.
  The SELECT policy already exists. These are needed for the cash register feature to work.
*/

-- Allow authenticated users to insert cash registers
CREATE POLICY "Authenticated users can create cash registers"
  ON cash_registers FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to update cash registers
CREATE POLICY "Authenticated users can update cash registers"
  ON cash_registers FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to delete cash registers
CREATE POLICY "Authenticated users can delete cash registers"
  ON cash_registers FOR DELETE
  TO authenticated
  USING (true);
