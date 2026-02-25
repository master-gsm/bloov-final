/*
  # إصلاح View الحساب الجاري - القراءة من جدول expenses
  
  ## المشكلة
  الـ View السابق كان يقرأ من جدول `operating_expenses`
  لكن المصاريف الفعلية يتم إضافتها في جدول `expenses`
  
  ## الحل
  تعديل الـ View ليقرأ من جدول `expenses` بدلاً من `operating_expenses`
  - استخدام `amount` بدلاً من `net_amount`
  - استخدام `category` بدلاً من `expense_type`
  
  ## ملاحظة
  المصاريف التي لا تحتوي على `partner_contribution_id` تُعتبر مشتركة
  المصاريف التي تحتوي على `partner_contribution_id` تُحسب كمدفوعة من ذلك الشريك
*/

-- Drop existing view
DROP VIEW IF EXISTS v_partner_analytical_balances CASCADE;

-- Recreate with fixed logic
CREATE VIEW v_partner_analytical_balances AS
WITH 
-- إجمالي المصاريف المشتركة (كل المصاريف ما عدا الرأسمالية)
total_shared_expenses AS (
  SELECT 
    COALESCE(SUM(amount), 0) AS total
  FROM expenses
  WHERE is_deleted = false
    AND category != 'capital'
    AND category NOT IN ('salaries', 'commissions', 'purchases')
),

-- المصاريف المدفوعة من كل شريك (المرتبطة بـ partner_contribution)
partner_expenses AS (
  SELECT 
    pc.partner_id,
    COALESCE(SUM(e.amount), 0) AS paid_expenses
  FROM partner_contributions pc
  INNER JOIN expenses e ON e.partner_contribution_id = pc.id
  WHERE pc.is_deleted = false
    AND e.is_deleted = false
    AND e.category != 'capital'
    AND e.category NOT IN ('salaries', 'commissions', 'purchases')
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

COMMENT ON VIEW v_partner_analytical_balances IS 'الحساب الجاري التحليلي للشركاء - يحسب رصيد كل شريك بناءً على جميع المصاريف المشتركة (من جدول expenses) والحصة المفترضة والتسويات';
