
/*
  # Fix record_vat_tx_from_sale — use sale_number instead of invoice_number

  ## Problem
  The trigger function `record_vat_tx_from_sale` references `NEW.invoice_number`
  but the `sales` table does not have an `invoice_number` column.
  The correct column is `sale_number`.

  This causes the error:
    "record 'new' has no field 'invoice_number'"
  whenever a sale is inserted or its status is updated to confirmed/completed/returned.

  ## Fix
  Replace `NEW.invoice_number` with `NEW.sale_number` in the function body.
*/

CREATE OR REPLACE FUNCTION record_vat_tx_from_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tax   numeric := COALESCE(NEW.tax, 0);
  v_net   numeric := COALESCE(NEW.subtotal, 0);
  v_month integer;
  v_year  integer;
BEGIN
  IF NEW.status NOT IN ('confirmed','completed','returned') THEN
    RETURN NEW;
  END IF;
  IF v_tax <= 0 THEN
    RETURN NEW;
  END IF;

  v_month := EXTRACT(MONTH FROM NEW.sale_date::date)::integer;
  v_year  := EXTRACT(YEAR  FROM NEW.sale_date::date)::integer;

  DELETE FROM vat_transactions WHERE source_type = 'sale' AND source_id = NEW.id;

  INSERT INTO vat_transactions (
    source_type, source_id, invoice_number,
    taxable_amount, vat_amount, vat_category, tax_code, tax_rate,
    direction, period_month, period_year, transaction_date, branch_id
  ) VALUES (
    'sale', NEW.id, NEW.sale_number,
    v_net, v_tax, 'standard', 'S', 15,
    'output', v_month, v_year, NEW.sale_date::date, NEW.branch_id
  );

  RETURN NEW;
END;
$$;
