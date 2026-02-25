/*
  # السماح بـ NULL في حقل expense_date في جدول setup_expenses

  ## المشكلة
  عمود expense_date كان NOT NULL مما يمنع استيراد السجلات بدون تاريخ.

  ## الحل
  1. إزالة قيد NOT NULL من expense_date
  2. يبقى الحساب الديناميكي كما هو (لا تغيير في journal entries)
  3. RLS و branch isolation لا تتأثر

  ## ملاحظة
  السجلات بدون تاريخ لا تُحذف ولا تُرفض - تُقبل وتُعرض بحالة "بدون تاريخ"
  ويمكن تحديث التاريخ لاحقاً من الواجهة.
*/

ALTER TABLE setup_expenses ALTER COLUMN expense_date DROP NOT NULL;
