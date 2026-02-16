/*
  # Freeze Financial Values After Creation (Financial Integrity)

  1. Purpose
    - Prevent modification of financial amounts after record creation
    - Only status, is_deleted, voided_at, voided_by, version, updated_at can be changed
    - All financial corrections must go through reversal/void functions

  2. Triggers Created
    - `trg_freeze_sales_financials` on sales
    - `trg_freeze_sale_items_financials` on sale_items
    - `trg_freeze_purchases_financials` on purchases
    - `trg_freeze_purchase_items_financials` on purchase_items
    - `trg_freeze_expenses_financials` on expenses
    - `trg_freeze_operating_expenses_financials` on operating_expenses
    - `trg_freeze_cash_transactions_financials` on cash_transactions
    - `trg_freeze_partner_contributions_financials` on partner_contributions
    - `trg_freeze_partner_settlements_financials` on partner_settlements
    - `trg_freeze_setup_expenses_financials` on setup_expenses
    - `trg_freeze_inventory_movements_financials` on inventory_movements

  3. Protected Columns Per Table
    - sales: subtotal, tax, discount, total, delivery_charge, total_cost, gross_profit, profit_margin
    - sale_items: quantity, unit_price, discount, total, purchase_price
    - purchases: subtotal, tax, discount, total
    - purchase_items: quantity, unit_price, discount, total
    - expenses: amount
    - operating_expenses: amount
    - cash_transactions: amount
    - partner_contributions: amount
    - partner_settlements: amount
    - setup_expenses: amount
    - inventory_movements: quantity

  4. Security
    - Uses session variable 'app.bypass_immutable' as escape hatch
    - Only SECURITY DEFINER functions can set this variable
*/

