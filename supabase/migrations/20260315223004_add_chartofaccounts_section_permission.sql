/*
  # Add chartofaccounts section to user permissions

  1. Modified Tables
    - `user_permissions`
      - Updated section check constraint to include 'chartofaccounts'

  2. Data Changes
    - Adds chartofaccounts permission rows for all existing users who have journal permissions

  3. Notes
    - Users with journal access automatically get chart of accounts access
*/

ALTER TABLE public.user_permissions
  DROP CONSTRAINT IF EXISTS user_permissions_section_check;

ALTER TABLE public.user_permissions
  ADD CONSTRAINT user_permissions_section_check
  CHECK (section = ANY (ARRAY[
    'dashboard', 'sales', 'purchases', 'expenses', 'fixedassets',
    'products', 'inventory', 'customers', 'suppliers', 'partners',
    'employees', 'custody', 'branches', 'salla', 'cashregister',
    'reports', 'journal', 'chartofaccounts', 'backup', 'systemhealth',
    'users', 'settings'
  ]::text[]));

INSERT INTO public.user_permissions (user_id, section, can_view, can_create, can_edit, can_delete)
SELECT user_id, 'chartofaccounts', can_view, can_create, can_edit, can_delete
FROM public.user_permissions
WHERE section = 'journal'
ON CONFLICT DO NOTHING;
