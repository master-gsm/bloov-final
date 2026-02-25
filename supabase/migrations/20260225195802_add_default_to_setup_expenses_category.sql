/*
  # Add DEFAULT value to setup_expenses.category

  ## Problem
  The `category` column in `setup_expenses` is NOT NULL with no DEFAULT,
  causing INSERT failures when the column is omitted from the payload.

  ## Change
  - Sets DEFAULT 'capital' on the `category` column as a safety net.
  - The application code already sends the correct value; this is a DB-level
    guard against any future omission.
*/

ALTER TABLE setup_expenses
  ALTER COLUMN category SET DEFAULT 'capital';
