/*
  # Fix Infinite Loop Between Inventory and Product Costing Triggers
  
  ## Problem
  The sync triggers between inventory and product_costing tables create an infinite loop:
  - sync_costing_from_inventory updates product_costing when inventory changes
  - sync_inventory_from_costing updates inventory when product_costing changes
  - This creates a recursive loop that exceeds stack depth
  
  ## Solution
  Add a flag check to prevent recursive updates using pg_trigger_depth()
  
  ## Changes
  1. Drop and recreate sync_costing_from_inventory with recursion guard
  2. Drop and recreate sync_inventory_from_costing with recursion guard
*/

-- Fix sync_costing_from_inventory to prevent infinite loop
CREATE OR REPLACE FUNCTION public.sync_costing_from_inventory()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Prevent infinite recursion by checking trigger depth
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE product_costing
    SET quantity_on_hand = NEW.quantity,
        updated_at = now()
    WHERE product_id = NEW.product_id
      AND branch_id = NEW.branch_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Fix sync_inventory_from_costing to prevent infinite loop
CREATE OR REPLACE FUNCTION public.sync_inventory_from_costing()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Prevent infinite recursion by checking trigger depth
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO inventory (id, product_id, branch_id, quantity, last_updated)
    VALUES (gen_random_uuid(), NEW.product_id, NEW.branch_id, NEW.quantity_on_hand, now())
    ON CONFLICT DO NOTHING;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE inventory
    SET quantity = NEW.quantity_on_hand,
        last_updated = now()
    WHERE product_id = NEW.product_id
      AND branch_id = NEW.branch_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Also fix audit trigger to not audit on recursive calls
CREATE OR REPLACE FUNCTION public.fn_audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_action TEXT;
  v_old_data JSONB;
  v_new_data JSONB;
  v_record_id UUID;
  v_branch_id UUID;
BEGIN
  -- Prevent recursive audit logging
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  v_user_id := auth.uid();
  
  IF TG_OP = 'INSERT' THEN
    v_action := 'CREATE';
    v_new_data := to_jsonb(NEW);
    v_old_data := NULL;
    v_record_id := NEW.id;
    v_branch_id := CASE WHEN TG_TABLE_NAME IN ('sales', 'purchases', 'operating_expenses', 'inventory') 
                        THEN NEW.branch_id ELSE NULL END;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'UPDATE';
    v_old_data := to_jsonb(OLD);
    v_new_data := to_jsonb(NEW);
    v_record_id := NEW.id;
    v_branch_id := CASE WHEN TG_TABLE_NAME IN ('sales', 'purchases', 'operating_expenses', 'inventory') 
                        THEN NEW.branch_id ELSE NULL END;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'DELETE';
    v_old_data := to_jsonb(OLD);
    v_new_data := NULL;
    v_record_id := OLD.id;
    v_branch_id := CASE WHEN TG_TABLE_NAME IN ('sales', 'purchases', 'operating_expenses', 'inventory') 
                        THEN OLD.branch_id ELSE NULL END;
  END IF;
  
  INSERT INTO audit_logs (
    user_id, 
    action, 
    table_name, 
    record_id, 
    branch_id,
    old_data, 
    new_data,
    metadata
  )
  VALUES (
    v_user_id,
    v_action || '_' || UPPER(TG_TABLE_NAME),
    TG_TABLE_NAME,
    v_record_id,
    v_branch_id,
    v_old_data,
    v_new_data,
    jsonb_build_object(
      'trigger_operation', TG_OP,
      'timestamp', NOW(),
      'schema', TG_TABLE_SCHEMA
    )
  );
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION sync_costing_from_inventory IS 'Syncs product_costing quantity when inventory changes - with recursion guard';
COMMENT ON FUNCTION sync_inventory_from_costing IS 'Syncs inventory quantity when product_costing changes - with recursion guard';
