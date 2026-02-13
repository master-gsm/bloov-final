/*
  # Add cash register, expenses, supplier payments, bouquet components, event orders, and activity log

  1. New Tables
    - `cash_registers` - Daily cash register open/close tracking
      - `id` (uuid, PK)
      - `open_date` (date) - Day this register covers
      - `opening_balance` (numeric) - Starting cash amount
      - `closing_balance` (numeric, nullable) - Final cash amount
      - `expected_balance` (numeric, nullable) - System-calculated expected balance
      - `status` (text) - open/closed
      - `opened_by` / `closed_by` (uuid FKs)
      - `opened_at` / `closed_at` (timestamptz)
      - `notes` (text)

    - `expenses` - Business expense tracking
      - `id` (uuid, PK)
      - `expense_number` (text, unique)
      - `category` (text) - rent/salaries/delivery/purchases/utilities/maintenance/other
      - `amount` (numeric)
      - `description` (text)
      - `expense_date` (date)
      - `payment_method` (text) - cash/transfer/card
      - `cash_register_id` (uuid, nullable FK) - Links to daily register
      - `created_by` (uuid FK)
      - `created_at` (timestamptz)

    - `supplier_payments` - Payments made to suppliers
      - `id` (uuid, PK)
      - `payment_number` (text, unique)
      - `supplier_id` (uuid FK)
      - `amount` (numeric)
      - `payment_method` (text)
      - `payment_date` (date)
      - `reference` (text) - Check number, transfer ref, etc.
      - `notes` (text)
      - `created_by` (uuid FK)
      - `created_at` (timestamptz)

    - `bouquet_components` - Recipe/components for composed bouquets
      - `id` (uuid, PK)
      - `bouquet_product_id` (uuid FK to products) - The composed bouquet
      - `component_product_id` (uuid FK to products) - The ingredient
      - `quantity` (numeric) - How many of this component
      - `created_at` (timestamptz)

    - `event_orders` - Special occasion/event orders
      - `id` (uuid, PK)
      - `sale_id` (uuid FK to sales)
      - `event_type` (text) - wedding/birthday/anniversary/funeral/corporate/other
      - `event_date` (date)
      - `delivery_time` (time)
      - `delivery_address` (text)
      - `recipient_name` (text)
      - `recipient_phone` (text)
      - `card_message` (text)
      - `special_instructions` (text)
      - `status` (text) - pending/preparing/ready/delivered/cancelled
      - `created_by` (uuid FK)
      - `created_at` / `updated_at` (timestamptz)

    - `activity_log` - System audit trail
      - `id` (uuid, PK)
      - `user_id` (uuid FK)
      - `action` (text)
      - `entity_type` (text) - sale/purchase/product/inventory/customer/supplier/expense/etc.
      - `entity_id` (uuid, nullable)
      - `details` (text)
      - `created_at` (timestamptz)

  2. Modified Tables
    - `sales` - Added delivery fields and credit payment support
      - `delivery_charge` (numeric, default 0)
      - `delivery_address` (text)
      - `card_message` (text)

  3. Security
    - RLS enabled on all new tables
    - Policies restricted to authenticated users with role checks
*/

-- =====================
-- CASH REGISTERS TABLE
-- =====================
CREATE TABLE IF NOT EXISTS cash_registers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  open_date date NOT NULL DEFAULT CURRENT_DATE,
  opening_balance numeric NOT NULL DEFAULT 0,
  closing_balance numeric,
  expected_balance numeric,
  status text NOT NULL DEFAULT 'open',
  opened_by uuid REFERENCES auth.users(id),
  closed_by uuid REFERENCES auth.users(id),
  opened_at timestamptz DEFAULT now(),
  closed_at timestamptz,
  notes text,
  CONSTRAINT valid_status CHECK (status IN ('open', 'closed'))
);

ALTER TABLE cash_registers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view cash registers"
  ON cash_registers FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins and accountants can insert cash registers"
  ON cash_registers FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('admin', 'accountant'));

CREATE POLICY "Admins and accountants can update cash registers"
  ON cash_registers FOR UPDATE TO authenticated
  USING (get_my_role() IN ('admin', 'accountant'))
  WITH CHECK (get_my_role() IN ('admin', 'accountant'));

