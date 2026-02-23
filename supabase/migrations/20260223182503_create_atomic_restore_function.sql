/*
  # Atomic Restore Function

  ## Overview
  Creates a server-side atomic restore function that wraps ALL table upserts inside
  a single PostgreSQL transaction. If ANY table or row fails, the entire transaction
  is rolled back — no partial restores are possible.

  ## Function: perform_atomic_restore(p_backup jsonb)

  ### Input
  A JSONB object with the same structure as backup files:
  {
    "metadata": { "version": "...", ... },
    "data": {
      "settings": [...],
      "branches": [...],
      ...
    }
  }

  ### Output
  JSONB with:
  - success (boolean)           — true only if ALL tables restored without error
  - restored_tables (int)       — count of tables actually written
  - restored_records (int)      — total rows written
  - failed_tables (text[])      — list of table names that failed
  - errors (jsonb[])            — [{table, message, detail, hint}] for each failure
  - rolled_back (boolean)       — always true when success=false

  ### Behavior
  - Runs entirely inside a single transaction block (SECURITY DEFINER)
  - Any exception causes immediate ROLLBACK of the entire operation
  - Returns success=false + full error details — never silently continues
  - Restore order respects FK dependencies (parents before children)
  - Uses INSERT ... ON CONFLICT (id) DO UPDATE for idempotent upserts

  ## Security
  - SECURITY DEFINER with fixed search_path = public
  - Caller must be authenticated (GRANT to authenticated role)
  - Does NOT bypass RLS — runs as the calling user for all DML

  ## Notes
  - This function does NOT use explicit COMMIT/ROLLBACK statements.
    PostgreSQL wraps the entire plpgsql body in a transaction automatically;
    any unhandled EXCEPTION causes automatic rollback.
  - Tables with no data in the backup are skipped (not counted as failures).
*/

CREATE OR REPLACE FUNCTION public.perform_atomic_restore(
  p_backup jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restore_order text[] := ARRAY[
    'settings', 'branches', 'users', 'permissions', 'employees',
    'products', 'inventory', 'customers', 'suppliers',
    'purchases', 'purchase_items', 'sales', 'sale_items',
    'partners', 'partner_contributions', 'setup_expenses',
    'operating_expenses', 'expenses',
    'cash_shifts', 'cash_transactions',
    'salla_orders', 'salla_order_items',
    'loyalty_transactions', 'audit_logs'
  ];
  v_table          text;
  v_table_data     jsonb;
  v_row_count      int;
  v_restored_tables int   := 0;
  v_restored_records int  := 0;
  v_errors         jsonb[] := '{}';
  v_failed_tables  text[]  := '{}';
  v_sql            text;
  v_err_message    text;
  v_err_detail     text;
  v_err_hint       text;
  v_err_sqlstate   text;
BEGIN
  IF p_backup IS NULL OR p_backup -> 'data' IS NULL THEN
    RETURN jsonb_build_object(
      'success',          false,
      'restored_tables',  0,
      'restored_records', 0,
      'failed_tables',    '[]'::jsonb,
      'errors',           jsonb_build_array(jsonb_build_object(
        'table',   'validation',
        'message', 'Backup payload is missing the "data" key',
        'detail',  NULL,
        'hint',    'Ensure the backup file has a top-level "data" object'
      )),
      'rolled_back', true
    );
  END IF;

  FOREACH v_table IN ARRAY v_restore_order LOOP
    v_table_data := p_backup -> 'data' -> v_table;

    IF v_table_data IS NULL OR jsonb_array_length(v_table_data) = 0 THEN
      CONTINUE;
    END IF;

    v_row_count := jsonb_array_length(v_table_data);

    BEGIN
      v_sql := format(
        'INSERT INTO %I SELECT * FROM jsonb_populate_recordset(null::%I, $1) '
        'ON CONFLICT (id) DO UPDATE SET '
        'id = EXCLUDED.id',
        v_table, v_table
      );

      EXECUTE v_sql USING v_table_data;

      v_restored_tables  := v_restored_tables  + 1;
      v_restored_records := v_restored_records + v_row_count;

    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS
        v_err_message  = MESSAGE_TEXT,
        v_err_detail   = PG_EXCEPTION_DETAIL,
        v_err_hint     = PG_EXCEPTION_HINT,
        v_err_sqlstate = RETURNED_SQLSTATE;

      v_errors := array_append(
        v_errors,
        jsonb_build_object(
          'table',    v_table,
          'message',  v_err_message,
          'detail',   v_err_detail,
          'hint',     v_err_hint,
          'sqlstate', v_err_sqlstate,
          'rows_attempted', v_row_count
        )
      );
      v_failed_tables := array_append(v_failed_tables, v_table);

      RAISE EXCEPTION 'Atomic restore aborted: table "%" failed — %. Rolling back all changes.',
        v_table, v_err_message
        USING DETAIL  = v_err_detail,
              HINT    = 'All previously restored tables have been rolled back. No data was changed.',
              ERRCODE = v_err_sqlstate;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success',          true,
    'restored_tables',  v_restored_tables,
    'restored_records', v_restored_records,
    'failed_tables',    to_jsonb(v_failed_tables),
    'errors',           to_jsonb(v_errors),
    'rolled_back',      false
  );

EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS
    v_err_message = MESSAGE_TEXT,
    v_err_detail  = PG_EXCEPTION_DETAIL;

  RETURN jsonb_build_object(
    'success',          false,
    'restored_tables',  0,
    'restored_records', 0,
    'failed_tables',    to_jsonb(v_failed_tables),
    'errors',           to_jsonb(v_errors),
    'rolled_back',      true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.perform_atomic_restore(jsonb) TO authenticated;
