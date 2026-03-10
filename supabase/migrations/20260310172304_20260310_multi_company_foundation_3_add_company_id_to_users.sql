/*
  # Multi-Company Foundation - Part 3: Add company_id to users table
  
  ## Overview
  Users need a primary company assignment for context and RLS.
  The company_members table handles multi-company access.
  
  ## Changes
  - Add `company_id` column to `users` table for primary company
  - Migrate existing users to default company
  - Link existing users to company_members table
  
  ## Data Migration
  - All existing users assigned to default company
  - Users added to company_members with appropriate roles
*/

-- Add company_id to users table if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'company_id'
  ) THEN
    ALTER TABLE public.users 
    ADD COLUMN company_id UUID REFERENCES public.companies(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- Update all existing users to belong to default company
UPDATE public.users
SET company_id = '00000000-0000-0000-0000-000000000001'
WHERE company_id IS NULL;

-- Make company_id NOT NULL after data migration
ALTER TABLE public.users 
ALTER COLUMN company_id SET NOT NULL;

-- Set default for new users
ALTER TABLE public.users 
ALTER COLUMN company_id SET DEFAULT '00000000-0000-0000-0000-000000000001';

-- Create index for company_id lookups
CREATE INDEX IF NOT EXISTS idx_users_company_id ON public.users(company_id);

-- Insert existing users into company_members table
-- Map existing roles to company roles
INSERT INTO public.company_members (company_id, user_id, company_role, is_primary, is_active)
SELECT 
  '00000000-0000-0000-0000-000000000001',
  u.id,
  CASE 
    WHEN u.role = 'super_admin' THEN 'owner'
    WHEN u.role = 'admin' THEN 'admin'
    WHEN u.role = 'accountant' THEN 'accountant'
    WHEN u.role = 'cashier' THEN 'cashier'
    WHEN u.role = 'observer' THEN 'observer'
    ELSE 'member'
  END,
  true,
  true
FROM public.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.company_members cm 
  WHERE cm.user_id = u.id AND cm.company_id = '00000000-0000-0000-0000-000000000001'
);
