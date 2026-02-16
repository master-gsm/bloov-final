/*
  # Soft Delete via Restrictive RLS Policies

  1. Purpose
    - Hide soft-deleted records (is_deleted = true) from all queries
    - Uses RESTRICTIVE policies which are AND'd with existing PERMISSIVE policies
    - This means even super_admin cannot see deleted records via normal queries
    - Deleted records can only be accessed via SECURITY DEFINER functions

  2. Policies Created (all RESTRICTIVE)
    - `soft_delete_filter_sales` on sales
    - `soft_delete_filter_sale_items` on sale_items
    - `soft_delete_filter_purchases` on purchases
    - `soft_delete_filter_purchase_items` on purchase_items
    - `soft_delete_filter_expenses` on expenses
    - `soft_delete_filter_inventory_movements` on inventory_movements
    - `soft_delete_filter_operating_expenses` on operating_expenses
    - `soft_delete_filter_cash_transactions` on cash_transactions
    - `soft_delete_filter_cash_shifts` on cash_shifts
    - `soft_delete_filter_partner_contributions` on partner_contributions
    - `soft_delete_filter_partner_settlements` on partner_settlements
    - `soft_delete_filter_setup_expenses` on setup_expenses

  3. Security
    - RESTRICTIVE policies are evaluated with AND logic
    - A record must pass BOTH this policy AND at least one permissive policy
    - This guarantees deleted records are invisible at the database level
    - Only SECURITY DEFINER functions that bypass RLS can see deleted records

  4. Important Notes
    - Existing data remains unchanged (all records have is_deleted = false by default)
    - No existing policies are modified
    - These policies stack on top of existing branch-isolation and role-based policies
*/

DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'sales', 'sale_items', 'purchases', 'purchase_items',
    'expenses', 'inventory_movements', 'operating_expenses',
    'cash_transactions', 'cash_shifts', 'partner_contributions',
    'partner_settlements', 'setup_expenses'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('
      DROP POLICY IF EXISTS "soft_delete_filter_%I" ON %I;
      CREATE POLICY "soft_delete_filter_%I"
        ON %I
        AS RESTRICTIVE
        FOR SELECT
        TO authenticated
        USING (is_deleted = false);
    ', tbl, tbl, tbl, tbl);

    EXECUTE format('
      DROP POLICY IF EXISTS "soft_delete_filter_update_%I" ON %I;
      CREATE POLICY "soft_delete_filter_update_%I"
        ON %I
        AS RESTRICTIVE
        FOR UPDATE
        TO authenticated
        USING (is_deleted = false);
    ', tbl, tbl, tbl, tbl);
  END LOOP;
END $$;