/*
  # Revoke EXECUTE on internal-only SECURITY DEFINER functions

  1. Changes
    - Revokes EXECUTE from authenticated on SECURITY DEFINER functions that are
      NOT called directly from the frontend application via RPC
    - These functions are only called internally by other functions, triggers,
      or are legacy/unused
    - They remain callable by postgres and service_role for internal use

  2. Functions affected
    - Internal helper functions called only by other SQL functions
    - Trigger-adjacent functions
    - Legacy test/maintenance functions
    - Functions that duplicate functionality of other called functions

  3. Security
    - Reduces the RPC attack surface significantly
    - No impact on application functionality since these are never called via RPC
*/

-- ============================================================
-- Internal-only functions: revoke authenticated EXECUTE
-- These are called by other SQL functions, not directly from frontend
-- ============================================================

-- Called only by create_sale_atomic internally
REVOKE EXECUTE ON FUNCTION public.auto_post_cogs_on_sale(uuid, uuid, uuid, numeric, date, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.calculate_sale_profit(uuid) FROM authenticated;

-- Called only by other functions or triggers, not from RPC
REVOKE EXECUTE ON FUNCTION public.add_loyalty_points_transaction(uuid, uuid, integer, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_purchase_receipt_journal_entry(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_sale_journal_entry_test(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_bank_reconciliation(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.post_partner_operation_atomic(jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.post_partner_settlement_atomic(uuid) FROM authenticated;

-- Allocation engine - not called directly from frontend
REVOKE EXECUTE ON FUNCTION public.allocate_customer_payment(uuid, jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.allocate_supplier_payment(uuid, jsonb) FROM authenticated;

-- Bank reconciliation - not called from frontend
REVOKE EXECUTE ON FUNCTION public.auto_match_bank_transactions(uuid, date, date) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.manual_match_bank_transaction(uuid, uuid, numeric, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.unmatch_bank_transaction(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.import_bank_statement(uuid, date, date, numeric, numeric, jsonb) FROM authenticated;

-- Admin maintenance functions - should only be called from edge functions or admin tools
REVOKE EXECUTE ON FUNCTION public.execute_sql_as_admin(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.safe_delete_user(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fix_customer_metrics_for_existing_data() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.recalculate_all_customer_metrics() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.recalculate_all_customer_stats() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.recalculate_all_valid_loyalty_points() FROM authenticated;

-- Company management - called from edge functions, not frontend RPC
REVOKE EXECUTE ON FUNCTION public.fn_add_user_to_company(uuid, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_remove_user_from_company(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_create_company(text, text, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_switch_primary_company(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_update_company_member_role(uuid, uuid, text) FROM authenticated;

-- Period/error management - not called from frontend
REVOKE EXECUTE ON FUNCTION public.fn_reopen_accounting_period(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_cleanup_old_errors(integer) FROM authenticated;

-- Internal logging/audit - called by triggers or other functions, not directly from frontend
REVOKE EXECUTE ON FUNCTION public.fn_log_audit(text, text, uuid, jsonb, jsonb, jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_log_closed_period_modification(text, uuid, text, jsonb, jsonb, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.log_security_event(text, jsonb) FROM authenticated;

-- Internal helpers - called by other functions
REVOKE EXECUTE ON FUNCTION public.fn_next_invoice_number(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_can_bypass_period_lock() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_check_period_open(date) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_enqueue_zatca_retry(uuid, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_update_zatca_hash(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_auth_email_by_user_id(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.initialize_branch_onboarding() FROM authenticated;

-- VAT settlement - not called from frontend
REVOKE EXECUTE ON FUNCTION public.settle_vat_period(uuid, integer, integer, text, uuid) FROM authenticated;

-- trusted_* functions are only called by other definer functions
REVOKE EXECUTE ON FUNCTION public.trusted_change_purchase_status(uuid, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.trusted_change_sale_status(uuid, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.trusted_void_expense(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.trusted_void_operating_expense(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.trusted_void_purchase(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.trusted_void_sale(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.trusted_void_setup_expense(uuid, text) FROM authenticated;

-- Other internal-only
REVOKE EXECUTE ON FUNCTION public.create_payroll_run(integer, integer, uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_draft_payroll_run(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_setup_expense_amount(uuid, numeric) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.void_invoice_payment(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.void_operating_expense(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.void_purchase(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.void_purchase_payment(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.void_setup_expense(uuid, text) FROM authenticated;
