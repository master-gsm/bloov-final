/*
  # Add Observer Role and Fix Foreign Key Constraints

  1. Changes
    - Add 'observer' role to the users table CHECK constraint
    - Observer role: can view ALL data (sales, purchases, inventory, reports, customers, suppliers, cash register) but CANNOT add, edit, or delete anything
    - Fix foreign key constraints on created_by/updated_by columns to allow user deletion (SET NULL on delete)

  2. Role Definitions
    - admin: Full access to everything
    - accountant: Operational access (create sales/purchases, manage cash register)
    - observer (مطلع): Read-only access to ALL sections
    - viewer: Limited view access

  3. FK Constraint Fixes
    - inventory.updated_by -> SET NULL on delete
    - inventory_movements.created_by -> SET NULL on delete
    - customers.created_by -> SET NULL on delete
    - sales.created_by -> SET NULL on delete
    - invoices.created_by -> SET NULL on delete
    - suppliers.created_by -> SET NULL on delete
    - purchases.created_by -> SET NULL on delete
    - transactions.created_by -> SET NULL on delete
    - partner_distributions.created_by -> SET NULL on delete
*/

-- Step 1: Update the role CHECK constraint to include 'observer'
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'accountant', 'viewer', 'observer'));

-- Step 2: Fix FK constraints to allow user deletion
-- inventory.updated_by
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'inventory_updated_by_fkey'
  ) THEN
    ALTER TABLE inventory DROP CONSTRAINT inventory_updated_by_fkey;
    ALTER TABLE inventory ADD CONSTRAINT inventory_updated_by_fkey
      FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- inventory_movements.created_by
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'inventory_movements_created_by_fkey'
  ) THEN
    ALTER TABLE inventory_movements DROP CONSTRAINT inventory_movements_created_by_fkey;
    ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- customers.created_by
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'customers_created_by_fkey'
  ) THEN
    ALTER TABLE customers DROP CONSTRAINT customers_created_by_fkey;
    ALTER TABLE customers ADD CONSTRAINT customers_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- sales.created_by
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'sales_created_by_fkey'
  ) THEN
    ALTER TABLE sales DROP CONSTRAINT sales_created_by_fkey;
    ALTER TABLE sales ADD CONSTRAINT sales_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- invoices.created_by
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'invoices_created_by_fkey'
  ) THEN
    ALTER TABLE invoices DROP CONSTRAINT invoices_created_by_fkey;
    ALTER TABLE invoices ADD CONSTRAINT invoices_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- suppliers.created_by
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'suppliers_created_by_fkey'
  ) THEN
    ALTER TABLE suppliers DROP CONSTRAINT suppliers_created_by_fkey;
    ALTER TABLE suppliers ADD CONSTRAINT suppliers_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- purchases.created_by
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'purchases_created_by_fkey'
  ) THEN
    ALTER TABLE purchases DROP CONSTRAINT purchases_created_by_fkey;
    ALTER TABLE purchases ADD CONSTRAINT purchases_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- transactions.created_by
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'transactions_created_by_fkey'
  ) THEN
    ALTER TABLE transactions DROP CONSTRAINT transactions_created_by_fkey;
    ALTER TABLE transactions ADD CONSTRAINT transactions_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- partner_distributions.created_by
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'partner_distributions_created_by_fkey'
  ) THEN
    ALTER TABLE partner_distributions DROP CONSTRAINT partner_distributions_created_by_fkey;
    ALTER TABLE partner_distributions ADD CONSTRAINT partner_distributions_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;
