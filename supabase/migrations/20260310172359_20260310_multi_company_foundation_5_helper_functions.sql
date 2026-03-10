/*
  # Multi-Company Foundation - Part 5: Helper Functions
  
  ## Overview
  Create helper functions for company context management.
  These functions provide efficient ways to check company access.
  
  ## Functions Created
  - `fn_get_user_company_id()` - Get user's primary company ID
  - `fn_get_user_company_ids()` - Get all companies user has access to
  - `fn_user_has_company_access()` - Check if user can access a company
  - `fn_get_user_company_role()` - Get user's role in a company
  - `fn_is_company_admin()` - Check if user is admin in company
  
  ## Important Notes
  - All functions use SECURITY DEFINER for RLS bypass
  - Functions are optimized for use in RLS policies
*/

-- Get user's primary company ID
CREATE OR REPLACE FUNCTION public.fn_get_user_company_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id 
  FROM public.company_members 
  WHERE user_id = auth.uid() 
    AND is_primary = true 
    AND is_active = true
  LIMIT 1;
$$;

-- Get all company IDs user has access to
CREATE OR REPLACE FUNCTION public.fn_get_user_company_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id 
  FROM public.company_members 
  WHERE user_id = auth.uid() 
    AND is_active = true;
$$;

-- Check if user has access to a specific company
CREATE OR REPLACE FUNCTION public.fn_user_has_company_access(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.company_members 
    WHERE user_id = auth.uid() 
      AND company_id = p_company_id 
      AND is_active = true
  );
$$;

-- Get user's role in a specific company
CREATE OR REPLACE FUNCTION public.fn_get_user_company_role(p_company_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_role 
  FROM public.company_members 
  WHERE user_id = auth.uid() 
    AND company_id = p_company_id 
    AND is_active = true
  LIMIT 1;
$$;

-- Check if user is admin (owner or admin) in a company
CREATE OR REPLACE FUNCTION public.fn_is_company_admin(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.company_members 
    WHERE user_id = auth.uid() 
      AND company_id = p_company_id 
      AND company_role IN ('owner', 'admin')
      AND is_active = true
  );
$$;

-- Check if user can manage data (owner, admin, accountant)
CREATE OR REPLACE FUNCTION public.fn_can_manage_company_data(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.company_members 
    WHERE user_id = auth.uid() 
      AND company_id = p_company_id 
      AND company_role IN ('owner', 'admin', 'accountant')
      AND is_active = true
  );
$$;

-- Get company ID from branch ID (for tables with branch_id but not company_id)
CREATE OR REPLACE FUNCTION public.fn_get_company_from_branch(p_branch_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.branches WHERE id = p_branch_id;
$$;

-- Check if user has access to branch (via company)
CREATE OR REPLACE FUNCTION public.fn_user_has_branch_access(p_branch_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.branches b
    JOIN public.company_members cm ON cm.company_id = b.company_id
    WHERE b.id = p_branch_id 
      AND cm.user_id = auth.uid() 
      AND cm.is_active = true
  );
$$;

-- Function to switch user's primary company
CREATE OR REPLACE FUNCTION public.fn_switch_primary_company(p_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_access BOOLEAN;
BEGIN
  -- Check if user has access to target company
  SELECT EXISTS (
    SELECT 1 FROM public.company_members 
    WHERE user_id = auth.uid() AND company_id = p_company_id AND is_active = true
  ) INTO v_has_access;
  
  IF NOT v_has_access THEN
    RETURN jsonb_build_object('success', false, 'error', 'No access to this company');
  END IF;
  
  -- Remove primary flag from all user's companies
  UPDATE public.company_members
  SET is_primary = false, updated_at = now()
  WHERE user_id = auth.uid();
  
  -- Set new primary company
  UPDATE public.company_members
  SET is_primary = true, updated_at = now()
  WHERE user_id = auth.uid() AND company_id = p_company_id;
  
  -- Update user's company_id
  UPDATE public.users
  SET company_id = p_company_id, updated_at = now()
  WHERE id = auth.uid();
  
  RETURN jsonb_build_object(
    'success', true, 
    'company_id', p_company_id,
    'message', 'Primary company switched successfully'
  );
END;
$$;
