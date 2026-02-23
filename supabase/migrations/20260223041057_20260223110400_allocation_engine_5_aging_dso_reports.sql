
/*
  # Allocation Engine — Migration 5: AR/AP Aging + DSO Reports

  ## Summary
  Three analytical functions for receivables and payables management.

  ## `get_ar_aging(p_branch_id, p_as_of_date)`
  Returns a jsonb with:
  - Per-invoice detail rows with aging bucket assignment.
  - Summary buckets: current (0–30), bucket_31_60, bucket_61_90, bucket_91_plus.
  - Total outstanding AR, total overdue, count per bucket.

  Bucket logic (days past due_date as of p_as_of_date):
  - current:    due_date IS NULL OR days_overdue = 0   (not yet due)
  - 0_30:       days_overdue 1–30
  - 31_60:      days_overdue 31–60
  - 61_90:      days_overdue 61–90
  - 91_plus:    days_overdue > 90

  ## `get_ap_aging(p_branch_id, p_as_of_date)`
  Same structure for AP. Uses purchase_date + 30-day assumed due date.

  ## `get_dso(p_branch_id, p_date_from, p_date_to)`
  DSO = (Average AR Balance / Total Credit Sales) × Days in Period
  - Average AR Balance = (opening_ar + closing_ar) / 2
  - Total Credit Sales = SUM of invoice totals created in period
  - Days = date_to - date_from + 1
*/

