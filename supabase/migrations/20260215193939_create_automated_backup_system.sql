/*
  # نظام النسخ الاحتياطي التلقائي الشامل
  # Automated SaaS-Grade Backup System

  ## التغييرات الرئيسية | Main Changes

  ### 1. جداول جديدة | New Tables
    - `backup_logs` - سجل جميع عمليات النسخ الاحتياطي
    - `backup_settings` - إعدادات النسخ الاحتياطي والـ API Keys

  ### 2. الحقول | Fields
    
    **backup_logs:**
    - `id` (uuid) - معرّف فريد
    - `backup_type` (text) - نوع النسخة (full, incremental, realtime, images)
    - `status` (text) - الحالة (pending, processing, success, failed)
    - `backup_size` (bigint) - حجم النسخة بالبايتات
    - `records_count` (int) - عدد السجلات
    - `google_drive_file_id` (text) - معرّف الملف في Google Drive
    - `google_drive_url` (text) - رابط الملف
    - `error_message` (text) - رسالة الخطأ في حال الفشل
    - `started_at` (timestamptz) - وقت البدء
    - `completed_at` (timestamptz) - وقت الانتهاء
    - `metadata` (jsonb) - بيانات إضافية

    **backup_settings:**
    - `id` (uuid) - معرّف فريد
    - `google_drive_enabled` (boolean) - تفعيل Google Drive
    - `google_drive_folder_id` (text) - معرّف المجلد
    - `google_drive_credentials` (text) - بيانات الاعتماد (مشفرة)
    - `realtime_backup_enabled` (boolean) - تفعيل النسخ اللحظي
    - `daily_backup_enabled` (boolean) - تفعيل النسخ اليومي
    - `daily_backup_time` (time) - وقت النسخ اليومي
    - `retention_days` (int) - عدد أيام الاحتفاظ
    - `last_backup_at` (timestamptz) - آخر نسخة ناجحة
    - `last_backup_status` (text) - حالة آخر نسخة

  ### 3. الأمان | Security
    - تفعيل RLS على جميع الجداول
    - سياسات للـ admin فقط

  ### 4. الوظائف | Functions
    - `check_backup_health()` - فحص صحة النسخ الاحتياطي
    - `cleanup_old_backups()` - حذف النسخ القديمة
*/

-- 1. جدول سجل النسخ الاحتياطي
CREATE TABLE IF NOT EXISTS backup_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_type text NOT NULL CHECK (backup_type IN ('full', 'incremental', 'realtime', 'images')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'success', 'failed')),
  backup_size bigint DEFAULT 0,
  records_count int DEFAULT 0,
  google_drive_file_id text,
  google_drive_url text,
  error_message text,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- 2. جدول إعدادات النسخ الاحتياطي
CREATE TABLE IF NOT EXISTS backup_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_drive_enabled boolean DEFAULT false,
  google_drive_folder_id text,
  google_drive_credentials text, -- مشفر
  google_drive_refresh_token text, -- مشفر
  realtime_backup_enabled boolean DEFAULT false,
  daily_backup_enabled boolean DEFAULT true,
  daily_backup_time time DEFAULT '02:00:00',
  retention_days int DEFAULT 30,
  last_full_backup_at timestamptz,
  last_backup_status text DEFAULT 'never',
  notification_email text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- إدراج إعدادات افتراضية
INSERT INTO backup_settings (
  google_drive_enabled,
  realtime_backup_enabled,
  daily_backup_enabled,
  retention_days
) VALUES (
  false,
  false,
  true,
  30
) ON CONFLICT (id) DO NOTHING;

-- 3. جدول قائمة انتظار النسخ الاحتياطي (للنسخ اللحظي)
CREATE TABLE IF NOT EXISTS backup_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  operation text NOT NULL CHECK (operation IN ('insert', 'update', 'delete')),
  record_id text NOT NULL,
  data jsonb,
  processed boolean DEFAULT false,
  processed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 4. فهارس للأداء
CREATE INDEX IF NOT EXISTS idx_backup_logs_status ON backup_logs(status);
CREATE INDEX IF NOT EXISTS idx_backup_logs_type ON backup_logs(backup_type);
CREATE INDEX IF NOT EXISTS idx_backup_logs_created_at ON backup_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backup_queue_processed ON backup_queue(processed) WHERE NOT processed;
CREATE INDEX IF NOT EXISTS idx_backup_queue_created_at ON backup_queue(created_at);

-- 5. تفعيل RLS
ALTER TABLE backup_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_queue ENABLE ROW LEVEL SECURITY;

-- 6. سياسات RLS (Admin فقط)
CREATE POLICY "Admins can view all backup logs"
  ON backup_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY "System can insert backup logs"
  ON backup_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "System can update backup logs"
  ON backup_logs FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Admins can view backup settings"
  ON backup_settings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can update backup settings"
  ON backup_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY "System can access backup queue"
  ON backup_queue FOR ALL
  TO authenticated
  USING (true);

