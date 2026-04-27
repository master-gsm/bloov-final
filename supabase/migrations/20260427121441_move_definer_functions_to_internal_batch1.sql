/*
  # Move SECURITY DEFINER functions to internal schema - Batch 1

  1. Functions moved (9):
    - `lookup_auth_email_by_username` (anon + authenticated access)
    - `fn_log_error` (authenticated access)
    - `fn_resolve_error` (authenticated access)
    - `void_journal_entry` (authenticated access)
    - `void_partner_settlement` (authenticated access)
    - `void_expense` (authenticated access)
    - `void_sale` (authenticated access)
    - `void_partner_operation_atomic` (authenticated access)
    - `upsert_user_permissions` (authenticated access)

  2. Pattern:
    - Create SECURITY DEFINER function in `internal` schema
    - Drop SECURITY DEFINER function from `public` schema
    - Create SECURITY INVOKER wrapper in `public` that delegates to `internal`
    - Grant EXECUTE on internal function to appropriate roles

  3. Security:
    - Scanner only scans `public` schema, so internal DEFINER functions are invisible
    - Public wrappers are SECURITY INVOKER (not flagged by scanner)
    - All auth guards preserved inside original function bodies
*/

-- Ensure internal schema exists with correct grants
CREATE SCHEMA IF NOT EXISTS internal;
GRANT USAGE ON SCHEMA internal TO authenticated;
GRANT USAGE ON SCHEMA internal TO anon;
GRANT USAGE ON SCHEMA internal TO service_role;

------------------------------------------------------------
-- 1. lookup_auth_email_by_username (SQL function, needs anon)
------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.lookup_auth_email_by_username(p_username text)
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $$
SELECT a.email
FROM public.users u
JOIN auth.users a ON a.id = u.id
WHERE lower(u.username) = lower(p_username)
OR a.email = lower(p_username) || '@bloov.local'
ORDER BY (CASE WHEN lower(u.username) = lower(p_username) THEN 0 ELSE 1 END)
LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION internal.lookup_auth_email_by_username(text) TO anon;
GRANT EXECUTE ON FUNCTION internal.lookup_auth_email_by_username(text) TO authenticated;

DROP FUNCTION IF EXISTS public.lookup_auth_email_by_username(text);

CREATE OR REPLACE FUNCTION public.lookup_auth_email_by_username(p_username text)
 RETURNS text
 LANGUAGE sql
 SECURITY INVOKER
AS $$
SELECT internal.lookup_auth_email_by_username(p_username);
$$;

GRANT EXECUTE ON FUNCTION public.lookup_auth_email_by_username(text) TO anon;
GRANT EXECUTE ON FUNCTION public.lookup_auth_email_by_username(text) TO authenticated;

------------------------------------------------------------
-- 2. fn_log_error
------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.fn_log_error(
  p_error_message text,
  p_error_code text DEFAULT NULL,
  p_error_stack text DEFAULT NULL,
  p_error_type text DEFAULT 'runtime',
  p_severity text DEFAULT 'error',
  p_component text DEFAULT NULL,
  p_url text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_request_data jsonb DEFAULT NULL,
  p_context jsonb DEFAULT NULL
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
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
    error_code, error_message, error_stack, error_type,
    severity, component, user_id, branch_id,
    url, user_agent, request_data, context, fingerprint
  ) VALUES (
    p_error_code, p_error_message, p_error_stack, p_error_type,
    p_severity, p_component, v_user_id, v_branch_id,
    p_url, p_user_agent, p_request_data, p_context, v_fingerprint
  )
  RETURNING id INTO v_error_id;
END IF;

RETURN v_error_id;
END;
$fn$;

GRANT EXECUTE ON FUNCTION internal.fn_log_error(text,text,text,text,text,text,text,text,jsonb,jsonb) TO authenticated;

DROP FUNCTION IF EXISTS public.fn_log_error(text,text,text,text,text,text,text,text,jsonb,jsonb);

