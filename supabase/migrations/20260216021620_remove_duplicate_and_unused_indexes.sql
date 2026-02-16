/*
  # Remove Duplicate and Unused Indexes

  1. Performance Improvements
    - Remove duplicate indexes to save storage and improve write performance
    - Remove unused indexes to reduce maintenance overhead
    - Keep only necessary indexes

  2. Duplicate Indexes Removed
    - Keep idx_compensation_plans_employee_id, remove idx_comp_plans_employee
    - Keep idx_employee_commissions_employee_id, remove idx_employee_commissions_employee
    - Keep idx_employee_commissions_sale_id, remove idx_employee_commissions_sale
    - Keep idx_employees_branch_id, remove idx_employees_branch
    - Keep idx_employees_is_active, remove idx_employees_active
    - Keep idx_employees_user_id, remove idx_employees_user

  3. Unused Indexes Removed
    - All indexes listed in the security report that are not being used
*/

-- Drop duplicate indexes (keeping the ones with full names)
DROP INDEX IF EXISTS idx_comp_plans_employee;
DROP INDEX IF EXISTS idx_employee_commissions_employee;
DROP INDEX IF EXISTS idx_employee_commissions_sale;
DROP INDEX IF EXISTS idx_employees_branch;
DROP INDEX IF EXISTS idx_employees_active;
DROP INDEX IF EXISTS idx_employees_user;

-- Drop unused indexes on accounts and activity_log
DROP INDEX IF EXISTS idx_accounts_parent_id;
DROP INDEX IF EXISTS idx_activity_log_user_id;

-- Drop unused indexes on bouquet_components
DROP INDEX IF EXISTS idx_bouquet_components_component_product_id;

-- Drop unused indexes on cash_registers
DROP INDEX IF EXISTS idx_cash_registers_closed_by;
DROP INDEX IF EXISTS idx_cash_registers_opened_by;

-- Drop unused indexes on categories
DROP INDEX IF EXISTS idx_categories_parent_id;

-- Drop unused indexes on customers
DROP INDEX IF EXISTS idx_customers_created_by;
DROP INDEX IF EXISTS idx_customers_total_spend;
DROP INDEX IF EXISTS idx_customers_last_purchase_date;
DROP INDEX IF EXISTS idx_customers_total_orders;
DROP INDEX IF EXISTS idx_customers_loyalty_points;
DROP INDEX IF EXISTS idx_customers_phone;
DROP INDEX IF EXISTS idx_customers_tier;
DROP INDEX IF EXISTS idx_customers_last_order_date;
DROP INDEX IF EXISTS idx_customers_total_spend_desc;
DROP INDEX IF EXISTS idx_customers_total_orders_desc;
DROP INDEX IF EXISTS idx_customers_branch_id;

-- Drop unused indexes on event_orders
DROP INDEX IF EXISTS idx_event_orders_created_by;
DROP INDEX IF EXISTS idx_event_orders_sale_id;

-- Drop unused indexes on expenses
DROP INDEX IF EXISTS idx_expenses_cash_register_id;
DROP INDEX IF EXISTS idx_expenses_created_by;
DROP INDEX IF EXISTS idx_expenses_branch_id;

-- Drop unused indexes on inventory
DROP INDEX IF EXISTS idx_inventory_updated_by;
DROP INDEX IF EXISTS idx_inventory_branch_id;

-- Drop unused indexes on inventory_movements
DROP INDEX IF EXISTS idx_inventory_movements_created_by;

-- Drop unused indexes on invoice_items
DROP INDEX IF EXISTS idx_invoice_items_invoice_id;
DROP INDEX IF EXISTS idx_invoice_items_product_id;

-- Drop unused indexes on invoices
DROP INDEX IF EXISTS idx_invoices_created_by;

-- Drop unused indexes on loyalty_transactions
DROP INDEX IF EXISTS idx_loyalty_transactions_customer_id;
DROP INDEX IF EXISTS idx_loyalty_transactions_sale_id;
DROP INDEX IF EXISTS idx_loyalty_transactions_expiry;

-- Drop unused indexes on partner_contributions
DROP INDEX IF EXISTS idx_partner_contributions_created_by;
DROP INDEX IF EXISTS idx_partner_contributions_partner_id;

-- Drop unused indexes on partner_distributions
DROP INDEX IF EXISTS idx_partner_distributions_created_by;
DROP INDEX IF EXISTS idx_partner_distributions_partner_id;

