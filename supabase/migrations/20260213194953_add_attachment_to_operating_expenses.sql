/*
  # إضافة عمود المرفقات لجدول المصاريف التشغيلية

  1. التعديلات
    - إضافة عمود `attachment_url` لتخزين رابط الإيصال/الفاتورة المرفقة
    - يسمح بقيمة null (اختياري)

  2. الملاحظات
    - يتم ربط المرفق مع كل مصروف تشغيلي
    - الملف يُرفع على Supabase Storage في bucket 'receipts'
*/

DO $$
BEGIN
  -- إضافة عمود attachment_url إذا لم يكن موجوداً
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operating_expenses' AND column_name = 'attachment_url'
  ) THEN
    ALTER TABLE operating_expenses 
    ADD COLUMN attachment_url text;
    
    COMMENT ON COLUMN operating_expenses.attachment_url IS 'رابط الإيصال أو الفاتورة المرفقة';
  END IF;
END $$;