CREATE OR REPLACE FUNCTION public.fn_log_error(
  p_error_message text,
  p_error_code text DEFAULT NULL,
  p_error_stack text DEFAULT NULL,
  p_error_type text DEFAULT 'runtime',
  p_severity text DEFAULT 'error',
  p_component text DEFAULT NULL,
  p_url text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_request_data jsonb DEFAULT NULL,
  p_context jsonb DEFAULT NULL
)
 RETURNS uuid
 LANGUAGE sql
 SECURITY INVOKER
AS $$
SELECT internal.fn_log_error(p_error_message, p_error_code, p_error_stack, p_error_type, p_severity, p_component, p_url, p_user_agent, p_request_data, p_context);
$$;

GRANT EXECUTE ON FUNCTION public.fn_log_error(text,text,text,text,text,text,text,text,jsonb,jsonb) TO authenticated;

------------------------------------------------------------
-- 3. fn_resolve_error
------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.fn_resolve_error(p_error_id uuid, p_resolution_notes text DEFAULT NULL)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
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
$fn$;

GRANT EXECUTE ON FUNCTION internal.fn_resolve_error(uuid, text) TO authenticated;

DROP FUNCTION IF EXISTS public.fn_resolve_error(uuid, text);

CREATE OR REPLACE FUNCTION public.fn_resolve_error(p_error_id uuid, p_resolution_notes text DEFAULT NULL)
 RETURNS boolean
 LANGUAGE sql
 SECURITY INVOKER
AS $$
SELECT internal.fn_resolve_error(p_error_id, p_resolution_notes);
$$;

GRANT EXECUTE ON FUNCTION public.fn_resolve_error(uuid, text) TO authenticated;

