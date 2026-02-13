/*
  # Create Operating Expenses System and Link to Partners

  1. New Table: operating_expenses
    - Comprehensive expense tracking system
    - Linked to partner_contributions for automatic tracking
    - Unified expense categories

  2. Unified Expense Categories
    - operational: تشغيلي (salaries, utilities, rent, etc.)
    - government: حكومي (permits, licenses, registrations)
    - assets: أصول (equipment, furniture, etc.)
    - other: أخرى

  3. Trigger System
    - Automatically creates operating expense when partner contribution is added
    - Links contribution to expense record
    - Maintains data consistency

  4. Security
    - Enable RLS
    - Policies for authenticated users based on roles
*/

-- Create operating_expenses table with unified categories
CREATE TABLE IF NOT EXISTS operating_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_number TEXT UNIQUE NOT NULL,
  expense_type TEXT NOT NULL DEFAULT 'other' CHECK (
    expense_type IN (
      'operational',
      'government', 
      'assets',
      'other',
      'residence',
      'sponsorship',
      'electricity',
      'water',
      'violations',
      'rent',
      'maintenance',
      'salaries',
      'transportation',
      'communication',
      'office'
    )
  ),
  description TEXT NOT NULL,
  description_ar TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash', 'transfer', 'check', 'card')),
  notes TEXT,
  notes_ar TEXT,
  partner_contribution_id UUID REFERENCES partner_contributions(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE operating_expenses IS 'Operating expenses including those from partner contributions';
COMMENT ON COLUMN operating_expenses.partner_contribution_id IS 'Links to partner contribution if expense originated from partner payment';
COMMENT ON COLUMN operating_expenses.expense_type IS 'Unified expense category matching partner contribution types';

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_operating_expenses_expense_date ON operating_expenses(expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_operating_expenses_expense_type ON operating_expenses(expense_type);
CREATE INDEX IF NOT EXISTS idx_operating_expenses_partner_contribution ON operating_expenses(partner_contribution_id);
CREATE INDEX IF NOT EXISTS idx_operating_expenses_created_by ON operating_expenses(created_by);

-- Enable RLS
ALTER TABLE operating_expenses ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view operating expenses"
ON operating_expenses
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admin and accountant can insert operating expenses"
ON operating_expenses
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'accountant')
  )
);

CREATE POLICY "Admin and accountant can update operating expenses"
ON operating_expenses
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'accountant')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'accountant')
  )
);

CREATE POLICY "Admin can delete operating expenses"
ON operating_expenses
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- Function to generate expense number
CREATE OR REPLACE FUNCTION generate_expense_number()
RETURNS TEXT AS $$
DECLARE
  next_num INTEGER;
  new_number TEXT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(expense_number FROM 4) AS INTEGER)), 0) + 1
  INTO next_num
  FROM operating_expenses
  WHERE expense_number ~ '^EXP[0-9]+$';
  
  new_number := 'EXP' || LPAD(next_num::TEXT, 6, '0');
  RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to automatically create expense from partner contribution
CREATE OR REPLACE FUNCTION create_expense_from_partner_contribution()
RETURNS TRIGGER AS $$
DECLARE
  expense_num TEXT;
  partner_name TEXT;
  partner_name_ar TEXT;
BEGIN
  -- Generate expense number
  expense_num := generate_expense_number();
  
  -- Get partner name
  SELECT name, name_ar INTO partner_name, partner_name_ar
  FROM partners
  WHERE id = NEW.partner_id;
  
  -- Create operating expense record
  INSERT INTO operating_expenses (
    expense_number,
    expense_type,
    description,
    description_ar,
    amount,
    expense_date,
    payment_method,
    notes,
    notes_ar,
    partner_contribution_id,
    created_by
  ) VALUES (
    expense_num,
    COALESCE(NEW.contribution_type, 'operational'),
    COALESCE(NEW.description, 'Partner contribution: ' || partner_name),
    COALESCE(NEW.description_ar, 'دفعة شريك: ' || COALESCE(partner_name_ar, partner_name)),
    NEW.amount,
    NEW.contribution_date,
    'cash',
    'Auto-generated from partner contribution',
    'تم إنشاؤه تلقائياً من دفعة الشريك',
    NEW.id,
    NEW.created_by
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trg_create_expense_from_contribution ON partner_contributions;
CREATE TRIGGER trg_create_expense_from_contribution
AFTER INSERT ON partner_contributions
FOR EACH ROW
EXECUTE FUNCTION create_expense_from_partner_contribution();

-- Migrate existing partner contributions to operating expenses
DO $$
DECLARE
  contrib RECORD;
  expense_num TEXT;
  partner_name TEXT;
  partner_name_ar TEXT;
BEGIN
  FOR contrib IN 
    SELECT pc.*, p.name, p.name_ar 
    FROM partner_contributions pc
    JOIN partners p ON p.id = pc.partner_id
    WHERE NOT EXISTS (
      SELECT 1 FROM operating_expenses oe 
      WHERE oe.partner_contribution_id = pc.id
    )
  LOOP
    expense_num := generate_expense_number();
    
    INSERT INTO operating_expenses (
      expense_number,
      expense_type,
      description,
      description_ar,
      amount,
      expense_date,
      payment_method,
      notes,
      notes_ar,
      partner_contribution_id,
      created_by,
      created_at
    ) VALUES (
      expense_num,
      COALESCE(contrib.contribution_type, 'operational'),
      COALESCE(contrib.description, 'Partner contribution: ' || contrib.name),
      COALESCE(contrib.description_ar, 'دفعة شريك: ' || COALESCE(contrib.name_ar, contrib.name)),
      contrib.amount,
      contrib.contribution_date,
      'cash',
      'Migrated from partner contribution',
      'تم ترحيله من دفعة الشريك',
      contrib.id,
      contrib.created_by,
      contrib.created_at
    );
  END LOOP;
END $$;