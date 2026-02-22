/*
  # Remove Setup-to-Operating Trigger and Migrate Existing Assets

  1. Changes
    - Drop the trigger that auto-creates operating expenses from setup expenses
    - Drop the trigger function
    - Soft-delete operating expenses that were auto-linked from setup_expenses
    - Migrate existing setup_expenses into fixed_assets table
    - This prevents setup expenses (CapEx) from being double-counted

  2. Data Migration
    - Each setup_expense becomes a fixed_asset entry
    - Uses the amortization_months from setup_expenses as useful_life_months
    - If not amortizable, defaults to 60 months (5 years)
    - Auto-linked operating expenses are soft-deleted (is_deleted = true)

  3. Important Notes
    - After this migration, setup_expenses no longer affect operating_expenses
    - Only monthly depreciation entries will hit the income statement
    - Existing operating expenses that were NOT auto-generated remain untouched
*/

-- 1. Drop the trigger
DROP TRIGGER IF EXISTS trg_setup_expense_to_operating ON setup_expenses;

-- 2. Drop the trigger function
DROP FUNCTION IF EXISTS create_operating_expense_from_setup_expense();

-- 3. Soft-delete auto-linked operating expenses from setup_expenses
UPDATE operating_expenses
SET is_deleted = true
WHERE notes LIKE 'Auto-linked from setup_expenses%'
  AND is_deleted = false;

-- 4. Migrate existing non-deleted setup_expenses into fixed_assets
INSERT INTO fixed_assets (
  asset_name,
  asset_name_ar,
  category,
  purchase_cost,
  salvage_value,
  useful_life_months,
  purchase_date,
  depreciation_start_date,
  branch_id,
  setup_expense_id,
  supplier_id,
  notes,
  is_active,
  created_by,
  created_at
)
SELECT
  se.description,
  se.description_ar,
  COALESCE(se.category, 'Equipment'),
  se.amount,
  0,
  CASE
    WHEN se.is_amortizable AND se.amortization_months > 0 THEN se.amortization_months
    ELSE 60
  END,
  se.expense_date,
  se.expense_date,
  se.branch_id,
  se.id,
  se.supplier_id,
  se.notes,
  true,
  se.created_by,
  se.created_at
FROM setup_expenses se
WHERE se.is_deleted = false
  AND NOT EXISTS (
    SELECT 1 FROM fixed_assets fa WHERE fa.setup_expense_id = se.id
  );

-- 5. Generate depreciation entries for migrated assets up to today
SELECT generate_depreciation_entries(CURRENT_DATE);
