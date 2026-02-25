
/*
  # حذف كامل للبيانات التجريبية - v4 النهائي المصحح

  ## الإصلاح: عمود vat_transactions هو source_type و source_id (لا source_table)

  ### ترتيب الحذف الآمن:
  1. تعطيل triggers الواقية
  2. حذف journal_lines
  3. فك FK بين journal_entries
  4. حذف journal_entries
  5. حذف vat_transactions المرتبطة
  6. فك ربط fixed_assets
  7. حذف السجلات الأصلية
  8. إعادة تفعيل الـ triggers
*/

-- ====== تعطيل جميع triggers الواقية ======
ALTER TABLE journal_lines       DISABLE TRIGGER trg_protect_posted_lines;
ALTER TABLE journal_lines       DISABLE TRIGGER trg_period_lock_journal_lines;
ALTER TABLE journal_entries     DISABLE TRIGGER trg_protect_posted_entries;
ALTER TABLE journal_entries     DISABLE TRIGGER enforce_period_locking;
ALTER TABLE journal_entries     DISABLE TRIGGER trg_check_period_lock;
ALTER TABLE setup_expenses      DISABLE TRIGGER trg_prevent_delete_setup_expenses;
ALTER TABLE operating_expenses  DISABLE TRIGGER trg_prevent_delete_operating_expenses;
ALTER TABLE operating_expenses  DISABLE TRIGGER prevent_closed_period_expenses;
ALTER TABLE partner_settlements DISABLE TRIGGER trg_prevent_delete_partner_settlements;

-- ====== حذف journal_lines لجميع القيود المرتبطة ======
DELETE FROM journal_lines
WHERE journal_entry_id IN (
  SELECT id FROM journal_entries
  WHERE reference_type IN (
    'setup_expense',
    'setup_expense_reversal',
    'operating_expense',
    'expense',
    'partner_settlement'
  )
);

-- ====== فك جميع روابط FK بين journal_entries ======
UPDATE journal_entries
SET reverse_entry_id = NULL
WHERE reference_type IN ('setup_expense', 'operating_expense', 'expense', 'partner_settlement');

UPDATE journal_entries
SET original_entry_id = NULL
WHERE reference_type = 'setup_expense_reversal';

-- ====== حذف journal_entries ======
DELETE FROM journal_entries
WHERE reference_type IN (
  'setup_expense_reversal',
  'setup_expense',
  'operating_expense',
  'expense',
  'partner_settlement'
);

-- ====== حذف vat_transactions المرتبطة (source_type) ======
DELETE FROM vat_transactions
WHERE source_type IN ('setup_expense', 'operating_expense', 'expense');

-- ====== فك ربط fixed_assets من setup_expenses ======
UPDATE fixed_assets
SET setup_expense_id = NULL
WHERE setup_expense_id IS NOT NULL;

-- ====== حذف السجلات الأصلية ======
DELETE FROM setup_expenses;
DELETE FROM operating_expenses;
DELETE FROM partner_settlements;

-- ====== إعادة تفعيل جميع الـ triggers ======
ALTER TABLE journal_lines       ENABLE TRIGGER trg_protect_posted_lines;
ALTER TABLE journal_lines       ENABLE TRIGGER trg_period_lock_journal_lines;
ALTER TABLE journal_entries     ENABLE TRIGGER trg_protect_posted_entries;
ALTER TABLE journal_entries     ENABLE TRIGGER enforce_period_locking;
ALTER TABLE journal_entries     ENABLE TRIGGER trg_check_period_lock;
ALTER TABLE setup_expenses      ENABLE TRIGGER trg_prevent_delete_setup_expenses;
ALTER TABLE operating_expenses  ENABLE TRIGGER trg_prevent_delete_operating_expenses;
ALTER TABLE operating_expenses  ENABLE TRIGGER prevent_closed_period_expenses;
ALTER TABLE partner_settlements ENABLE TRIGGER trg_prevent_delete_partner_settlements;
