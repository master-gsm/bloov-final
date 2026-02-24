/*
  # Add RLS Policies for Tables Missing Policies

  Tables with RLS enabled but NO policies:
  - customer_payments
  - journal_entry_lines
*/

-- customer_payments: Enable RLS and add policies
ALTER TABLE public.customer_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and accountants can manage customer_payments"
  ON public.customer_payments
  FOR ALL
  TO authenticated
  USING (
    (SELECT get_user_role()) IN ('admin', 'accountant')
  )
  WITH CHECK (
    (SELECT get_user_role()) IN ('admin', 'accountant')
  );

CREATE POLICY "Branch members can view customer_payments"
  ON public.customer_payments
  FOR SELECT
  TO authenticated
  USING (
    branch_id = (SELECT get_user_branch_id())
  );

-- journal_entry_lines: Enable RLS and add policies
ALTER TABLE public.journal_entry_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and accountants can manage journal_entry_lines"
  ON public.journal_entry_lines
  FOR ALL
  TO authenticated
  USING (
    (SELECT get_user_role()) IN ('admin', 'accountant')
  )
  WITH CHECK (
    (SELECT get_user_role()) IN ('admin', 'accountant')
  );

CREATE POLICY "Branch members can view journal_entry_lines"
  ON public.journal_entry_lines
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.journal_entries
      WHERE journal_entries.id = journal_entry_lines.journal_entry_id
      AND journal_entries.branch_id = (SELECT get_user_branch_id())
    )
  );
