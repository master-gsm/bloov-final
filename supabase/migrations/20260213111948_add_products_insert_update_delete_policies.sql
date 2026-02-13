/*
  # Fix Products RLS Policies

  1. Changes
    - Add INSERT policy for products table to allow authenticated users to add products
    - Add UPDATE policy for products table to allow authenticated users to update products
    - Add DELETE policy for products table to allow authenticated users to soft-delete products
  
  2. Security
    - All policies require user authentication
    - Policies allow full CRUD operations for authenticated users
*/

-- Add INSERT policy for products
CREATE POLICY "Users can add products"
  ON products
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Add UPDATE policy for products
CREATE POLICY "Users can update products"
  ON products
  FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Add DELETE policy for products
CREATE POLICY "Users can delete products"
  ON products
  FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);