-- Drop unused indexes on partner_settlements
DROP INDEX IF EXISTS idx_partner_settlements_from_partner;
DROP INDEX IF EXISTS idx_partner_settlements_to_partner;

-- Drop unused indexes on purchase_items
DROP INDEX IF EXISTS idx_purchase_items_product_id;

-- Drop unused indexes on purchases
DROP INDEX IF EXISTS idx_purchases_created_by;
DROP INDEX IF EXISTS idx_purchases_branch_id;

-- Drop unused indexes on role_permissions
DROP INDEX IF EXISTS idx_role_permissions_permission_id;

-- Drop unused indexes on sales
DROP INDEX IF EXISTS idx_sales_created_by;
DROP INDEX IF EXISTS idx_sales_source;
DROP INDEX IF EXISTS idx_sales_salla_order_id;
DROP INDEX IF EXISTS idx_sales_gross_profit;
DROP INDEX IF EXISTS idx_sales_profit_margin;
DROP INDEX IF EXISTS idx_sales_total_cost;
DROP INDEX IF EXISTS idx_sales_branch_id;
DROP INDEX IF EXISTS idx_sales_not_deleted;
DROP INDEX IF EXISTS idx_sales_salesperson;
DROP INDEX IF EXISTS idx_sales_channel;

-- Drop unused indexes on sale_items
DROP INDEX IF EXISTS idx_sale_item_materials_material_id;
DROP INDEX IF EXISTS idx_sale_items_purchase_price;

-- Drop unused indexes on supplier_payments
DROP INDEX IF EXISTS idx_supplier_payments_created_by;
DROP INDEX IF EXISTS idx_supplier_payments_supplier_id;

-- Drop unused indexes on suppliers
DROP INDEX IF EXISTS idx_suppliers_created_by;

-- Drop unused indexes on transactions
DROP INDEX IF EXISTS idx_transactions_created_by;

-- Drop unused indexes on operating_expenses
DROP INDEX IF EXISTS idx_operating_expenses_expense_type;
DROP INDEX IF EXISTS idx_operating_expenses_created_by;
DROP INDEX IF EXISTS idx_operating_expenses_branch_id;
DROP INDEX IF EXISTS idx_operating_expenses_not_deleted;

-- Drop unused indexes on sms_logs
DROP INDEX IF EXISTS idx_sms_logs_created_at;
DROP INDEX IF EXISTS idx_sms_logs_status;
DROP INDEX IF EXISTS idx_sms_logs_recipient_phone;
DROP INDEX IF EXISTS idx_sms_logs_sent_by;

-- Drop unused indexes on cash_shifts
DROP INDEX IF EXISTS idx_cash_shifts_user_id;
DROP INDEX IF EXISTS idx_cash_shifts_status;
DROP INDEX IF EXISTS idx_cash_shifts_opened_at;

-- Drop unused indexes on cash_transactions
DROP INDEX IF EXISTS idx_cash_transactions_shift_id;
DROP INDEX IF EXISTS idx_cash_transactions_reference;
DROP INDEX IF EXISTS idx_cash_transactions_created_at;

-- Drop unused indexes on wastage
DROP INDEX IF EXISTS idx_wastage_product_id;
DROP INDEX IF EXISTS idx_wastage_recorded_at;
DROP INDEX IF EXISTS idx_wastage_recorded_by;

-- Drop unused indexes on branch_stock
DROP INDEX IF EXISTS idx_branch_stock_product_id;
DROP INDEX IF EXISTS idx_branch_stock_low_stock;

-- Drop unused indexes on setup_expenses
DROP INDEX IF EXISTS idx_setup_expenses_branch_id;
DROP INDEX IF EXISTS idx_setup_expenses_category;
DROP INDEX IF EXISTS idx_setup_expenses_partner_id;

-- Drop unused indexes on salla_orders
DROP INDEX IF EXISTS idx_salla_orders_salla_order_id;
DROP INDEX IF EXISTS idx_salla_orders_status;
DROP INDEX IF EXISTS idx_salla_orders_synced;

-- Drop unused indexes on salla_order_items
DROP INDEX IF EXISTS idx_salla_order_items_order_id;
DROP INDEX IF EXISTS idx_salla_order_items_product_id;

