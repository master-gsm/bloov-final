
/*
  # Allocation Engine — Migration 2: Over-Allocation Prevention Triggers

  ## Summary
  Three trigger-level guards on invoice_payments and purchase_payments:

  ### Guard 1 — Invoice cap (AR)
  `check_invoice_payment_cap`:
  BEFORE INSERT OR UPDATE on invoice_payments.
  Blocks if: SUM(allocated_amount) for this invoice (excl. current row on UPDATE)
  would exceed invoices.total.

  ### Guard 2 — Payment cap (AR)
  `check_customer_payment_cap`:
  BEFORE INSERT OR UPDATE on invoice_payments.
  Blocks if: SUM(allocated_amount) for this payment
  would exceed customer_payments.amount.

  ### Guard 3 — Cross-branch block (AR)
  `check_invoice_payment_branch`:
  BEFORE INSERT on invoice_payments.
  Blocks if invoice.branch_id != payment.branch_id.

  ### Same three guards mirrored for AP:
  `check_purchase_payment_cap`
  `check_supplier_payment_cap`
  `check_purchase_payment_branch`

  ### Guard 4 — Invoice status (AR)
  Blocks allocation if invoice.status = 'draft' or 'cancelled'.
  Active statuses: 'sent', 'overdue', 'paid' (allow partial re-allocation).

  ### Guard 5 — Purchase status (AP)
  Blocks allocation if purchase.status = 'draft' or 'cancelled'.
  Active statuses: 'confirmed', 'received'.

  All guards are combined into two trigger functions (one per table)
  to minimize trigger overhead.
*/

-- ═══════════════════════════════════════════════════════════════════
-- AR GUARDS: invoice_payments
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION guard_invoice_payment_allocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_total    numeric;
  v_invoice_status   text;
  v_invoice_branch   uuid;
  v_payment_amount   numeric;
  v_payment_branch   uuid;
  v_already_invoiced numeric;
  v_already_paid     numeric;
  v_excl_id          uuid;
BEGIN
  -- On UPDATE, exclude current row from sums
  v_excl_id := CASE WHEN TG_OP = 'UPDATE' THEN OLD.id ELSE NULL END;

  -- Fetch invoice details
  SELECT total, status, branch_id
  INTO v_invoice_total, v_invoice_status, v_invoice_branch
  FROM invoices
  WHERE id = NEW.invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % not found.', NEW.invoice_id;
  END IF;

  -- Guard: invoice must be in allocatable status
  IF v_invoice_status IN ('draft', 'cancelled') THEN
    RAISE EXCEPTION
      'Cannot allocate to invoice % — status is "%". Must be sent, overdue, or paid.',
      NEW.invoice_id, v_invoice_status;
  END IF;

  -- Fetch payment details
  SELECT amount, branch_id
  INTO v_payment_amount, v_payment_branch
  FROM customer_payments
  WHERE id = NEW.payment_id AND is_deleted IS NOT TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer payment % not found or deleted.', NEW.payment_id;
  END IF;

  -- Guard: cross-branch allocation blocked
  IF v_invoice_branch IS NOT NULL
     AND v_payment_branch IS NOT NULL
     AND v_invoice_branch != v_payment_branch THEN
    RAISE EXCEPTION
      'Cross-branch allocation blocked: invoice branch % != payment branch %.',
      v_invoice_branch, v_payment_branch;
  END IF;

  -- Also enforce new row branch_id consistency
  IF NEW.branch_id != COALESCE(v_payment_branch, NEW.branch_id) THEN
    RAISE EXCEPTION
      'Allocation branch_id % does not match payment branch_id %.',
      NEW.branch_id, v_payment_branch;
  END IF;

  -- Guard: over-invoice allocation
  SELECT COALESCE(SUM(allocated_amount), 0)
  INTO v_already_invoiced
  FROM invoice_payments
  WHERE invoice_id = NEW.invoice_id
    AND is_deleted = false
    AND (v_excl_id IS NULL OR id != v_excl_id);

  IF v_already_invoiced + NEW.allocated_amount > v_invoice_total THEN
    RAISE EXCEPTION
      'Over-allocation blocked: invoice % total is %, already allocated %, trying to add % (would exceed by %).',
      NEW.invoice_id,
      v_invoice_total,
      v_already_invoiced,
      NEW.allocated_amount,
      (v_already_invoiced + NEW.allocated_amount - v_invoice_total);
  END IF;

  -- Guard: over-payment allocation
  SELECT COALESCE(SUM(allocated_amount), 0)
  INTO v_already_paid
  FROM invoice_payments
  WHERE payment_id = NEW.payment_id
    AND is_deleted = false
    AND (v_excl_id IS NULL OR id != v_excl_id);

  IF v_already_paid + NEW.allocated_amount > v_payment_amount THEN
    RAISE EXCEPTION
      'Over-allocation blocked: payment % amount is %, already allocated %, trying to add % (would exceed by %).',
      NEW.payment_id,
      v_payment_amount,
      v_already_paid,
      NEW.allocated_amount,
      (v_already_paid + NEW.allocated_amount - v_payment_amount);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_invoice_payment ON invoice_payments;
