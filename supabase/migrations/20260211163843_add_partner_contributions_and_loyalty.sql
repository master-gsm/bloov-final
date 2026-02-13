/*
  # Add Partner Contributions and Customer Loyalty

  ## Description
  Adds tables for tracking partner setup fee contributions and customer loyalty program.

  ## New Tables
  1. `partner_contributions`
    - `id` (uuid, primary key)
    - `partner_id` (uuid, foreign key to partners)
    - `amount` (numeric) - Amount contributed
    - `description` (text) - Description of the contribution
    - `description_ar` (text) - Arabic description
    - `contribution_date` (date) - Date of contribution
    - `created_by` (uuid) - Who recorded it
    - `created_at` (timestamptz)

  2. `customer_loyalty`
    - `id` (uuid, primary key)
    - `customer_id` (uuid, foreign key to customers)
    - `points` (integer) - Current loyalty points balance
    - `total_earned` (integer) - Total points ever earned
    - `total_redeemed` (integer) - Total points ever redeemed

  3. `loyalty_transactions`
    - `id` (uuid, primary key)
    - `customer_id` (uuid, foreign key to customers)
    - `sale_id` (uuid, nullable, foreign key to sales)
    - `points` (integer) - Points earned or redeemed (negative for redemption)
    - `type` (text) - 'earned' or 'redeemed'
    - `description` (text)
    - `created_at` (timestamptz)

  ## Modified Tables
  - `sales`: Add `customer_name`, `customer_phone` columns for walk-in capture

  ## Security
  - RLS enabled on all new tables
  - Only authenticated users can access
  - Partner contributions restricted to admins
*/

-- Add walk-in customer fields to sales
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'customer_name'
  ) THEN
    ALTER TABLE sales ADD COLUMN customer_name text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'customer_phone'
  ) THEN
    ALTER TABLE sales ADD COLUMN customer_phone text;
  END IF;
END $$;

-- Partner Contributions
CREATE TABLE IF NOT EXISTS partner_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT '',
  description_ar text,
  contribution_date date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE partner_contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage partner contributions"
  ON partner_contributions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
      AND users.is_active = true
    )
  );

CREATE POLICY "Admins can insert partner contributions"
  ON partner_contributions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
      AND users.is_active = true
    )
  );

CREATE POLICY "Admins can update partner contributions"
  ON partner_contributions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
      AND users.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
      AND users.is_active = true
    )
  );

CREATE POLICY "Admins can delete partner contributions"
  ON partner_contributions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
      AND users.is_active = true
    )
  );

-- Customer Loyalty
CREATE TABLE IF NOT EXISTS customer_loyalty (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
  points integer NOT NULL DEFAULT 0,
  total_earned integer NOT NULL DEFAULT 0,
  total_redeemed integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE customer_loyalty ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view loyalty"
  ON customer_loyalty FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can insert loyalty"
  ON customer_loyalty FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can update loyalty"
  ON customer_loyalty FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Loyalty Transactions
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  sale_id uuid REFERENCES sales(id),
  points integer NOT NULL DEFAULT 0,
  type text NOT NULL CHECK (type IN ('earned', 'redeemed')),
  description text,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE loyalty_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view loyalty transactions"
  ON loyalty_transactions FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can insert loyalty transactions"
  ON loyalty_transactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