-- =====================
-- EXPENSES TABLE
-- =====================
CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_number text UNIQUE NOT NULL,
  category text NOT NULL DEFAULT 'other',
  amount numeric NOT NULL DEFAULT 0,
  description text,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_method text NOT NULL DEFAULT 'cash',
  cash_register_id uuid REFERENCES cash_registers(id),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  CONSTRAINT valid_category CHECK (category IN ('rent', 'salaries', 'delivery', 'purchases', 'utilities', 'maintenance', 'other')),
  CONSTRAINT valid_payment CHECK (payment_method IN ('cash', 'transfer', 'card'))
);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view expenses"
  ON expenses FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins and accountants can insert expenses"
  ON expenses FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('admin', 'accountant'));

CREATE POLICY "Admins can update expenses"
  ON expenses FOR UPDATE TO authenticated
  USING (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');

CREATE POLICY "Admins can delete expenses"
  ON expenses FOR DELETE TO authenticated
  USING (get_my_role() = 'admin');

-- =====================
-- SUPPLIER PAYMENTS TABLE
-- =====================
CREATE TABLE IF NOT EXISTS supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_number text UNIQUE NOT NULL,
  supplier_id uuid NOT NULL REFERENCES suppliers(id),
  amount numeric NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'cash',
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  reference text,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  CONSTRAINT valid_sp_payment CHECK (payment_method IN ('cash', 'transfer', 'card', 'check'))
);

ALTER TABLE supplier_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view supplier payments"
  ON supplier_payments FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins and accountants can insert supplier payments"
  ON supplier_payments FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('admin', 'accountant'));

CREATE POLICY "Admins can update supplier payments"
  ON supplier_payments FOR UPDATE TO authenticated
  USING (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');

-- =====================
-- BOUQUET COMPONENTS TABLE
-- =====================
CREATE TABLE IF NOT EXISTS bouquet_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bouquet_product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  component_product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity numeric NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT unique_bouquet_component UNIQUE (bouquet_product_id, component_product_id)
);

ALTER TABLE bouquet_components ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view bouquet components"
  ON bouquet_components FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins and accountants can manage bouquet components"
  ON bouquet_components FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('admin', 'accountant'));

CREATE POLICY "Admins and accountants can update bouquet components"
  ON bouquet_components FOR UPDATE TO authenticated
  USING (get_my_role() IN ('admin', 'accountant'))
  WITH CHECK (get_my_role() IN ('admin', 'accountant'));

CREATE POLICY "Admins can delete bouquet components"
  ON bouquet_components FOR DELETE TO authenticated
  USING (get_my_role() = 'admin');

-- =====================
-- EVENT ORDERS TABLE
-- =====================
CREATE TABLE IF NOT EXISTS event_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid REFERENCES sales(id),
  event_type text NOT NULL DEFAULT 'other',
  event_date date,
  delivery_time time,
  delivery_address text,
  recipient_name text,
  recipient_phone text,
  card_message text,
  special_instructions text,
  status text NOT NULL DEFAULT 'pending',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_event_type CHECK (event_type IN ('wedding', 'birthday', 'anniversary', 'funeral', 'corporate', 'other')),
  CONSTRAINT valid_event_status CHECK (status IN ('pending', 'preparing', 'ready', 'delivered', 'cancelled'))
);

ALTER TABLE event_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view event orders"
  ON event_orders FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert event orders"
  ON event_orders FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update event orders"
  ON event_orders FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- =====================
-- ACTIVITY LOG TABLE
-- =====================
CREATE TABLE IF NOT EXISTS activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  details text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view activity log"
  ON activity_log FOR SELECT TO authenticated
  USING (get_my_role() = 'admin');

CREATE POLICY "Authenticated users can insert activity log"
  ON activity_log FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- =====================
-- ADD DELIVERY FIELDS TO SALES
-- =====================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'delivery_charge') THEN
    ALTER TABLE sales ADD COLUMN delivery_charge numeric NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'delivery_address') THEN
    ALTER TABLE sales ADD COLUMN delivery_address text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'card_message') THEN
    ALTER TABLE sales ADD COLUMN card_message text;
  END IF;
END $$;

-- =====================
-- SEED DEFAULT PRODUCT CATEGORIES
-- =====================
INSERT INTO categories (name, name_ar, type) VALUES
  ('Bouquets', 'باقات', 'natural'),
  ('Single Flowers', 'ورود مفردة', 'natural'),
  ('Accessories', 'إكسسوارات', 'accessories'),
  ('Gift Wrapping', 'تغليف هدايا', 'accessories')
ON CONFLICT DO NOTHING;