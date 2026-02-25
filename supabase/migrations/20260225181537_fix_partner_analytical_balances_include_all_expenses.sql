/*
  # إصلاح View الحساب الجاري للشركاء - شمول جميع المصاريف
  
  ## المشكلة
  الـ View السابق كان يفلتر المصاريف على الأنواع:
  - operational
  - marketing
  - administrative
  
  لكن المصاريف الفعلية في النظام من أنواع:
  - other
  - rent
  - utilities
  - salaries
  - etc.
  
  ## الحل
  1. تعديل الـ View ليشمل **جميع أنواع المصاريف**
  2. استثناء فقط المصاريف من النوع 'capital' (رأسمالية) لأنها خاصة بالشركاء
  
  ## التعديلات
  - إزالة الفلتر الصارم على expense_type
  - استثناء 'capital' فقط
  - الباقي يُحسب ضمن المصاريف المشتركة
*/

-- Drop existing view
DROP VIEW IF EXISTS v_partner_analytical_balances CASCADE;

-- Recreate with fixed logic
CREATE VIEW v_partner_analytical_balances AS
WITH 
-- إجمالي المصاريف المشتركة (كل المصاريف ما عدا الرأسمالية)
total_shared_expenses AS (
  SELECT 
    COALESCE(SUM(net_amount), 0) AS total
  FROM operating_expenses
  WHERE is_deleted = false
    AND expense_type != 'capital'  -- استثناء المصاريف الرأسمالية فقط
),

-- المصاريف المدفوعة من كل شريك (المرتبطة بـ partner_contribution)
partner_expenses AS (
  SELECT 
    pc.partner_id,
    COALESCE(SUM(oe.net_amount), 0) AS paid_expenses
  FROM partner_contributions pc
  INNER JOIN operating_expenses oe ON oe.partner_contribution_id = pc.id
  WHERE pc.is_deleted = false
    AND oe.is_deleted = false
    AND oe.expense_type != 'capital'
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

-- Grant access to the view
GRANT SELECT ON v_partner_analytical_balances TO authenticated;

COMMENT ON VIEW v_partner_analytical_balances IS 'الحساب الجاري التحليلي للشركاء - يحسب رصيد كل شريك بناءً على جميع المصاريف المشتركة (ما عدا الرأسمالية) والحصة المفترضة والتسويات';
