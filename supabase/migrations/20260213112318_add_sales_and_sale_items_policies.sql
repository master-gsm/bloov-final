/*
  # Fix Sales and Sale Items RLS Policies

  1. Changes
    - Add INSERT policy for sales table to allow authenticated users to create sales
    - Add UPDATE policy for sales table to allow authenticated users to update sales
    - Add DELETE policy for sales table to allow authenticated users to delete sales
    - Add INSERT policy for sale_items table to allow authenticated users to add sale items
    - Add UPDATE policy for sale_items table to allow authenticated users to update sale items
    - Add DELETE policy for sale_items table to allow authenticated users to delete sale items
  
  2. Security
    - All policies require user authentication
    - Policies allow full CRUD operations for authenticated users
*/

-- Add INSERT policy for sales
CREATE POLICY "Users can create sales"
  ON sales
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Add UPDATE policy for sales
CREATE POLICY "Users can update sales"
  ON sales
  FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Add DELETE policy for sales
CREATE POLICY "Users can delete sales"
  ON sales
  FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Add INSERT policy for sale_items
CREATE POLICY "Users can create sale items"
  ON sale_items
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Add UPDATE policy for sale_items
CREATE POLICY "Users can update sale items"
  ON sale_items
  FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Add DELETE policy for sale_items
CREATE POLICY "Users can delete sale items"
  ON sale_items
  FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);
