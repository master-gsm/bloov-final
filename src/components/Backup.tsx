import { useState, useEffect } from 'react';
import { Database, Download, HardDrive, Clock, FileText, AlertCircle, CheckCircle, Loader } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useLanguage } from '../contexts/LanguageContext';

interface BackupResult {
  filename: string;
  size: number;
  size_mb: string;
  total_records: number;
  tables_count: number;
  execution_time: string;
  created_at: string;
  download_url: string;
  backup_data: any;
}

interface BackupHistory {
  name: string;
  created_at: string;
  size: number;
}

export default function Backup() {
  const { t, language } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState(false);
  const [backupResult, setBackupResult] = useState<BackupResult | null>(null);
  const [backupHistory, setBackupHistory] = useState<BackupHistory[]>([]);

  useEffect(() => {
    loadBackupHistory();
  }, []);

  const loadBackupHistory = async () => {
    try {
      const { data, error } = await supabase.storage.from('backups').list();

      if (error) throw error;

      if (data) {
        const history = data
          .filter(file => file.name.endsWith('.json'))
          .map(file => ({
            name: file.name,
            created_at: file.created_at,
            size: file.metadata?.size || 0,
          }))
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        setBackupHistory(history);
      }
    } catch (err) {
      console.error('Error loading backup history:', err);
    }
  };

  const createBackup = async () => {
    setLoading(true);
    setError('');
    setSuccess(false);
    setBackupResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-backup`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to create backup');
      }

      setSuccess(true);
      setBackupResult(result.data);
      await loadBackupHistory();
    } catch (err) {
      console.error('Backup error:', err);
      setError(err instanceof Error ? err.message : 'حدث خطأ أثناء إنشاء النسخة الاحتياطية');
    } finally {
      setLoading(false);
    }
  };

  const downloadBackup = (data: any, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadFromHistory = async (filename: string) => {
    try {
      const { data, error } = await supabase.storage.from('backups').download(filename);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download error:', err);
      alert('فشل تحميل النسخة الاحتياطية');
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleString(language === 'ar' ? 'ar-SA' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Database className="w-8 h-8 text-teal-600" />
          <h1 className="text-3xl font-bold text-gray-900">
            {language === 'ar' ? 'النسخ الاحتياطي' : 'Backup System'}
          </h1>
        </div>
        <p className="text-gray-600">
          {language === 'ar'
            ? 'إنشاء وإدارة النسخ الاحتياطية لجميع بيانات النظام'
            : 'Create and manage backups for all system data'}
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">
          {language === 'ar' ? 'إنشاء نسخة احتياطية جديدة' : 'Create New Backup'}
        </h2>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-900">
              <p className="font-medium mb-2">
                {language === 'ar' ? 'ستشمل النسخة الاحتياطية:' : 'The backup will include:'}
              </p>
              <ul className="list-disc list-inside space-y-1 text-blue-800">
                <li>{language === 'ar' ? 'جميع المبيعات والمشتريات' : 'All sales and purchases'}</li>
                <li>{language === 'ar' ? 'المنتجات والمخزون' : 'Products and inventory'}</li>
                <li>{language === 'ar' ? 'العملاء والموردين' : 'Customers and suppliers'}</li>
                <li>{language === 'ar' ? 'الشركاء والموظفين' : 'Partners and employees'}</li>
                <li>{language === 'ar' ? 'المصاريف والعمليات المالية' : 'Expenses and financial operations'}</li>
                <li>{language === 'ar' ? 'الفروع والصلاحيات' : 'Branches and permissions'}</li>
                <li>{language === 'ar' ? 'جميع الإعدادات والبيانات الأخرى' : 'All settings and other data'}</li>
              </ul>
            </div>
          </div>
        </div>

        <button
          onClick={createBackup}
          disabled={loading}
          className={`w-full flex items-center justify-center gap-2 py-4 px-6 rounded-lg font-medium transition ${
            loading
              ? 'bg-gray-300 cursor-not-allowed'
              : 'bg-gradient-to-r from-teal-600 to-teal-700 text-white hover:from-teal-700 hover:to-teal-800'
          }`}
        >
          {loading ? (
            <>
              <Loader className="w-5 h-5 animate-spin" />
              {language === 'ar' ? 'جاري إنشاء النسخة الاحتياطية...' : 'Creating backup...'}
            </>
          ) : (
            <>
              <Database className="w-5 h-5" />
              {language === 'ar' ? 'إنشاء نسخة احتياطية الآن' : 'Create Backup Now'}
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-medium text-red-900 mb-1">
                {language === 'ar' ? 'فشل إنشاء النسخة الاحتياطية' : 'Backup Failed'}
              </h3>
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        </div>
      )}

      {success && backupResult && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
          <div className="flex items-start gap-3 mb-4">
            <CheckCircle className="w-6 h-6 text-green-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-lg font-bold text-green-900 mb-2">
                {language === 'ar' ? 'تم إنشاء النسخة الاحتياطية بنجاح!' : 'Backup Created Successfully!'}
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="bg-white rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-gray-600" />
                    <span className="text-sm font-medium text-gray-700">
                      {language === 'ar' ? 'وقت العملية' : 'Execution Time'}
                    </span>
                  </div>
                  <p className="text-lg font-bold text-gray-900">{backupResult.execution_time}</p>
                </div>

                <div className="bg-white rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-gray-600" />
                    <span className="text-sm font-medium text-gray-700">
                      {language === 'ar' ? 'اسم الملف' : 'Filename'}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-gray-900 truncate" title={backupResult.filename}>
                    {backupResult.filename}
                  </p>
                </div>

                <div className="bg-white rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <HardDrive className="w-4 h-4 text-gray-600" />
                    <span className="text-sm font-medium text-gray-700">
                      {language === 'ar' ? 'حجم الملف' : 'File Size'}
                    </span>
                  </div>
                  <p className="text-lg font-bold text-gray-900">{backupResult.size_mb} MB</p>
                </div>

                <div className="bg-white rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Database className="w-4 h-4 text-gray-600" />
                    <span className="text-sm font-medium text-gray-700">
                      {language === 'ar' ? 'عدد السجلات' : 'Total Records'}
                    </span>
                  </div>
                  <p className="text-lg font-bold text-gray-900">
                    {backupResult.total_records.toLocaleString()}
                    <span className="text-sm text-gray-600 font-normal mr-2">
                      ({backupResult.tables_count} {language === 'ar' ? 'جدول' : 'tables'})
                    </span>
                  </p>
                </div>
              </div>

              <button
                onClick={() => downloadBackup(backupResult.backup_data, backupResult.filename)}
                className="w-full flex items-center justify-center gap-2 bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 transition font-medium"
              >
                <Download className="w-5 h-5" />
                {language === 'ar' ? 'تحميل النسخة المحلية (JSON)' : 'Download Local Copy (JSON)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {backupHistory.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            {language === 'ar' ? 'سجل النسخ الاحتياطية' : 'Backup History'}
          </h2>

          <div className="space-y-3">
            {backupHistory.map((backup) => (
              <div
                key={backup.name}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-teal-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{backup.name}</p>
                    <div className="flex items-center gap-4 mt-1">
                      <span className="text-xs text-gray-600">
                        {formatDate(backup.created_at)}
                      </span>
                      <span className="text-xs text-gray-600">
                        {formatBytes(backup.size)}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => downloadFromHistory(backup.name)}
                  className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition text-sm"
                >
                  <Download className="w-4 h-4" />
                  {language === 'ar' ? 'تحميل' : 'Download'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
