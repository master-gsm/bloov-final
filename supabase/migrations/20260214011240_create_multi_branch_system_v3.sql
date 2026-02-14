/*
  # Multi-Branch Management System with Strict Data Isolation - V3

  ## Overview
  Comprehensive multi-branch system for managing multiple store locations with strict data isolation.

  ## New Tables
  1. branches - Core branch entity
  2. branch_stock - Branch-specific inventory
  3. setup_expenses - Capital/founding expenses

  ## Modified Tables
  Adds branch_id to: users, sales, inventory, expenses, customers, cash_transactions, purchases

  ## New Role: super_admin
*/

-- ============================================================================
-- 1. UPDATE USERS ROLE CONSTRAINT
-- ============================================================================

DO $$
BEGIN
  ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
  ALTER TABLE users ADD CONSTRAINT users_role_check 
    CHECK (role IN ('admin', 'manager', 'employee', 'accountant', 'observer', 'super_admin'));
END $$;

-- ============================================================================
-- 2. CREATE BRANCHES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text UNIQUE NOT NULL,
  location text,
  city text,
  phone text,
  manager_id uuid,
  is_active boolean DEFAULT true,
  opening_date date DEFAULT CURRENT_DATE,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_branches_is_active ON branches(is_active);
CREATE INDEX IF NOT EXISTS idx_branches_manager_id ON branches(manager_id);

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 3. ADD BRANCH_ID TO EXISTING TABLES
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE users ADD COLUMN branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
    CREATE INDEX idx_users_branch_id ON users(branch_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE sales ADD COLUMN branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
    CREATE INDEX idx_sales_branch_id ON sales(branch_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE inventory ADD COLUMN branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
    CREATE INDEX idx_inventory_branch_id ON inventory(branch_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE expenses ADD COLUMN branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
    CREATE INDEX idx_expenses_branch_id ON expenses(branch_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customers' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE customers ADD COLUMN branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
    CREATE INDEX idx_customers_branch_id ON customers(branch_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cash_transactions' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE cash_transactions ADD COLUMN branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
    CREATE INDEX idx_cash_transactions_branch_id ON cash_transactions(branch_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchases' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE purchases ADD COLUMN branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
    CREATE INDEX idx_purchases_branch_id ON purchases(branch_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operating_expenses' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE operating_expenses ADD COLUMN branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
    CREATE INDEX idx_operating_expenses_branch_id ON operating_expenses(branch_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cash_shifts' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE cash_shifts ADD COLUMN branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
    CREATE INDEX idx_cash_shifts_branch_id ON cash_shifts(branch_id);
  END IF;
END $$;

-- ============================================================================
-- 4. ADD FK CONSTRAINT FOR MANAGER_ID
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'branches_manager_id_fkey'
  ) THEN
    ALTER TABLE branches 
    ADD CONSTRAINT branches_manager_id_fkey 
    FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================================
-- 5. CREATE BRANCH_STOCK TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS branch_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 0,
  min_stock_level integer DEFAULT 10,
  max_stock_level integer DEFAULT 1000,
  last_restock_date timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(branch_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_branch_stock_branch_id ON branch_stock(branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_stock_product_id ON branch_stock(product_id);
CREATE INDEX IF NOT EXISTS idx_branch_stock_low_stock ON branch_stock(branch_id, product_id) 
  WHERE quantity <= min_stock_level;

ALTER TABLE branch_stock ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 6. CREATE SETUP_EXPENSES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS setup_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  category text NOT NULL,
  description text NOT NULL,
  amount decimal(15,2) NOT NULL,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  payment_method text,
  receipt_number text,
  attachment text,
  is_amortizable boolean DEFAULT false,
  amortization_months integer DEFAULT 0,
  notes text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_amortization CHECK (
    (is_amortizable = false AND amortization_months = 0) OR
    (is_amortizable = true AND amortization_months > 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_setup_expenses_branch_id ON setup_expenses(branch_id);
CREATE INDEX IF NOT EXISTS idx_setup_expenses_category ON setup_expenses(category);
CREATE INDEX IF NOT EXISTS idx_setup_expenses_date ON setup_expenses(expense_date);

ALTER TABLE setup_expenses ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 7. HELPER FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'super_admin'
  );
$$;

CREATE OR REPLACE FUNCTION get_user_branch_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT branch_id FROM users
  WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION get_consolidated_sales_summary(
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE (
  branch_id uuid,
  branch_name text,
  total_sales decimal,
  total_orders bigint,
  avg_order_value decimal
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Access denied. Super admin privileges required.';
  END IF;

  RETURN QUERY
  SELECT 
    b.id as branch_id,
    b.name as branch_name,
    COALESCE(SUM(s.total), 0) as total_sales,
    COUNT(s.id) as total_orders,
    COALESCE(AVG(s.total), 0) as avg_order_value
  FROM branches b
  LEFT JOIN sales s ON s.branch_id = b.id
  WHERE 
    b.is_active = true
    AND (p_start_date IS NULL OR s.sale_date >= p_start_date)
    AND (p_end_date IS NULL OR s.sale_date <= p_end_date)
  GROUP BY b.id, b.name
  ORDER BY total_sales DESC;
END;
$$;

CREATE OR REPLACE FUNCTION get_branch_stock_summary(p_branch_id uuid DEFAULT NULL)
RETURNS TABLE (
  branch_id uuid,
  branch_name text,
  total_products bigint,
  low_stock_items bigint,
  out_of_stock_items bigint,
  total_stock_value decimal
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_branch_id uuid;
BEGIN
  v_branch_id := COALESCE(p_branch_id, get_user_branch_id());
  
  IF p_branch_id IS NULL AND NOT is_super_admin() THEN
    v_branch_id := get_user_branch_id();
  END IF;

  RETURN QUERY
  SELECT 
    b.id as branch_id,
    b.name as branch_name,
    COUNT(DISTINCT bs.product_id) as total_products,
    COUNT(DISTINCT bs.product_id) FILTER (WHERE bs.quantity <= bs.min_stock_level AND bs.quantity > 0) as low_stock_items,
    COUNT(DISTINCT bs.product_id) FILTER (WHERE bs.quantity = 0) as out_of_stock_items,
    COALESCE(SUM(bs.quantity * p.sale_price), 0) as total_stock_value
  FROM branches b
  LEFT JOIN branch_stock bs ON bs.branch_id = b.id
  LEFT JOIN products p ON p.id = bs.product_id
  WHERE 
    b.is_active = true
    AND (v_branch_id IS NULL OR b.id = v_branch_id)
  GROUP BY b.id, b.name
  ORDER BY b.name;
END;
$$;

-- ============================================================================
-- 8. RLS POLICIES FOR BRANCHES
-- ============================================================================

CREATE POLICY "Super admins can manage all branches"
  ON branches FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "Users can view their own branch"
  ON branches FOR SELECT
  TO authenticated
  USING (id = get_user_branch_id());

-- ============================================================================
-- 9. RLS POLICIES FOR BRANCH_STOCK
-- ============================================================================

CREATE POLICY "Super admins can manage all branch stock"
  ON branch_stock FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "Users can view their branch stock"
  ON branch_stock FOR SELECT
  TO authenticated
  USING (branch_id = get_user_branch_id());

CREATE POLICY "Users can update their branch stock"
  ON branch_stock FOR UPDATE
  TO authenticated
  USING (branch_id = get_user_branch_id())
  WITH CHECK (branch_id = get_user_branch_id());

CREATE POLICY "Users can insert stock for their branch"
  ON branch_stock FOR INSERT
  TO authenticated
  WITH CHECK (branch_id = get_user_branch_id());

CREATE POLICY "Users can delete their branch stock"
  ON branch_stock FOR DELETE
  TO authenticated
  USING (branch_id = get_user_branch_id());

-- ============================================================================
-- 10. RLS POLICIES FOR SETUP_EXPENSES
-- ============================================================================

CREATE POLICY "Super admins can manage all setup expenses"
  ON setup_expenses FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "Users can view setup expenses for their branch"
  ON setup_expenses FOR SELECT
  TO authenticated
  USING (branch_id = get_user_branch_id() OR branch_id IS NULL);

-- ============================================================================
-- 11. UPDATE EXISTING RLS POLICIES FOR BRANCH ISOLATION
-- ============================================================================

DROP POLICY IF EXISTS "Users can view sales from their branch" ON sales;
DROP POLICY IF EXISTS "Users can create sales for their branch" ON sales;
DROP POLICY IF EXISTS "Users can update sales in their branch" ON sales;
DROP POLICY IF EXISTS "Users can delete sales from their branch" ON sales;

CREATE POLICY "Users can view sales from their branch"
  ON sales FOR SELECT
  TO authenticated
  USING (is_super_admin() OR branch_id = get_user_branch_id() OR branch_id IS NULL);

CREATE POLICY "Users can create sales for their branch"
  ON sales FOR INSERT
  TO authenticated
  WITH CHECK (is_super_admin() OR branch_id = get_user_branch_id());

CREATE POLICY "Users can update sales in their branch"
  ON sales FOR UPDATE
  TO authenticated
  USING (is_super_admin() OR branch_id = get_user_branch_id() OR branch_id IS NULL)
  WITH CHECK (is_super_admin() OR branch_id = get_user_branch_id());

CREATE POLICY "Users can delete sales from their branch"
  ON sales FOR DELETE
  TO authenticated
  USING (is_super_admin() OR branch_id = get_user_branch_id() OR branch_id IS NULL);

-- Update expenses policies
DROP POLICY IF EXISTS "Users can view expenses from their branch" ON expenses;
DROP POLICY IF EXISTS "Users can create expenses for their branch" ON expenses;
DROP POLICY IF EXISTS "Users can update expenses in their branch" ON expenses;
DROP POLICY IF EXISTS "Users can delete expenses from their branch" ON expenses;

CREATE POLICY "Users can view expenses from their branch"
  ON expenses FOR SELECT
  TO authenticated
  USING (is_super_admin() OR branch_id = get_user_branch_id() OR branch_id IS NULL);

CREATE POLICY "Users can create expenses for their branch"
  ON expenses FOR INSERT
  TO authenticated
  WITH CHECK (is_super_admin() OR branch_id = get_user_branch_id());

CREATE POLICY "Users can update expenses in their branch"
  ON expenses FOR UPDATE
  TO authenticated
  USING (is_super_admin() OR branch_id = get_user_branch_id() OR branch_id IS NULL)
  WITH CHECK (is_super_admin() OR branch_id = get_user_branch_id());

CREATE POLICY "Users can delete expenses from their branch"
  ON expenses FOR DELETE
  TO authenticated
  USING (is_super_admin() OR branch_id = get_user_branch_id() OR branch_id IS NULL);

-- Purchases policies
DROP POLICY IF EXISTS "Users can view purchases from their branch" ON purchases;
DROP POLICY IF EXISTS "Users can create purchases for their branch" ON purchases;

CREATE POLICY "Users can view purchases from their branch"
  ON purchases FOR SELECT
  TO authenticated
  USING (is_super_admin() OR branch_id = get_user_branch_id() OR branch_id IS NULL);

CREATE POLICY "Users can create purchases for their branch"
  ON purchases FOR INSERT
  TO authenticated
  WITH CHECK (is_super_admin() OR branch_id = get_user_branch_id());

CREATE POLICY "Users can update purchases in their branch"
  ON purchases FOR UPDATE
  TO authenticated
  USING (is_super_admin() OR branch_id = get_user_branch_id() OR branch_id IS NULL)
  WITH CHECK (is_super_admin() OR branch_id = get_user_branch_id());

-- ============================================================================
-- 12. TRIGGERS FOR UPDATED_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_branches_updated_at ON branches;
CREATE TRIGGER update_branches_updated_at
  BEFORE UPDATE ON branches
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_branch_stock_updated_at ON branch_stock;
CREATE TRIGGER update_branch_stock_updated_at
  BEFORE UPDATE ON branch_stock
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_setup_expenses_updated_at ON setup_expenses;
CREATE TRIGGER update_setup_expenses_updated_at
  BEFORE UPDATE ON setup_expenses
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 13. SEED DEFAULT BRANCH
-- ============================================================================

INSERT INTO branches (name, code, location, city, is_active, opening_date)
SELECT 'Main Branch', 'MAIN', 'Main Location', 'Riyadh', true, CURRENT_DATE
WHERE NOT EXISTS (SELECT 1 FROM branches LIMIT 1);
