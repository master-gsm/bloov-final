
/*
  # VAT Engine — Fix: purchases trigger uses purchase_number not invoice_number

  ## Summary
  The record_vat_tx_from_purchase() trigger referenced NEW.invoice_number
  which does not exist on the purchases table. The correct column is
  NEW.purchase_number. This migration corrects the function.

  No schema changes — function replacement only.
*/

CREATE OR REPLACE FUNCTION record_vat_tx_from_purchase()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_vat    numeric := COALESCE(NEW.vat_amount, 0);
  v_net    numeric := COALESCE(NEW.subtotal, 0);
  v_cat    vat_category_enum;
  v_code   text    := 'S';
  v_rate   numeric := 0;
  v_month  integer;
  v_year   integer;
BEGIN
  IF NEW.is_deleted IS TRUE THEN
    DELETE FROM vat_transactions WHERE source_type = 'purchase' AND source_id = NEW.id;
    RETURN NEW;
  END IF;
  IF v_vat <= 0 THEN
    RETURN NEW;
  END IF;

  CASE COALESCE(NEW.vat_status_snapshot, 'standard')
    WHEN 'standard'      THEN v_cat := 'standard';      v_code := 'S'; v_rate := 15;
    WHEN 'zero_rated'    THEN v_cat := 'zero_rated';     v_code := 'Z'; v_rate := 0;
    WHEN 'exempt'        THEN v_cat := 'exempt';         v_code := 'E'; v_rate := 0;
    WHEN 'outside_scope' THEN v_cat := 'outside_scope';  v_code := 'O'; v_rate := 0;
    ELSE                      v_cat := 'standard';      v_code := 'S'; v_rate := 15;
  END CASE;

  v_month := EXTRACT(MONTH FROM NEW.purchase_date)::integer;
  v_year  := EXTRACT(YEAR  FROM NEW.purchase_date)::integer;

  DELETE FROM vat_transactions WHERE source_type = 'purchase' AND source_id = NEW.id;

  INSERT INTO vat_transactions (
    source_type, source_id, supplier_id, invoice_number,
    taxable_amount, vat_amount, vat_category, tax_code, tax_rate,
    direction, period_month, period_year, transaction_date, branch_id
  ) VALUES (
    'purchase', NEW.id, NEW.supplier_id, NEW.purchase_number,
    v_net, v_vat, v_cat, v_code, v_rate,
    'input', v_month, v_year, NEW.purchase_date, NEW.branch_id
  );
  RETURN NEW;
END;
$$;
