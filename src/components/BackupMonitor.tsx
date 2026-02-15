import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, Clock, HardDrive, Cloud, Database, TrendingUp } from 'lucide-react';
import { checkBackupHealth, getRecentBackupLogs } from '../lib/realtimeBackup';
import { useLanguage } from '../contexts/LanguageContext';

interface BackupHealth {
  status: 'healthy' | 'warning' | 'critical' | 'never_backed_up';
  last_backup_at: string | null;
  hours_since_backup: number | null;
  failed_backups_24h: number;
  google_drive_enabled: boolean;
  realtime_enabled: boolean;
}

interface BackupLog {
  id: string;
  backup_type: string;
  status: string;
  backup_size: number;
  records_count: number;
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
}

export default function BackupMonitor() {
  const { language } = useLanguage();
  const [health, setHealth] = useState<BackupHealth | null>(null);
  const [logs, setLogs] = useState<BackupLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);

  const isRTL = language === 'ar';

  useEffect(() => {
    loadBackupStatus();

    // تحديث كل 5 دقائق
    const interval = setInterval(loadBackupStatus, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  async function loadBackupStatus() {
    try {
      const [healthData, logsData] = await Promise.all([
        checkBackupHealth(),
        getRecentBackupLogs(),
      ]);

      setHealth(healthData);
      setLogs(logsData);
    } catch (error) {
      console.error('Error loading backup status:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return null;
  }

  if (!health) {
    return null;
  }

  // تحديد نوع التنبيه
  const isCritical = health.status === 'critical' || health.status === 'never_backed_up' || health.failed_backups_24h > 0;
  const isWarning = health.status === 'warning';

  // إذا كان النظام صحي ولا توجد تنبيهات، لا نعرض شيء
  if (health.status === 'healthy' && health.failed_backups_24h === 0) {
    return null;
  }

  return (
    <div className={`mb-6 ${isRTL ? 'text-right' : 'text-left'}`}>
      {/* التنبيه الرئيسي */}
      {isCritical && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4 rounded">
          <div className="flex items-start">
            <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
            <div className={`flex-1 ${isRTL ? 'mr-3' : 'ml-3'}`}>
              <h3 className="text-lg font-bold text-red-800 mb-2">
                {isRTL ? '⚠️ تنبيه: فشل النسخ الاحتياطي التلقائي' : '⚠️ Warning: Automatic Backup Failed'}
              </h3>

              {health.status === 'never_backed_up' && (
                <p className="text-red-700 mb-2">
                  {isRTL
                    ? 'لم يتم إجراء أي نسخة احتياطية تلقائية حتى الآن. بياناتك معرضة للخطر!'
                    : 'No automatic backup has been performed yet. Your data is at risk!'}
                </p>
              )}

              {health.hours_since_backup !== null && health.hours_since_backup > 24 && (
                <p className="text-red-700 mb-2">
                  {isRTL
                    ? `آخر نسخة احتياطية ناجحة كانت منذ ${Math.floor(health.hours_since_backup)} ساعة`
                    : `Last successful backup was ${Math.floor(health.hours_since_backup)} hours ago`}
                </p>
              )}

              {health.failed_backups_24h > 0 && (
                <p className="text-red-700 mb-2">
                  {isRTL
                    ? `فشلت ${health.failed_backups_24h} محاولة نسخ احتياطي في آخر 24 ساعة`
                    : `${health.failed_backups_24h} backup attempts failed in the last 24 hours`}
                </p>
              )}

              <div className="flex flex-wrap gap-2 mt-3">
                {!health.google_drive_enabled && (
                  <span className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm font-medium">
                    {isRTL ? 'Google Drive غير مفعل' : 'Google Drive Disabled'}
                  </span>
                )}
                {!health.realtime_enabled && (
                  <span className="bg-orange-100 text-orange-800 px-3 py-1 rounded-full text-sm font-medium">
                    {isRTL ? 'النسخ اللحظي غير مفعل' : 'Real-time Backup Disabled'}
                  </span>
                )}
              </div>

              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="mt-3 text-red-700 hover:text-red-900 font-medium underline"
              >
                {isExpanded
                  ? (isRTL ? 'إخفاء التفاصيل' : 'Hide Details')
                  : (isRTL ? 'عرض التفاصيل والحلول' : 'View Details & Solutions')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* تنبيه تحذيري */}
      {isWarning && !isCritical && (
        <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 mb-4 rounded">
          <div className="flex items-start">
            <Clock className="w-6 h-6 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div className={`flex-1 ${isRTL ? 'mr-3' : 'ml-3'}`}>
              <h3 className="text-lg font-bold text-yellow-800 mb-2">
                {isRTL ? '⚠️ تحذير: النسخة الاحتياطية قديمة' : '⚠️ Warning: Backup is Outdated'}
              </h3>
              <p className="text-yellow-700">
                {isRTL
                  ? `آخر نسخة احتياطية كانت منذ ${Math.floor(health.hours_since_backup || 0)} ساعة. يوصى بإجراء نسخة جديدة.`
                  : `Last backup was ${Math.floor(health.hours_since_backup || 0)} hours ago. A new backup is recommended.`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* التفاصيل الموسعة */}
      {isExpanded && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Database className="w-5 h-5" />
            {isRTL ? 'حالة النسخ الاحتياطي التفصيلية' : 'Detailed Backup Status'}
          </h4>

          {/* إحصائيات */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="flex items-center gap-3">
                <Cloud className="w-8 h-8 text-blue-600" />
                <div>
                  <p className="text-sm text-gray-600">
                    {isRTL ? 'Google Drive' : 'Google Drive'}
                  </p>
                  <p className="text-lg font-bold text-gray-900">
                    {health.google_drive_enabled
                      ? (isRTL ? 'مفعل' : 'Enabled')
                      : (isRTL ? 'غير مفعل' : 'Disabled')}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-green-50 p-4 rounded-lg">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-8 h-8 text-green-600" />
                <div>
                  <p className="text-sm text-gray-600">
                    {isRTL ? 'النسخ اللحظي' : 'Real-time Backup'}
                  </p>
                  <p className="text-lg font-bold text-gray-900">
                    {health.realtime_enabled
                      ? (isRTL ? 'مفعل' : 'Enabled')
                      : (isRTL ? 'غير مفعل' : 'Disabled')}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-purple-50 p-4 rounded-lg">
              <div className="flex items-center gap-3">
                <HardDrive className="w-8 h-8 text-purple-600" />
                <div>
                  <p className="text-sm text-gray-600">
                    {isRTL ? 'آخر نسخة' : 'Last Backup'}
                  </p>
                  <p className="text-lg font-bold text-gray-900">
                    {health.last_backup_at
                      ? new Date(health.last_backup_at).toLocaleDateString(isRTL ? 'ar-SA' : 'en-US')
                      : (isRTL ? 'لم يتم' : 'Never')}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* سجل النسخ الاحتياطي */}
          {logs.length > 0 && (
            <div className="mb-6">
              <h5 className="font-bold text-gray-900 mb-3">
                {isRTL ? 'آخر 10 عمليات نسخ احتياطي:' : 'Last 10 Backup Operations:'}
              </h5>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                        {isRTL ? 'النوع' : 'Type'}
                      </th>
                      <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                        {isRTL ? 'الحالة' : 'Status'}
                      </th>
                      <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                        {isRTL ? 'الحجم' : 'Size'}
                      </th>
                      <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                        {isRTL ? 'السجلات' : 'Records'}
                      </th>
                      <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                        {isRTL ? 'التاريخ' : 'Date'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {logs.map((log) => (
                      <tr key={log.id}>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            log.backup_type === 'full' ? 'bg-blue-100 text-blue-800' :
                            log.backup_type === 'incremental' ? 'bg-green-100 text-green-800' :
                            'bg-purple-100 text-purple-800'
                          }`}>
                            {log.backup_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {log.status === 'success' ? (
                            <span className="flex items-center gap-1 text-green-600">
                              <CheckCircle className="w-4 h-4" />
                              {isRTL ? 'نجح' : 'Success'}
                            </span>
                          ) : log.status === 'failed' ? (
                            <span className="flex items-center gap-1 text-red-600">
                              <AlertTriangle className="w-4 h-4" />
                              {isRTL ? 'فشل' : 'Failed'}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-yellow-600">
                              <Clock className="w-4 h-4" />
                              {isRTL ? 'جاري' : 'Processing'}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {log.backup_size ? (log.backup_size / 1024 / 1024).toFixed(2) + ' MB' : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {log.records_count?.toLocaleString() || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {new Date(log.created_at).toLocaleString(isRTL ? 'ar-SA' : 'en-US')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* الحلول المقترحة */}
          {isCritical && (
            <div className="bg-blue-50 p-4 rounded-lg">
              <h5 className="font-bold text-blue-900 mb-3">
                {isRTL ? '🔧 الحلول المقترحة:' : '🔧 Suggested Solutions:'}
              </h5>
              <ul className="space-y-2 text-blue-800">
                {!health.google_drive_enabled && (
                  <li className="flex items-start gap-2">
                    <span>•</span>
                    <span>
                      {isRTL
                        ? 'قم بتفعيل Google Drive من صفحة الإعدادات → النسخ الاحتياطي'
                        : 'Enable Google Drive from Settings → Backup'}
                    </span>
                  </li>
                )}
                <li className="flex items-start gap-2">
                  <span>•</span>
                  <span>
                    {isRTL
                      ? 'تحقق من اتصال الإنترنت'
                      : 'Check your internet connection'}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span>•</span>
                  <span>
                    {isRTL
                      ? 'راجع صفحة الإعدادات للتأكد من صحة بيانات Google Drive'
                      : 'Review Settings page to verify Google Drive credentials'}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span>•</span>
                  <span>
                    {isRTL
                      ? 'اتصل بالدعم الفني إذا استمرت المشكلة'
                      : 'Contact technical support if the issue persists'}
                  </span>
                </li>
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
