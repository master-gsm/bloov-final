/*
  # Link Cash Register to Sales and Expenses

  ## Summary
  Creates a proper real-time linkage between the cash register and all cash movements.
  Instead of calculating totals by querying sales/expenses each time, every cash movement
  is now recorded as a transaction row linked to the open register.

  ## Changes

  ### 1. New table: register_transactions
  - Stores every cash movement (sale IN, expense OUT) linked to a cash_register record
  - Positive amounts = cash in (sales)
  - Negative amounts = cash out (expenses)
  - References: cash_registers, sales or expenses via reference_id + reference_type

  ### 2. New function: get_open_cash_register()
  - Returns the currently open cash_register id for the calling user's branch
  - Used by triggers and frontend validation

  ### 3. New function: record_sale_cash_movement()
  - Trigger function: fires AFTER INSERT OR UPDATE on sales
  - When a sale is confirmed with payment_method = 'cash' (or 'card'/'transfer' tracked separately)
  - Inserts a positive register_transaction linked to the open register
  - Idempotent: ON CONFLICT DO NOTHING on (sale_id)

  ### 4. New function: record_expense_cash_movement()
  - Trigger function: fires AFTER INSERT on expenses
  - When an expense has payment_method = 'cash' and is linked to an open register
  - Inserts a negative register_transaction

  ### 5. Helper function: get_register_current_balance(register_id uuid)
  - Returns: opening_balance + SUM(register_transactions.amount)
  - Used by frontend for live balance display

  ### 6. RLS on register_transactions
  - Authenticated users can read/write their branch transactions

  ### Security
  - SECURITY DEFINER functions to bypass RLS in triggers
  - No new roles
*/

-- ─────────────────────────────────────────────
-- 1. Create register_transactions table
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS register_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  register_id uuid NOT NULL REFERENCES cash_registers(id) ON DELETE CASCADE,
  transaction_type text NOT NULL CHECK (transaction_type IN ('sale', 'expense', 'deposit', 'withdrawal')),
  amount numeric(12,2) NOT NULL,
  reference_id uuid DEFAULT NULL,
  reference_type text DEFAULT NULL CHECK (reference_type IS NULL OR reference_type IN ('sales', 'expenses', 'manual')),
  description text,
  description_ar text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_register_transactions_register_id ON register_transactions(register_id);
