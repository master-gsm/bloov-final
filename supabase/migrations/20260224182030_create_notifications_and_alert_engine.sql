/*
  # Create Notifications Table and Alert Engine

  1. New Tables
    - `notifications`
      - `id` (uuid, primary key)
      - `user_id` (uuid, nullable) - target user, null = broadcast
      - `type` (text) - alert category: iqama_expiry, payroll_missing, draft_journal, open_shift, vat_quarter, vat_unsettled
      - `severity` (text) - info / warning / critical / urgent
      - `title` (text)
      - `title_ar` (text)
      - `message` (text)
      - `message_ar` (text)
      - `reference_type` (text) - employees, payroll_runs, journal_entries, etc.
      - `reference_id` (text)
      - `roles` (text[]) - which roles can see this notification
      - `is_read` (boolean)
      - `created_at` (timestamp)

  2. Alert Engine Functions
    - `fn_get_alerts(p_role text)` - returns live alerts filtered by role, no persistence needed
    - Returns standardised alert rows with severity, title, message

  3. Security
    - RLS enabled with role-based access
    - Users can only read their own or broadcast notifications
*/

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical', 'urgent')),
  title text NOT NULL,
  title_ar text,
  message text NOT NULL,
  message_ar text,
  reference_type text,
  reference_id text,
  roles text[] NOT NULL DEFAULT ARRAY['admin'],
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications (is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_roles ON notifications USING gin (roles);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own or broadcast notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR user_id IS NULL
  );

