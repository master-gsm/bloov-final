/*
  # Remove Unused Indexes

  1. Performance
    - Drops indexes that have never been used according to pg_stat_user_indexes
    - Unused indexes waste storage and slow down writes (INSERT/UPDATE/DELETE)
    - Covers: company-related indexes on branches/users/products/suppliers/partners/
      categories/settings/accounting_periods/partner_settlements/partner_contributions/
      loyalty_settings, error_logs indexes, companies indexes, company_members index,
      employee_custodies/custody_settlements indexes, role_permissions index

  2. Important Notes
    - IF EXISTS used to prevent errors
    - These indexes had zero scans since database creation
*/

DROP INDEX IF EXISTS idx_branches_company_id;
DROP INDEX IF EXISTS idx_branches_company_active;
DROP INDEX IF EXISTS idx_users_company_id;
DROP INDEX IF EXISTS idx_products_company_id;
DROP INDEX IF EXISTS idx_suppliers_company_id;
DROP INDEX IF EXISTS idx_partners_company_id;
DROP INDEX IF EXISTS idx_categories_company_id;
DROP INDEX IF EXISTS idx_settings_company_id;
DROP INDEX IF EXISTS idx_accounting_periods_company_id;
DROP INDEX IF EXISTS idx_partner_settlements_company_id;
DROP INDEX IF EXISTS idx_partner_contributions_company_id;
DROP INDEX IF EXISTS idx_loyalty_settings_company_id;
DROP INDEX IF EXISTS idx_error_logs_created;
DROP INDEX IF EXISTS idx_error_logs_severity;
DROP INDEX IF EXISTS idx_error_logs_type;
DROP INDEX IF EXISTS idx_error_logs_component;
DROP INDEX IF EXISTS idx_error_logs_fingerprint;
DROP INDEX IF EXISTS idx_error_logs_resolved;
DROP INDEX IF EXISTS idx_error_logs_user;
DROP INDEX IF EXISTS idx_companies_code;
DROP INDEX IF EXISTS idx_companies_is_active;
DROP INDEX IF EXISTS idx_company_members_is_primary;
DROP INDEX IF EXISTS idx_employee_custodies_branch;
DROP INDEX IF EXISTS idx_custody_settlements_branch;
DROP INDEX IF EXISTS idx_custody_settlements_type;
DROP INDEX IF EXISTS idx_role_permissions_permission_id;
