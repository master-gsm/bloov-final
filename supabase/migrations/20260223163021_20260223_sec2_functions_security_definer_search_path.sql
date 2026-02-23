
/*
  # Security Fix: Add SECURITY DEFINER + fixed search_path to all mutable-search_path functions

  ## Summary
  Functions without SECURITY DEFINER and without a fixed search_path are vulnerable
  to search_path injection attacks (a malicious schema earlier in the search path could
  shadow public objects). This migration recreates all affected functions with:
    - SECURITY DEFINER
    - SET search_path = public

  ## Functions Fixed (12)
  1.  calculate_customer_tier (3-arg variant with p_total_spend)
  2.  create_expense_from_partner_contribution (trigger)
  3.  create_sale_journal_entry_test
  4.  deduct_wastage_from_inventory (trigger)
  5.  prevent_commission_delete (trigger)
  6.  restore_wastage_to_inventory (trigger)
  7.  sync_salla_order_to_inventory (trigger)
  8.  update_cash_shifts_updated_at (trigger)
  9.  update_employees_updated_at (trigger)
  10. update_salla_orders_updated_at (trigger)
  11. update_settings_updated_at (trigger)
  12. update_updated_at_column (trigger)
  13. update_users_updated_at (trigger — fix pg_catalog to public)

  ## Notes
  - Business logic is NOT changed in any function.
  - Trigger functions use SECURITY DEFINER so they run with fixed context regardless of caller.
*/

-- 1. calculate_customer_tier (3-arg INVOKER variant)
CREATE OR REPLACE FUNCTION public.calculate_customer_tier(
  p_total_spend numeric,
  p_total_orders integer,
  p_last_purchase_date timestamp with time zone
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_days_since_purchase integer;
BEGIN
  IF p_last_purchase_date IS NOT NULL THEN
    v_days_since_purchase := EXTRACT(DAY FROM (CURRENT_TIMESTAMP - p_last_purchase_date));
  ELSE
    v_days_since_purchase := 999999;
  END IF;

  IF p_total_spend >= 5000 OR p_total_orders >= 20 THEN
    RETURN 'vip';
  END IF;

  IF v_days_since_purchase > 60 THEN
    RETURN 'inactive';
  END IF;

  IF p_total_spend >= 1000 OR p_total_orders >= 5 THEN
    RETURN 'frequent';
  END IF;

  RETURN 'regular';
END;
$function$;

-- 2. create_expense_from_partner_contribution (trigger)
CREATE OR REPLACE FUNCTION public.create_expense_from_partner_contribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  expense_num TEXT;
  partner_name TEXT;
  partner_name_ar TEXT;
BEGIN
  expense_num := generate_expense_number();

  SELECT name, name_ar INTO partner_name, partner_name_ar
  FROM partners
  WHERE id = NEW.partner_id;

  INSERT INTO operating_expenses (
    expense_number, expense_type, description, description_ar,
    amount, expense_date, payment_method, notes, notes_ar,
    partner_contribution_id, created_by
  ) VALUES (
    expense_num,
    COALESCE(NEW.contribution_type, 'operational'),
    COALESCE(NEW.description, 'Partner contribution: ' || partner_name),
    COALESCE(NEW.description_ar, 'دفعة شريك: ' || COALESCE(partner_name_ar, partner_name)),
    NEW.amount,
    NEW.contribution_date,
    'cash',
    'Auto-generated from partner contribution',
    'تم إنشاؤه تلقائياً من دفعة الشريك',
    NEW.id,
    NEW.created_by
  );

  RETURN NEW;
END;
$function$;

-- 3. create_sale_journal_entry_test
CREATE OR REPLACE FUNCTION public.create_sale_journal_entry_test(p_sale_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_journal_entry_id UUID;
  v_user_id UUID;
  v_sale sales%ROWTYPE;
BEGIN
  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale not found';
  END IF;

  IF v_sale.status != 'confirmed' THEN
    RAISE EXCEPTION 'Sale status must be confirmed, found: %', v_sale.status;
  END IF;

  v_user_id := v_sale.created_by;
  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id FROM users WHERE role = 'admin' LIMIT 1;
  END IF;

  INSERT INTO journal_entries (
    entry_number, date, description, status, branch_id,
    currency_code, exchange_rate, reference_type, reference_id,
    created_by
  ) VALUES (
    NULL,
    CURRENT_DATE,
    'Test Sale #' || v_sale.sale_number,
    'Draft',
    v_sale.branch_id,
    'SAR',
    1.0,
    'sale',
    p_sale_id,
    v_user_id
  ) RETURNING id INTO v_journal_entry_id;

  RETURN v_journal_entry_id;
END;
$function$;

-- 4. deduct_wastage_from_inventory (trigger)
CREATE OR REPLACE FUNCTION public.deduct_wastage_from_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  UPDATE inventory
  SET quantity = quantity - NEW.quantity
  WHERE product_id = NEW.product_id;

  IF NOT FOUND OR (SELECT quantity FROM inventory WHERE product_id = NEW.product_id) < 0 THEN
    RAISE EXCEPTION 'Insufficient inventory for product';
  END IF;

  RETURN NEW;
END;
$function$;

-- 5. prevent_commission_delete (trigger)
CREATE OR REPLACE FUNCTION public.prevent_commission_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  RAISE EXCEPTION 'Cannot delete commission records. Use status change instead.';
  RETURN NULL;
END;
$function$;

-- 6. restore_wastage_to_inventory (trigger)
CREATE OR REPLACE FUNCTION public.restore_wastage_to_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  UPDATE inventory
  SET quantity = quantity + OLD.quantity
  WHERE product_id = OLD.product_id;

  RETURN OLD;
END;
$function$;

-- 7. sync_salla_order_to_inventory (trigger)
CREATE OR REPLACE FUNCTION public.sync_salla_order_to_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.status = 'completed' AND NEW.synced = false THEN
    UPDATE inventory i
    SET quantity = i.quantity - soi.quantity
    FROM salla_order_items soi
    WHERE soi.salla_order_id = NEW.id
      AND soi.product_id = i.product_id
      AND soi.product_id IS NOT NULL;

    NEW.synced := true;
    NEW.synced_at := now();
  END IF;

  RETURN NEW;
END;
$function$;

-- 8. update_cash_shifts_updated_at (trigger)
CREATE OR REPLACE FUNCTION public.update_cash_shifts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- 9. update_employees_updated_at (trigger)
CREATE OR REPLACE FUNCTION public.update_employees_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- 10. update_salla_orders_updated_at (trigger)
CREATE OR REPLACE FUNCTION public.update_salla_orders_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- 11. update_settings_updated_at (trigger)
CREATE OR REPLACE FUNCTION public.update_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- 12. update_updated_at_column (trigger)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- 13. update_users_updated_at — fix pg_catalog reference to public
CREATE OR REPLACE FUNCTION public.update_users_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
