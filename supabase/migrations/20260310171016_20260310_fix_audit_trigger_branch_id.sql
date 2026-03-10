/*
  # Fix Audit Trigger for Tables Without branch_id
  
  ## Problem
  The audit trigger fails when triggered on tables that don't have a branch_id column
  
  ## Solution
  Use exception handling to safely extract branch_id when available
*/

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
  v_branch_id UUID := NULL;
BEGIN
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
    BEGIN
      v_branch_id := (to_jsonb(NEW)->>'branch_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
      v_branch_id := NULL;
    END;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'UPDATE';
    v_old_data := to_jsonb(OLD);
    v_new_data := to_jsonb(NEW);
    v_record_id := NEW.id;
    BEGIN
      v_branch_id := (to_jsonb(NEW)->>'branch_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
      v_branch_id := NULL;
    END;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'DELETE';
    v_old_data := to_jsonb(OLD);
    v_new_data := NULL;
    v_record_id := OLD.id;
    BEGIN
      v_branch_id := (to_jsonb(OLD)->>'branch_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
      v_branch_id := NULL;
    END;
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

COMMENT ON FUNCTION fn_audit_trigger IS 'Generic audit trigger that safely handles tables with or without branch_id';
