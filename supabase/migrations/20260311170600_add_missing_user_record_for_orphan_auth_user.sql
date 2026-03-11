/*
  # Add Missing User Record for Orphan Auth User

  1. Data Fix
    - Creates a record in public.users for auth user samhana71@gmail.com
      who had an auth account but no corresponding users table entry
    - Assigns to the default Main Branch with admin role
    - Also adds to company_members table

  2. Important Notes
    - Uses NOT EXISTS to prevent duplicate insert errors
*/

INSERT INTO public.users (id, full_name, role, branch_id, is_active, company_id)
SELECT 
  au.id,
  COALESCE(au.raw_user_meta_data->>'full_name', split_part(au.email, '@', 1)),
  'admin',
  (SELECT id FROM public.branches WHERE is_active = true ORDER BY created_at LIMIT 1),
  true,
  (SELECT id FROM public.companies ORDER BY created_at LIMIT 1)
FROM auth.users au
WHERE au.id = 'e375be45-18ff-4da5-b768-e5ef187dd333'
AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = au.id);

INSERT INTO public.company_members (company_id, user_id, company_role, is_primary, is_active)
SELECT 
  (SELECT id FROM public.companies ORDER BY created_at LIMIT 1),
  'e375be45-18ff-4da5-b768-e5ef187dd333',
  'owner',
  true,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.company_members 
  WHERE user_id = 'e375be45-18ff-4da5-b768-e5ef187dd333'
);
