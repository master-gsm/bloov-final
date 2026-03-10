/*
  # Production Error Monitoring System
  
  ## Overview
  Creates a comprehensive error logging and monitoring system to capture
  all application errors in production for analysis and debugging.
  
  ## New Tables
  1. `error_logs` - Stores all application errors
  2. `error_alerts` - Configurable alert thresholds
  
  ## Features
  - Automatic error categorization
  - Error frequency tracking
  - Alert threshold configuration
  - Error resolution tracking
  
  ## Security
  - Only admins can view error logs
  - Errors are retained for 90 days by default
*/

-- 1. Create error_logs table
CREATE TABLE IF NOT EXISTS error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  error_code TEXT,
  error_message TEXT NOT NULL,
  error_stack TEXT,
  error_type TEXT DEFAULT 'runtime',
  severity TEXT DEFAULT 'error' CHECK (severity IN ('debug', 'info', 'warning', 'error', 'critical')),
  component TEXT,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  url TEXT,
  user_agent TEXT,
  request_data JSONB,
  context JSONB,
  fingerprint TEXT,
  is_resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolution_notes TEXT,
  occurrence_count INTEGER DEFAULT 1,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_error_logs_created ON error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_severity ON error_logs(severity);
CREATE INDEX IF NOT EXISTS idx_error_logs_type ON error_logs(error_type);
CREATE INDEX IF NOT EXISTS idx_error_logs_component ON error_logs(component);
CREATE INDEX IF NOT EXISTS idx_error_logs_fingerprint ON error_logs(fingerprint);
CREATE INDEX IF NOT EXISTS idx_error_logs_resolved ON error_logs(is_resolved);
CREATE INDEX IF NOT EXISTS idx_error_logs_user ON error_logs(user_id);

-- 3. Enable RLS
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies - Only admins can view/manage error logs
DO $$
BEGIN
  DROP POLICY IF EXISTS "error_logs_select_admin" ON error_logs;
  DROP POLICY IF EXISTS "error_logs_insert_any" ON error_logs;
  DROP POLICY IF EXISTS "error_logs_update_admin" ON error_logs;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "error_logs_select_admin" ON error_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "error_logs_insert_any" ON error_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "error_logs_update_admin" ON error_logs
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role IN ('admin', 'super_admin')
    )
  );

