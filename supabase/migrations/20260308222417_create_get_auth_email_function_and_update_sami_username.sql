/*
  # Create function to get auth email and update sami username
  
  1. New Functions
    - `get_auth_email_by_user_id` - Returns the email from auth.users for a given public.users id
    
  2. Data Updates
    - Set username for sami user to 'sami'
*/

CREATE OR REPLACE FUNCTION get_auth_email_by_user_id(user_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT email FROM auth.users WHERE id = user_id;
$$;

UPDATE public.users 
SET username = 'sami' 
WHERE id = 'ec55a0c1-5351-4087-b168-181968c69cca' AND (username IS NULL OR username = '');
