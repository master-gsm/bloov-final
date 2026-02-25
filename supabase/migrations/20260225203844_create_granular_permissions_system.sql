/*
  # Granular Permissions System

  1. New Tables
    - `user_permissions`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references users.id)
      - `section` (text) - section identifier (dashboard, sales, purchases, etc.)
      - `can_view` (boolean, default false)
      - `can_create` (boolean, default false)
      - `can_edit` (boolean, default false)
      - `can_delete` (boolean, default false)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      - Unique constraint on (user_id, section)

  2. Security
    - Enable RLS on `user_permissions` table
    - Admin-only write policies
    - Users can read their own permissions
    - RLS helper function `check_user_permission` for use in other table policies

  3. Functions
    - `check_user_permission(p_section text, p_action text)` - returns boolean
    - `get_user_permissions(p_user_id uuid)` - returns all permissions for a user
    - `upsert_user_permissions(p_user_id uuid, p_permissions jsonb)` - bulk upsert

  4. Notes
    - Admins always have full access (bypasses permission checks)
    - 20 sections supported: dashboard, sales, purchases, expenses, fixedassets,
      products, inventory, customers, suppliers, partners, employees, branches,
      salla, cashregister, reports, journal, backup, systemhealth, users, settings
*/

-- Create user_permissions table
CREATE TABLE IF NOT EXISTS user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  section text NOT NULL,
  can_view boolean NOT NULL DEFAULT false,
  can_create boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, section)
);

-- Valid sections check
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_permissions_section_check'
  ) THEN
    ALTER TABLE user_permissions ADD CONSTRAINT user_permissions_section_check
      CHECK (section IN (
        'dashboard', 'sales', 'purchases', 'expenses', 'fixedassets',
        'products', 'inventory', 'customers', 'suppliers', 'partners',
        'employees', 'branches', 'salla', 'cashregister', 'reports',
        'journal', 'backup', 'systemhealth', 'users', 'settings'
      ));
  END IF;
END $$;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_user_section ON user_permissions(user_id, section);

-- Enable RLS
ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can read their own permissions
CREATE POLICY "Users can view own permissions"
  ON user_permissions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policy: Admins can view all permissions
CREATE POLICY "Admins can view all permissions"
  ON user_permissions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
      AND users.is_active = true
    )
  );

-- RLS Policy: Admins can insert permissions
CREATE POLICY "Admins can insert permissions"
  ON user_permissions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
      AND users.is_active = true
    )
  );

-- RLS Policy: Admins can update permissions
CREATE POLICY "Admins can update permissions"
  ON user_permissions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
      AND users.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
      AND users.is_active = true
    )
  );

-- RLS Policy: Admins can delete permissions
CREATE POLICY "Admins can delete permissions"
  ON user_permissions
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
      AND users.is_active = true
    )
  );

