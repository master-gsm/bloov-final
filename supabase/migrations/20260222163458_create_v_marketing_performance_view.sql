/*
  # Create v_marketing_performance View

  ## Summary
  A SQL view that calculates marketing performance KPIs per channel.
  All calculations are done in the database — no React-side computation needed.

  ## What it calculates per (branch_id, sale_source, date range):
  - total_revenue: sum of confirmed/completed sales totals
  - total_cogs: sum of total_cost from sales
  - gross_profit: total_revenue - total_cogs
  - marketing_expenses: sum of expenses where category='marketing' and subtype=channel
  - net_profit: gross_profit - marketing_expenses
  - roi_percent: (net_profit / NULLIF(marketing_expenses,0)) * 100

  ## Filtering
  - Accepts date range via WHERE sale_date::date BETWEEN x AND y
  - Accepts branch_id via WHERE branch_id = x
  - Excludes deleted, voided, draft, and cancelled sales
  - Excludes deleted expenses

  ## Security
  - No RLS on views; underlying tables already have RLS enforced
*/

DROP VIEW IF EXISTS v_marketing_performance;

CREATE VIEW v_marketing_performance AS
WITH sales_data AS (
  SELECT
    s.branch_id,
    s.sale_source,
    s.sale_date::date                        AS sale_date,
    COALESCE(s.total, 0)                     AS revenue,
    COALESCE(s.total_cost, 0)                AS cogs
  FROM sales s
  WHERE s.is_deleted IS NOT TRUE
    AND s.status NOT IN ('draft', 'cancelled', 'void')
),

expense_data AS (
  SELECT
    e.branch_id,
    COALESCE(e.subtype, 'general')           AS channel,
    e.expense_date                           AS expense_date,
    COALESCE(e.amount, 0)                    AS amount
  FROM expenses e
  WHERE e.is_deleted IS NOT TRUE
    AND e.category = 'marketing'
),

sales_agg AS (
  SELECT
    branch_id,
    sale_source,
    sale_date,
    SUM(revenue)   AS total_revenue,
    SUM(cogs)      AS total_cogs
  FROM sales_data
  GROUP BY branch_id, sale_source, sale_date
),

expense_agg AS (
  SELECT
    branch_id,
    channel,
    expense_date,
    SUM(amount) AS total_marketing_expenses
  FROM expense_data
  GROUP BY branch_id, channel, expense_date
)

SELECT
  COALESCE(sa.branch_id, ea.branch_id)                               AS branch_id,
  COALESCE(sa.sale_source, ea.channel)                               AS channel,
  COALESCE(sa.sale_date, ea.expense_date)                            AS report_date,

  COALESCE(sa.total_revenue, 0)                                      AS total_revenue,
  COALESCE(sa.total_cogs, 0)                                         AS total_cogs,
  COALESCE(sa.total_revenue, 0) - COALESCE(sa.total_cogs, 0)        AS gross_profit,
  COALESCE(ea.total_marketing_expenses, 0)                           AS marketing_expenses,

  (COALESCE(sa.total_revenue, 0) - COALESCE(sa.total_cogs, 0))
    - COALESCE(ea.total_marketing_expenses, 0)                       AS net_profit,

  CASE
    WHEN COALESCE(ea.total_marketing_expenses, 0) = 0 THEN NULL
    ELSE ROUND(
      (
        (COALESCE(sa.total_revenue, 0) - COALESCE(sa.total_cogs, 0))
        - COALESCE(ea.total_marketing_expenses, 0)
      )
      / ea.total_marketing_expenses * 100
    , 2)
  END                                                                AS roi_percent

FROM sales_agg sa
FULL OUTER JOIN expense_agg ea
  ON  sa.branch_id   = ea.branch_id
  AND sa.sale_source = ea.channel
  AND sa.sale_date   = ea.expense_date;

COMMENT ON VIEW v_marketing_performance IS
'Marketing performance KPIs per channel/date/branch. Filter by report_date, branch_id, and channel in your queries.';
