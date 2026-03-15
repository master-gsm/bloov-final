/*
  # Fix Company Helper Functions for Super Admin

  1. Problem
    - fn_get_user_company_ids only checks company_members table
    - fn_is_company_admin only checks company_members table
    - super_admin needs access to ALL companies without being in company_members

  2. Changes
    - Update fn_get_user_company_ids to return ALL company IDs for super_admin
    - Update fn_is_company_admin to always return true for super_admin
    - Create fn_is_company_manager that respects super_admin

  3. Security
    - super_admin bypasses all company restrictions
    - Other users maintain existing company membership restrictions
*/

CREATE OR REPLACE FUNCTION fn_get_user_company_ids()
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin') THEN
    RETURN QUERY SELECT id FROM companies WHERE is_active = true;
  ELSE
    RETURN QUERY 
      SELECT company_id 
      FROM company_members 
      WHERE user_id = auth.uid() 
      AND is_active = true;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION fn_is_company_admin(p_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin') THEN
    RETURN true;
  END IF;
  
  RETURN EXISTS (
    SELECT 1 
    FROM company_members 
    WHERE user_id = auth.uid() 
    AND company_id = p_company_id 
    AND company_role IN ('owner', 'admin')
    AND is_active = true
  );
END;
$$;

CREATE OR REPLACE FUNCTION fn_is_company_manager(p_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin') THEN
    RETURN true;
  END IF;
  
  RETURN EXISTS (
    SELECT 1 
    FROM company_members 
    WHERE user_id = auth.uid() 
    AND company_id = p_company_id 
    AND company_role IN ('owner', 'admin', 'manager')
    AND is_active = true
  );
END;
$$;

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(role, 'viewer') FROM users WHERE id = auth.uid() AND is_active = true LIMIT 1;
$$;