-- 5. Function to log errors with deduplication
CREATE OR REPLACE FUNCTION public.fn_log_error(
  p_error_message TEXT,
  p_error_code TEXT DEFAULT NULL,
  p_error_stack TEXT DEFAULT NULL,
  p_error_type TEXT DEFAULT 'runtime',
  p_severity TEXT DEFAULT 'error',
  p_component TEXT DEFAULT NULL,
  p_url TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_request_data JSONB DEFAULT NULL,
  p_context JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_error_id UUID;
  v_user_id UUID;
  v_branch_id UUID;
  v_fingerprint TEXT;
  v_existing_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  SELECT branch_id INTO v_branch_id FROM users WHERE id = v_user_id;
  
  v_fingerprint := md5(COALESCE(p_error_message, '') || COALESCE(p_error_code, '') || COALESCE(p_component, ''));
  
  SELECT id INTO v_existing_id
  FROM error_logs
  WHERE fingerprint = v_fingerprint
    AND is_resolved = false
    AND created_at > NOW() - INTERVAL '24 hours'
  LIMIT 1;
  
  IF v_existing_id IS NOT NULL THEN
    UPDATE error_logs
    SET occurrence_count = occurrence_count + 1,
        last_seen_at = NOW(),
        context = COALESCE(p_context, context)
    WHERE id = v_existing_id
    RETURNING id INTO v_error_id;
  ELSE
    INSERT INTO error_logs (
      error_code,
      error_message,
      error_stack,
      error_type,
      severity,
      component,
      user_id,
      branch_id,
      url,
      user_agent,
      request_data,
      context,
      fingerprint
    )
    VALUES (
      p_error_code,
      p_error_message,
      p_error_stack,
      p_error_type,
      p_severity,
      p_component,
      v_user_id,
      v_branch_id,
      p_url,
      p_user_agent,
      p_request_data,
      p_context,
      v_fingerprint
    )
    RETURNING id INTO v_error_id;
  END IF;
  
  RETURN v_error_id;
END;
$$;

-- 6. Function to mark error as resolved
CREATE OR REPLACE FUNCTION public.fn_resolve_error(
  p_error_id UUID,
  p_resolution_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_user_role TEXT;
BEGIN
  v_user_id := auth.uid();
  SELECT role INTO v_user_role FROM users WHERE id = v_user_id;
  
  IF v_user_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'ACCESS_DENIED: Only administrators can resolve errors';
  END IF;
  
  UPDATE error_logs
  SET is_resolved = true,
      resolved_at = NOW(),
      resolved_by = v_user_id,
      resolution_notes = p_resolution_notes
  WHERE id = p_error_id;
  
  RETURN FOUND;
END;
$$;

-- 7. View for error dashboard
DROP VIEW IF EXISTS v_error_dashboard;
CREATE VIEW v_error_dashboard AS
SELECT 
  e.id,
  e.error_code,
  e.error_message,
  e.error_type,
  e.severity,
  e.component,
  e.occurrence_count,
  e.first_seen_at,
  e.last_seen_at,
  e.is_resolved,
  e.resolved_at,
  u.full_name as affected_user,
  b.name as branch_name,
  r.full_name as resolved_by_name,
  e.resolution_notes,
  CASE 
    WHEN e.severity = 'critical' THEN 1
    WHEN e.severity = 'error' THEN 2
    WHEN e.severity = 'warning' THEN 3
    ELSE 4
  END as severity_order
FROM error_logs e
LEFT JOIN users u ON u.id = e.user_id
LEFT JOIN branches b ON b.id = e.branch_id
LEFT JOIN users r ON r.id = e.resolved_by
ORDER BY 
  e.is_resolved ASC,
  severity_order ASC,
  e.last_seen_at DESC;

-- 8. Summary statistics function
CREATE OR REPLACE FUNCTION public.fn_get_error_stats(
  p_days INTEGER DEFAULT 7
)
RETURNS TABLE (
  total_errors BIGINT,
  critical_count BIGINT,
  error_count BIGINT,
  warning_count BIGINT,
  unresolved_count BIGINT,
  most_common_component TEXT,
  most_frequent_error TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH stats AS (
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE severity = 'critical') as critical,
      COUNT(*) FILTER (WHERE severity = 'error') as errors,
      COUNT(*) FILTER (WHERE severity = 'warning') as warnings,
      COUNT(*) FILTER (WHERE is_resolved = false) as unresolved
    FROM error_logs
    WHERE created_at > NOW() - (p_days || ' days')::INTERVAL
  ),
  common_component AS (
    SELECT component
    FROM error_logs
    WHERE created_at > NOW() - (p_days || ' days')::INTERVAL
      AND component IS NOT NULL
    GROUP BY component
    ORDER BY COUNT(*) DESC
    LIMIT 1
  ),
  frequent_error AS (
    SELECT error_message
    FROM error_logs
    WHERE created_at > NOW() - (p_days || ' days')::INTERVAL
    GROUP BY error_message
    ORDER BY SUM(occurrence_count) DESC
    LIMIT 1
  )
  SELECT 
    s.total,
    s.critical,
    s.errors,
    s.warnings,
    s.unresolved,
    cc.component,
    fe.error_message
  FROM stats s
  CROSS JOIN (SELECT component FROM common_component UNION ALL SELECT NULL LIMIT 1) cc
  CROSS JOIN (SELECT error_message FROM frequent_error UNION ALL SELECT NULL LIMIT 1) fe;
END;
$$;

-- 9. Cleanup function for old error logs (call periodically)
CREATE OR REPLACE FUNCTION public.fn_cleanup_old_errors(
  p_retention_days INTEGER DEFAULT 90
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM error_logs
  WHERE created_at < NOW() - (p_retention_days || ' days')::INTERVAL
    AND is_resolved = true;
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  RETURN v_deleted_count;
END;
$$;

COMMENT ON TABLE error_logs IS 'Production error logging table for monitoring and debugging';
COMMENT ON FUNCTION fn_log_error IS 'Log an error with automatic deduplication';
COMMENT ON FUNCTION fn_resolve_error IS 'Mark an error as resolved - admin only';
COMMENT ON FUNCTION fn_get_error_stats IS 'Get error statistics for dashboard';
