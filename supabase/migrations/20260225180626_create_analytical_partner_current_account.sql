/*
  # نظام الحساب الجاري التحليلي للشركاء
  
  ## الهدف
  إنشاء نظام حساب جاري بسيط يعتمد على:
  - المصاريف المدفوعة من كل شريك
  - الحصة المفترضة لكل شريك حسب نسبة الملكية
  - التسويات بين الشركاء
  
  ## المعادلة
  ```
  partner_balance = 
    (total_shared_expenses × ownership_percentage / 100)  -- الحصة المفترضة
    - partner_paid_expenses                                -- المدفوع فعلياً
    - settlements_paid_to_others                           -- التسويات المدفوعة
    + settlements_received_from_others                     -- التسويات المستلمة
  ```
  
  إذا كان الرصيد:
  - **موجب (+)**: الشريك له رصيد (دفع أكثر من حصته)
  - **سالب (-)**: الشريك عليه رصيد (دفع أقل من حصته)
  
  ## الجداول المعدلة
  - إضافة حقل `notes` لـ partner_settlements (إن لم يكن موجوداً)
  
  ## الـ Views المُنشأة
  - `v_partner_analytical_balances`: الحساب الجاري التحليلي لكل شريك
  
  ## ملاحظات
  - هذا حساب تحليلي فقط (لا يؤثر على journal_entries)
  - مستقل عن نظام GL
  - مناسب للتسويات الداخلية بين الشركاء
*/

-- ============================================================================
-- 1. إضافة حقل notes إلى partner_settlements (إن لم يكن موجوداً)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partner_settlements'
      AND column_name = 'notes'
  ) THEN
    ALTER TABLE partner_settlements ADD COLUMN notes text;
  END IF;
END $$;

-- ============================================================================
-- 2. إنشاء View الحساب الجاري التحليلي
-- ============================================================================

-- Drop existing view if exists
DROP VIEW IF EXISTS v_partner_analytical_balances CASCADE;

-- Create new analytical view
CREATE VIEW v_partner_analytical_balances AS
WITH 
-- إجمالي المصاريف المشتركة (operating_expenses فقط)
total_shared_expenses AS (
  SELECT 
    COALESCE(SUM(net_amount), 0) AS total
  FROM operating_expenses
  WHERE is_deleted = false
    AND expense_type IN ('operational', 'marketing', 'administrative')
),

-- المصاريف المدفوعة من كل شريك
partner_expenses AS (
  SELECT 
    pc.partner_id,
    COALESCE(SUM(oe.net_amount), 0) AS paid_expenses
  FROM partner_contributions pc
  INNER JOIN operating_expenses oe ON oe.partner_contribution_id = pc.id
  WHERE pc.is_deleted = false
    AND oe.is_deleted = false
    AND pc.contribution_type IN ('operational', 'marketing', 'administrative')
  GROUP BY pc.partner_id
),

-- التسويات المدفوعة من الشريك
settlements_paid AS (
  SELECT 
    from_partner_id AS partner_id,
    COALESCE(SUM(amount), 0) AS total_paid
  FROM partner_settlements
  WHERE is_deleted = false
    AND status = 'active'
  GROUP BY from_partner_id
),

-- التسويات المستلمة للشريك
settlements_received AS (
  SELECT 
    to_partner_id AS partner_id,
    COALESCE(SUM(amount), 0) AS total_received
  FROM partner_settlements
  WHERE is_deleted = false
    AND status = 'active'
  GROUP BY to_partner_id
)