CREATE TRIGGER trg_guard_invoice_payment
  BEFORE INSERT OR UPDATE OF allocated_amount, invoice_id, payment_id
  ON invoice_payments
  FOR EACH ROW
  EXECUTE FUNCTION guard_invoice_payment_allocation();

-- ═══════════════════════════════════════════════════════════════════
-- AP GUARDS: purchase_payments
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION guard_purchase_payment_allocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase_total   numeric;
  v_purchase_status  text;
  v_purchase_branch  uuid;
  v_payment_amount   numeric;
  v_payment_branch   uuid;
  v_already_purchase numeric;
  v_already_paid     numeric;
  v_excl_id          uuid;
BEGIN
  v_excl_id := CASE WHEN TG_OP = 'UPDATE' THEN OLD.id ELSE NULL END;

  -- Fetch purchase details
  SELECT total, status, branch_id
  INTO v_purchase_total, v_purchase_status, v_purchase_branch
  FROM purchases
  WHERE id = NEW.purchase_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase % not found.', NEW.purchase_id;
  END IF;

  -- Guard: purchase must be in allocatable status
  IF v_purchase_status IN ('draft', 'cancelled', 'void') THEN
    RAISE EXCEPTION
      'Cannot allocate to purchase % — status is "%". Must be confirmed or received.',
      NEW.purchase_id, v_purchase_status;
  END IF;

  -- Fetch supplier payment details
  SELECT amount, branch_id
  INTO v_payment_amount, v_payment_branch
  FROM supplier_payments
  WHERE id = NEW.payment_id AND is_deleted IS NOT TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Supplier payment % not found or deleted.', NEW.payment_id;
  END IF;

  -- Guard: cross-branch allocation blocked
  IF v_purchase_branch IS NOT NULL
     AND v_payment_branch IS NOT NULL
     AND v_purchase_branch != v_payment_branch THEN
    RAISE EXCEPTION
      'Cross-branch allocation blocked: purchase branch % != payment branch %.',
      v_purchase_branch, v_payment_branch;
  END IF;

  IF v_payment_branch IS NOT NULL AND NEW.branch_id != v_payment_branch THEN
    RAISE EXCEPTION
      'Allocation branch_id % does not match payment branch_id %.',
      NEW.branch_id, v_payment_branch;
  END IF;

  -- Guard: over-purchase allocation
  SELECT COALESCE(SUM(allocated_amount), 0)
  INTO v_already_purchase
  FROM purchase_payments
  WHERE purchase_id = NEW.purchase_id
    AND is_deleted = false
    AND (v_excl_id IS NULL OR id != v_excl_id);

  IF v_already_purchase + NEW.allocated_amount > v_purchase_total THEN
    RAISE EXCEPTION
      'Over-allocation blocked: purchase % total is %, already allocated %, trying to add % (would exceed by %).',
      NEW.purchase_id,
      v_purchase_total,
      v_already_purchase,
      NEW.allocated_amount,
      (v_already_purchase + NEW.allocated_amount - v_purchase_total);
  END IF;

  -- Guard: over-payment allocation
  SELECT COALESCE(SUM(allocated_amount), 0)
  INTO v_already_paid
  FROM purchase_payments
  WHERE payment_id = NEW.payment_id
    AND is_deleted = false
    AND (v_excl_id IS NULL OR id != v_excl_id);

  IF v_already_paid + NEW.allocated_amount > v_payment_amount THEN
    RAISE EXCEPTION
      'Over-allocation blocked: payment % amount is %, already allocated %, trying to add % (would exceed by %).',
      NEW.payment_id,
      v_payment_amount,
      v_already_paid,
      NEW.allocated_amount,
      (v_already_paid + NEW.allocated_amount - v_payment_amount);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_purchase_payment ON purchase_payments;
CREATE TRIGGER trg_guard_purchase_payment
  BEFORE INSERT OR UPDATE OF allocated_amount, purchase_id, payment_id
  ON purchase_payments
  FOR EACH ROW
  EXECUTE FUNCTION guard_purchase_payment_allocation();

-- ═══════════════════════════════════════════════════════════════════
-- Soft-delete guards: block hard DELETE on both tables
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION prevent_hard_delete_allocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION
    'Hard delete is not allowed on %. Use is_deleted = true (soft delete).', TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS trg_no_delete_invoice_payments  ON invoice_payments;
CREATE TRIGGER trg_no_delete_invoice_payments
  BEFORE DELETE ON invoice_payments
  FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete_allocation();

DROP TRIGGER IF EXISTS trg_no_delete_purchase_payments ON purchase_payments;
CREATE TRIGGER trg_no_delete_purchase_payments
  BEFORE DELETE ON purchase_payments
  FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete_allocation();
