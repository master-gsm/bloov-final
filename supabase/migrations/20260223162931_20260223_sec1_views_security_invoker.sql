
/*
  # Security Fix: Set All Views to SECURITY INVOKER

  ## Summary
  All public views currently default to SECURITY DEFINER behaviour (inherited from the
  view owner). This migration explicitly sets `security_invoker = true` on every view
  so that RLS policies on the underlying tables are evaluated using the calling user's
  credentials, not the view owner's. `sales_profit_summary` was already correct.

  ## Views Fixed (11)
  - v_bank_reconciliation_status
  - v_customer_payment_balance
  - v_income_statement
  - v_invoice_open_balance
  - v_marketing_performance
  - v_partner_balances
  - v_purchase_open_balance
  - v_supplier_payment_balance
  - v_trial_balance
  - v_unmatched_bank_lines
  - v_unmatched_journal_entries
  - sales_profit_summary (already set — re-confirmed)

  ## Security Notes
  - No view definitions are changed, only the security context is corrected.
  - After this change, users can only see rows that their RLS policies allow on the base tables.
*/

ALTER VIEW public.v_bank_reconciliation_status       SET (security_invoker = true);
ALTER VIEW public.v_customer_payment_balance         SET (security_invoker = true);
ALTER VIEW public.v_income_statement                 SET (security_invoker = true);
ALTER VIEW public.v_invoice_open_balance             SET (security_invoker = true);
ALTER VIEW public.v_marketing_performance            SET (security_invoker = true);
ALTER VIEW public.v_partner_balances                 SET (security_invoker = true);
ALTER VIEW public.v_purchase_open_balance            SET (security_invoker = true);
ALTER VIEW public.v_supplier_payment_balance         SET (security_invoker = true);
ALTER VIEW public.v_trial_balance                    SET (security_invoker = true);
ALTER VIEW public.v_unmatched_bank_lines             SET (security_invoker = true);
ALTER VIEW public.v_unmatched_journal_entries        SET (security_invoker = true);
ALTER VIEW public.sales_profit_summary               SET (security_invoker = true);