-- Drop unused indexes on backup_queue
DROP INDEX IF EXISTS idx_backup_queue_processed;
DROP INDEX IF EXISTS idx_backup_queue_created_at;

-- Drop unused indexes on ai_analysis_logs
DROP INDEX IF EXISTS idx_ai_logs_query_type;
DROP INDEX IF EXISTS idx_ai_logs_created_at;
DROP INDEX IF EXISTS idx_ai_logs_created_by;

-- Drop unused indexes on ai_forecasts
DROP INDEX IF EXISTS idx_ai_forecasts_product;
DROP INDEX IF EXISTS idx_ai_forecasts_date;
DROP INDEX IF EXISTS idx_ai_forecasts_period;

-- Drop unused indexes on ai_insights
DROP INDEX IF EXISTS idx_ai_insights_type;
DROP INDEX IF EXISTS idx_ai_insights_created_at;
DROP INDEX IF EXISTS idx_ai_insights_status;
DROP INDEX IF EXISTS idx_ai_insights_priority;
DROP INDEX IF EXISTS idx_ai_insights_subject;

-- Drop unused indexes on product_recipes
DROP INDEX IF EXISTS idx_product_recipes_product_id;
DROP INDEX IF EXISTS idx_product_recipes_material_id;

-- Drop unused indexes on products
DROP INDEX IF EXISTS idx_products_type;
DROP INDEX IF EXISTS idx_products_classification;
DROP INDEX IF EXISTS idx_products_type_classification;

-- Drop unused indexes on branches
DROP INDEX IF EXISTS idx_branches_manager_id;

-- Drop unused indexes on users
DROP INDEX IF EXISTS idx_users_branch_id;

-- Drop unused indexes on chart_of_accounts
DROP INDEX IF EXISTS idx_coa_type;
DROP INDEX IF EXISTS idx_coa_code;

-- Drop unused indexes on journal_entries
DROP INDEX IF EXISTS idx_je_number;
DROP INDEX IF EXISTS idx_je_status;

-- Drop unused indexes on journal_entry_lines
DROP INDEX IF EXISTS idx_jel_entry;
DROP INDEX IF EXISTS idx_jel_account;

-- Drop unused indexes on audit_log
DROP INDEX IF EXISTS idx_audit_log_table_record;
DROP INDEX IF EXISTS idx_audit_log_changed_at;
DROP INDEX IF EXISTS idx_audit_log_changed_by;

-- Drop unused indexes on audit_logs
DROP INDEX IF EXISTS idx_audit_logs_created;
DROP INDEX IF EXISTS idx_audit_logs_user;
DROP INDEX IF EXISTS idx_audit_logs_action;
DROP INDEX IF EXISTS idx_audit_logs_branch;

-- Drop unused indexes on commission_accruals
DROP INDEX IF EXISTS idx_comm_accruals_employee;
DROP INDEX IF EXISTS idx_comm_accruals_status;
DROP INDEX IF EXISTS idx_comm_accruals_payroll;
DROP INDEX IF EXISTS idx_comm_accruals_accrued_at;

-- Drop unused indexes on compensation_plans
DROP INDEX IF EXISTS idx_comp_plans_effective;
DROP INDEX IF EXISTS idx_comp_plans_branch;
DROP INDEX IF EXISTS idx_compensation_plans_is_active;

-- Drop unused indexes on employee_commissions
DROP INDEX IF EXISTS idx_employee_commissions_payment;
DROP INDEX IF EXISTS idx_employee_commissions_paid;
DROP INDEX IF EXISTS idx_employee_commissions_status;

-- Drop unused indexes on payroll_runs
DROP INDEX IF EXISTS idx_payroll_runs_period;
DROP INDEX IF EXISTS idx_payroll_runs_branch;
DROP INDEX IF EXISTS idx_payroll_runs_status;

-- Drop unused indexes on payroll_lines
DROP INDEX IF EXISTS idx_payroll_lines_run;
DROP INDEX IF EXISTS idx_payroll_lines_employee;

-- Drop unused indexes on payroll_items
DROP INDEX IF EXISTS idx_payroll_items_payroll_run_id;
DROP INDEX IF EXISTS idx_payroll_items_employee_id;

-- Drop unused indexes on salary_payments
DROP INDEX IF EXISTS idx_salary_payments_employee;
DROP INDEX IF EXISTS idx_salary_payments_branch;
DROP INDEX IF EXISTS idx_salary_payments_date;