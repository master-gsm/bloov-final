/*
  # Critical Security Fix - Remove Anonymous Access
  
  ## Summary
  This migration closes critical security vulnerabilities identified in the system audit.
  
  ## Changes
  1. Remove anonymous access to users table
  2. Remove anonymous upload to backups storage
  3. Restrict invoice storage to authenticated users only
  4. Add proper authenticated-only policies
  
  ## Security Impact
  - Closes user enumeration vulnerability
  - Prevents unauthorized backup uploads
  - Protects customer invoice data
  
  ## Affected Tables/Buckets
  - public.users (RLS policy)
  - storage.objects (backups bucket)
  - storage.objects (invoices bucket)
*/

-- ============================================
-- 1. FIX: Remove anonymous access to users table
-- ============================================

-- Drop the dangerous policy that allows anonymous users to read all user data
DROP POLICY IF EXISTS "anon_can_lookup_username" ON public.users;

-- Create a secure policy for username lookup (authenticated only)
CREATE POLICY "authenticated_can_lookup_users"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (
    -- Users can see their own data
    id = auth.uid()
    -- Or admins can see all users
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
      AND u.role IN ('admin', 'super_admin')
      AND u.is_active = true
    )
    -- Or users in same branch can see limited info
    OR branch_id = (SELECT branch_id FROM public.users WHERE id = auth.uid())
  );

-- ============================================
-- 2. FIX: Remove anonymous upload to backups
-- ============================================

-- Drop ALL anonymous/public policies on backups bucket
DROP POLICY IF EXISTS "Allow anon upload to backups" ON storage.objects;
DROP POLICY IF EXISTS "Allow anonymous upload to backups" ON storage.objects;
DROP POLICY IF EXISTS "anon_upload_backups" ON storage.objects;
DROP POLICY IF EXISTS "Public upload to backups" ON storage.objects;

-- Drop any public/anon SELECT policies on backups
DROP POLICY IF EXISTS "Allow anon read backups" ON storage.objects;
DROP POLICY IF EXISTS "Public read backups" ON storage.objects;

-- Create secure backup policies (admin only)
CREATE POLICY "admin_only_upload_backups"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'backups'
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
      AND is_active = true
    )
  );

CREATE POLICY "admin_only_read_backups"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'backups'
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
      AND is_active = true
    )
  );

CREATE POLICY "admin_only_update_backups"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'backups'
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
      AND is_active = true
    )
  )
  WITH CHECK (
    bucket_id = 'backups'
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
      AND is_active = true
    )
  );

CREATE POLICY "admin_only_delete_backups"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'backups'
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
      AND is_active = true
    )
  );

-- ============================================
-- 3. FIX: Restrict invoice storage access
-- ============================================

-- Drop public read policy on invoices
DROP POLICY IF EXISTS "Public read access to invoices" ON storage.objects;
DROP POLICY IF EXISTS "public_read_invoices" ON storage.objects;

-- Create authenticated-only policy for invoices
CREATE POLICY "authenticated_read_invoices"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'invoices');

-- Ensure authenticated users can still write invoices
DROP POLICY IF EXISTS "Authenticated users can upload invoices" ON storage.objects;
CREATE POLICY "authenticated_upload_invoices"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'invoices');

-- ============================================
-- 4. FIX: Secure receipts bucket similarly
-- ============================================

-- Drop any public policies on receipts
DROP POLICY IF EXISTS "Public read access to receipts" ON storage.objects;
DROP POLICY IF EXISTS "public_read_receipts" ON storage.objects;

-- Create authenticated-only policies for receipts
CREATE POLICY "authenticated_read_receipts"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'receipts');

DROP POLICY IF EXISTS "Authenticated users can upload receipts" ON storage.objects;
CREATE POLICY "authenticated_upload_receipts"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'receipts');

-- ============================================
-- 5. Add security logging for sensitive operations
-- ============================================

-- Create function to log security events
CREATE OR REPLACE FUNCTION log_security_event(
  p_event_type text,
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO audit_logs (
    table_name,
    action,
    user_id,
    new_data,
    created_at
  ) VALUES (
    'security_events',
    p_event_type,
    auth.uid(),
    p_details,
    now()
  );
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION log_security_event(text, jsonb) TO authenticated;
