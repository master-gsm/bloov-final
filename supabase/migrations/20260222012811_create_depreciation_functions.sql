/*
  # Create Depreciation Calculation Functions

  1. Functions
    - `calculate_monthly_depreciation(asset_id)` - Returns monthly depreciation for one asset
    - `generate_depreciation_entries(p_up_to_date)` - Generates entries for all assets up to a date
    - `get_total_depreciation_for_period(p_from, p_to, p_branch_id)` - Sum of depreciation in a date range

  2. Important Notes
    - Uses straight-line depreciation: (cost - salvage) / useful_life_months
    - Entries are generated per month, one row per asset per month
    - Only active, non-deleted assets are included
    - Idempotent: won't create duplicate entries (UNIQUE constraint on asset_id + entry_date)
*/

-- Function: Calculate monthly depreciation for a single asset
CREATE OR REPLACE FUNCTION calculate_monthly_depreciation(p_asset_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN useful_life_months > 0
      THEN ROUND((purchase_cost - salvage_value) / useful_life_months, 2)
      ELSE 0
    END
  FROM fixed_assets
  WHERE id = p_asset_id
    AND is_deleted = false
    AND is_active = true;
$$;

-- Function: Generate depreciation entries up to a given date
CREATE OR REPLACE FUNCTION generate_depreciation_entries(p_up_to_date date DEFAULT CURRENT_DATE)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  asset RECORD;
  month_cursor date;
  monthly_amount numeric;
  running_accumulated numeric;
  running_book_value numeric;
  entries_created integer := 0;
  asset_end_date date;
BEGIN
  FOR asset IN
    SELECT id, purchase_cost, salvage_value, useful_life_months, depreciation_start_date
    FROM fixed_assets
    WHERE is_deleted = false
      AND is_active = true
      AND depreciation_start_date <= p_up_to_date
  LOOP
    monthly_amount := ROUND((asset.purchase_cost - asset.salvage_value) / asset.useful_life_months, 2);
    asset_end_date := asset.depreciation_start_date + (asset.useful_life_months || ' months')::interval;

    SELECT COALESCE(MAX(accumulated_depreciation), 0)
    INTO running_accumulated
    FROM depreciation_entries
    WHERE asset_id = asset.id;

    month_cursor := date_trunc('month', asset.depreciation_start_date)::date;

    WHILE month_cursor < p_up_to_date AND month_cursor < asset_end_date LOOP
      IF NOT EXISTS (
        SELECT 1 FROM depreciation_entries
        WHERE asset_id = asset.id AND entry_date = month_cursor
      ) THEN
        running_accumulated := running_accumulated + monthly_amount;
        running_book_value := GREATEST(asset.purchase_cost - running_accumulated, asset.salvage_value);

        INSERT INTO depreciation_entries (asset_id, entry_date, amount, accumulated_depreciation, book_value, is_auto)
        VALUES (asset.id, month_cursor, monthly_amount, running_accumulated, running_book_value, true);

        entries_created := entries_created + 1;
      ELSE
        SELECT accumulated_depreciation INTO running_accumulated
        FROM depreciation_entries
        WHERE asset_id = asset.id AND entry_date = month_cursor;
      END IF;

      month_cursor := (month_cursor + interval '1 month')::date;
    END LOOP;
  END LOOP;

  RETURN entries_created;
END;
$$;

-- Function: Get total depreciation for a period (used in financial summary)
CREATE OR REPLACE FUNCTION get_total_depreciation_for_period(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_branch_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(de.amount), 0)
  FROM depreciation_entries de
  JOIN fixed_assets fa ON fa.id = de.asset_id
  WHERE fa.is_deleted = false
    AND (p_date_from IS NULL OR de.entry_date >= date_trunc('month', p_date_from)::date)
    AND (p_date_to IS NULL OR de.entry_date <= p_date_to)
    AND (p_branch_id IS NULL OR fa.branch_id = p_branch_id);
$$;

GRANT EXECUTE ON FUNCTION calculate_monthly_depreciation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION generate_depreciation_entries(date) TO authenticated;
GRANT EXECUTE ON FUNCTION get_total_depreciation_for_period(date, date, uuid) TO authenticated;
