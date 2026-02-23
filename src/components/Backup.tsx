import { useState, useEffect, useRef } from 'react';
import { Database, Download, HardDrive, Clock, FileText, AlertCircle, CheckCircle, Loader, Upload, RotateCcw } from 'lucide-react';
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
  const { language } = useLanguage();
  const [localLoading, setLocalLoading] = useState(false);
  const [serverLoading, setServerLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState(false);
  const [backupResult, setBackupResult] = useState<BackupResult | null>(null);
  const [backupHistory, setBackupHistory] = useState<BackupHistory[]>([]);
  const [savingSettings, setSavingSettings] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState('');
  const [showRestoreSection, setShowRestoreSection] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [confirmModal, setConfirmModal] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [alertModal, setAlertModal] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showAlert = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setAlertModal({ message, type });
  };

  useEffect(() => {
    loadBackupHistory();
  }, []);

  const loadBackupHistory = async () => {
    try {
      const { data: files, error } = await supabase.storage
        .from('backups')
        .list('', { limit: 200, sortBy: { column: 'created_at', order: 'desc' } });

      if (error) {
        console.error('[Backup] list error:', error.message);
        return;
      }

      const history = (files || [])
        .filter((f: any) => f.name && f.name.endsWith('.json'))
        .map((f: any) => ({
          name: f.name,
          created_at: f.created_at,
          size: f.metadata?.size || 0,
        }))
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setBackupHistory(history);
    } catch (err) {
      console.error('Error loading backup history:', err);
    }
  };

  const TABLES_TO_BACKUP = [
    'users', 'branches', 'products', 'inventory', 'customers',
    'suppliers', 'sales', 'sale_items', 'purchases', 'purchase_items',
    'partners', 'partner_contributions', 'employees', 'setup_expenses',
    'operating_expenses', 'cash_shifts', 'cash_transactions',
    'expenses', 'settings', 'permissions', 'salla_orders',
    'salla_order_items', 'loyalty_transactions', 'audit_logs'
  ];

  const createLocalBackup = async () => {
    setLocalLoading(true);
    setError('');
    setSuccess(false);
    setBackupResult(null);

    try {
      const backupData: any = {
        metadata: {
          created_at: new Date().toISOString(),
          version: '1.0',
          total_records: 0,
          tables_count: 0,
        },
        data: {},
      };

      let totalRecords = 0;
      let successfulTables = 0;

      for (const table of TABLES_TO_BACKUP) {
        try {
          const { data, error } = await supabase.from(table as any).select('*');
          if (error) { console.warn(`Error loading ${table}:`, error); continue; }
          if (data && data.length > 0) {
            backupData.data[table] = data;
            totalRecords += data.length;
            successfulTables++;
          }
        } catch (err) {
          console.warn(`Error loading ${table}:`, err);
        }
      }

      backupData.metadata.total_records = totalRecords;
      backupData.metadata.tables_count = successfulTables;

      const backupJson = JSON.stringify(backupData, null, 2);
      const backupSize = new Blob([backupJson]).size;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `backup_${timestamp}.json`;

      downloadBackup(backupData, filename);

      setSuccess(true);
      setBackupResult({
        filename,
        size: backupSize,
        size_mb: (backupSize / (1024 * 1024)).toFixed(2),
        total_records: totalRecords,
        tables_count: successfulTables,
        execution_time: '< 1s',
        created_at: new Date().toISOString(),
        download_url: '',
        backup_data: backupData,
      });

      showAlert(
        language === 'ar'
          ? `تم تنزيل النسخة الاحتياطية بنجاح!\n\nالملف: ${filename}\nعدد السجلات: ${totalRecords.toLocaleString()}\nالحجم: ${(backupSize / (1024 * 1024)).toFixed(2)} MB`
          : `Backup downloaded successfully!\n\nFile: ${filename}\nTotal Records: ${totalRecords.toLocaleString()}\nSize: ${(backupSize / (1024 * 1024)).toFixed(2)} MB`,
        'success'
      );
    } catch (err) {
      console.error('Backup error:', err);
      const errorMsg = err instanceof Error ? err.message : (language === 'ar' ? 'حدث خطأ أثناء إنشاء النسخة الاحتياطية' : 'Error creating backup');
      setError(errorMsg);
      showAlert(language === 'ar' ? `فشل إنشاء النسخة الاحتياطية\n\n${errorMsg}` : `Backup Failed\n\n${errorMsg}`, 'error');
    } finally {
      setLocalLoading(false);
    }
  };

  const createServerBackup = async () => {
    setServerLoading(true);
    setError('');
    setSuccess(false);
    setBackupResult(null);

    try {
      const startTime = Date.now();

      console.log('[ServerBackup] === START ===');

      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      console.log('[ServerBackup] session:', session?.user?.email, 'error:', sessionError?.message);
      if (!session) throw new Error(language === 'ar' ? 'غير مسجل الدخول' : 'Not authenticated');

      const testBlob = new Blob(['test'], { type: 'text/plain' });
      const testResult = await supabase.storage.from('backups').upload('test.txt', testBlob, { upsert: true });
      console.log('[ServerBackup] test upload result:', JSON.stringify(testResult));
      if (testResult.error) {
        throw new Error(`Storage test failed: ${testResult.error.message} (status: ${(testResult.error as any).statusCode})`);
      }
      console.log('[ServerBackup] test upload OK - Storage is working');

      const backupData: any = {
        metadata: {
          created_at: new Date().toISOString(),
          version: '1.0',
          total_records: 0,
          tables_count: 0,
        },
        data: {},
      };

      let totalRecords = 0;
      let successfulTables = 0;

      for (const table of TABLES_TO_BACKUP) {
        try {
          const { data, error } = await supabase.from(table as any).select('*');
          if (error) { console.warn(`[ServerBackup] ${table}:`, error.message); continue; }
          if (data && data.length > 0) {
            backupData.data[table] = data;
            totalRecords += data.length;
            successfulTables++;
          }
        } catch (err) {
          console.warn(`[ServerBackup] ${table}:`, err);
        }
      }

      backupData.metadata.total_records = totalRecords;
      backupData.metadata.tables_count = successfulTables;
      console.log(`[ServerBackup] collected ${totalRecords} records from ${successfulTables} tables`);

      const backupJson = JSON.stringify(backupData, null, 2);
      const backupBlob = new Blob([backupJson], { type: 'application/json' });
      const backupSize = backupBlob.size;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `backup_${timestamp}.json`;

      console.log(`[ServerBackup] uploading ${filename} (${(backupSize / 1024).toFixed(1)} KB)...`);

      const uploadResult = await supabase.storage
        .from('backups')
        .upload(filename, backupBlob, {
          contentType: 'application/json',
          upsert: false,
        });

      console.log('[ServerBackup] upload result:', JSON.stringify(uploadResult));

      if (uploadResult.error) {
        throw new Error(`${uploadResult.error.message} (status: ${(uploadResult.error as any).statusCode})`);
      }

      console.log('[ServerBackup] upload SUCCESS - path:', uploadResult.data?.path);

      await supabase.from('settings').update({ last_backup_date: new Date().toISOString() }).eq('id', 1);

      const executionTime = ((Date.now() - startTime) / 1000).toFixed(2);

      setSuccess(true);
      setBackupResult({
        filename,
        size: backupSize,
        size_mb: (backupSize / (1024 * 1024)).toFixed(2),
        total_records: totalRecords,
        tables_count: successfulTables,
        execution_time: `${executionTime} seconds`,
        created_at: backupData.metadata.created_at,
        download_url: `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/backups/${filename}`,
        backup_data: backupData,
      });

      await loadBackupHistory();

      showAlert(
        language === 'ar'
          ? `تم رفع النسخة الاحتياطية بنجاح!\n\nالملف: ${filename}\nعدد السجلات: ${totalRecords.toLocaleString()}\nوقت التنفيذ: ${executionTime} ثانية`
          : `Backup uploaded successfully!\n\nFile: ${filename}\nTotal Records: ${totalRecords.toLocaleString()}\nExecution Time: ${executionTime}s`,
        'success'
      );
    } catch (err) {
      console.error('[ServerBackup] FAILED:', err);
      const errorMsg = err instanceof Error ? err.message : (language === 'ar' ? 'حدث خطأ أثناء إنشاء النسخة الاحتياطية' : 'Error creating backup');
      setError(errorMsg);
      showAlert(language === 'ar' ? `فشل رفع النسخة الاحتياطية\n\n${errorMsg}` : `Backup Failed\n\n${errorMsg}`, 'error');
    } finally {
      setServerLoading(false);
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
      showAlert(language === 'ar' ? 'فشل تحميل النسخة الاحتياطية' : 'Failed to download backup', 'error');
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const restoreFromFile = (file: File) => {
    setPendingFile(file);
    setConfirmModal({
      message: language === 'ar'
        ? 'تحذير: استعادة النسخة الاحتياطية ستقوم بتحديث البيانات الحالية. هل تريد المتابعة؟'
        : 'Warning: Restoring a backup will update current data. Continue?',
      onConfirm: () => executeFileRestore(file),
    });
  };

  const executeFileRestore = async (file: File) => {
    setConfirmModal(null);
    setPendingFile(null);
    setRestoreLoading(true);
    setError('');
    setSuccessMessage('');
    setRestoreProgress(language === 'ar' ? 'جاري قراءة الملف...' : 'Reading file...');

    try {
      const text = await file.text();
      const backupData = JSON.parse(text);

      if (!backupData.data || !backupData.metadata) {
        throw new Error(language === 'ar' ? 'ملف النسخة الاحتياطية غير صالح' : 'Invalid backup file format');
      }

      await performRestore(backupData);
    } catch (err) {
      console.error('Restore error:', err);
      let errorMsg = '';
      if (err instanceof SyntaxError) {
        errorMsg = language === 'ar' ? 'الملف ليس بتنسيق JSON صحيح' : 'File is not valid JSON';
      } else {
        errorMsg = err instanceof Error ? err.message : (language === 'ar' ? 'فشل استعادة النسخة الاحتياطية' : 'Restore failed');
      }
      setError(errorMsg);
      showAlert(language === 'ar' ? `فشل استعادة النسخة الاحتياطية\n\n${errorMsg}` : `Restore Failed\n\n${errorMsg}`, 'error');
    } finally {
      setRestoreLoading(false);
      setRestoreProgress('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const restoreFromServer = (filename: string) => {
    setConfirmModal({
      message: language === 'ar'
        ? `تحذير: استعادة النسخة "${filename}" ستقوم بتحديث البيانات الحالية. هل تريد المتابعة؟`
        : `Warning: Restoring "${filename}" will update current data. Continue?`,
      onConfirm: () => executeServerRestore(filename),
    });
  };

  const executeServerRestore = async (filename: string) => {
    setConfirmModal(null);
    setRestoreLoading(true);
    setError('');
    setSuccessMessage('');
    setRestoreProgress(language === 'ar' ? 'جاري تحميل الملف من السيرفر...' : 'Downloading from server...');

    try {
      const { data, error } = await supabase.storage.from('backups').download(filename);
      if (error) throw new Error(language === 'ar' ? 'فشل تحميل الملف' : 'Failed to download file');

      const text = await data.text();
      const backupData = JSON.parse(text);

      if (!backupData.data || !backupData.metadata) {
        throw new Error(language === 'ar' ? 'ملف النسخة الاحتياطية غير صالح' : 'Invalid backup file format');
      }

      await performRestore(backupData);
    } catch (err) {
      console.error('Server restore error:', err);
      const errorMsg = err instanceof Error ? err.message : (language === 'ar' ? 'فشل استعادة النسخة' : 'Restore failed');
      setError(errorMsg);
      showAlert(language === 'ar' ? `فشل استعادة النسخة\n\n${errorMsg}` : `Restore Failed\n\n${errorMsg}`, 'error');
    } finally {
      setRestoreLoading(false);
      setRestoreProgress('');
    }
  };

  const performRestore = async (backupData: any) => {
    const RESTORE_ORDER = [
      'settings', 'branches', 'users', 'permissions', 'employees',
      'products', 'inventory', 'customers', 'suppliers',
      'purchases', 'purchase_items', 'sales', 'sale_items',
      'partners', 'partner_contributions', 'setup_expenses',
      'operating_expenses', 'expenses',
      'cash_shifts', 'cash_transactions',
      'salla_orders', 'salla_order_items',
      'loyalty_transactions', 'audit_logs'
    ];

    setRestoreProgress(language === 'ar' ? 'جاري التحقق من صحة البيانات...' : 'Validating backup data...');

    const validationErrors: Array<{ table: string; message: string }> = [];
    let totalRecordsToRestore = 0;

    for (const table of RESTORE_ORDER) {
      const tableData = backupData.data[table];
      if (!tableData) continue;
      if (!Array.isArray(tableData)) {
        validationErrors.push({ table, message: language === 'ar' ? 'البيانات ليست مصفوفة' : 'Data is not an array' });
        continue;
      }
      totalRecordsToRestore += tableData.length;
    }

    if (validationErrors.length > 0) {
      const details = validationErrors.map(e => `• ${e.table}: ${e.message}`).join('\n');
      throw new Error(
        (language === 'ar'
          ? `فشل التحقق من صحة النسخة الاحتياطية:\n\n`
          : `Backup validation failed:\n\n`) + details
      );
    }

    if (totalRecordsToRestore === 0) {
      throw new Error(language === 'ar' ? 'النسخة الاحتياطية لا تحتوي على بيانات' : 'Backup contains no data to restore');
    }

    setRestoreProgress(language === 'ar'
      ? `جاري تنفيذ الاستعادة الذرية (${totalRecordsToRestore.toLocaleString()} سجل)...`
      : `Executing atomic restore (${totalRecordsToRestore.toLocaleString()} records)...`
    );

    const { data: result, error: rpcError } = await (supabase.rpc as any)('perform_atomic_restore', {
      p_backup: backupData,
    });

    if (rpcError) {
      throw new Error(
        (language === 'ar'
          ? 'فشلت الاستعادة الذرية — تم التراجع عن جميع التغييرات:\n\n'
          : 'Atomic restore failed — all changes have been rolled back:\n\n')
        + rpcError.message
      );
    }

    const restoreResult = result as {
      success: boolean;
      restored_tables: number;
      restored_records: number;
      failed_tables: string[];
      errors: Array<{ table: string; message: string; detail?: string }>;
      rolled_back: boolean;
    };

    if (!restoreResult.success) {
      const failedTables = Array.isArray(restoreResult.failed_tables) ? restoreResult.failed_tables : [];
      const errors = Array.isArray(restoreResult.errors) ? restoreResult.errors : [];
      const errorLines = errors.map(e => {
        let line = `• ${e.table}: ${e.message}`;
        if (e.detail) line += `\n  ${e.detail}`;
        return line;
      }).join('\n\n');

      throw new Error(
        (language === 'ar'
          ? `فشلت الاستعادة الذرية\n\nالجداول التي فشلت (${failedTables.length}):\n`
          : `Atomic restore failed\n\nFailed tables (${failedTables.length}):\n`)
        + (failedTables.length > 0 ? failedTables.map(t => `• ${t}`).join('\n') : '')
        + (errorLines ? `\n\n${language === 'ar' ? 'تفاصيل الأخطاء:' : 'Error details:'}\n${errorLines}` : '')
      );
    }

    const successMsg = language === 'ar'
      ? `تم استعادة النسخة الاحتياطية بالكامل بنجاح!\n\nالسجلات: ${restoreResult.restored_records.toLocaleString()}\nالجداول: ${restoreResult.restored_tables}`
      : `Backup restored completely!\n\nRecords: ${restoreResult.restored_records.toLocaleString()}\nTables: ${restoreResult.restored_tables}`;

    setSuccessMessage(successMsg);
    setSuccess(true);

    showAlert(
      language === 'ar'
        ? `نجحت الاستعادة الذرية!\n\nعدد السجلات: ${restoreResult.restored_records.toLocaleString()}\nعدد الجداول: ${restoreResult.restored_tables}\nالاستعادة كانت 100% أو 0% — لا استعادة جزئية`
        : `Atomic restore succeeded!\n\nRecords Restored: ${restoreResult.restored_records.toLocaleString()}\nTables Restored: ${restoreResult.restored_tables}\nRestore was 100% or 0% — no partial restore`,
      'success'
    );
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
      {alertModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-start gap-3 mb-6">
              {alertModal.type === 'success' && <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />}
              {alertModal.type === 'error' && <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />}
              {alertModal.type === 'info' && <AlertCircle className="w-6 h-6 text-blue-500 flex-shrink-0 mt-0.5" />}
              <p className="text-gray-900 font-medium leading-relaxed whitespace-pre-line">{alertModal.message}</p>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setAlertModal(null)}
                className={`px-5 py-2.5 text-white rounded-lg transition font-medium ${
                  alertModal.type === 'success' ? 'bg-green-600 hover:bg-green-700' :
                  alertModal.type === 'error' ? 'bg-red-600 hover:bg-red-700' :
                  'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {language === 'ar' ? 'موافق' : 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-start gap-3 mb-6">
              <AlertCircle className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-gray-900 font-medium leading-relaxed">{confirmModal.message}</p>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => {
                  setConfirmModal(null);
                  setPendingFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition font-medium"
              >
                {language === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={confirmModal.onConfirm}
                className="px-5 py-2.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition font-medium"
              >
                {language === 'ar' ? 'متابعة' : 'Continue'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-6">
        <div className="flex items-center gap-3">
          <Database className="w-8 h-8 text-teal-600" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {language === 'ar' ? 'النسخ الاحتياطي' : 'Backup System'}
            </h1>
            <p className="text-gray-600">
              {language === 'ar'
                ? 'إنشاء وإدارة النسخ الاحتياطية لجميع بيانات النظام'
                : 'Create and manage backups for all system data'}
            </p>
          </div>
        </div>
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={createLocalBackup}
            disabled={localLoading}
            className={`flex items-center justify-center gap-2 py-4 px-6 rounded-lg font-medium transition ${
              localLoading
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800'
            }`}
          >
            {localLoading ? (
              <>
                <Loader className="w-5 h-5 animate-spin" />
                {language === 'ar' ? 'جاري الحفظ...' : 'Saving...'}
              </>
            ) : (
              <>
                <Download className="w-5 h-5" />
                {language === 'ar' ? 'حفظ على الكمبيوتر' : 'Save to Computer'}
              </>
            )}
          </button>

          <button
            type="button"
            onClick={createServerBackup}
            disabled={serverLoading}
            className={`flex items-center justify-center gap-2 py-4 px-6 rounded-lg font-medium transition ${
              serverLoading
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-gradient-to-r from-teal-600 to-teal-700 text-white hover:from-teal-700 hover:to-teal-800'
            }`}
          >
            {serverLoading ? (
              <>
                <Loader className="w-5 h-5 animate-spin" />
                {language === 'ar' ? 'جاري الحفظ...' : 'Saving...'}
              </>
            ) : (
              <>
                <HardDrive className="w-5 h-5" />
                {language === 'ar' ? 'حفظ على السيرفر' : 'Save to Server'}
              </>
            )}
          </button>
        </div>

        <p className="text-xs text-center text-gray-500 mt-4">
          {language === 'ar'
            ? 'النسخ المحفوظة على السيرفر يمكن الوصول إليها من أي جهاز'
            : 'Backups saved to server can be accessed from any device'}
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <RotateCcw className="w-6 h-6 text-amber-600" />
            {language === 'ar' ? 'استعادة نسخة احتياطية' : 'Restore Backup'}
          </h2>
          <button
            type="button"
            onClick={() => setShowRestoreSection(!showRestoreSection)}
            className="text-sm px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition text-gray-700"
          >
            {showRestoreSection
              ? (language === 'ar' ? 'إخفاء' : 'Hide')
              : (language === 'ar' ? 'عرض خيارات الاستعادة' : 'Show Restore Options')}
          </button>
        </div>

        {showRestoreSection && (
          <div className="space-y-6">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-amber-900 space-y-1">
                  <p className="font-semibold">
                    {language === 'ar' ? 'وضع الاستعادة الذرية' : 'Atomic Restore Mode'}
                  </p>
                  <p>
                    {language === 'ar'
                      ? 'الاستعادة تعمل بمبدأ الكل أو لا شيء — إذا فشل أي جدول، يتم التراجع عن جميع التغييرات تلقائياً.'
                      : 'Restore operates on an all-or-nothing basis — if any table fails, all changes are automatically rolled back.'}
                  </p>
                </div>
              </div>
            </div>

            {restoreLoading && restoreProgress && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <Loader className="w-5 h-5 text-blue-600 animate-spin flex-shrink-0" />
                  <p className="text-sm text-blue-900 font-medium">{restoreProgress}</p>
                </div>
              </div>
            )}

            <div className="border border-gray-200 rounded-lg p-6">
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Upload className="w-5 h-5 text-blue-600" />
                {language === 'ar' ? 'استعادة من ملف على الكمبيوتر' : 'Restore from Local File'}
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                {language === 'ar'
                  ? 'اختر ملف نسخة احتياطية (JSON) من جهازك لاستعادة البيانات'
                  : 'Select a backup file (JSON) from your device to restore data'}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) restoreFromFile(file);
                }}
                disabled={restoreLoading}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={restoreLoading}
                className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-medium transition border-2 border-dashed ${
                  restoreLoading
                    ? 'bg-gray-100 border-gray-300 cursor-not-allowed text-gray-400'
                    : 'bg-white border-blue-300 text-blue-700 hover:bg-blue-50 hover:border-blue-400'
                }`}
              >
                {restoreLoading ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    {language === 'ar' ? 'جاري الاستعادة...' : 'Restoring...'}
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5" />
                    {language === 'ar' ? 'اختر ملف النسخة الاحتياطية (.json)' : 'Select Backup File (.json)'}
                  </>
                )}
              </button>
            </div>

            {backupHistory.length > 0 && (
              <div className="border border-gray-200 rounded-lg p-6">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <HardDrive className="w-5 h-5 text-teal-600" />
                  {language === 'ar' ? 'استعادة من السيرفر' : 'Restore from Server'}
                </h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {backupHistory.map((backup) => (
                    <div
                      key={backup.name}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="w-5 h-5 text-teal-600 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{backup.name}</p>
                          <p className="text-xs text-gray-500">
                            {formatDate(backup.created_at)}
                            {backup.size ? ` - ${formatBytes(backup.size)}` : ''}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => restoreFromServer(backup.name)}
                        disabled={restoreLoading}
                        className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition text-sm disabled:opacity-50"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        {language === 'ar' ? 'استعادة' : 'Restore'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-green-900 font-medium whitespace-pre-line">{successMessage}</p>
            </div>
            <button
              type="button"
              onClick={() => setSuccessMessage('')}
              className="text-green-600 hover:text-green-800 text-sm"
            >
              {language === 'ar' ? 'إغلاق' : 'Close'}
            </button>
          </div>
        </div>
      )}

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
              <h3 className="text-lg font-bold text-green-900 mb-4">
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

              {backupResult.backup_data && (
                <button
                  type="button"
                  onClick={() => downloadBackup(backupResult.backup_data, backupResult.filename)}
                  className="w-full flex items-center justify-center gap-2 bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 transition font-medium"
                >
                  <Download className="w-5 h-5" />
                  {language === 'ar' ? 'تحميل النسخة (JSON)' : 'Download Backup (JSON)'}
                </button>
              )}
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
                      <span className="text-xs text-gray-600">{formatDate(backup.created_at)}</span>
                      <span className="text-xs text-gray-600">{formatBytes(backup.size)}</span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
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