-- Function: Check if current user has a specific permission on a section
CREATE OR REPLACE FUNCTION check_user_permission(p_section text, p_action text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_user_id uuid;
  v_role text;
  v_result boolean := false;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT role INTO v_role FROM public.users WHERE id = v_user_id AND is_active = true;

  IF v_role = 'admin' THEN
    RETURN true;
  END IF;

  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  CASE p_action
    WHEN 'view' THEN
      SELECT can_view INTO v_result FROM user_permissions WHERE user_id = v_user_id AND section = p_section;
    WHEN 'create' THEN
      SELECT can_create INTO v_result FROM user_permissions WHERE user_id = v_user_id AND section = p_section;
    WHEN 'edit' THEN
      SELECT can_edit INTO v_result FROM user_permissions WHERE user_id = v_user_id AND section = p_section;
    WHEN 'delete' THEN
      SELECT can_delete INTO v_result FROM user_permissions WHERE user_id = v_user_id AND section = p_section;
    ELSE
      RETURN false;
  END CASE;

  RETURN COALESCE(v_result, false);
END;
$$;

-- Function: Get all permissions for a user (returns JSON)
CREATE OR REPLACE FUNCTION get_user_permissions(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_result jsonb := '{}'::jsonb;
  v_role text;
BEGIN
  SELECT role INTO v_role FROM public.users WHERE id = p_user_id AND is_active = true;

  IF v_role = 'admin' THEN
    RETURN jsonb_build_object(
      'dashboard', jsonb_build_object('view', true, 'create', true, 'edit', true, 'delete', true),
      'sales', jsonb_build_object('view', true, 'create', true, 'edit', true, 'delete', true),
      'purchases', jsonb_build_object('view', true, 'create', true, 'edit', true, 'delete', true),
      'expenses', jsonb_build_object('view', true, 'create', true, 'edit', true, 'delete', true),
      'fixedassets', jsonb_build_object('view', true, 'create', true, 'edit', true, 'delete', true),
      'products', jsonb_build_object('view', true, 'create', true, 'edit', true, 'delete', true),
      'inventory', jsonb_build_object('view', true, 'create', true, 'edit', true, 'delete', true),
      'customers', jsonb_build_object('view', true, 'create', true, 'edit', true, 'delete', true),
      'suppliers', jsonb_build_object('view', true, 'create', true, 'edit', true, 'delete', true),
      'partners', jsonb_build_object('view', true, 'create', true, 'edit', true, 'delete', true),
      'employees', jsonb_build_object('view', true, 'create', true, 'edit', true, 'delete', true),
      'branches', jsonb_build_object('view', true, 'create', true, 'edit', true, 'delete', true),
      'salla', jsonb_build_object('view', true, 'create', true, 'edit', true, 'delete', true),
      'cashregister', jsonb_build_object('view', true, 'create', true, 'edit', true, 'delete', true),
      'reports', jsonb_build_object('view', true, 'create', true, 'edit', true, 'delete', true),
      'journal', jsonb_build_object('view', true, 'create', true, 'edit', true, 'delete', true),
      'backup', jsonb_build_object('view', true, 'create', true, 'edit', true, 'delete', true),
      'systemhealth', jsonb_build_object('view', true, 'create', true, 'edit', true, 'delete', true),
      'users', jsonb_build_object('view', true, 'create', true, 'edit', true, 'delete', true),
      'settings', jsonb_build_object('view', true, 'create', true, 'edit', true, 'delete', true)
    );
  END IF;

  SELECT jsonb_object_agg(
    up.section,
    jsonb_build_object('view', up.can_view, 'create', up.can_create, 'edit', up.can_edit, 'delete', up.can_delete)
  ) INTO v_result
  FROM user_permissions up
  WHERE up.user_id = p_user_id;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

-- Function: Bulk upsert permissions for a user
CREATE OR REPLACE FUNCTION upsert_user_permissions(p_user_id uuid, p_permissions jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_section text;
  v_perms jsonb;
BEGIN
  FOR v_section, v_perms IN SELECT * FROM jsonb_each(p_permissions)
  LOOP
    INSERT INTO user_permissions (user_id, section, can_view, can_create, can_edit, can_delete, updated_at)
    VALUES (
      p_user_id,
      v_section,
      COALESCE((v_perms->>'view')::boolean, false),
      COALESCE((v_perms->>'create')::boolean, false),
      COALESCE((v_perms->>'edit')::boolean, false),
      COALESCE((v_perms->>'delete')::boolean, false),
      now()
    )
    ON CONFLICT (user_id, section)
    DO UPDATE SET
      can_view = COALESCE((v_perms->>'view')::boolean, false),
      can_create = COALESCE((v_perms->>'create')::boolean, false),
      can_edit = COALESCE((v_perms->>'edit')::boolean, false),
      can_delete = COALESCE((v_perms->>'delete')::boolean, false),
      updated_at = now();
  END LOOP;
END;
$$;

-- Add user_permissions cleanup to safe_delete_user
-- (CASCADE on FK already handles this, but explicit is better)

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION check_user_permission(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_permissions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_user_permissions(uuid, jsonb) TO authenticated;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
