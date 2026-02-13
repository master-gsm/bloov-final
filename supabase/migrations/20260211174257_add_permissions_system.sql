/*
  # Add Individual Permissions System

  1. Changes
    - Add `permissions` JSONB column to `users` table to store individual permission toggles
    - Keep `role` column for backward compatibility and quick role assignment
    - Add default permissions for existing users based on their roles
  
  2. Permissions Structure
    The permissions JSONB will contain:
    ```json
    {
      "view_sales": true,
      "create_sales": false,
      "view_purchases": true,
      "create_purchases": false,
      "view_inventory": true,
      "manage_inventory": false,
      "view_reports": true,
      "view_cash_register": true,
      "manage_cash_register": false,
      "view_customers": true,
      "manage_customers": false,
      "view_suppliers": true,
      "manage_suppliers": false,
      "manage_users": false,
      "manage_settings": false
    }
    ```
  
  3. Notes
    - Admin role gets all permissions
    - Accountant role gets most operational permissions
    - Viewer role gets only view permissions
*/

-- Add permissions column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}'::jsonb;

-- Update existing users with default permissions based on their role
UPDATE users
SET permissions = CASE
  WHEN role = 'admin' THEN jsonb_build_object(
    'view_sales', true,
    'create_sales', true,
    'view_purchases', true,
    'create_purchases', true,
    'view_inventory', true,
    'manage_inventory', true,
    'view_reports', true,
    'view_cash_register', true,
    'manage_cash_register', true,
    'view_customers', true,
    'manage_customers', true,
    'view_suppliers', true,
    'manage_suppliers', true,
    'manage_users', true,
    'manage_settings', true
  )
  WHEN role = 'accountant' THEN jsonb_build_object(
    'view_sales', true,
    'create_sales', true,
    'view_purchases', true,
    'create_purchases', true,
    'view_inventory', true,
    'manage_inventory', false,
    'view_reports', true,
    'view_cash_register', true,
    'manage_cash_register', true,
    'view_customers', true,
    'manage_customers', false,
    'view_suppliers', true,
    'manage_suppliers', false,
    'manage_users', false,
    'manage_settings', false
  )
  WHEN role = 'viewer' THEN jsonb_build_object(
    'view_sales', true,
    'create_sales', false,
    'view_purchases', false,
    'create_purchases', false,
    'view_inventory', true,
    'manage_inventory', false,
    'view_reports', true,
    'view_cash_register', false,
    'manage_cash_register', false,
    'view_customers', false,
    'manage_customers', false,
    'view_suppliers', false,
    'manage_suppliers', false,
    'manage_users', false,
    'manage_settings', false
  )
  ELSE '{}'::jsonb
END
WHERE permissions = '{}'::jsonb OR permissions IS NULL;