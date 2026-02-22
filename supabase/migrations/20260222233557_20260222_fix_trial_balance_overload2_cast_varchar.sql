/*
  # Fix get_trial_balance second overload — cast varchar columns to text
  
  accounts.code, name, name_ar, type are varchar but function returns text.
  Add explicit ::text casts to resolve the type mismatch.
*/

DROP FUNCTION IF EXISTS public.get_trial_balance(uuid, date, date);

CREATE FUNCTION public.get_trial_balance(
  p_branch_id uuid    DEFAULT NULL,
  p_date_from date    DEFAULT NULL,
  p_date_to   date    DEFAULT NULL
)
RETURNS TABLE(
  code           text,
  name           text,
  name_ar        text,
  account_type   text,
  opening_debit  numeric,
  opening_credit numeric,
  period_debit   numeric,
  period_credit  numeric,
  closing_debit  numeric,
  closing_credit numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_date_from date := COALESCE(p_date_from, '2020-01-01');
  v_date_to   date := COALESCE(p_date_to, CURRENT_DATE);
BEGIN
  RETURN QUERY
  WITH posted_lines AS (
    SELECT
      jl.account_id,
      je.date          AS entry_date,
      je.branch_id,
      SUM(jl.debit)    AS total_debit,
      SUM(jl.credit)   AS total_credit
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.journal_entry_id
    WHERE je.status = 'posted'
      AND (p_branch_id IS NULL OR je.branch_id = p_branch_id)
    GROUP BY jl.account_id, je.date, je.branch_id
  ),
  opening AS (
    SELECT
      account_id,
      SUM(total_debit)  AS debit,
      SUM(total_credit) AS credit
    FROM posted_lines
    WHERE entry_date < v_date_from
    GROUP BY account_id
  ),
  period AS (
    SELECT
      account_id,
      SUM(total_debit)  AS debit,
      SUM(total_credit) AS credit
    FROM posted_lines
    WHERE entry_date BETWEEN v_date_from AND v_date_to
    GROUP BY account_id
  )
  SELECT
    a.code::text,
    a.name::text,
    a.name_ar::text,
    a.type::text,
    COALESCE(o.debit,  0) AS opening_debit,
    COALESCE(o.credit, 0) AS opening_credit,
    COALESCE(p.debit,  0) AS period_debit,
    COALESCE(p.credit, 0) AS period_credit,
    COALESCE(o.debit,  0) + COALESCE(p.debit,  0) AS closing_debit,
    COALESCE(o.credit, 0) + COALESCE(p.credit, 0) AS closing_credit
  FROM accounts a
  LEFT JOIN opening o ON o.account_id = a.id
  LEFT JOIN period  p ON p.account_id = a.id
  WHERE (COALESCE(o.debit,0) + COALESCE(o.credit,0) + COALESCE(p.debit,0) + COALESCE(p.credit,0)) > 0
  ORDER BY a.code;
END;
$$;
