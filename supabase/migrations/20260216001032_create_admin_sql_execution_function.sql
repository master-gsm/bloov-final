/*
  # Create Admin SQL Execution Function
  
  1. New Functions
    - `execute_sql_as_admin` - Executes DELETE queries with admin privileges
  
  2. Security
    - Function runs with SECURITY DEFINER to bypass RLS
    - Only allows DELETE statements for safety
    - Returns count of affected rows
*/

CREATE OR REPLACE FUNCTION execute_sql_as_admin(sql_query TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  affected_count INTEGER;
BEGIN
  -- Only allow DELETE statements for safety
  IF sql_query !~* '^DELETE FROM' THEN
    RAISE EXCEPTION 'Only DELETE statements are allowed';
  END IF;
  
  -- Execute the query and get affected row count
  EXECUTE sql_query;
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  
  RETURN affected_count;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION execute_sql_as_admin(TEXT) TO authenticated;

COMMENT ON FUNCTION execute_sql_as_admin IS 'Executes DELETE queries with admin privileges, bypassing RLS. Only for use by reset-test-database edge function.';
