/*
  # Security Audit Fixes - Batch 1: RLS Performance & Duplicate Policies

  1. RLS Performance Issues
    - Fix zatca_queue policies to use (SELECT auth.uid()) pattern
    - Prevents re-evaluation of auth.uid() for each row
    - Improves query performance at scale

  2. Multiple Permissive Policies
    - Remove duplicate policies across multiple tables
    - Keep only one optimized policy per action per role
    - Prevents policy conflicts and improves performance

  3. Security
    - All policies maintain same security level
    - Branch isolation preserved where applicable
    - Role-based access control unchanged
*/

-- ============================================
-- PART 1: Fix zatca_queue RLS Performance
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can view zatca_queue" ON zatca_queue;
DROP POLICY IF EXISTS "Admins can insert zatca_queue" ON zatca_queue;
DROP POLICY IF EXISTS "Admins can update zatca_queue" ON zatca_queue;

-- Recreate with optimized auth.uid() pattern
CREATE POLICY "Admins can view zatca_queue"
  ON zatca_queue
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM users
      WHERE users.id = (SELECT auth.uid())
        AND users.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Admins can insert zatca_queue"
  ON zatca_queue
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM users
      WHERE users.id = (SELECT auth.uid())
        AND users.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Admins can update zatca_queue"
  ON zatca_queue
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM users
      WHERE users.id = (SELECT auth.uid())
        AND users.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM users
      WHERE users.id = (SELECT auth.uid())
        AND users.role IN ('admin', 'super_admin')
    )
  );

-- ============================================
-- PART 2: Fix Multiple Permissive Policies
-- ============================================

-- bank_statement_imports: Remove duplicates
DROP POLICY IF EXISTS "Authenticated users can insert bank_statement_imports" ON bank_statement_imports;
DROP POLICY IF EXISTS "Authenticated users can view bank_statement_imports" ON bank_statement_imports;
DROP POLICY IF EXISTS "Authenticated users can update bank_statement_imports" ON bank_statement_imports;

-- bank_statement_lines: Remove duplicates
DROP POLICY IF EXISTS "Authenticated users can insert bank_statement_lines" ON bank_statement_lines;
DROP POLICY IF EXISTS "Authenticated users can view bank_statement_lines" ON bank_statement_lines;
DROP POLICY IF EXISTS "Authenticated users can update bank_statement_lines" ON bank_statement_lines;

-- customers: Remove duplicate SELECT policy
DROP POLICY IF EXISTS "Authenticated users can view customers" ON customers;

-- expenses: Remove duplicates
DROP POLICY IF EXISTS "Authenticated users can insert expenses" ON expenses;
DROP POLICY IF EXISTS "Authenticated users can update expenses" ON expenses;

-- invoice_payments: Remove duplicates
DROP POLICY IF EXISTS "Authenticated users can insert invoice_payments" ON invoice_payments;
DROP POLICY IF EXISTS "Authenticated users can view invoice_payments" ON invoice_payments;
DROP POLICY IF EXISTS "Authenticated users can update invoice_payments" ON invoice_payments;

-- notifications: Keep the more specific policy (own or broadcast)
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can mark own notifications as read" ON notifications;

-- partner_withdrawals: Remove duplicates
DROP POLICY IF EXISTS "Authenticated users can insert partner_withdrawals" ON partner_withdrawals;
DROP POLICY IF EXISTS "Authenticated users can view partner_withdrawals" ON partner_withdrawals;
DROP POLICY IF EXISTS "Authenticated users can update partner_withdrawals" ON partner_withdrawals;

-- partners: Remove duplicates
DROP POLICY IF EXISTS "Authenticated users can insert partners" ON partners;
DROP POLICY IF EXISTS "Authenticated users can update partners" ON partners;

-- profit_distributions: Remove duplicates
DROP POLICY IF EXISTS "Authenticated users can insert profit_distributions" ON profit_distributions;
DROP POLICY IF EXISTS "Authenticated users can view profit_distributions" ON profit_distributions;
DROP POLICY IF EXISTS "Authenticated users can update profit_distributions" ON profit_distributions;

-- purchase_payments: Remove duplicates
DROP POLICY IF EXISTS "Authenticated users can insert purchase_payments" ON purchase_payments;
DROP POLICY IF EXISTS "Authenticated users can view purchase_payments" ON purchase_payments;
DROP POLICY IF EXISTS "Authenticated users can update purchase_payments" ON purchase_payments;

-- reconciliation_matches: Remove duplicates
DROP POLICY IF EXISTS "Authenticated users can insert reconciliation_matches" ON reconciliation_matches;
DROP POLICY IF EXISTS "Authenticated users can view reconciliation_matches" ON reconciliation_matches;
DROP POLICY IF EXISTS "Authenticated users can update reconciliation_matches" ON reconciliation_matches;

-- vat_returns: Remove duplicates
DROP POLICY IF EXISTS "Authenticated users can insert vat_returns" ON vat_returns;
DROP POLICY IF EXISTS "Authenticated users can view vat_returns" ON vat_returns;
DROP POLICY IF EXISTS "Authenticated users can update vat_returns" ON vat_returns;

-- vat_transactions: Keep most specific policy (Branch members can view)
DROP POLICY IF EXISTS "Authenticated users can view vat_transactions" ON vat_transactions;
DROP POLICY IF EXISTS "Users can view vat transactions" ON vat_transactions;

-- Add documentation
COMMENT ON TABLE zatca_queue IS 
'ZATCA e-invoicing queue with optimized RLS. 
All policies use (SELECT auth.uid()) pattern for performance at scale.';
