/*
  # Add UPDATE policies for inventory and customers

  1. Changes
    - Add UPDATE policy for inventory table (needed for stock updates during sales)
    - Add UPDATE policy for customers table (needed for credit balance updates)
    - Add INSERT/UPDATE/DELETE policies for inventory table for full CRUD
    - Add INSERT/DELETE policies for customers table for full CRUD
  
  2. Security
    - All policies require user authentication
*/

-- Inventory policies
CREATE POLICY "Users can update inventory"
  ON inventory
  FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can insert inventory"
  ON inventory
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete inventory"
  ON inventory
  FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Customers policies
CREATE POLICY "Users can insert customers"
  ON customers
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update customers"
  ON customers
  FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete customers"
  ON customers
  FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);
