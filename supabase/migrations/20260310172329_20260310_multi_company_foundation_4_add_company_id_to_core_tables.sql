/*
  # Multi-Company Foundation - Part 4: Add company_id to Core Tables
  
  ## Overview
  Add company_id to core master data tables that should be company-scoped.
  These tables define shared data within a company across all branches.
  
  ## Tables Modified
  - `products` - Product catalog is company-specific
  - `suppliers` - Supplier relationships are company-specific  
  - `partners` - Business partners are company-specific
  - `categories` - Product categories are company-specific
  - `settings` - Settings are company-specific
  - `accounting_periods` - Accounting periods are company-specific
  - `chart_of_accounts` - Chart of accounts can be company-specific
  
  ## Data Migration
  - All existing data assigned to default company
*/

-- Add company_id to products
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'company_id'
  ) THEN
    ALTER TABLE public.products 
    ADD COLUMN company_id UUID REFERENCES public.companies(id) ON DELETE RESTRICT
    DEFAULT '00000000-0000-0000-0000-000000000001';
  END IF;
END $$;

UPDATE public.products SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
ALTER TABLE public.products ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_company_id ON public.products(company_id);

-- Add company_id to suppliers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'suppliers' AND column_name = 'company_id'
  ) THEN
    ALTER TABLE public.suppliers 
    ADD COLUMN company_id UUID REFERENCES public.companies(id) ON DELETE RESTRICT
    DEFAULT '00000000-0000-0000-0000-000000000001';
  END IF;
END $$;

UPDATE public.suppliers SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
ALTER TABLE public.suppliers ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_suppliers_company_id ON public.suppliers(company_id);

-- Add company_id to partners
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partners' AND column_name = 'company_id'
  ) THEN
    ALTER TABLE public.partners 
    ADD COLUMN company_id UUID REFERENCES public.companies(id) ON DELETE RESTRICT
    DEFAULT '00000000-0000-0000-0000-000000000001';
  END IF;
END $$;

UPDATE public.partners SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
ALTER TABLE public.partners ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_partners_company_id ON public.partners(company_id);

-- Add company_id to categories
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'categories' AND column_name = 'company_id'
  ) THEN
    ALTER TABLE public.categories 
    ADD COLUMN company_id UUID REFERENCES public.companies(id) ON DELETE RESTRICT
    DEFAULT '00000000-0000-0000-0000-000000000001';
  END IF;
END $$;

UPDATE public.categories SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
ALTER TABLE public.categories ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_categories_company_id ON public.categories(company_id);

-- Add company_id to settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'settings' AND column_name = 'company_id'
  ) THEN
    ALTER TABLE public.settings 
    ADD COLUMN company_id UUID REFERENCES public.companies(id) ON DELETE RESTRICT
    DEFAULT '00000000-0000-0000-0000-000000000001';
  END IF;
END $$;

UPDATE public.settings SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
ALTER TABLE public.settings ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_settings_company_id ON public.settings(company_id);

-- Add company_id to accounting_periods
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accounting_periods' AND column_name = 'company_id'
  ) THEN
    ALTER TABLE public.accounting_periods 
    ADD COLUMN company_id UUID REFERENCES public.companies(id) ON DELETE RESTRICT
    DEFAULT '00000000-0000-0000-0000-000000000001';
  END IF;
END $$;

UPDATE public.accounting_periods SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
ALTER TABLE public.accounting_periods ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_accounting_periods_company_id ON public.accounting_periods(company_id);

-- Add company_id to partner_settlements (doesn't have branch_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partner_settlements' AND column_name = 'company_id'
  ) THEN
    ALTER TABLE public.partner_settlements 
    ADD COLUMN company_id UUID REFERENCES public.companies(id) ON DELETE RESTRICT
    DEFAULT '00000000-0000-0000-0000-000000000001';
  END IF;
END $$;

UPDATE public.partner_settlements SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
ALTER TABLE public.partner_settlements ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_partner_settlements_company_id ON public.partner_settlements(company_id);

-- Add company_id to partner_contributions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partner_contributions' AND column_name = 'company_id'
  ) THEN
    ALTER TABLE public.partner_contributions 
    ADD COLUMN company_id UUID REFERENCES public.companies(id) ON DELETE RESTRICT
    DEFAULT '00000000-0000-0000-0000-000000000001';
  END IF;
END $$;

UPDATE public.partner_contributions SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
ALTER TABLE public.partner_contributions ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_partner_contributions_company_id ON public.partner_contributions(company_id);

-- Add company_id to loyalty_settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'loyalty_settings' AND column_name = 'company_id'
  ) THEN
    ALTER TABLE public.loyalty_settings 
    ADD COLUMN company_id UUID REFERENCES public.companies(id) ON DELETE RESTRICT
    DEFAULT '00000000-0000-0000-0000-000000000001';
  END IF;
END $$;

UPDATE public.loyalty_settings SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_loyalty_settings_company_id ON public.loyalty_settings(company_id);
