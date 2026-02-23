/*
  # Add period_month and period_year to employee_commissions

  ## Problem
  The function create_sale_atomic inserts into employee_commissions using:
    - period_month (integer)
    - period_year  (integer)
  But these columns do not exist in the table.

  ## Fix
  Add the two missing columns. No other changes.
*/

ALTER TABLE employee_commissions
  ADD COLUMN IF NOT EXISTS period_month integer,
  ADD COLUMN IF NOT EXISTS period_year  integer;
