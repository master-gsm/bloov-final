
/*
  # Allocation Engine — Migration 4: Open Balance Views

  ## Summary
  Four live views for AR/AP open balances and payment capacity tracking.

  ## Views Created
  - `v_invoice_open_balance`        — AR: remaining balance per invoice
  - `v_purchase_open_balance`       — AP: remaining balance per purchase
  - `v_customer_payment_balance`    — AR: unallocated capacity per customer payment
  - `v_supplier_payment_balance`    — AP: unallocated capacity per supplier payment

  ## Key Columns (invoice/purchase views)
  - `total_amount`      — document total
  - `total_allocated`   — SUM of active allocation rows
  - `remaining_balance` — total_amount - total_allocated (floored at 0)
  - `is_overdue`        — boolean flag
  - `days_overdue`      — integer days past due
*/

-- ── AR: v_invoice_open_balance ────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_invoice_open_balance AS
SELECT
  i.id                                                       AS invoice_id,
  i.invoice_number,
  i.customer_id,
  i.sale_id,
  i.invoice_date::date                                       AS invoice_date,
  i.due_date::date                                           AS due_date,
  COALESCE(i.branch_id, s.branch_id)                        AS branch_id,
  i.status,
  i.total                                                    AS total_amount,
  COALESCE(ip.total_allocated, 0)                           AS total_allocated,
  GREATEST(i.total - COALESCE(ip.total_allocated, 0), 0)    AS remaining_balance,
  CASE
    WHEN i.due_date IS NOT NULL
      AND i.due_date::date < CURRENT_DATE
      AND i.total > COALESCE(ip.total_allocated, 0)
    THEN true ELSE false
  END                                                         AS is_overdue,
  GREATEST(
    CASE
      WHEN i.due_date IS NOT NULL AND i.due_date::date < CURRENT_DATE
      THEN (CURRENT_DATE - i.due_date::date)::integer
      ELSE 0
    END,
    0
  )                                                           AS days_overdue,
  i.created_at
FROM invoices i
LEFT JOIN sales s ON s.id = i.sale_id
LEFT JOIN (
  SELECT invoice_id, SUM(allocated_amount) AS total_allocated
  FROM invoice_payments
  WHERE is_deleted = false
  GROUP BY invoice_id
) ip ON ip.invoice_id = i.id
WHERE i.status NOT IN ('cancelled');

-- ── AP: v_purchase_open_balance ───────────────────────────────────────────────
CREATE OR REPLACE VIEW v_purchase_open_balance AS
SELECT
  p.id                                                       AS purchase_id,
  p.purchase_number,
  p.supplier_id,
  p.purchase_date,
  p.branch_id,
  p.status,
  p.total                                                    AS total_amount,
  COALESCE(pp.total_allocated, 0)                           AS total_allocated,
  GREATEST(p.total - COALESCE(pp.total_allocated, 0), 0)    AS remaining_balance,
  CASE
    WHEN p.total > COALESCE(pp.total_allocated, 0)
      AND p.purchase_date < CURRENT_DATE - INTERVAL '30 days'
    THEN true ELSE false
  END                                                         AS is_overdue,
  GREATEST(
    (CURRENT_DATE - p.purchase_date::date)::integer,
    0
  )                                                           AS days_outstanding,
  p.created_at
FROM purchases p
LEFT JOIN (
  SELECT purchase_id, SUM(allocated_amount) AS total_allocated
  FROM purchase_payments
  WHERE is_deleted = false
  GROUP BY purchase_id
) pp ON pp.purchase_id = p.id
WHERE p.status NOT IN ('cancelled', 'void')
  AND p.is_deleted IS NOT TRUE;

-- ── AR: v_customer_payment_balance ────────────────────────────────────────────
CREATE OR REPLACE VIEW v_customer_payment_balance AS
SELECT
  cp.id                                                       AS payment_id,
  cp.payment_number,
  cp.customer_id,
  cp.payment_date,
  cp.branch_id,
  cp.amount                                                   AS payment_amount,
  COALESCE(ip.total_allocated, 0)                            AS total_allocated,
  GREATEST(cp.amount - COALESCE(ip.total_allocated, 0), 0)   AS unallocated_balance
FROM customer_payments cp
LEFT JOIN (
  SELECT payment_id, SUM(allocated_amount) AS total_allocated
  FROM invoice_payments WHERE is_deleted = false
  GROUP BY payment_id
) ip ON ip.payment_id = cp.id
WHERE cp.is_deleted IS NOT TRUE;

-- ── AP: v_supplier_payment_balance ────────────────────────────────────────────
CREATE OR REPLACE VIEW v_supplier_payment_balance AS
SELECT
  sp.id                                                       AS payment_id,
  sp.payment_number,
  sp.supplier_id,
  sp.payment_date,
  sp.branch_id,
  sp.amount                                                   AS payment_amount,
  COALESCE(pp.total_allocated, 0)                            AS total_allocated,
  GREATEST(sp.amount - COALESCE(pp.total_allocated, 0), 0)   AS unallocated_balance
FROM supplier_payments sp
LEFT JOIN (
  SELECT payment_id, SUM(allocated_amount) AS total_allocated
  FROM purchase_payments WHERE is_deleted = false
  GROUP BY payment_id
) pp ON pp.payment_id = sp.id
WHERE sp.is_deleted IS NOT TRUE;