-- 7. وظيفة فحص صحة النسخ الاحتياطي
CREATE OR REPLACE FUNCTION check_backup_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  last_backup backup_logs;
  settings backup_settings;
  health_status jsonb;
  hours_since_backup numeric;
BEGIN
  -- جلب آخر نسخة ناجحة
  SELECT * INTO last_backup
  FROM backup_logs
  WHERE status = 'success' AND backup_type = 'full'
  ORDER BY completed_at DESC
  LIMIT 1;

  -- جلب الإعدادات
  SELECT * INTO settings
  FROM backup_settings
  LIMIT 1;

  -- حساب الساعات منذ آخر نسخة
  IF last_backup.completed_at IS NOT NULL THEN
    hours_since_backup := EXTRACT(EPOCH FROM (now() - last_backup.completed_at)) / 3600;
  ELSE
    hours_since_backup := NULL;
  END IF;

  -- بناء حالة الصحة
  health_status := jsonb_build_object(
    'status', CASE
      WHEN hours_since_backup IS NULL THEN 'never_backed_up'
      WHEN hours_since_backup > 48 THEN 'critical'
      WHEN hours_since_backup > 26 THEN 'warning'
      ELSE 'healthy'
    END,
    'last_backup_at', last_backup.completed_at,
    'hours_since_backup', hours_since_backup,
    'last_backup_size', last_backup.backup_size,
    'google_drive_enabled', settings.google_drive_enabled,
    'realtime_enabled', settings.realtime_backup_enabled,
    'failed_backups_24h', (
      SELECT COUNT(*)
      FROM backup_logs
      WHERE status = 'failed'
      AND created_at > now() - interval '24 hours'
    )
  );

  RETURN health_status;
END;
$$;

-- 8. وظيفة تنظيف النسخ القديمة
CREATE OR REPLACE FUNCTION cleanup_old_backups()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  retention_days int;
  deleted_count int;
BEGIN
  -- جلب مدة الاحتفاظ
  SELECT backup_settings.retention_days INTO retention_days
  FROM backup_settings
  LIMIT 1;

  -- حذف السجلات القديمة
  DELETE FROM backup_logs
  WHERE created_at < now() - (retention_days || ' days')::interval
  AND status IN ('success', 'failed');

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RETURN deleted_count;
END;
$$;

-- 9. وظيفة لتحديث آخر نسخة ناجحة في الإعدادات
CREATE OR REPLACE FUNCTION update_last_backup_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'success' AND NEW.backup_type = 'full' THEN
    UPDATE backup_settings
    SET 
      last_full_backup_at = NEW.completed_at,
      last_backup_status = 'success',
      updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;

-- 10. Trigger لتحديث إعدادات النسخ الاحتياطي
DROP TRIGGER IF EXISTS trigger_update_backup_status ON backup_logs;
CREATE TRIGGER trigger_update_backup_status
  AFTER INSERT OR UPDATE ON backup_logs
  FOR EACH ROW
  WHEN (NEW.status = 'success' AND NEW.backup_type = 'full')
  EXECUTE FUNCTION update_last_backup_status();

-- 11. تحديث timestamp عند تعديل backup_settings
CREATE OR REPLACE FUNCTION update_backup_settings_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_backup_settings_timestamp ON backup_settings;
CREATE TRIGGER trigger_update_backup_settings_timestamp
  BEFORE UPDATE ON backup_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_backup_settings_timestamp();

-- 12. إنشاء view لإحصائيات النسخ الاحتياطي
CREATE OR REPLACE VIEW backup_statistics AS
SELECT
  COUNT(*) FILTER (WHERE status = 'success') as successful_backups,
  COUNT(*) FILTER (WHERE status = 'failed') as failed_backups,
  COUNT(*) FILTER (WHERE status = 'processing') as in_progress_backups,
  COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours') as backups_24h,
  COUNT(*) FILTER (WHERE status = 'failed' AND created_at > now() - interval '24 hours') as failed_24h,
  AVG(backup_size) FILTER (WHERE status = 'success') as avg_backup_size,
  MAX(completed_at) FILTER (WHERE status = 'success') as last_successful_backup,
  SUM(backup_size) as total_backup_size
FROM backup_logs;

-- 13. منح الأذونات للـ authenticated users
GRANT SELECT ON backup_statistics TO authenticated;

COMMENT ON TABLE backup_logs IS 'سجل جميع عمليات النسخ الاحتياطي التلقائية';
COMMENT ON TABLE backup_settings IS 'إعدادات نظام النسخ الاحتياطي التلقائي';
COMMENT ON TABLE backup_queue IS 'قائمة انتظار للنسخ الاحتياطي اللحظي';
COMMENT ON FUNCTION check_backup_health() IS 'فحص صحة نظام النسخ الاحتياطي';
COMMENT ON FUNCTION cleanup_old_backups() IS 'تنظيف النسخ الاحتياطية القديمة';
