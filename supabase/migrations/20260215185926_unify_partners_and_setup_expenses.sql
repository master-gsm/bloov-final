/*
  # توحيد نظام الشركاء ومصاريف التأسيس
  
  1. التغييرات في setup_expenses:
    - إضافة description_ar (للوصف بالعربي)
    - إضافة expense_type (نوع المصروف: asset/capital/operational)
    - التأكد من وجود partner_id
    
  2. نقل البيانات:
    - نقل السجلات من partner_contributions إلى setup_expenses
    
  3. التوافق:
    - الحفاظ على partner_contributions للتوافق مع الكود القديم
*/

-- إضافة حقول جديدة في setup_expenses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'setup_expenses' AND column_name = 'description_ar'
  ) THEN
    ALTER TABLE setup_expenses ADD COLUMN description_ar text;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'setup_expenses' AND column_name = 'expense_type'
  ) THEN
    ALTER TABLE setup_expenses ADD COLUMN expense_type text DEFAULT 'asset';
  END IF;
END $$;

-- إضافة تعليق توضيحي
COMMENT ON COLUMN setup_expenses.expense_type IS 'نوع المصروف: asset (أصول), capital (رأس مال), operational (تشغيلي)';

-- نقل البيانات من partner_contributions إلى setup_expenses
INSERT INTO setup_expenses (
  partner_id,
  category,
  description,
  description_ar,
  amount,
  expense_date,
  attachment,
  expense_type,
  notes,
  created_by,
  created_at
)
SELECT 
  partner_id,
  contribution_type as category,
  description,
  description_ar,
  amount,
  contribution_date as expense_date,
  attachment_url as attachment,
  'capital' as expense_type,
  'تم النقل من مساهمات الشركاء' as notes,
  created_by,
  created_at
FROM partner_contributions
WHERE NOT EXISTS (
  SELECT 1 FROM setup_expenses 
  WHERE setup_expenses.partner_id = partner_contributions.partner_id
  AND setup_expenses.amount = partner_contributions.amount
  AND setup_expenses.expense_date = partner_contributions.contribution_date
);

-- تحديث setup_expenses الموجودة لتكون asset
UPDATE setup_expenses 
SET expense_type = 'asset' 
WHERE expense_type IS NULL OR expense_type = 'asset';