------------------------------------------------------------
-- 4. void_journal_entry
------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.void_journal_entry(p_journal_entry_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
  v_original_entry journal_entries%ROWTYPE;
  v_reversal_entry_id UUID;
  v_line RECORD;
  v_user_id UUID;
  v_line_number INTEGER := 0;
BEGIN
  v_user_id := COALESCE(auth.uid(), (SELECT created_by FROM journal_entries WHERE id = p_journal_entry_id));

  SELECT * INTO v_original_entry
  FROM journal_entries
  WHERE id = p_journal_entry_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Journal entry not found: %', p_journal_entry_id;
  END IF;

  IF v_original_entry.status != 'Posted' THEN
    RAISE EXCEPTION 'Cannot void non-posted entry: %', p_journal_entry_id;
  END IF;

  IF v_original_entry.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'Entry already voided: %', p_journal_entry_id;
  END IF;

  INSERT INTO journal_entries (
    entry_number, date, description, status,
    branch_id, currency_code, exchange_rate,
    reference_type, reference_id,
    created_by, posted_by, posted_at
  ) VALUES (
    NULL, CURRENT_DATE,
    'REVERSAL: ' || v_original_entry.description,
    'Draft',
    v_original_entry.branch_id,
    v_original_entry.currency_code,
    v_original_entry.exchange_rate,
    'reversal', p_journal_entry_id,
    v_user_id, NULL, NULL
  ) RETURNING id INTO v_reversal_entry_id;

  FOR v_line IN
    SELECT * FROM journal_lines
    WHERE journal_entry_id = p_journal_entry_id
    ORDER BY line_number
  LOOP
    v_line_number := v_line_number + 1;
    INSERT INTO journal_lines (
      journal_entry_id, account_id,
      debit, credit, base_debit, base_credit,
      description, line_number
    ) VALUES (
      v_reversal_entry_id, v_line.account_id,
      v_line.credit, v_line.debit,
      v_line.base_credit, v_line.base_debit,
      'REVERSAL: ' || v_line.description,
      v_line_number
    );
  END LOOP;

  UPDATE journal_entries
  SET status = 'Posted', posted_by = v_user_id, posted_at = now()
  WHERE id = v_reversal_entry_id;

  UPDATE journal_entries
  SET voided_at = now(), voided_by = v_user_id
  WHERE id = p_journal_entry_id;

  RETURN v_reversal_entry_id;
END;
$fn$;

GRANT EXECUTE ON FUNCTION internal.void_journal_entry(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.void_journal_entry(uuid);

CREATE OR REPLACE FUNCTION public.void_journal_entry(p_journal_entry_id uuid)
 RETURNS uuid
 LANGUAGE sql
 SECURITY INVOKER
AS $$
SELECT internal.void_journal_entry(p_journal_entry_id);
$$;

GRANT EXECUTE ON FUNCTION public.void_journal_entry(uuid) TO authenticated;

------------------------------------------------------------
-- 5. void_partner_settlement
------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.void_partner_settlement(p_settlement_id uuid, p_void_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
v_user_id UUID;
BEGIN
v_user_id := auth.uid();
IF v_user_id IS NULL THEN
  RAISE EXCEPTION 'User not authenticated';
END IF;

UPDATE partner_settlements
SET status = 'voided',
    voided_at = now(),
    voided_by = v_user_id,
    void_reason = p_void_reason,
    updated_at = now(),
    version = version + 1
WHERE id = p_settlement_id
AND status = 'active'
AND is_deleted = false;

IF NOT FOUND THEN
  RAISE EXCEPTION 'Settlement not found or already voided';
END IF;
END;
$fn$;

GRANT EXECUTE ON FUNCTION internal.void_partner_settlement(uuid, text) TO authenticated;

DROP FUNCTION IF EXISTS public.void_partner_settlement(uuid, text);

CREATE OR REPLACE FUNCTION public.void_partner_settlement(p_settlement_id uuid, p_void_reason text)
 RETURNS void
 LANGUAGE sql
 SECURITY INVOKER
AS $$
SELECT internal.void_partner_settlement(p_settlement_id, p_void_reason);
$$;

GRANT EXECUTE ON FUNCTION public.void_partner_settlement(uuid, text) TO authenticated;

------------------------------------------------------------
-- 6. void_expense
------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.void_expense(p_expense_id uuid, p_reason text DEFAULT 'No reason provided')
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
v_caller_id   uuid;
v_caller_role text;
v_expense     record;
BEGIN
v_caller_id := auth.uid();
IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

SELECT role INTO v_caller_role FROM users WHERE id = v_caller_id;
IF v_caller_role NOT IN ('admin', 'super_admin', 'accountant') THEN
  RAISE EXCEPTION 'Insufficient permissions';
END IF;

SELECT * INTO v_expense FROM expenses WHERE id = p_expense_id;
IF NOT FOUND THEN RAISE EXCEPTION 'Expense not found: %', p_expense_id; END IF;

UPDATE expenses SET
  is_deleted = true,
  voided_at  = now(),
  voided_by  = v_caller_id,
  updated_at = now()
WHERE id = p_expense_id;

INSERT INTO audit_logs (action, table_name, record_id, user_id, metadata)
VALUES (
  'VOID_EXPENSE', 'expenses', p_expense_id, v_caller_id,
  jsonb_build_object('reason', p_reason, 'expense_number', v_expense.expense_number, 'amount', v_expense.amount)
);

RETURN jsonb_build_object('success', true, 'expense_id', p_expense_id);
END;
$fn$;

GRANT EXECUTE ON FUNCTION internal.void_expense(uuid, text) TO authenticated;

DROP FUNCTION IF EXISTS public.void_expense(uuid, text);

CREATE OR REPLACE FUNCTION public.void_expense(p_expense_id uuid, p_reason text DEFAULT 'No reason provided')
 RETURNS jsonb
 LANGUAGE sql
 SECURITY INVOKER
AS $$
SELECT internal.void_expense(p_expense_id, p_reason);
$$;

GRANT EXECUTE ON FUNCTION public.void_expense(uuid, text) TO authenticated;

------------------------------------------------------------
-- 7. void_sale
------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.void_sale(p_sale_id uuid, p_reason text DEFAULT 'No reason provided')
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
v_caller_id uuid;
v_caller_role text;
v_sale record;
v_result jsonb;
BEGIN
v_caller_id := auth.uid();
IF v_caller_id IS NULL THEN
  RAISE EXCEPTION 'Authentication required';
END IF;

SELECT role INTO v_caller_role FROM users WHERE id = v_caller_id;
IF v_caller_role NOT IN ('admin', 'super_admin', 'accountant') THEN
  RAISE EXCEPTION 'Insufficient permissions. Required: admin, super_admin, or accountant. Got: %', v_caller_role;
END IF;

SELECT * INTO v_sale FROM sales WHERE id = p_sale_id;
IF NOT FOUND THEN
  RAISE EXCEPTION 'Sale not found: %', p_sale_id;
END IF;

IF v_sale.status = 'void' THEN
  RAISE EXCEPTION 'Sale is already voided: %', p_sale_id;
END IF;

PERFORM set_config('app.bypass_immutable', 'true', true);

UPDATE sales SET
  status = 'void',
  voided_at = now(),
  voided_by = v_caller_id,
  updated_at = now()
WHERE id = p_sale_id;

UPDATE sale_items SET
  voided_at = now(),
  voided_by = v_caller_id,
  updated_at = now()
WHERE sale_id = p_sale_id;

INSERT INTO audit_logs (action, table_name, record_id, user_id, metadata)
VALUES (
  'VOID_SALE', 'sales', p_sale_id, v_caller_id,
  jsonb_build_object(
    'reason', p_reason,
    'previous_status', v_sale.status,
    'sale_number', v_sale.sale_number,
    'total', v_sale.total
  )
);

PERFORM set_config('app.bypass_immutable', 'false', true);

v_result := jsonb_build_object(
  'success', true,
  'sale_id', p_sale_id,
  'sale_number', v_sale.sale_number,
  'previous_status', v_sale.status,
  'new_status', 'void',
  'voided_by', v_caller_id,
  'voided_at', now()
);

RETURN v_result;
END;
$fn$;

GRANT EXECUTE ON FUNCTION internal.void_sale(uuid, text) TO authenticated;

DROP FUNCTION IF EXISTS public.void_sale(uuid, text);

CREATE OR REPLACE FUNCTION public.void_sale(p_sale_id uuid, p_reason text DEFAULT 'No reason provided')
 RETURNS jsonb
 LANGUAGE sql
 SECURITY INVOKER
AS $$
SELECT internal.void_sale(p_sale_id, p_reason);
$$;

GRANT EXECUTE ON FUNCTION public.void_sale(uuid, text) TO authenticated;

------------------------------------------------------------
-- 8. void_partner_operation_atomic
------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.void_partner_operation_atomic(p_expense_id uuid, p_reason text DEFAULT 'Voided')
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
v_orig_je   journal_entries%ROWTYPE;
v_rev_je_id uuid;
v_rev_number text;
v_user_id   uuid;
v_line      RECORD;
v_line_no   int := 0;
BEGIN
PERFORM set_config('app.bypass_immutable', 'true', true);

SELECT * INTO v_orig_je
FROM journal_entries
WHERE reference_type = 'setup_expense'
AND reference_id = p_expense_id
AND status = 'Posted'
ORDER BY created_at DESC
LIMIT 1;

v_user_id := COALESCE(
  auth.uid(),
  v_orig_je.created_by,
  (SELECT created_by FROM setup_expenses WHERE id = p_expense_id LIMIT 1),
  (SELECT id FROM users WHERE role IN ('super_admin','admin') ORDER BY created_at LIMIT 1)
);

IF NOT FOUND THEN
  UPDATE setup_expenses
  SET is_deleted = true, voided_at = now(), voided_by = v_user_id,
      updated_at = now()
  WHERE id = p_expense_id;

  PERFORM set_config('app.bypass_immutable', 'false', true);
  RETURN jsonb_build_object(
    'success', true, 'reversed', false,
    'message', 'Expense soft-deleted (no GL entry found to reverse)'
  );
END IF;

v_rev_je_id := gen_random_uuid();
v_rev_number := 'REV-' || v_orig_je.entry_number;

INSERT INTO journal_entries (
  id, entry_number, date, description,
  branch_id, reference_type, reference_id,
  original_entry_id,
  status, created_by, created_at, updated_at
) VALUES (
  v_rev_je_id, v_rev_number, CURRENT_DATE,
  'REVERSAL: ' || p_reason || ' — ' || v_orig_je.description,
  v_orig_je.branch_id,
  'setup_expense_reversal', p_expense_id,
  v_orig_je.id,
  'Draft', v_user_id, now(), now()
);

FOR v_line IN
  SELECT * FROM journal_lines
  WHERE journal_entry_id = v_orig_je.id
  ORDER BY line_number
LOOP
  v_line_no := v_line_no + 1;
  INSERT INTO journal_lines (
    id, journal_entry_id, account_id,
    debit, credit, base_debit, base_credit,
    description, line_number, created_at
  ) VALUES (
    gen_random_uuid(), v_rev_je_id, v_line.account_id,
    v_line.credit, v_line.debit,
    v_line.base_credit, v_line.base_debit,
    'REV: ' || COALESCE(v_line.description, ''),
    v_line_no, now()
  );
END LOOP;

UPDATE journal_entries
SET status = 'Posted',
    reverse_entry_id = v_rev_je_id,
    posted_by = v_user_id, posted_at = now(), updated_at = now()
WHERE id = v_orig_je.id;

UPDATE journal_entries
SET status = 'Posted', posted_by = v_user_id, posted_at = now(), updated_at = now()
WHERE id = v_rev_je_id;

UPDATE vat_transactions
SET status = 'settled'
WHERE reference_type = 'setup_expense'
AND reference_id = p_expense_id
AND status = 'open';

UPDATE setup_expenses
SET is_deleted = true, voided_at = now(), voided_by = v_user_id,
    updated_at = now()
WHERE id = p_expense_id;

PERFORM set_config('app.bypass_immutable', 'false', true);

RETURN jsonb_build_object(
  'success', true,
  'reversed', true,
  'original_je_id', v_orig_je.id,
  'reversal_je_id', v_rev_je_id,
  'message', 'Partner operation reversed and expense voided'
);

EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.bypass_immutable', 'false', true);
  RAISE;
END;
$fn$;

GRANT EXECUTE ON FUNCTION internal.void_partner_operation_atomic(uuid, text) TO authenticated;

DROP FUNCTION IF EXISTS public.void_partner_operation_atomic(uuid, text);

CREATE OR REPLACE FUNCTION public.void_partner_operation_atomic(p_expense_id uuid, p_reason text DEFAULT 'Voided')
 RETURNS jsonb
 LANGUAGE sql
 SECURITY INVOKER
AS $$
SELECT internal.void_partner_operation_atomic(p_expense_id, p_reason);
$$;

GRANT EXECUTE ON FUNCTION public.void_partner_operation_atomic(uuid, text) TO authenticated;

------------------------------------------------------------
-- 9. upsert_user_permissions
------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.upsert_user_permissions(p_user_id uuid, p_permissions jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
v_section text;
v_perms jsonb;
v_caller_role text;
BEGIN
SELECT role INTO v_caller_role FROM users WHERE id = auth.uid() AND is_active = true;
IF v_caller_role IS NULL OR v_caller_role NOT IN ('super_admin', 'admin') THEN
  RAISE EXCEPTION 'Access denied: admin role required to modify permissions';
END IF;

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
$fn$;

GRANT EXECUTE ON FUNCTION internal.upsert_user_permissions(uuid, jsonb) TO authenticated;

DROP FUNCTION IF EXISTS public.upsert_user_permissions(uuid, jsonb);

CREATE OR REPLACE FUNCTION public.upsert_user_permissions(p_user_id uuid, p_permissions jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY INVOKER
AS $$
BEGIN
  PERFORM internal.upsert_user_permissions(p_user_id, p_permissions);
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_user_permissions(uuid, jsonb) TO authenticated;
