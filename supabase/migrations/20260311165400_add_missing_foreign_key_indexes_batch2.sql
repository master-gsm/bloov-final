/*
  # Add Missing Foreign Key Indexes - Batch 2

  1. Performance
    - Adds indexes on foreign key columns that were missing covering indexes
    - Covers tables: employee_custodies, employee_leaves, employee_loans,
      employee_settlements, error_logs, event_orders, expenses, fixed_assets,
      inventory, inventory_movements, invoice_items, invoices

  2. Important Notes
    - Uses IF NOT EXISTS to prevent errors on re-runs
*/

CREATE INDEX IF NOT EXISTS idx_employee_custodies_created_by ON public.employee_custodies (created_by);
CREATE INDEX IF NOT EXISTS idx_employee_custodies_journal_entry_id ON public.employee_custodies (journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_employee_custodies_partner_id ON public.employee_custodies (partner_id);
CREATE INDEX IF NOT EXISTS idx_employee_custodies_voided_by ON public.employee_custodies (voided_by);
CREATE INDEX IF NOT EXISTS idx_employee_leaves_approved_by ON public.employee_leaves (approved_by);
CREATE INDEX IF NOT EXISTS idx_employee_leaves_branch_id ON public.employee_leaves (branch_id);
CREATE INDEX IF NOT EXISTS idx_employee_leaves_created_by ON public.employee_leaves (created_by);
CREATE INDEX IF NOT EXISTS idx_employee_leaves_employee_id ON public.employee_leaves (employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_loans_branch_id ON public.employee_loans (branch_id);
CREATE INDEX IF NOT EXISTS idx_employee_loans_created_by ON public.employee_loans (created_by);
CREATE INDEX IF NOT EXISTS idx_employee_loans_employee_id ON public.employee_loans (employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_settlements_approved_by ON public.employee_settlements (approved_by);
CREATE INDEX IF NOT EXISTS idx_employee_settlements_branch_id ON public.employee_settlements (branch_id);
CREATE INDEX IF NOT EXISTS idx_employee_settlements_created_by ON public.employee_settlements (created_by);
CREATE INDEX IF NOT EXISTS idx_employee_settlements_employee_id ON public.employee_settlements (employee_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_branch_id ON public.error_logs (branch_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_resolved_by ON public.error_logs (resolved_by);
CREATE INDEX IF NOT EXISTS idx_event_orders_created_by ON public.event_orders (created_by);
CREATE INDEX IF NOT EXISTS idx_event_orders_sale_id ON public.event_orders (sale_id);
CREATE INDEX IF NOT EXISTS idx_expenses_branch_id ON public.expenses (branch_id);
CREATE INDEX IF NOT EXISTS idx_expenses_cash_register_id ON public.expenses (cash_register_id);
CREATE INDEX IF NOT EXISTS idx_expenses_created_by ON public.expenses (created_by);
CREATE INDEX IF NOT EXISTS idx_expenses_expense_account_id ON public.expenses (expense_account_id);
CREATE INDEX IF NOT EXISTS idx_expenses_partner_contribution_id ON public.expenses (partner_contribution_id);
CREATE INDEX IF NOT EXISTS idx_expenses_voided_by ON public.expenses (voided_by);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_created_by ON public.fixed_assets (created_by);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_supplier_id ON public.fixed_assets (supplier_id);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_voided_by ON public.fixed_assets (voided_by);
CREATE INDEX IF NOT EXISTS idx_inventory_branch_id ON public.inventory (branch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_updated_by ON public.inventory (updated_by);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_branch_id ON public.inventory_movements (branch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_created_by ON public.inventory_movements (created_by);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_product_id ON public.inventory_movements (product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_voided_by ON public.inventory_movements (voided_by);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON public.invoice_items (invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_product_id ON public.invoice_items (product_id);
CREATE INDEX IF NOT EXISTS idx_invoices_created_by ON public.invoices (created_by);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON public.invoices (customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_sale_id ON public.invoices (sale_id);
