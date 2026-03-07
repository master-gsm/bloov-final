/*
  # Create function to update setup expense amount bypassing freeze trigger

  1. New Functions
    - `update_setup_expense_amount(p_id uuid, p_amount numeric)` - Updates the amount field on a setup expense,
      bypassing the freeze trigger by setting `app.bypass_immutable` session variable.

  2. Security
    - Function uses SECURITY DEFINER to run with elevated privileges
    - Restricted search_path to prevent injection
    - Only updates non-deleted records
*/

CREATE OR REPLACE FUNCTION public.update_setup_expense_amount(
  p_id uuid,
  p_amount numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.bypass_immutable', 'true', true);

  UPDATE public.setup_expenses
  SET amount = p_amount,
      updated_at = now()
  WHERE id = p_id
    AND is_deleted = false;

  PERFORM set_config('app.bypass_immutable', '', true);
END;
$$;
