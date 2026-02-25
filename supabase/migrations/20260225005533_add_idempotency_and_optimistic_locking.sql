/*
  # Add Idempotency Keys and Optimistic Locking

  1. Idempotency
    - Add idempotency_key to sales table for preventing duplicate submissions
    - Add unique constraint for active idempotency keys

  2. Optimistic Locking
    - Add version column to critical tables
    - Add triggers to auto-increment version on update
    
  3. Tables affected
    - sales (idempotency + version)
    - products (version)
    - customers (version)
    - suppliers (version)
    - employees (version)
*/

-- Add idempotency_key to sales table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'sales' 
    AND column_name = 'idempotency_key'
  ) THEN
    ALTER TABLE sales ADD COLUMN idempotency_key UUID;
    CREATE UNIQUE INDEX idx_sales_idempotency_key ON sales(idempotency_key) WHERE idempotency_key IS NOT NULL;
  END IF;
END $$;

-- Add version columns for optimistic locking
DO $$
BEGIN
  -- Products
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'version'
  ) THEN
    ALTER TABLE products ADD COLUMN version INTEGER DEFAULT 1 NOT NULL;
  END IF;

  -- Customers
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'version'
  ) THEN
    ALTER TABLE customers ADD COLUMN version INTEGER DEFAULT 1 NOT NULL;
  END IF;

  -- Suppliers
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'suppliers' AND column_name = 'version'
  ) THEN
    ALTER TABLE suppliers ADD COLUMN version INTEGER DEFAULT 1 NOT NULL;
  END IF;

  -- Employees
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'employees' AND column_name = 'version'
  ) THEN
    ALTER TABLE employees ADD COLUMN version INTEGER DEFAULT 1 NOT NULL;
  END IF;

  -- Sales
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'version'
  ) THEN
    ALTER TABLE sales ADD COLUMN version INTEGER DEFAULT 1 NOT NULL;
  END IF;
END $$;

-- Create trigger function to increment version on update
CREATE OR REPLACE FUNCTION increment_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.version = OLD.version + 1;
  RETURN NEW;
END;
$$;

-- Add triggers for version increment
DO $$
BEGIN
  -- Products
  DROP TRIGGER IF EXISTS products_version_trigger ON products;
  CREATE TRIGGER products_version_trigger
    BEFORE UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION increment_version();

  -- Customers
  DROP TRIGGER IF EXISTS customers_version_trigger ON customers;
  CREATE TRIGGER customers_version_trigger
    BEFORE UPDATE ON customers
    FOR EACH ROW
    EXECUTE FUNCTION increment_version();

  -- Suppliers
  DROP TRIGGER IF EXISTS suppliers_version_trigger ON suppliers;
  CREATE TRIGGER suppliers_version_trigger
    BEFORE UPDATE ON suppliers
    FOR EACH ROW
    EXECUTE FUNCTION increment_version();

  -- Employees
  DROP TRIGGER IF EXISTS employees_version_trigger ON employees;
  CREATE TRIGGER employees_version_trigger
    BEFORE UPDATE ON employees
    FOR EACH ROW
    EXECUTE FUNCTION increment_version();

  -- Sales
  DROP TRIGGER IF EXISTS sales_version_trigger ON sales;
  CREATE TRIGGER sales_version_trigger
    BEFORE UPDATE ON sales
    FOR EACH ROW
    EXECUTE FUNCTION increment_version();
END $$;

-- Add comment
COMMENT ON COLUMN sales.idempotency_key IS 'UUID to prevent duplicate sale submissions';
COMMENT ON COLUMN products.version IS 'Optimistic locking version number';
COMMENT ON COLUMN customers.version IS 'Optimistic locking version number';
COMMENT ON COLUMN suppliers.version IS 'Optimistic locking version number';
COMMENT ON COLUMN employees.version IS 'Optimistic locking version number';
COMMENT ON COLUMN sales.version IS 'Optimistic locking version number';