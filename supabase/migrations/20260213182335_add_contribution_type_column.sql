/*
  # إضافة عمود contribution_type إلى جدول partner_contributions

  ## التعديلات
    - إضافة عمود `contribution_type` إلى جدول `partner_contributions`
      - الأنواع المتاحة: حكومي (governmental)، أصول (assets)، تشغيلي (operational)، آخر (other)
      - القيمة الافتراضية: 'operational'
*/

-- إضافة عمود contribution_type إلى جدول partner_contributions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partner_contributions' AND column_name = 'contribution_type'
  ) THEN
    ALTER TABLE partner_contributions ADD COLUMN contribution_type text DEFAULT 'operational';
  END IF;
END $$;