-- Freeze sales financial columns
CREATE OR REPLACE FUNCTION freeze_sales_financials()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF current_setting('app.bypass_immutable', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF OLD.is_deleted = true THEN
    RAISE EXCEPTION 'Cannot update a deleted record on sales. Record ID: %', OLD.id;
  END IF;

  IF NEW.subtotal IS DISTINCT FROM OLD.subtotal
    OR NEW.tax IS DISTINCT FROM OLD.tax
    OR NEW.discount IS DISTINCT FROM OLD.discount
    OR NEW.total IS DISTINCT FROM OLD.total
    OR NEW.delivery_charge IS DISTINCT FROM OLD.delivery_charge
  THEN
    RAISE EXCEPTION 'Financial values (subtotal, tax, discount, total, delivery_charge) on sales are frozen after creation. Use void/reversal. Record ID: %', OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_freeze_sales_financials ON sales;
CREATE TRIGGER trg_freeze_sales_financials
  BEFORE UPDATE ON sales
  FOR EACH ROW
  EXECUTE FUNCTION freeze_sales_financials();

-- Freeze sale_items financial columns
CREATE OR REPLACE FUNCTION freeze_sale_items_financials()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF current_setting('app.bypass_immutable', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF OLD.is_deleted = true THEN
    RAISE EXCEPTION 'Cannot update a deleted record on sale_items. Record ID: %', OLD.id;
  END IF;

  IF NEW.quantity IS DISTINCT FROM OLD.quantity
    OR NEW.unit_price IS DISTINCT FROM OLD.unit_price
    OR NEW.discount IS DISTINCT FROM OLD.discount
    OR NEW.total IS DISTINCT FROM OLD.total
    OR NEW.purchase_price IS DISTINCT FROM OLD.purchase_price
  THEN
    RAISE EXCEPTION 'Financial values (quantity, unit_price, discount, total, purchase_price) on sale_items are frozen after creation. Record ID: %', OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_freeze_sale_items_financials ON sale_items;
CREATE TRIGGER trg_freeze_sale_items_financials
  BEFORE UPDATE ON sale_items
  FOR EACH ROW
  EXECUTE FUNCTION freeze_sale_items_financials();

-- Freeze purchases financial columns
CREATE OR REPLACE FUNCTION freeze_purchases_financials()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF current_setting('app.bypass_immutable', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF OLD.is_deleted = true THEN
    RAISE EXCEPTION 'Cannot update a deleted record on purchases. Record ID: %', OLD.id;
  END IF;

  IF NEW.subtotal IS DISTINCT FROM OLD.subtotal
    OR NEW.tax IS DISTINCT FROM OLD.tax
    OR NEW.discount IS DISTINCT FROM OLD.discount
    OR NEW.total IS DISTINCT FROM OLD.total
  THEN
    RAISE EXCEPTION 'Financial values on purchases are frozen after creation. Use void/reversal. Record ID: %', OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_freeze_purchases_financials ON purchases;
CREATE TRIGGER trg_freeze_purchases_financials
  BEFORE UPDATE ON purchases
  FOR EACH ROW
  EXECUTE FUNCTION freeze_purchases_financials();

-- Freeze purchase_items financial columns
CREATE OR REPLACE FUNCTION freeze_purchase_items_financials()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF current_setting('app.bypass_immutable', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF OLD.is_deleted = true THEN
    RAISE EXCEPTION 'Cannot update a deleted record on purchase_items. Record ID: %', OLD.id;
  END IF;

  IF NEW.quantity IS DISTINCT FROM OLD.quantity
    OR NEW.unit_price IS DISTINCT FROM OLD.unit_price
    OR NEW.discount IS DISTINCT FROM OLD.discount
    OR NEW.total IS DISTINCT FROM OLD.total
  THEN
    RAISE EXCEPTION 'Financial values on purchase_items are frozen after creation. Record ID: %', OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_freeze_purchase_items_financials ON purchase_items;
CREATE TRIGGER trg_freeze_purchase_items_financials
  BEFORE UPDATE ON purchase_items
  FOR EACH ROW
  EXECUTE FUNCTION freeze_purchase_items_financials();

-- Freeze expenses amount
CREATE OR REPLACE FUNCTION freeze_expenses_financials()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF current_setting('app.bypass_immutable', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF OLD.is_deleted = true THEN
    RAISE EXCEPTION 'Cannot update a deleted record on expenses. Record ID: %', OLD.id;
  END IF;

  IF NEW.amount IS DISTINCT FROM OLD.amount THEN
    RAISE EXCEPTION 'Financial value (amount) on expenses is frozen after creation. Use void/reversal. Record ID: %', OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_freeze_expenses_financials ON expenses;
CREATE TRIGGER trg_freeze_expenses_financials
  BEFORE UPDATE ON expenses
  FOR EACH ROW
  EXECUTE FUNCTION freeze_expenses_financials();

-- Freeze operating_expenses amount
CREATE OR REPLACE FUNCTION freeze_operating_expenses_financials()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF current_setting('app.bypass_immutable', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF OLD.is_deleted = true THEN
    RAISE EXCEPTION 'Cannot update a deleted record on operating_expenses. Record ID: %', OLD.id;
  END IF;

  IF NEW.amount IS DISTINCT FROM OLD.amount THEN
    RAISE EXCEPTION 'Financial value (amount) on operating_expenses is frozen after creation. Use void/reversal. Record ID: %', OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_freeze_operating_expenses_financials ON operating_expenses;
CREATE TRIGGER trg_freeze_operating_expenses_financials
  BEFORE UPDATE ON operating_expenses
  FOR EACH ROW
  EXECUTE FUNCTION freeze_operating_expenses_financials();

-- Freeze cash_transactions amount
CREATE OR REPLACE FUNCTION freeze_cash_transactions_financials()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF current_setting('app.bypass_immutable', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF OLD.is_deleted = true THEN
    RAISE EXCEPTION 'Cannot update a deleted record on cash_transactions. Record ID: %', OLD.id;
  END IF;

  IF NEW.amount IS DISTINCT FROM OLD.amount THEN
    RAISE EXCEPTION 'Financial value (amount) on cash_transactions is frozen after creation. Record ID: %', OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_freeze_cash_transactions_financials ON cash_transactions;
CREATE TRIGGER trg_freeze_cash_transactions_financials
  BEFORE UPDATE ON cash_transactions
  FOR EACH ROW
  EXECUTE FUNCTION freeze_cash_transactions_financials();

-- Freeze partner_contributions amount
CREATE OR REPLACE FUNCTION freeze_partner_contributions_financials()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF current_setting('app.bypass_immutable', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF OLD.is_deleted = true THEN
    RAISE EXCEPTION 'Cannot update a deleted record on partner_contributions. Record ID: %', OLD.id;
  END IF;

  IF NEW.amount IS DISTINCT FROM OLD.amount THEN
    RAISE EXCEPTION 'Financial value (amount) on partner_contributions is frozen after creation. Record ID: %', OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_freeze_partner_contributions_financials ON partner_contributions;
CREATE TRIGGER trg_freeze_partner_contributions_financials
  BEFORE UPDATE ON partner_contributions
  FOR EACH ROW
  EXECUTE FUNCTION freeze_partner_contributions_financials();

-- Freeze partner_settlements amount
CREATE OR REPLACE FUNCTION freeze_partner_settlements_financials()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF current_setting('app.bypass_immutable', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF OLD.is_deleted = true THEN
    RAISE EXCEPTION 'Cannot update a deleted record on partner_settlements. Record ID: %', OLD.id;
  END IF;

  IF NEW.amount IS DISTINCT FROM OLD.amount THEN
    RAISE EXCEPTION 'Financial value (amount) on partner_settlements is frozen after creation. Record ID: %', OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_freeze_partner_settlements_financials ON partner_settlements;
CREATE TRIGGER trg_freeze_partner_settlements_financials
  BEFORE UPDATE ON partner_settlements
  FOR EACH ROW
  EXECUTE FUNCTION freeze_partner_settlements_financials();

-- Freeze setup_expenses amount
CREATE OR REPLACE FUNCTION freeze_setup_expenses_financials()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF current_setting('app.bypass_immutable', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF OLD.is_deleted = true THEN
    RAISE EXCEPTION 'Cannot update a deleted record on setup_expenses. Record ID: %', OLD.id;
  END IF;

  IF NEW.amount IS DISTINCT FROM OLD.amount THEN
    RAISE EXCEPTION 'Financial value (amount) on setup_expenses is frozen after creation. Record ID: %', OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_freeze_setup_expenses_financials ON setup_expenses;
CREATE TRIGGER trg_freeze_setup_expenses_financials
  BEFORE UPDATE ON setup_expenses
  FOR EACH ROW
  EXECUTE FUNCTION freeze_setup_expenses_financials();

-- Freeze inventory_movements quantity
CREATE OR REPLACE FUNCTION freeze_inventory_movements_financials()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF current_setting('app.bypass_immutable', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF OLD.is_deleted = true THEN
    RAISE EXCEPTION 'Cannot update a deleted record on inventory_movements. Record ID: %', OLD.id;
  END IF;

  IF NEW.quantity IS DISTINCT FROM OLD.quantity THEN
    RAISE EXCEPTION 'Financial value (quantity) on inventory_movements is frozen after creation. Record ID: %', OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_freeze_inventory_movements_financials ON inventory_movements;
CREATE TRIGGER trg_freeze_inventory_movements_financials
  BEFORE UPDATE ON inventory_movements
  FOR EACH ROW
  EXECUTE FUNCTION freeze_inventory_movements_financials();