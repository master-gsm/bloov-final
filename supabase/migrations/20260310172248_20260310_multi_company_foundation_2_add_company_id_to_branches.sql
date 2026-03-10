/*
  # Multi-Company Foundation - Part 2: Add company_id to branches
  
  ## Overview
  Branches are the top-level organizational unit within a company.
  Adding company_id to branches allows complete multi-tenant isolation.
  
  ## Changes
  - Add `company_id` column to `branches` table
  - Set default company for all existing branches
  - Create foreign key constraint
  - Add index for performance
  
  ## Data Migration
  - All existing branches assigned to default company (00000000-0000-0000-0000-000000000001)
  
  ## Important Notes
  - This maintains existing branch isolation while adding company layer above
  - Branches are now: Company > Branch > Data hierarchy
*/

-- Add company_id to branches table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'branches' AND column_name = 'company_id'
  ) THEN
    ALTER TABLE public.branches 
    ADD COLUMN company_id UUID REFERENCES public.companies(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- Update all existing branches to belong to default company
UPDATE public.branches
SET company_id = '00000000-0000-0000-0000-000000000001'
WHERE company_id IS NULL;

-- Make company_id NOT NULL after data migration
ALTER TABLE public.branches 
ALTER COLUMN company_id SET NOT NULL;

-- Set default for new branches
ALTER TABLE public.branches 
ALTER COLUMN company_id SET DEFAULT '00000000-0000-0000-0000-000000000001';

-- Create index for company_id lookups
CREATE INDEX IF NOT EXISTS idx_branches_company_id ON public.branches(company_id);

-- Create compound index for company + active branches
CREATE INDEX IF NOT EXISTS idx_branches_company_active ON public.branches(company_id, is_active);
