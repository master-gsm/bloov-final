/*
  # Create Fixed Assets and Depreciation System

  1. New Tables
    - `fixed_assets`
      - `id` (uuid, primary key)
      - `asset_name` (text) - Name of the asset
      - `asset_name_ar` (text) - Arabic name
      - `category` (text) - Equipment, Furniture, etc.
      - `purchase_cost` (numeric) - Original purchase price
      - `salvage_value` (numeric) - Estimated residual value at end of life
      - `useful_life_months` (integer) - How many months to depreciate over
      - `purchase_date` (date) - When asset was acquired
      - `depreciation_start_date` (date) - When depreciation begins
      - `depreciation_method` (text) - straight_line (default)
      - `branch_id` (uuid) - Which branch the asset belongs to
      - `setup_expense_id` (uuid) - Link to original setup_expense if migrated
      - `notes` (text)
      - `is_active` (boolean) - Whether asset is still in use
      - `is_deleted` (boolean) - Soft delete
      - Standard audit columns

    - `depreciation_entries`
      - `id` (uuid, primary key)
      - `asset_id` (uuid) - FK to fixed_assets
      - `entry_date` (date) - The month this depreciation applies to
      - `amount` (numeric) - Monthly depreciation amount
      - `accumulated_depreciation` (numeric) - Running total
      - `book_value` (numeric) - purchase_cost - accumulated_depreciation
      - `is_auto` (boolean) - Whether generated automatically
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Policies for authenticated admin/accountant access

  3. Important Notes
    - Fixed assets are NOT operating expenses
    - Only the monthly depreciation amount hits the income statement
    - This prevents CapEx from being fully expensed at once
*/

-- Create fixed_assets table
CREATE TABLE IF NOT EXISTS fixed_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_name text NOT NULL,
  asset_name_ar text,
  category text NOT NULL DEFAULT 'Equipment',
  purchase_cost numeric NOT NULL CHECK (purchase_cost >= 0),
  salvage_value numeric NOT NULL DEFAULT 0 CHECK (salvage_value >= 0),
  useful_life_months integer NOT NULL DEFAULT 60 CHECK (useful_life_months > 0),
  purchase_date date NOT NULL DEFAULT CURRENT_DATE,
  depreciation_start_date date NOT NULL DEFAULT CURRENT_DATE,
  depreciation_method text NOT NULL DEFAULT 'straight_line',
  branch_id uuid REFERENCES branches(id),
  setup_expense_id uuid REFERENCES setup_expenses(id),
  supplier_id uuid REFERENCES suppliers(id),
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  is_deleted boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  voided_at timestamptz,
  voided_by uuid REFERENCES auth.users(id)
);

-- Create depreciation_entries table
CREATE TABLE IF NOT EXISTS depreciation_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES fixed_assets(id),
  entry_date date NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  accumulated_depreciation numeric NOT NULL DEFAULT 0,
  book_value numeric NOT NULL DEFAULT 0,
  is_auto boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(asset_id, entry_date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fixed_assets_branch ON fixed_assets(branch_id);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_category ON fixed_assets(category);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_setup_expense ON fixed_assets(setup_expense_id);
CREATE INDEX IF NOT EXISTS idx_depreciation_entries_asset ON depreciation_entries(asset_id);
CREATE INDEX IF NOT EXISTS idx_depreciation_entries_date ON depreciation_entries(entry_date);

-- Enable RLS
ALTER TABLE fixed_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE depreciation_entries ENABLE ROW LEVEL SECURITY;

-- RLS for fixed_assets
CREATE POLICY "Admins and accountants can view fixed assets"
  ON fixed_assets FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.role IN ('admin', 'accountant', 'viewer')
    )
  );

CREATE POLICY "Admins can insert fixed assets"
  ON fixed_assets FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.role = 'admin'
    )
  );

CREATE POLICY "Admins can update fixed assets"
  ON fixed_assets FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete fixed assets"
  ON fixed_assets FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.role = 'admin'
    )
  );

-- RLS for depreciation_entries
CREATE POLICY "Admins and accountants can view depreciation entries"
  ON depreciation_entries FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.role IN ('admin', 'accountant', 'viewer')
    )
  );

CREATE POLICY "System can insert depreciation entries"
  ON depreciation_entries FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.role IN ('admin', 'accountant')
    )
  );

CREATE POLICY "Admins can delete depreciation entries"
  ON depreciation_entries FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.role = 'admin'
    )
  );