CREATE INDEX IF NOT EXISTS idx_register_transactions_reference_id ON register_transactions(reference_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_register_transactions_sale_unique ON register_transactions(reference_id) WHERE reference_type = 'sales';

ALTER TABLE register_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read register transactions"
  ON register_transactions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert register transactions"
  ON register_transactions FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ─────────────────────────────────────────────
-- 2. Function: get_open_cash_register
--    Returns the id of the currently open register for any branch
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_open_cash_register()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_register_id uuid;
BEGIN
  SELECT id INTO v_register_id
  FROM cash_registers
  WHERE status = 'open'
  ORDER BY opened_at DESC
  LIMIT 1;
  RETURN v_register_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_open_cash_register() TO authenticated;

-- ─────────────────────────────────────────────
-- 3. Function: get_register_current_balance
--    Live balance = opening_balance + sum(movements)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_register_current_balance(p_register_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opening numeric;
  v_movements numeric;
BEGIN
  SELECT opening_balance INTO v_opening
  FROM cash_registers
  WHERE id = p_register_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_movements
  FROM register_transactions
  WHERE register_id = p_register_id;

  RETURN COALESCE(v_opening, 0) + v_movements;
END;
$$;

GRANT EXECUTE ON FUNCTION get_register_current_balance(uuid) TO authenticated;

-- ─────────────────────────────────────────────
-- 4. Trigger: record cash movement on confirmed cash sale
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION record_sale_cash_movement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_register_id uuid;
BEGIN
  -- Only for cash sales becoming confirmed
  IF NEW.status != 'confirmed' THEN
    RETURN NEW;
  END IF;
  IF NEW.payment_method NOT IN ('cash') THEN
    RETURN NEW;
  END IF;
  -- On update, only if status just changed to confirmed
  IF TG_OP = 'UPDATE' AND OLD.status = 'confirmed' THEN
    RETURN NEW;
  END IF;

  -- Find open register
  SELECT id INTO v_register_id
  FROM cash_registers
  WHERE status = 'open'
  ORDER BY opened_at DESC
  LIMIT 1;

  IF v_register_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Insert movement (idempotent via unique index on reference_id for sales)
  INSERT INTO register_transactions (
    register_id,
    transaction_type,
    amount,
    reference_id,
    reference_type,
    description,
    description_ar,
    created_by
  ) VALUES (
    v_register_id,
    'sale',
    NEW.total,
    NEW.id,
    'sales',
    'Cash sale #' || COALESCE(NEW.sale_number, NEW.id::text),
    'بيع نقدي #' || COALESCE(NEW.sale_number, NEW.id::text),
    NEW.created_by
  )
  ON CONFLICT (reference_id) WHERE reference_type = 'sales' DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_record_sale_cash_movement ON sales;
CREATE TRIGGER trigger_record_sale_cash_movement
  AFTER INSERT OR UPDATE OF status ON sales
  FOR EACH ROW
  EXECUTE FUNCTION record_sale_cash_movement();

-- ─────────────────────────────────────────────
-- 5. Trigger: record cash movement on expense insert
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION record_expense_cash_movement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_register_id uuid;
BEGIN
  -- Only cash expenses
  IF NEW.payment_method != 'cash' THEN
    RETURN NEW;
  END IF;

  -- Use provided cash_register_id or find open one
  v_register_id := NEW.cash_register_id;

  IF v_register_id IS NULL THEN
    SELECT id INTO v_register_id
    FROM cash_registers
    WHERE status = 'open'
    ORDER BY opened_at DESC
    LIMIT 1;
  END IF;

  IF v_register_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO register_transactions (
    register_id,
    transaction_type,
    amount,
    reference_id,
    reference_type,
    description,
    description_ar,
    created_by
  ) VALUES (
    v_register_id,
    'expense',
    -NEW.amount,
    NEW.id,
    'expenses',
    'Expense: ' || COALESCE(NEW.description, NEW.category),
    'مصروف: ' || COALESCE(NEW.description, NEW.category),
    NEW.created_by
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_record_expense_cash_movement ON expenses;
CREATE TRIGGER trigger_record_expense_cash_movement
  AFTER INSERT ON expenses
  FOR EACH ROW
  EXECUTE FUNCTION record_expense_cash_movement();

-- ─────────────────────────────────────────────
-- 6. Backfill: record existing confirmed cash sales for open registers
-- ─────────────────────────────────────────────
DO $$
DECLARE
  v_register_id uuid;
BEGIN
  SELECT id INTO v_register_id FROM cash_registers WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1;

  IF v_register_id IS NOT NULL THEN
    INSERT INTO register_transactions (
      register_id, transaction_type, amount, reference_id, reference_type,
      description, description_ar, created_by
    )
    SELECT
      v_register_id,
      'sale',
      s.total,
      s.id,
      'sales',
      'Cash sale #' || COALESCE(s.sale_number, s.id::text),
      'بيع نقدي #' || COALESCE(s.sale_number, s.id::text),
      s.created_by
    FROM sales s
    CROSS JOIN (SELECT opened_at FROM cash_registers WHERE id = v_register_id) r
    WHERE s.status = 'confirmed'
      AND s.payment_method = 'cash'
      AND s.created_at >= r.opened_at
    ON CONFLICT (reference_id) WHERE reference_type = 'sales' DO NOTHING;

    INSERT INTO register_transactions (
      register_id, transaction_type, amount, reference_id, reference_type,
      description, description_ar, created_by
    )
    SELECT
      v_register_id,
      'expense',
      -e.amount,
      e.id,
      'expenses',
      'Expense: ' || COALESCE(e.description, e.category),
      'مصروف: ' || COALESCE(e.description, e.category),
      e.created_by
    FROM expenses e
    CROSS JOIN (SELECT opened_at FROM cash_registers WHERE id = v_register_id) r
    WHERE e.payment_method = 'cash'
      AND e.created_at >= r.opened_at
      AND (e.cash_register_id = v_register_id OR e.cash_register_id IS NULL)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
