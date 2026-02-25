/*
  # تضمين مصاريف التأسيس في حساب أرصدة الشركاء
  
  ## المشكلة
  الـ View السابق كان يقرأ فقط من `operating_expenses`
  لكن المصاريف الرأسمالية (التي يدفعها الشركاء) موجودة في `setup_expenses`
  
  ## الحل
  1. إضافة UNION لجمع المصاريف من كلا الجدولين:
     - operating_expenses (المصاريف التشغيلية)
     - setup_expenses (المصاريف الرأسمالية)
  
  2. في setup_expenses:
     - الحقل partner_id يربط المصروف مباشرة بالشريك
     - لا يحتاج partner_contribution_id
  
  3. المصاريف الرأسمالية تُحسب ضمن المصاريف المشتركة
  4. المصاريف المدفوعة من شريك تُخصم من رصيده
*/

-- Drop existing view
DROP VIEW IF EXISTS v_partner_analytical_balances CASCADE;

-- Recreate with setup_expenses included
CREATE VIEW v_partner_analytical_balances AS
WITH 
-- إجمالي المصاريف المشتركة من operating_expenses
operating_shared_expenses AS (
  SELECT 
    COALESCE(SUM(net_amount), 0) AS total
  FROM operating_expenses
  WHERE is_deleted = false
    AND expense_type != 'capital'
),

-- إجمالي المصاريف الرأسمالية من setup_expenses
setup_shared_expenses AS (
  SELECT 
    COALESCE(SUM(amount), 0) AS total
  FROM setup_expenses
  WHERE category = 'capital'
),

-- إجمالي كل المصاريف المشتركة
total_shared_expenses AS (
  SELECT 
    (SELECT total FROM operating_shared_expenses) + 
    (SELECT total FROM setup_shared_expenses) AS total
),

-- المصاريف التشغيلية المدفوعة من كل شريك (عبر partner_contribution)
operating_partner_expenses AS (
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

-- المصاريف الرأسمالية المدفوعة من كل شريك (عبر partner_id)
setup_partner_expenses AS (
  SELECT 
    partner_id,
    COALESCE(SUM(amount), 0) AS paid_expenses
  FROM setup_expenses
  WHERE category = 'capital'
    AND partner_id IS NOT NULL
  GROUP BY partner_id
),

-- إجمالي المصاريف المدفوعة من كل شريك
partner_expenses AS (
  SELECT 
    COALESCE(ope.partner_id, spe.partner_id) AS partner_id,
    COALESCE(ope.paid_expenses, 0) + COALESCE(spe.paid_expenses, 0) AS paid_expenses
  FROM operating_partner_expenses ope
  FULL OUTER JOIN setup_partner_expenses spe ON spe.partner_id = ope.partner_id
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
  
  -- إجمالي المصاريف المشتركة (تشغيلية + رأسمالية)
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

COMMENT ON VIEW v_partner_analytical_balances IS 'الحساب الجاري التحليلي للشركاء - يحسب رصيد كل شريك بناءً على المصاريف التشغيلية (operating_expenses) والرأسمالية (setup_expenses) والتسويات';
