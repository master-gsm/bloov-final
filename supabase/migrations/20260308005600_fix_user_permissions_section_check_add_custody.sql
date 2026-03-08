/*
  # Fix user_permissions section check constraint
  
  1. Changes
    - Updates the section check constraint to include 'custody' section
    - Removes 'themes' from allowed sections (not used in frontend)
    
  2. Purpose
    - Allows admins to add employees with custody permissions
    - Synchronizes database constraint with frontend permissions list
*/

ALTER TABLE user_permissions DROP CONSTRAINT IF EXISTS user_permissions_section_check;

ALTER TABLE user_permissions ADD CONSTRAINT user_permissions_section_check 
CHECK (section = ANY (ARRAY[
  'dashboard'::text, 
  'sales'::text, 
  'purchases'::text, 
  'expenses'::text, 
  'fixedassets'::text,
  'products'::text, 
  'inventory'::text, 
  'customers'::text, 
  'suppliers'::text, 
  'partners'::text,
  'employees'::text, 
  'custody'::text,
  'branches'::text, 
  'salla'::text, 
  'cashregister'::text, 
  'reports'::text,
  'journal'::text, 
  'backup'::text, 
  'systemhealth'::text, 
  'users'::text, 
  'settings'::text
]));