/*
  # Add Partner Capital Account (3110)
  
  1. New Accounts
    - `3110` - Partner Capital (رأس مال الشركاء)
    - Required for employee custody system when funding source is 'partner'
    
  2. Purpose
    - Used when an employee custody is funded by a partner
    - Child account under 3100 (Capital)
*/

INSERT INTO accounts (code, name, name_ar, type, parent_id, is_active, is_system)
SELECT '3110', 'Partner Capital', 'رأس مال الشركاء', 'Equity', 
       (SELECT id FROM accounts WHERE code = '3100'), true, true
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE code = '3110');