SELECT 
  p.id AS partner_id,
  p.name,
  p.name_ar,
  p.ownership_percentage,
  p.is_active,
  
  -- إجمالي المصاريف المشتركة
  tse.total AS total_shared_expenses,
  
  -- الحصة المفترضة (حسب نسبة الملكية)
  ROUND((tse.total * p.ownership_percentage / 100), 2) AS expected_share,
  
  -- المدفوع فعلياً من الشريك
  COALESCE(pe.paid_expenses, 0) AS paid_expenses,
  
  -- التسويات المدفوعة
  COALESCE(sp.total_paid, 0) AS settlements_paid,
  
  -- التسويات المستلمة
  COALESCE(sr.total_received, 0) AS settlements_received,
  
  -- الرصيد النهائي = الحصة المفترضة - المدفوع فعلياً - التسويات المدفوعة + التسويات المستلمة
  ROUND(
    (tse.total * p.ownership_percentage / 100)
    - COALESCE(pe.paid_expenses, 0)
    - COALESCE(sp.total_paid, 0)
    + COALESCE(sr.total_received, 0),
    2
  ) AS current_balance,
  
  -- حالة الرصيد (موجب = له / سالب = عليه)
  CASE 
    WHEN ROUND(
      (tse.total * p.ownership_percentage / 100)
      - COALESCE(pe.paid_expenses, 0)
      - COALESCE(sp.total_paid, 0)
      + COALESCE(sr.total_received, 0),
      2
    ) > 0 THEN 'له'
    WHEN ROUND(
      (tse.total * p.ownership_percentage / 100)
      - COALESCE(pe.paid_expenses, 0)
      - COALESCE(sp.total_paid, 0)
      + COALESCE(sr.total_received, 0),
      2
    ) < 0 THEN 'عليه'
    ELSE 'متوازن'
  END AS balance_status,
  
  -- الرصيد المطلق (للعرض)
  ABS(ROUND(
    (tse.total * p.ownership_percentage / 100)
    - COALESCE(pe.paid_expenses, 0)
    - COALESCE(sp.total_paid, 0)
    + COALESCE(sr.total_received, 0),
    2
  )) AS balance_absolute

FROM partners p
CROSS JOIN total_shared_expenses tse
LEFT JOIN partner_expenses pe ON pe.partner_id = p.id
LEFT JOIN settlements_paid sp ON sp.partner_id = p.id
LEFT JOIN settlements_received sr ON sr.partner_id = p.id
WHERE p.is_active = true
ORDER BY p.name;

-- ============================================================================
-- 3. إضافة RLS policy للـ View الجديد
-- ============================================================================

-- Grant access to the view
GRANT SELECT ON v_partner_analytical_balances TO authenticated;

-- ============================================================================
-- 4. إنشاء View لسجل التسويات مع أسماء الشركاء
-- ============================================================================

DROP VIEW IF EXISTS v_partner_settlements_history CASCADE;

CREATE VIEW v_partner_settlements_history AS
SELECT 
  ps.id,
  ps.from_partner_id,
  pf.name AS from_partner_name,
  pf.name_ar AS from_partner_name_ar,
  ps.to_partner_id,
  pt.name AS to_partner_name,
  pt.name_ar AS to_partner_name_ar,
  ps.amount,
  ps.settlement_date,
  ps.description,
  ps.description_ar,
  ps.notes,
  ps.status,
  ps.created_at,
  ps.created_by,
  u.full_name AS created_by_name
FROM partner_settlements ps
INNER JOIN partners pf ON pf.id = ps.from_partner_id
INNER JOIN partners pt ON pt.id = ps.to_partner_id
LEFT JOIN users u ON u.id = ps.created_by
WHERE ps.is_deleted = false
ORDER BY ps.settlement_date DESC, ps.created_at DESC;

-- Grant access
GRANT SELECT ON v_partner_settlements_history TO authenticated;

COMMENT ON VIEW v_partner_analytical_balances IS 'الحساب الجاري التحليلي للشركاء - يحسب رصيد كل شريك بناءً على المصاريف المدفوعة والحصة المفترضة والتسويات';
COMMENT ON VIEW v_partner_settlements_history IS 'سجل التسويات بين الشركاء مع أسماء الشركاء والمستخدمين';
