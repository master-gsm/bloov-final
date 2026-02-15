import { useState, useEffect } from 'react';
import { Cloud, HardDrive, Clock, Save, AlertCircle, CheckCircle, Play, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useLanguage } from '../contexts/LanguageContext';
import { triggerFullBackup, checkBackupHealth, cleanupOldBackups } from '../lib/realtimeBackup';

interface BackupSettings {
  id: string;
  google_drive_enabled: boolean;
  google_drive_folder_id: string | null;
  google_drive_credentials: string | null;
  realtime_backup_enabled: boolean;
  daily_backup_enabled: boolean;
  daily_backup_time: string;
  retention_days: number;
  last_full_backup_at: string | null;
  last_backup_status: string;
}

export default function BackupSettings() {
  const { language } = useLanguage();
  const isRTL = language === 'ar';

  const [settings, setSettings] = useState<BackupSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [runningBackup, setRunningBackup] = useState(false);

  // حقول النموذج
  const [googleDriveEnabled, setGoogleDriveEnabled] = useState(false);
  const [googleDriveFolderId, setGoogleDriveFolderId] = useState('');
  const [googleDriveCredentials, setGoogleDriveCredentials] = useState('');
  const [realtimeEnabled, setRealtimeEnabled] = useState(false);
  const [dailyBackupEnabled, setDailyBackupEnabled] = useState(true);
  const [dailyBackupTime, setDailyBackupTime] = useState('02:00');
  const [retentionDays, setRetentionDays] = useState(30);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const { data, error } = await supabase
        .from('backup_settings')
        .select('*')
        .single();

      if (error) throw error;

      if (data) {
        setSettings(data);
        setGoogleDriveEnabled(data.google_drive_enabled);
        setGoogleDriveFolderId(data.google_drive_folder_id || '');
        setGoogleDriveCredentials(''); // لا نعرض الـ credentials لأسباب أمنية
        setRealtimeEnabled(data.realtime_backup_enabled);
        setDailyBackupEnabled(data.daily_backup_enabled);
        setDailyBackupTime(data.daily_backup_time || '02:00');
        setRetentionDays(data.retention_days);
      }
    } catch (error: any) {
      console.error('Error loading settings:', error);
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);

    try {
      const updates: any = {
        google_drive_enabled: googleDriveEnabled,
        google_drive_folder_id: googleDriveFolderId || null,
        realtime_backup_enabled: realtimeEnabled,
        daily_backup_enabled: dailyBackupEnabled,
        daily_backup_time: dailyBackupTime,
        retention_days: retentionDays,
        updated_at: new Date().toISOString(),
      };

      // تحديث الـ credentials فقط إذا تم تغييرها
      if (googleDriveCredentials.trim()) {
        updates.google_drive_credentials = googleDriveCredentials;
      }

      const { error } = await supabase
        .from('backup_settings')
        .update(updates)
        .eq('id', settings!.id);

      if (error) throw error;

      setMessage({
        type: 'success',
        text: isRTL ? 'تم حفظ الإعدادات بنجاح' : 'Settings saved successfully',
      });

      // إعادة تحميل الإعدادات
      await loadSettings();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleRunBackupNow() {
    setRunningBackup(true);
    setMessage(null);

    try {
      const result = await triggerFullBackup();

      if (result.success) {
        setMessage({
          type: 'success',
          text: isRTL
            ? 'تم بدء النسخ الاحتياطي بنجاح. قد يستغرق الأمر بضع دقائق.'
            : 'Backup started successfully. This may take a few minutes.',
        });
        await loadSettings();
      } else {
        throw new Error(result.message);
      }
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.message || (isRTL ? 'فشل في بدء النسخ الاحتياطي' : 'Failed to start backup'),
      });
    } finally {
      setRunningBackup(false);
    }
  }

  async function handleCleanupOldBackups() {
    if (!confirm(isRTL ? 'هل تريد حذف النسخ القديمة؟' : 'Delete old backups?')) {
      return;
    }

    try {
      const result = await cleanupOldBackups();
      setMessage({
        type: 'success',
        text: isRTL
          ? `تم حذف ${result.deletedCount} نسخة قديمة`
          : `Deleted ${result.deletedCount} old backups`,
      });
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-gray-600">{isRTL ? 'جاري التحميل...' : 'Loading...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${isRTL ? 'text-right' : 'text-left'}`}>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-3">
          <Cloud className="w-6 h-6 text-teal-600" />
          {isRTL ? 'إعدادات النسخ الاحتياطي التلقائي' : 'Automated Backup Settings'}
        </h2>

        {/* رسالة */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg flex items-start gap-3 ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {message.type === 'success' ? (
              <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            )}
            <p>{message.text}</p>
          </div>
        )}

        {/* حالة آخر نسخة */}
        {settings?.last_full_backup_at && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-blue-900">
              <strong>{isRTL ? 'آخر نسخة احتياطية كاملة:' : 'Last Full Backup:'}</strong>{' '}
              {new Date(settings.last_full_backup_at).toLocaleString(isRTL ? 'ar-SA' : 'en-US')}
            </p>
            <p className="text-blue-800 mt-1">
              <strong>{isRTL ? 'الحالة:' : 'Status:'}</strong>{' '}
              {settings.last_backup_status === 'success'
                ? (isRTL ? '✅ نجح' : '✅ Success')
                : (isRTL ? '❌ فشل' : '❌ Failed')}
            </p>
          </div>
        )}

        <div className="space-y-6">
          {/* Google Drive */}
          <div className="border-b border-gray-200 pb-6">
            <div className="flex items-center gap-3 mb-4">
              <input
                type="checkbox"
                id="googleDriveEnabled"
                checked={googleDriveEnabled}
                onChange={(e) => setGoogleDriveEnabled(e.target.checked)}
                className="w-5 h-5 text-teal-600 rounded focus:ring-teal-500"
              />
              <label htmlFor="googleDriveEnabled" className="text-lg font-semibold text-gray-900 cursor-pointer">
                {isRTL ? 'تفعيل النسخ الاحتياطي إلى Google Drive' : 'Enable Google Drive Backup'}
              </label>
            </div>

            {googleDriveEnabled && (
              <div className="space-y-4 mr-8">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {isRTL ? 'معرّف المجلد (Folder ID)' : 'Folder ID'}
                  </label>
                  <input
                    type="text"
                    value={googleDriveFolderId}
                    onChange={(e) => setGoogleDriveFolderId(e.target.value)}
                    placeholder="1a2b3c4d5e6f7g8h9i0j"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    {isRTL
                      ? 'يمكنك إيجاد الـ Folder ID من رابط المجلد في Google Drive'
                      : 'Find the Folder ID from the folder URL in Google Drive'}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {isRTL ? 'بيانات الاعتماد (JSON)' : 'Credentials (JSON)'}
                  </label>
                  <textarea
                    value={googleDriveCredentials}
                    onChange={(e) => setGoogleDriveCredentials(e.target.value)}
                    placeholder='{"client_id": "...", "client_secret": "...", "refresh_token": "..."}'
                    rows={4}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent font-mono text-sm"
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    {isRTL
                      ? 'احصل على بيانات الاعتماد من Google Cloud Console'
                      : 'Get credentials from Google Cloud Console'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* النسخ اللحظي */}
          <div className="border-b border-gray-200 pb-6">
            <div className="flex items-center gap-3 mb-2">
              <input
                type="checkbox"
                id="realtimeEnabled"
                checked={realtimeEnabled}
                onChange={(e) => setRealtimeEnabled(e.target.checked)}
                className="w-5 h-5 text-teal-600 rounded focus:ring-teal-500"
              />
              <label htmlFor="realtimeEnabled" className="text-lg font-semibold text-gray-900 cursor-pointer">
                {isRTL ? 'تفعيل النسخ الاحتياطي اللحظي' : 'Enable Real-time Backup'}
              </label>
            </div>
            <p className="text-sm text-gray-600 mr-8">
              {isRTL
                ? 'يقوم بنسخ أي تغيير فوراً إلى Google Drive (مبيعات، مشتريات، مصاريف، صور)'
                : 'Backs up any changes immediately to Google Drive (sales, purchases, expenses, images)'}
            </p>
          </div>

          {/* النسخ اليومي */}
          <div className="border-b border-gray-200 pb-6">
            <div className="flex items-center gap-3 mb-4">
              <input
                type="checkbox"
                id="dailyBackupEnabled"
                checked={dailyBackupEnabled}
                onChange={(e) => setDailyBackupEnabled(e.target.checked)}
                className="w-5 h-5 text-teal-600 rounded focus:ring-teal-500"
              />
              <label htmlFor="dailyBackupEnabled" className="text-lg font-semibold text-gray-900 cursor-pointer">
                {isRTL ? 'تفعيل النسخ الاحتياطي اليومي' : 'Enable Daily Backup'}
              </label>
            </div>

            {dailyBackupEnabled && (
              <div className="mr-8">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {isRTL ? 'وقت النسخ اليومي' : 'Daily Backup Time'}
                </label>
                <input
                  type="time"
                  value={dailyBackupTime}
                  onChange={(e) => setDailyBackupTime(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
                <p className="mt-1 text-sm text-gray-500">
                  {isRTL ? 'الوقت الافتراضي: 2:00 صباحاً' : 'Default time: 2:00 AM'}
                </p>
              </div>
            )}
          </div>

          {/* مدة الاحتفاظ */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {isRTL ? 'مدة الاحتفاظ بالنسخ (أيام)' : 'Backup Retention (days)'}
            </label>
            <input
              type="number"
              value={retentionDays}
              onChange={(e) => setRetentionDays(parseInt(e.target.value) || 30)}
              min="7"
              max="365"
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
            <p className="mt-1 text-sm text-gray-500">
              {isRTL
                ? 'سيتم حذف النسخ الأقدم من هذه المدة تلقائياً'
                : 'Backups older than this will be automatically deleted'}
            </p>
          </div>
        </div>

        {/* أزرار الإجراءات */}
        <div className="mt-8 flex flex-wrap gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-teal-600 text-white px-6 py-3 rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            <Save className="w-5 h-5" />
            {saving ? (isRTL ? 'جاري الحفظ...' : 'Saving...') : (isRTL ? 'حفظ الإعدادات' : 'Save Settings')}
          </button>

          <button
            onClick={handleRunBackupNow}
            disabled={runningBackup || !googleDriveEnabled}
            className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            <Play className="w-5 h-5" />
            {runningBackup
              ? (isRTL ? 'جاري النسخ...' : 'Backing up...')
              : (isRTL ? 'تشغيل نسخة الآن' : 'Run Backup Now')}
          </button>

          <button
            onClick={handleCleanupOldBackups}
            className="flex items-center gap-2 bg-orange-600 text-white px-6 py-3 rounded-lg hover:bg-orange-700 font-medium"
          >
            <HardDrive className="w-5 h-5" />
            {isRTL ? 'حذف النسخ القديمة' : 'Cleanup Old Backups'}
          </button>
        </div>

        {/* ملاحظات مهمة */}
        <div className="mt-8 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h3 className="font-bold text-yellow-900 mb-2 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            {isRTL ? 'ملاحظات مهمة:' : 'Important Notes:'}
          </h3>
          <ul className="space-y-1 text-sm text-yellow-800">
            <li>• {isRTL ? 'يجب أن يكون لديك حساب Google Drive' : 'You must have a Google Drive account'}</li>
            <li>• {isRTL ? 'قم بإنشاء مجلد خاص بالنسخ الاحتياطي في Google Drive' : 'Create a dedicated folder for backups in Google Drive'}</li>
            <li>• {isRTL ? 'احصل على بيانات الاعتماد من Google Cloud Console' : 'Get credentials from Google Cloud Console'}</li>
            <li>• {isRTL ? 'النسخ اللحظي يحتاج إلى اتصال إنترنت مستمر' : 'Real-time backup requires continuous internet connection'}</li>
            <li>• {isRTL ? 'النسخ اليومي يعمل تلقائياً على السيرفر' : 'Daily backup runs automatically on the server'}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
