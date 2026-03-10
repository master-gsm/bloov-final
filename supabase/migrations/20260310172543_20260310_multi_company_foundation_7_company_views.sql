/*
  # Multi-Company Foundation - Part 7: Company Management Views
  
  ## Overview
  Create views for company management and statistics.
  
  ## Views Created
  - `v_user_companies` - All companies user has access to
  - `v_company_members_detailed` - Company members with user details
  - `v_company_statistics` - Statistics per company
  
  ## Security
  - All views use SECURITY INVOKER (respect caller's RLS)
*/

-- View for user's accessible companies
CREATE OR REPLACE VIEW public.v_user_companies
WITH (security_invoker = true)
AS
SELECT 
  c.id,
  c.name,
  c.name_ar,
  c.code,
  c.logo_url,
  c.subscription_plan,
  c.subscription_status,
  c.is_active,
  cm.company_role,
  cm.is_primary,
  cm.joined_at
FROM public.companies c
JOIN public.company_members cm ON cm.company_id = c.id
WHERE cm.user_id = auth.uid() AND cm.is_active = true;

-- View for company members with user details (users table has full_name, not email directly)
CREATE OR REPLACE VIEW public.v_company_members_detailed
WITH (security_invoker = true)
AS
SELECT 
  cm.id,
  cm.company_id,
  c.name as company_name,
  cm.user_id,
  u.full_name as user_name,
  u.username as user_username,
  u.role as system_role,
  cm.company_role,
  cm.is_primary,
  cm.is_active,
  cm.joined_at,
  cm.created_at
FROM public.company_members cm
JOIN public.companies c ON c.id = cm.company_id
JOIN public.users u ON u.id = cm.user_id
WHERE cm.company_id IN (SELECT fn_get_user_company_ids());

-- View for company statistics
CREATE OR REPLACE VIEW public.v_company_statistics
WITH (security_invoker = true)
AS
SELECT 
  c.id as company_id,
  c.name as company_name,
  c.code as company_code,
  (SELECT COUNT(*) FROM public.branches WHERE company_id = c.id AND is_active = true) as branch_count,
  (SELECT COUNT(*) FROM public.company_members WHERE company_id = c.id AND is_active = true) as member_count,
  (SELECT COUNT(*) FROM public.products WHERE company_id = c.id) as product_count,
  (SELECT COUNT(*) FROM public.suppliers WHERE company_id = c.id) as supplier_count,
  (SELECT COUNT(*) FROM public.customers cu JOIN public.branches b ON cu.branch_id = b.id WHERE b.company_id = c.id) as customer_count,
  (SELECT COUNT(*) FROM public.partners WHERE company_id = c.id) as partner_count,
  c.subscription_plan,
  c.subscription_status,
  c.trial_ends_at,
  c.created_at
FROM public.companies c
WHERE c.id IN (SELECT fn_get_user_company_ids());

-- Function to create a new company with owner
CREATE OR REPLACE FUNCTION public.fn_create_company(
  p_name TEXT,
  p_name_ar TEXT DEFAULT NULL,
  p_code TEXT DEFAULT NULL,
  p_tax_number TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_code TEXT;
BEGIN
  -- Generate code if not provided
  v_code := COALESCE(p_code, lower(regexp_replace(p_name, '[^a-zA-Z0-9]', '', 'g')));
  
  -- Ensure code is unique
  WHILE EXISTS (SELECT 1 FROM public.companies WHERE code = v_code) LOOP
    v_code := v_code || '_' || substr(gen_random_uuid()::text, 1, 4);
  END LOOP;
  
  -- Create company
  INSERT INTO public.companies (name, name_ar, code, tax_number)
  VALUES (p_name, p_name_ar, v_code, p_tax_number)
  RETURNING id INTO v_company_id;
  
  -- Add current user as owner
  INSERT INTO public.company_members (company_id, user_id, company_role, is_primary, is_active)
  VALUES (v_company_id, auth.uid(), 'owner', true, true);
  
  -- Create default branch for the company
  INSERT INTO public.branches (name, name_ar, company_id, is_active, is_main)
  VALUES ('المقر الرئيسي', 'Main Branch', v_company_id, true, true);
  
  -- Create default settings for the company
  INSERT INTO public.settings (company_id)
  VALUES (v_company_id);
  
  RETURN jsonb_build_object(
    'success', true,
    'company_id', v_company_id,
    'code', v_code,
    'message', 'Company created successfully'
  );
END;
$$;

-- Function to add user to company
CREATE OR REPLACE FUNCTION public.fn_add_user_to_company(
  p_company_id UUID,
  p_user_id UUID,
  p_role TEXT DEFAULT 'member'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if caller is admin of the company
  IF NOT fn_is_company_admin(p_company_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only company admins can add users');
  END IF;
  
  -- Check if user already a member
  IF EXISTS (SELECT 1 FROM public.company_members WHERE company_id = p_company_id AND user_id = p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'User is already a member of this company');
  END IF;
  
  -- Validate role
  IF p_role NOT IN ('admin', 'accountant', 'cashier', 'member', 'observer') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid role');
  END IF;
  
  -- Add user to company
  INSERT INTO public.company_members (company_id, user_id, company_role, is_primary, is_active)
  VALUES (p_company_id, p_user_id, p_role, false, true);
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'User added to company successfully'
  );
END;
$$;

-- Function to remove user from company
CREATE OR REPLACE FUNCTION public.fn_remove_user_from_company(
  p_company_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_role TEXT;
BEGIN
  -- Check if caller is admin of the company
  IF NOT fn_is_company_admin(p_company_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only company admins can remove users');
  END IF;
  
  -- Get member's role
  SELECT company_role INTO v_member_role
  FROM public.company_members 
  WHERE company_id = p_company_id AND user_id = p_user_id;
  
  IF v_member_role IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User is not a member of this company');
  END IF;
  
  -- Cannot remove owner
  IF v_member_role = 'owner' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot remove company owner');
  END IF;
  
  -- Remove user from company
  DELETE FROM public.company_members 
  WHERE company_id = p_company_id AND user_id = p_user_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'User removed from company successfully'
  );
END;
$$;

-- Function to update user's company role
CREATE OR REPLACE FUNCTION public.fn_update_company_member_role(
  p_company_id UUID,
  p_user_id UUID,
  p_new_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_role TEXT;
BEGIN
  -- Check if caller is admin of the company
  IF NOT fn_is_company_admin(p_company_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only company admins can update roles');
  END IF;
  
  -- Validate role
  IF p_new_role NOT IN ('admin', 'accountant', 'cashier', 'member', 'observer') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid role');
  END IF;
  
  -- Get current role
  SELECT company_role INTO v_current_role
  FROM public.company_members 
  WHERE company_id = p_company_id AND user_id = p_user_id;
  
  IF v_current_role IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User is not a member of this company');
  END IF;
  
  -- Cannot change owner's role
  IF v_current_role = 'owner' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot change owner role');
  END IF;
  
  -- Update role
  UPDATE public.company_members 
  SET company_role = p_new_role, updated_at = now()
  WHERE company_id = p_company_id AND user_id = p_user_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Role updated successfully'
  );
END;
$$;
