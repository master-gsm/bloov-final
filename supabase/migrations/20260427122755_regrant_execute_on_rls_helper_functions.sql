/*
  # Re-grant EXECUTE on RLS helper functions

  These 4 SECURITY DEFINER functions are used inside RLS policy expressions
  on the users, branches, and user_permissions tables. They MUST be callable
  by `authenticated` for any database queries to work.

  A previous migration (20260427120959) revoked EXECUTE from authenticated,
  which broke all data access. This migration restores the required grants.

  These functions are safe to expose:
    - They only read the users/company_members tables
    - They only return boolean/uuid values
    - They use auth.uid() internally (cannot be spoofed)
    - They cannot be dropped/replaced because RLS policies depend on them

  1. Functions re-granted:
    - `fn_is_super_admin()` - returns bool, checks if caller is super_admin
    - `fn_is_admin_or_super()` - returns bool, checks if caller is admin/super_admin
    - `fn_is_company_admin(uuid)` - returns bool, checks company admin status
    - `fn_get_user_company_ids()` - returns set of uuid, gets user's companies
*/

GRANT EXECUTE ON FUNCTION public.fn_is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_is_admin_or_super() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_is_company_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_user_company_ids() TO authenticated;