-- ═══════════════════════════════════════════════════════════════════
-- get_ar_aging()
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_ar_aging(
  p_branch_id  uuid DEFAULT NULL,
  p_as_of_date date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current    numeric := 0;
  v_b0_30      numeric := 0;
  v_b31_60     numeric := 0;
  v_b61_90     numeric := 0;
  v_b91_plus   numeric := 0;
  v_total      numeric := 0;
  v_rows       jsonb   := '[]';
  v_n_current  integer := 0;
  v_n0_30      integer := 0;
  v_n31_60     integer := 0;
  v_n61_90     integer := 0;
  v_n91_plus   integer := 0;
BEGIN
  -- Build detail array
  SELECT jsonb_agg(row_data ORDER BY days_overdue_as_of DESC)
  INTO v_rows
  FROM (
    SELECT
      jsonb_build_object(
        'invoice_id',     i.id,
        'invoice_number', i.invoice_number,
        'customer_id',    i.customer_id,
        'invoice_date',   i.invoice_date::date,
        'due_date',       i.due_date::date,
        'total_amount',   i.total,
        'total_allocated',COALESCE(ip_sum.total_allocated, 0),
        'balance',        GREATEST(i.total - COALESCE(ip_sum.total_allocated, 0), 0),
        'days_overdue',   GREATEST(
                            CASE
                              WHEN i.due_date IS NOT NULL AND i.due_date::date < p_as_of_date
                              THEN (p_as_of_date - i.due_date::date)::integer
                              ELSE 0
                            END, 0),
        'bucket',         CASE
                            WHEN i.due_date IS NULL OR i.due_date::date >= p_as_of_date THEN 'current'
                            WHEN (p_as_of_date - i.due_date::date) BETWEEN 1 AND 30   THEN '0_30'
                            WHEN (p_as_of_date - i.due_date::date) BETWEEN 31 AND 60  THEN '31_60'
                            WHEN (p_as_of_date - i.due_date::date) BETWEEN 61 AND 90  THEN '61_90'
                            ELSE '91_plus'
                          END,
        'status',         i.status
      ) AS row_data,
      GREATEST(
        CASE
          WHEN i.due_date IS NOT NULL AND i.due_date::date < p_as_of_date
          THEN (p_as_of_date - i.due_date::date)::integer
          ELSE 0
        END, 0
      ) AS days_overdue_as_of
    FROM invoices i
    LEFT JOIN sales s ON s.id = i.sale_id
    LEFT JOIN (
      SELECT invoice_id, SUM(allocated_amount) AS total_allocated
      FROM invoice_payments WHERE is_deleted = false GROUP BY invoice_id
    ) ip_sum ON ip_sum.invoice_id = i.id
    WHERE i.status NOT IN ('cancelled', 'paid')
      AND i.total > COALESCE(ip_sum.total_allocated, 0)
      AND (p_branch_id IS NULL OR COALESCE(i.branch_id, s.branch_id) = p_branch_id)
  ) sub;

  -- Compute bucket totals
  SELECT
    COALESCE(SUM(CASE WHEN (row_data->>'bucket') = 'current'  THEN (row_data->>'balance')::numeric ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN (row_data->>'bucket') = '0_30'     THEN (row_data->>'balance')::numeric ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN (row_data->>'bucket') = '31_60'    THEN (row_data->>'balance')::numeric ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN (row_data->>'bucket') = '61_90'    THEN (row_data->>'balance')::numeric ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN (row_data->>'bucket') = '91_plus'  THEN (row_data->>'balance')::numeric ELSE 0 END), 0),
    COALESCE(COUNT(CASE WHEN (row_data->>'bucket') = 'current' THEN 1 END), 0)::integer,
    COALESCE(COUNT(CASE WHEN (row_data->>'bucket') = '0_30'    THEN 1 END), 0)::integer,
    COALESCE(COUNT(CASE WHEN (row_data->>'bucket') = '31_60'   THEN 1 END), 0)::integer,
    COALESCE(COUNT(CASE WHEN (row_data->>'bucket') = '61_90'   THEN 1 END), 0)::integer,
    COALESCE(COUNT(CASE WHEN (row_data->>'bucket') = '91_plus' THEN 1 END), 0)::integer
  INTO
    v_current, v_b0_30, v_b31_60, v_b61_90, v_b91_plus,
    v_n_current, v_n0_30, v_n31_60, v_n61_90, v_n91_plus
  FROM jsonb_array_elements(COALESCE(v_rows, '[]')) AS t(row_data);

  v_total := v_current + v_b0_30 + v_b31_60 + v_b61_90 + v_b91_plus;

  RETURN jsonb_build_object(
    'as_of_date',   p_as_of_date,
    'branch_id',    p_branch_id,
    'summary', jsonb_build_object(
      'total_outstanding', v_total,
      'current',           jsonb_build_object('amount', v_current,  'count', v_n_current),
      'bucket_0_30',       jsonb_build_object('amount', v_b0_30,    'count', v_n0_30),
      'bucket_31_60',      jsonb_build_object('amount', v_b31_60,   'count', v_n31_60),
      'bucket_61_90',      jsonb_build_object('amount', v_b61_90,   'count', v_n61_90),
      'bucket_91_plus',    jsonb_build_object('amount', v_b91_plus, 'count', v_n91_plus),
      'total_overdue',     v_b0_30 + v_b31_60 + v_b61_90 + v_b91_plus
    ),
    'invoices', COALESCE(v_rows, '[]')
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- get_ap_aging()
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_ap_aging(
  p_branch_id  uuid DEFAULT NULL,
  p_as_of_date date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current    numeric := 0;
  v_b0_30      numeric := 0;
  v_b31_60     numeric := 0;
  v_b61_90     numeric := 0;
  v_b91_plus   numeric := 0;
  v_total      numeric := 0;
  v_rows       jsonb   := '[]';
  v_n_current  integer := 0;
  v_n0_30      integer := 0;
  v_n31_60     integer := 0;
  v_n61_90     integer := 0;
  v_n91_plus   integer := 0;
  -- AP uses purchase_date + 30 days as implied due date
BEGIN
  SELECT jsonb_agg(row_data ORDER BY days_outstanding DESC)
  INTO v_rows
  FROM (
    SELECT
      jsonb_build_object(
        'purchase_id',     p.id,
        'purchase_number', p.purchase_number,
        'supplier_id',     p.supplier_id,
        'purchase_date',   p.purchase_date,
        'implied_due',     (p.purchase_date + INTERVAL '30 days')::date,
        'total_amount',    p.total,
        'total_allocated', COALESCE(pp_sum.total_allocated, 0),
        'balance',         GREATEST(p.total - COALESCE(pp_sum.total_allocated, 0), 0),
        'days_outstanding',(p_as_of_date - p.purchase_date)::integer,
        'bucket',          CASE
                             WHEN (p_as_of_date - p.purchase_date) <= 30  THEN 'current'
                             WHEN (p_as_of_date - p.purchase_date) BETWEEN 31 AND 60  THEN '0_30'
                             WHEN (p_as_of_date - p.purchase_date) BETWEEN 61 AND 90  THEN '31_60'
                             WHEN (p_as_of_date - p.purchase_date) BETWEEN 91 AND 120 THEN '61_90'
                             ELSE '91_plus'
                           END,
        'status',          p.status
      ) AS row_data,
      (p_as_of_date - p.purchase_date)::integer AS days_outstanding
    FROM purchases p
    LEFT JOIN (
      SELECT purchase_id, SUM(allocated_amount) AS total_allocated
      FROM purchase_payments WHERE is_deleted = false GROUP BY purchase_id
    ) pp_sum ON pp_sum.purchase_id = p.id
    WHERE p.status NOT IN ('cancelled', 'void')
      AND p.is_deleted IS NOT TRUE
      AND p.total > COALESCE(pp_sum.total_allocated, 0)
      AND (p_branch_id IS NULL OR p.branch_id = p_branch_id)
  ) sub;

  SELECT
    COALESCE(SUM(CASE WHEN (row_data->>'bucket') = 'current' THEN (row_data->>'balance')::numeric ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN (row_data->>'bucket') = '0_30'    THEN (row_data->>'balance')::numeric ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN (row_data->>'bucket') = '31_60'   THEN (row_data->>'balance')::numeric ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN (row_data->>'bucket') = '61_90'   THEN (row_data->>'balance')::numeric ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN (row_data->>'bucket') = '91_plus' THEN (row_data->>'balance')::numeric ELSE 0 END), 0),
    COALESCE(COUNT(CASE WHEN (row_data->>'bucket') = 'current' THEN 1 END), 0)::integer,
    COALESCE(COUNT(CASE WHEN (row_data->>'bucket') = '0_30'    THEN 1 END), 0)::integer,
    COALESCE(COUNT(CASE WHEN (row_data->>'bucket') = '31_60'   THEN 1 END), 0)::integer,
    COALESCE(COUNT(CASE WHEN (row_data->>'bucket') = '61_90'   THEN 1 END), 0)::integer,
    COALESCE(COUNT(CASE WHEN (row_data->>'bucket') = '91_plus' THEN 1 END), 0)::integer
  INTO
    v_current, v_b0_30, v_b31_60, v_b61_90, v_b91_plus,
    v_n_current, v_n0_30, v_n31_60, v_n61_90, v_n91_plus
  FROM jsonb_array_elements(COALESCE(v_rows, '[]')) AS t(row_data);

  v_total := v_current + v_b0_30 + v_b31_60 + v_b61_90 + v_b91_plus;

  RETURN jsonb_build_object(
    'as_of_date', p_as_of_date,
    'branch_id',  p_branch_id,
    'summary', jsonb_build_object(
      'total_outstanding', v_total,
      'current',           jsonb_build_object('amount', v_current,  'count', v_n_current),
      'bucket_0_30',       jsonb_build_object('amount', v_b0_30,    'count', v_n0_30),
      'bucket_31_60',      jsonb_build_object('amount', v_b31_60,   'count', v_n31_60),
      'bucket_61_90',      jsonb_build_object('amount', v_b61_90,   'count', v_n61_90),
      'bucket_91_plus',    jsonb_build_object('amount', v_b91_plus, 'count', v_n91_plus),
      'total_overdue',     v_b0_30 + v_b31_60 + v_b61_90 + v_b91_plus
    ),
    'purchases', COALESCE(v_rows, '[]')
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- get_dso()
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_dso(
  p_branch_id  uuid DEFAULT NULL,
  p_date_from  date DEFAULT NULL,
  p_date_to    date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from          date    := COALESCE(p_date_from, date_trunc('month', CURRENT_DATE)::date);
  v_to            date    := COALESCE(p_date_to,   CURRENT_DATE);
  v_days          integer;
  v_credit_sales  numeric := 0;
  v_opening_ar    numeric := 0;
  v_closing_ar    numeric := 0;
  v_avg_ar        numeric := 0;
  v_dso           numeric := 0;
BEGIN
  v_days := (v_to - v_from) + 1;

  -- Total credit sales (invoice totals created in period)
  SELECT COALESCE(SUM(i.total), 0)
  INTO v_credit_sales
  FROM invoices i
  LEFT JOIN sales s ON s.id = i.sale_id
  WHERE i.invoice_date::date BETWEEN v_from AND v_to
    AND i.status NOT IN ('cancelled')
    AND (p_branch_id IS NULL OR COALESCE(i.branch_id, s.branch_id) = p_branch_id);

  -- Opening AR balance (invoices outstanding as of v_from - 1)
  SELECT COALESCE(SUM(
    GREATEST(
      i.total - COALESCE((
        SELECT SUM(ip.allocated_amount)
        FROM invoice_payments ip
        WHERE ip.invoice_id = i.id
          AND ip.is_deleted = false
          AND ip.allocation_date < v_from
      ), 0),
      0
    )
  ), 0)
  INTO v_opening_ar
  FROM invoices i
  LEFT JOIN sales s ON s.id = i.sale_id
  WHERE i.invoice_date::date < v_from
    AND i.status NOT IN ('cancelled')
    AND (p_branch_id IS NULL OR COALESCE(i.branch_id, s.branch_id) = p_branch_id);

  -- Closing AR balance (invoices outstanding as of v_to)
  SELECT COALESCE(SUM(
    GREATEST(
      i.total - COALESCE(ip_sum.total_allocated, 0),
      0
    )
  ), 0)
  INTO v_closing_ar
  FROM invoices i
  LEFT JOIN sales s ON s.id = i.sale_id
  LEFT JOIN (
    SELECT invoice_id, SUM(allocated_amount) AS total_allocated
    FROM invoice_payments
    WHERE is_deleted = false AND allocation_date <= v_to
    GROUP BY invoice_id
  ) ip_sum ON ip_sum.invoice_id = i.id
  WHERE i.invoice_date::date <= v_to
    AND i.status NOT IN ('cancelled')
    AND (p_branch_id IS NULL OR COALESCE(i.branch_id, s.branch_id) = p_branch_id);

  v_avg_ar := ROUND((v_opening_ar + v_closing_ar) / 2, 2);

  -- DSO = (Average AR / Credit Sales) × Days
  IF v_credit_sales > 0 THEN
    v_dso := ROUND((v_avg_ar / v_credit_sales) * v_days, 1);
  ELSE
    v_dso := NULL;
  END IF;

  RETURN jsonb_build_object(
    'date_from',      v_from,
    'date_to',        v_to,
    'days_in_period', v_days,
    'branch_id',      p_branch_id,
    'credit_sales',   v_credit_sales,
    'opening_ar',     v_opening_ar,
    'closing_ar',     v_closing_ar,
    'average_ar',     v_avg_ar,
    'dso_days',       v_dso,
    'dso_formula',    'avg_ar / credit_sales × days_in_period'
  );
END;
$$;
