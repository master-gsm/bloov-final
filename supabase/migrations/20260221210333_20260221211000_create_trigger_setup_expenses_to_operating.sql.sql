/*
  # Create Trigger: Link Setup Expenses to Operating Expenses

  When a setup expense is created in the Partners section, automatically
  create a corresponding operating expense record so it appears in the
  Operating Expenses section.

  1. New Trigger Function
    - `create_operating_expense_from_setup_expense()` - auto-creates operating expense

  2. Trigger
    - `trg_setup_expense_to_operating` - fires AFTER INSERT on setup_expenses
    
  3. Data Migration
    - Link existing setup_expenses to operating_expenses if not already linked
*/

-- Create trigger function
CREATE OR REPLACE FUNCTION create_operating_expense_from_setup_expense()
RETURNS TRIGGER AS $$
DECLARE
  expense_num TEXT;
  partner_name TEXT;
  partner_name_ar TEXT;
BEGIN
  -- Generate expense number
  SELECT COALESCE(MAX(CAST(SUBSTRING(expense_number FROM 4) AS INTEGER)), 0) + 1
  INTO expense_num
  FROM operating_expenses
  WHERE expense_number ~ '^EXP[0-9]+$';
  
  expense_num := 'EXP' || LPAD(expense_num::TEXT, 6, '0');
  
  -- Get partner name if partner_id exists
  IF NEW.partner_id IS NOT NULL THEN
    SELECT name, name_ar INTO partner_name, partner_name_ar
    FROM partners
    WHERE id = NEW.partner_id;
  END IF;
  
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
    created_by,
    created_at
  ) VALUES (
    expense_num,
    CASE NEW.expense_type
      WHEN 'capital' THEN 'operational'
      WHEN 'asset' THEN 'assets'
      ELSE 'operational'
    END,
    COALESCE(NEW.description, 'Setup Expense from ' || COALESCE(partner_name, 'General')),
    COALESCE(NEW.description_ar, 'مصروف تأسيسي من ' || COALESCE(partner_name_ar, 'عام')),
    NEW.amount,
    NEW.expense_date,
    'cash',
    'Auto-linked from setup_expenses: ' || COALESCE(NEW.notes, ''),
    'مرتبط تلقائياً من مصاريف التأسيس: ' || COALESCE(NEW.notes, ''),
    NEW.created_by,
    NEW.created_at
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trg_setup_expense_to_operating ON setup_expenses;

-- Create trigger
CREATE TRIGGER trg_setup_expense_to_operating
AFTER INSERT ON setup_expenses
FOR EACH ROW
EXECUTE FUNCTION create_operating_expense_from_setup_expense();

-- Link existing setup expenses to operating expenses
DO $$
DECLARE
  setup_exp RECORD;
  expense_num TEXT;
  partner_name TEXT;
  partner_name_ar TEXT;
  counter INTEGER;
BEGIN
  -- Get the max expense number to continue from
  SELECT COALESCE(MAX(CAST(SUBSTRING(expense_number FROM 4) AS INTEGER)), 0)
  INTO counter
  FROM operating_expenses
  WHERE expense_number ~ '^EXP[0-9]+$';
  
  -- For each setup expense that doesn't have a corresponding operating expense
  FOR setup_exp IN
    SELECT se.*, 
           COALESCE(p.name, 'General') as partner_name,
           COALESCE(p.name_ar, 'عام') as partner_name_ar
    FROM setup_expenses se
    LEFT JOIN partners p ON p.id = se.partner_id
    WHERE NOT EXISTS (
      SELECT 1 FROM operating_expenses oe 
      WHERE oe.notes LIKE '%' || se.id || '%'
    )
    ORDER BY se.created_at
  LOOP
    counter := counter + 1;
    expense_num := 'EXP' || LPAD(counter::TEXT, 6, '0');
    
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
      created_by,
      created_at
    ) VALUES (
      expense_num,
      CASE setup_exp.expense_type
        WHEN 'capital' THEN 'operational'
        WHEN 'asset' THEN 'assets'
        ELSE 'operational'
      END,
      COALESCE(setup_exp.description, 'Setup Expense from ' || setup_exp.partner_name),
      COALESCE(setup_exp.description_ar, 'مصروف تأسيسي من ' || setup_exp.partner_name_ar),
      setup_exp.amount,
      setup_exp.expense_date,
      'cash',
      'Auto-linked from setup_expenses ID: ' || setup_exp.id,
      'مرتبط تلقائياً من مصاريف التأسيس ID: ' || setup_exp.id,
      setup_exp.created_by,
      setup_exp.created_at
    );
  END LOOP;
END $$;
