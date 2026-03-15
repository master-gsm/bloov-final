/*
  # Add company_id to accounts table and enhance chart of accounts

  1. Modified Tables
    - `accounts`
      - Added `company_id` (uuid, nullable, FK to companies)
      - Added index on `company_id` for performance

  2. Notes
    - Existing accounts will have NULL company_id (global/shared accounts)
    - company_id allows multi-company chart of accounts isolation
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accounts' AND column_name = 'company_id'
  ) THEN
    ALTER TABLE public.accounts ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_accounts_company_id ON public.accounts(company_id);

CREATE INDEX IF NOT EXISTS idx_accounts_type ON public.accounts(type);

CREATE INDEX IF NOT EXISTS idx_accounts_is_active ON public.accounts(is_active) WHERE is_active = true;