CREATE POLICY "Users can mark own notifications as read"
  ON notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL)
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Admin can insert notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE OR REPLACE FUNCTION public.fn_get_alerts(p_role text DEFAULT 'admin')
RETURNS TABLE (
  alert_id text,
  type text,
  severity text,
  title text,
  title_ar text,
  message text,
  message_ar text,
  reference_type text,
  reference_id text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := CURRENT_DATE;
  v_branch_id uuid;
BEGIN
  SELECT branch_id INTO v_branch_id FROM users WHERE id = auth.uid();

  IF p_role IN ('admin', 'hr') THEN
    RETURN QUERY
    SELECT
      'iqama_' || e.id::text,
      'iqama_expiry'::text,
      CASE
        WHEN e.iqama_expiry_date < v_today THEN 'urgent'
        WHEN e.iqama_expiry_date < v_today + INTERVAL '30 days' THEN 'critical'
        ELSE 'warning'
      END,
      'Iqama Expiry: ' || e.name,
      'انتهاء إقامة: ' || COALESCE(e.name_ar, e.name),
      CASE
        WHEN e.iqama_expiry_date < v_today
          THEN 'Iqama expired on ' || to_char(e.iqama_expiry_date, 'DD Mon YYYY')
        ELSE 'Iqama expires on ' || to_char(e.iqama_expiry_date, 'DD Mon YYYY') || ' (' || (e.iqama_expiry_date - v_today) || ' days)'
      END,
      CASE
        WHEN e.iqama_expiry_date < v_today
          THEN 'انتهت إقامة الموظف في ' || to_char(e.iqama_expiry_date, 'DD Mon YYYY')
        ELSE 'تنتهي الإقامة في ' || to_char(e.iqama_expiry_date, 'DD Mon YYYY') || ' (بعد ' || (e.iqama_expiry_date - v_today) || ' يوم)'
      END,
      'employees'::text,
      e.id::text,
      now()
    FROM employees e
    WHERE
      e.iqama_expiry_date IS NOT NULL
      AND e.is_active = true
      AND e.iqama_expiry_date < v_today + INTERVAL '60 days'
      AND (v_branch_id IS NULL OR e.branch_id = v_branch_id OR p_role = 'admin');
  END IF;

  IF p_role IN ('admin', 'accountant') THEN
    RETURN QUERY
    SELECT
      'payroll_' || to_char(date_trunc('month', now()), 'YYYY_MM'),
      'payroll_missing'::text,
      'warning'::text,
      'Payroll not run for ' || to_char(now(), 'Month YYYY'),
      'الرواتب لم تُصرف لشهر ' || to_char(now(), 'Month YYYY'),
      'No payroll run has been created for the current month.',
      'لم يتم إنشاء صرف رواتب للشهر الحالي.',
      'payroll_runs'::text,
      to_char(date_trunc('month', now()), 'YYYY-MM-DD'),
      now()
    WHERE NOT EXISTS (
      SELECT 1 FROM payroll_runs
      WHERE period_month = EXTRACT(MONTH FROM now())::int
        AND period_year = EXTRACT(YEAR FROM now())::int
        AND status != 'cancelled'
    )
    AND EXTRACT(DAY FROM now()) >= 20;

    RETURN QUERY
    SELECT
      'draft_je_' || je.id::text,
      'draft_journal'::text,
      'warning'::text,
      'Draft Journal Entry: ' || je.entry_number,
      'قيد مؤقت: ' || je.entry_number,
      'Journal entry ' || je.entry_number || ' has been in draft status for over 7 days.',
      'القيد ' || je.entry_number || ' في حالة مسودة منذ أكثر من 7 أيام.',
      'journal_entries'::text,
      je.id::text,
      now()
    FROM journal_entries je
    WHERE je.status = 'draft'
      AND je.created_at < now() - INTERVAL '7 days'
      AND (v_branch_id IS NULL OR je.branch_id = v_branch_id OR p_role = 'admin')
    LIMIT 10;
  END IF;

  IF p_role IN ('admin', 'accountant', 'cashier') THEN
    RETURN QUERY
    SELECT
      'shift_' || cs.id::text,
      'open_shift'::text,
      'critical'::text,
      'Cash shift open > 24h',
      'وردية مفتوحة منذ أكثر من 24 ساعة',
      'Cash shift started at ' || to_char(cs.start_time, 'DD Mon HH24:MI') || ' is still open.',
      'وردية الصندوق بدأت في ' || to_char(cs.start_time, 'DD Mon HH24:MI') || ' لا تزال مفتوحة.',
      'cash_shifts'::text,
      cs.id::text,
      now()
    FROM cash_shifts cs
    WHERE cs.status = 'open'
      AND cs.start_time < now() - INTERVAL '24 hours'
      AND (v_branch_id IS NULL OR cs.branch_id = v_branch_id OR p_role = 'admin')
    LIMIT 5;
  END IF;

  IF p_role IN ('admin', 'accountant') THEN
    RETURN QUERY
    SELECT
      'vat_quarter_' || to_char(date_trunc('quarter', now()), 'YYYY_Q'),
      'vat_quarter'::text,
      CASE
        WHEN (date_trunc('quarter', now()) + INTERVAL '3 months' - now()) < INTERVAL '14 days' THEN 'critical'
        ELSE 'warning'
      END,
      'VAT Quarter ending soon',
      'اقتراب نهاية الربع الضريبي',
      'Current VAT quarter ends on ' || to_char(date_trunc('quarter', now()) + INTERVAL '3 months - 1 day', 'DD Mon YYYY') || '.',
      'ينتهي الربع الضريبي الحالي في ' || to_char(date_trunc('quarter', now()) + INTERVAL '3 months - 1 day', 'DD Mon YYYY') || '.',
      'vat_returns'::text,
      to_char(date_trunc('quarter', now()), 'YYYY-MM-DD'),
      now()
    WHERE (date_trunc('quarter', now()) + INTERVAL '3 months' - now()) < INTERVAL '30 days';

    RETURN QUERY
    SELECT
      'vat_unsettled_' || vr.id::text,
      'vat_unsettled'::text,
      'warning'::text,
      'Unsettled VAT return',
      'إقرار ضريبي غير مسوّى',
      'VAT return for period ' || to_char(vr.period_start, 'Mon YYYY') || ' has a net balance of ' || vr.net_vat_due::text || ' SAR.',
      'الإقرار الضريبي للفترة ' || to_char(vr.period_start, 'Mon YYYY') || ' يحتوي على رصيد صافي ' || vr.net_vat_due::text || ' ر.س.',
      'vat_returns'::text,
      vr.id::text,
      now()
    FROM vat_returns vr
    WHERE vr.status IN ('draft', 'submitted')
      AND vr.net_vat_due != 0
      AND vr.period_end < now() - INTERVAL '15 days'
    LIMIT 5;
  END IF;

END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_get_alerts TO authenticated;
