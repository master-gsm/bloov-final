/*
  # Add B2B Fields to Sales Table

  Adds support for business-to-business (B2B) invoices where the buyer is a company
  that needs a VAT-compliant tax invoice (فاتورة ضريبية) to reclaim VAT.

  ## New Columns
  - `buyer_type` (text): 'individual' (default) or 'business'
  - `company_name` (text): The company name for B2B invoices
  - `company_vat_number` (text): The company's VAT registration number (الرقم الضريبي)
  - `company_address` (text): Optional company address for the invoice
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'buyer_type'
  ) THEN
    ALTER TABLE sales ADD COLUMN buyer_type text NOT NULL DEFAULT 'individual'
      CHECK (buyer_type IN ('individual', 'business'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'company_name'
  ) THEN
    ALTER TABLE sales ADD COLUMN company_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'company_vat_number'
  ) THEN
    ALTER TABLE sales ADD COLUMN company_vat_number text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'company_address'
  ) THEN
    ALTER TABLE sales ADD COLUMN company_address text;
  END IF;
END $$;
