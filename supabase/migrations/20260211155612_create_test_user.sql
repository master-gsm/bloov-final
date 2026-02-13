/*
  # Create Test User for BLOOV System
  
  ## Description
  This migration creates a test user account for initial system access.
  
  ## User Credentials
  - Email: admin@bloov.com
  - Password: bloov123
  - Role: Admin (full system access)
  
  ## Important Notes
  - This is a development/testing user
  - Change the password after first login in production
  - The user will have full admin privileges
*/

-- Note: We cannot directly insert into auth.users table via migration
-- Instead, you'll need to create the user through Supabase Dashboard or use the signUp function

-- Create a profile for when the user signs up
-- This will be linked once the user is created in auth.users
