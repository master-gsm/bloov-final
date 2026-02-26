/*
  # Add unique phone index to customers table

  1. Changes
    - Add a unique partial index on `phone` column (WHERE phone IS NOT NULL AND phone != '')
    - This prevents duplicate customer records with the same phone number
    - NULL and empty phone values are excluded so walk-in customers without phones are not affected

  2. Why
    - The POS quick-add customer feature needs to guarantee no duplicate phone numbers
    - Without this, concurrent POS terminals could create duplicate customer records
*/

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_phone_unique
  ON customers (phone)
  WHERE phone IS NOT NULL AND phone != '';
