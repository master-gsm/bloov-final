import { useState, useEffect } from 'react';
import { Database, Download, HardDrive, Clock, FileText, AlertCircle, CheckCircle, Loader, Cloud, Settings as SettingsIcon, Link as LinkIcon } from 'lucide-react';
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
  google_drive_upload?: {
    success: boolean;
    fileId?: string;
    error?: string;
  };
}

interface BackupHistory {
  name: string;
  created_at: string;
  size: number;
}

interface GoogleDriveSettings {
  enabled: boolean;
  folderId: string;
  connected: boolean;
  clientId: string;
  clientSecret: string;
}

export default function Backup() {
  const { t, language } = useLanguage();
  const [localLoading, setLocalLoading] = useState(false);
  const [serverLoading, setServerLoading] = useState(false);
  const [googleDriveLoading, setGoogleDriveLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState(false);
  const [backupResult, setBackupResult] = useState<BackupResult | null>(null);
  const [backupHistory, setBackupHistory] = useState<BackupHistory[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [googleDrive, setGoogleDrive] = useState<GoogleDriveSettings>({
    enabled: false,
    folderId: '',
    connected: false,
    clientId: '',
    clientSecret: '',
  });
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    loadBackupHistory();
    loadGoogleDriveSettings();
  }, []);

  const loadGoogleDriveSettings = async () => {
    try {
      const { data } = await supabase
        .from('settings')
        .select('google_drive_enabled, google_drive_folder_id, google_drive_credentials, google_drive_client_id, google_drive_client_secret')
        .single();

      if (data) {
        setGoogleDrive({
          enabled: data.google_drive_enabled || false,
          folderId: data.google_drive_folder_id || '',
          connected: !!data.google_drive_credentials,
          clientId: data.google_drive_client_id || '',
          clientSecret: data.google_drive_client_secret || '',
        });
      }
    } catch (err) {
      console.error('Error loading Google Drive settings:', err);
    }
  };

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

  const connectGoogleDrive = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        alert(language === 'ar' ? 'يجب تسجيل الدخول أولاً' : 'Please login first');
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-drive-auth?action=get-auth-url`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
        }
      );

      console.log('Response status:', response.status);
      const result = await response.json();
      console.log('Auth URL response:', result);

      if (!result.success || !response.ok) {
        const errorMsg = result.error || (language === 'ar' ? 'فشل في الحصول على رابط المصادقة' : 'Failed to get auth URL');
        console.error('Failed to get auth URL:', errorMsg);
        alert(errorMsg);
        return;
      }

      const width = 600;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;

      const authWindow = window.open(
        result.auth_url,
        'Google Drive Auth',
        `width=${width},height=${height},left=${left},top=${top}`
      );

      const messageHandler = (event: MessageEvent) => {
        if (event.origin !== import.meta.env.VITE_SUPABASE_URL.replace('//', '//').split('/')[0] + '//' + import.meta.env.VITE_SUPABASE_URL.replace('//', '//').split('/')[2]) {
          return;
        }

        if (event.data.success) {
          setGoogleDrive(prev => ({ ...prev, connected: true }));
          alert(language === 'ar' ? 'تم الربط بنجاح مع Google Drive' : 'Successfully connected to Google Drive');
          loadGoogleDriveSettings();
        } else if (event.data.error) {
          alert((language === 'ar' ? 'فشل الربط: ' : 'Connection failed: ') + event.data.error);
        }

        window.removeEventListener('message', messageHandler);
      };

      window.addEventListener('message', messageHandler);

      const checkClosed = setInterval(() => {
        if (authWindow?.closed) {
          clearInterval(checkClosed);
          window.removeEventListener('message', messageHandler);
        }
      }, 500);
    } catch (err) {
      console.error('Error connecting Google Drive:', err);
      alert(language === 'ar' ? 'حدث خطأ أثناء الربط' : 'Error during connection');
    }
  };

  const disconnectGoogleDrive = async () => {
    if (!confirm(language === 'ar' ? 'هل تريد فصل الاتصال مع Google Drive؟' : 'Disconnect from Google Drive?')) {
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        alert(language === 'ar' ? 'يجب تسجيل الدخول أولاً' : 'Please login first');
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-drive-auth?action=disconnect`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
        }
      );

      const result = await response.json();

      if (result.success) {
        setGoogleDrive(prev => ({ ...prev, enabled: false, connected: false }));
        alert(language === 'ar' ? 'تم فصل الاتصال بنجاح' : 'Disconnected successfully');
        loadGoogleDriveSettings();
      } else {
        alert(result.error || (language === 'ar' ? 'فشل فصل الاتصال' : 'Failed to disconnect'));
      }
    } catch (err) {
      console.error('Error disconnecting:', err);
      alert(language === 'ar' ? 'حدث خطأ أثناء فصل الاتصال' : 'Error during disconnection');
    }
  };

  const saveGoogleDriveSettings = async () => {
    if (!googleDrive.clientId || !googleDrive.clientSecret) {
      alert(language === 'ar' ? 'يرجى إدخال Client ID و Client Secret' : 'Please enter Client ID and Client Secret');
      return;
    }

    setSavingSettings(true);
    try {
      const { error } = await supabase
        .from('settings')
        .update({
          google_drive_client_id: googleDrive.clientId,
          google_drive_client_secret: googleDrive.clientSecret,
        })
        .eq('id', 1);

      if (error) throw error;

      alert(language === 'ar' ? 'تم حفظ معلومات OAuth بنجاح. يمكنك الآن ربط حسابك' : 'OAuth credentials saved successfully. You can now connect your account');
    } catch (err) {
      console.error('Error saving settings:', err);
      alert(language === 'ar' ? 'فشل حفظ الإعدادات' : 'Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const saveBackupSettings = async () => {
    setSavingSettings(true);
    try {
      const { error } = await supabase
        .from('settings')
        .update({
          google_drive_enabled: googleDrive.enabled,
          google_drive_folder_id: googleDrive.folderId,
        })
        .eq('id', 1);

      if (error) throw error;

      alert(language === 'ar' ? 'تم حفظ إعدادات النسخ الاحتياطي' : 'Backup settings saved');
    } catch (err) {
      console.error('Error saving backup settings:', err);
      alert(language === 'ar' ? 'فشل حفظ الإعدادات' : 'Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const uploadToGoogleDrive = async () => {
    if (!googleDrive.connected) {
      alert(language === 'ar' ? 'يجب ربط حساب Google Drive أولاً' : 'Please connect Google Drive first');
      return;
    }

    setGoogleDriveLoading(true);
    setError('');
    setSuccess(false);
    setBackupResult(null);

    try {
      console.log('Starting Google Drive backup...');

      const TABLES_TO_BACKUP = [
        'users', 'branches', 'products', 'inventory', 'customers',
        'suppliers', 'sales', 'sale_items', 'purchases', 'purchase_items',
        'partners', 'partner_contributions', 'employees', 'setup_expenses',
        'operating_expenses', 'cash_shifts', 'cash_transactions',
        'expenses', 'settings', 'permissions', 'salla_orders',
        'salla_order_items', 'loyalty_transactions', 'customer_tags',
        'audit_logs'
      ];

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

      console.log('Fetching data from tables...');
      for (const table of TABLES_TO_BACKUP) {
        try {
          const { data, error } = await supabase.from(table).select('*');

          if (error) {
            console.warn(`Error loading ${table}:`, error);
            continue;
          }

          if (data && data.length > 0) {
            backupData.data[table] = data;
            totalRecords += data.length;
            successfulTables++;
          }
        } catch (err) {
          console.warn(`Error loading ${table}:`, err);
        }
      }

      console.log(`Backup created: ${totalRecords} records from ${successfulTables} tables`);

      backupData.metadata.total_records = totalRecords;
      backupData.metadata.tables_count = successfulTables;

      const backupJson = JSON.stringify(backupData, null, 2);
      const backupSize = new Blob([backupJson]).size;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `backup_${timestamp}.json`;

      console.log('Fetching Google Drive credentials...');
      const { data: settings, error: settingsError } = await supabase
        .from('settings')
        .select('google_drive_credentials, google_drive_folder_id')
        .single();

      if (settingsError) {
        console.error('Settings error:', settingsError);
        throw new Error(language === 'ar' ? 'فشل جلب إعدادات Google Drive' : 'Failed to fetch Google Drive settings');
      }

      if (!settings || !settings.google_drive_credentials) {
        console.error('No credentials found');
        throw new Error(language === 'ar' ? 'لم يتم العثور على بيانات Google Drive. يرجى ربط الحساب مرة أخرى' : 'Google Drive credentials not found. Please reconnect');
      }

      const credentials = settings.google_drive_credentials;
      console.log('Credentials found, access_token:', credentials.access_token ? 'exists' : 'missing');

      if (!credentials.access_token) {
        throw new Error(language === 'ar' ? 'رمز الوصول غير موجود. يرجى ربط الحساب مرة أخرى' : 'Access token missing. Please reconnect');
      }

      const folderId = settings.google_drive_folder_id || '';

      const metadata = {
        name: filename,
        parents: folderId ? [folderId] : [],
        mimeType: 'application/json',
      };

      const boundary = '-------314159265358979323846';
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelimiter = `\r\n--${boundary}--`;

      const multipartRequestBody =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        backupJson +
        closeDelimiter;

      console.log('Uploading to Google Drive...');
      const uploadResponse = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${credentials.access_token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body: multipartRequestBody,
        }
      );

      console.log('Upload response status:', uploadResponse.status);

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error('Upload error response:', errorText);

        let errorMessage = language === 'ar' ? 'فشل رفع النسخة إلى Google Drive' : 'Failed to upload to Google Drive';

        if (uploadResponse.status === 401) {
          errorMessage = language === 'ar'
            ? 'انتهت صلاحية الاتصال. يرجى ربط الحساب مرة أخرى'
            : 'Connection expired. Please reconnect your account';
        } else if (uploadResponse.status === 403) {
          errorMessage = language === 'ar'
            ? 'ليس لديك صلاحية الوصول. تحقق من الأذونات'
            : 'Access denied. Check permissions';
        } else if (uploadResponse.status === 404) {
          errorMessage = language === 'ar'
            ? 'المجلد غير موجود. تحقق من معرف المجلد'
            : 'Folder not found. Check folder ID';
        }

        throw new Error(`${errorMessage} (Status: ${uploadResponse.status})`);
      }

      const uploadResult = await uploadResponse.json();
      console.log('Upload successful! File ID:', uploadResult.id);

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
        google_drive_upload: {
          success: true,
          fileId: uploadResult.id,
        },
      });

      alert(language === 'ar'
        ? `تم رفع النسخة الاحتياطية بنجاح إلى Google Drive!\n\nاسم الملف: ${filename}\nالحجم: ${(backupSize / 1024).toFixed(2)} KB\nعدد السجلات: ${totalRecords}`
        : `Backup uploaded successfully to Google Drive!\n\nFilename: ${filename}\nSize: ${(backupSize / 1024).toFixed(2)} KB\nRecords: ${totalRecords}`
      );
    } catch (err) {
      console.error('Google Drive upload error:', err);
      const errorMessage = err instanceof Error ? err.message : (language === 'ar' ? 'حدث خطأ أثناء رفع النسخة إلى Google Drive' : 'Error uploading to Google Drive');
      setError(errorMessage);
      alert(errorMessage);
    } finally {
      setGoogleDriveLoading(false);
    }
  };

  const createLocalBackup = async () => {
    setLocalLoading(true);
    setError('');
    setSuccess(false);
    setBackupResult(null);

    try {
      const TABLES_TO_BACKUP = [
        'users', 'branches', 'products', 'inventory', 'customers',
        'suppliers', 'sales', 'sale_items', 'purchases', 'purchase_items',
        'partners', 'partner_contributions', 'employees', 'setup_expenses',
        'operating_expenses', 'cash_shifts', 'cash_transactions',
        'expenses', 'settings', 'permissions', 'salla_orders',
        'salla_order_items', 'loyalty_transactions', 'customer_tags',
        'audit_logs'
      ];

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
          const { data, error } = await supabase.from(table).select('*');

          if (error) {
            console.warn(`Error loading ${table}:`, error);
            continue;
          }

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
    } catch (err) {
      console.error('Backup error:', err);
      setError(err instanceof Error ? err.message : (language === 'ar' ? 'حدث خطأ أثناء إنشاء النسخة الاحتياطية' : 'Error creating backup'));
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
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error(language === 'ar' ? 'يجب تسجيل الدخول أولاً' : 'Not authenticated');
      }

      console.log('Creating server backup with token:', session.access_token.substring(0, 20) + '...');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-backup`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
        }
      );

      console.log('Response status:', response.status);
      const result = await response.json();
      console.log('Backup response:', result);

      if (!response.ok || !result.success) {
        throw new Error(result.error || (language === 'ar' ? 'فشل إنشاء النسخة الاحتياطية' : 'Failed to create backup'));
      }

      setSuccess(true);
      setBackupResult(result.data);
      await loadBackupHistory();
    } catch (err) {
      console.error('Backup error:', err);
      setError(err instanceof Error ? err.message : (language === 'ar' ? 'حدث خطأ أثناء إنشاء النسخة الاحتياطية' : 'Error creating backup'));
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
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <Database className="w-8 h-8 text-teal-600" />
            <h1 className="text-3xl font-bold text-gray-900">
              {language === 'ar' ? 'النسخ الاحتياطي' : 'Backup System'}
            </h1>
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg transition"
          >
            <SettingsIcon className="w-5 h-5" />
            {language === 'ar' ? 'إعدادات Google Drive' : 'Google Drive Settings'}
          </button>
        </div>
        <p className="text-gray-600">
          {language === 'ar'
            ? 'إنشاء وإدارة النسخ الاحتياطية لجميع بيانات النظام'
            : 'Create and manage backups for all system data'}
        </p>
      </div>

      {showSettings && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Cloud className="w-6 h-6 text-blue-600" />
            {language === 'ar' ? 'إعدادات Google Drive' : 'Google Drive Settings'}
          </h2>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-blue-900 mb-2">
              <strong>{language === 'ar' ? 'خطوات الإعداد:' : 'Setup Steps:'}</strong>
            </p>
            <ol className="text-sm text-blue-800 space-y-1" style={{ listStylePosition: 'inside' }}>
              <li>{language === 'ar' ? '1. اذهب إلى' : '1. Go to'} <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">Google Cloud Console</a></li>
              <li>{language === 'ar' ? '2. أنشئ مشروع جديد أو اختر مشروع موجود' : '2. Create a new project or select existing one'}</li>
              <li>{language === 'ar' ? '3. فعّل Google Drive API' : '3. Enable Google Drive API'}</li>
              <li>{language === 'ar' ? '4. أنشئ OAuth 2.0 Client credentials' : '4. Create OAuth 2.0 Client credentials'}</li>
              <li>{language === 'ar' ? '5. أضف Authorized redirect URI:' : '5. Add Authorized redirect URI:'} <code className="bg-white px-2 py-0.5 rounded text-xs">{import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-drive-auth?action=callback</code></li>
              <li>{language === 'ar' ? '6. انسخ Client ID و Client Secret وأدخلهما أدناه' : '6. Copy Client ID and Client Secret and enter them below'}</li>
            </ol>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {language === 'ar' ? 'Google Client ID' : 'Google Client ID'}
                <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={googleDrive.clientId}
                onChange={(e) => setGoogleDrive({ ...googleDrive, clientId: e.target.value })}
                placeholder="123456789.apps.googleusercontent.com"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {language === 'ar' ? 'Google Client Secret' : 'Google Client Secret'}
                <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={googleDrive.clientSecret}
                onChange={(e) => setGoogleDrive({ ...googleDrive, clientSecret: e.target.value })}
                placeholder="GOCSPX-xxxxxxxxxxxxxxxxxxxxx"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              onClick={saveGoogleDriveSettings}
              disabled={savingSettings || !googleDrive.clientId || !googleDrive.clientSecret}
              className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition disabled:bg-gray-300"
            >
              {savingSettings
                ? (language === 'ar' ? 'جاري الحفظ...' : 'Saving...')
                : (language === 'ar' ? 'حفظ معلومات OAuth' : 'Save OAuth Credentials')}
            </button>

            <div className="border-t border-gray-200 my-4"></div>

            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-gray-900">
                  {language === 'ar' ? 'حالة الاتصال' : 'Connection Status'}
                </p>
                <p className="text-sm text-gray-600">
                  {googleDrive.connected
                    ? (language === 'ar' ? 'متصل' : 'Connected')
                    : (language === 'ar' ? 'غير متصل' : 'Not connected')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!googleDrive.connected && (
                  <button
                    onClick={connectGoogleDrive}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                  >
                    <LinkIcon className="w-4 h-4" />
                    {language === 'ar' ? 'ربط الحساب' : 'Connect Account'}
                  </button>
                )}
                {googleDrive.connected && (
                  <>
                    <CheckCircle className="w-6 h-6 text-green-600" />
                    <button
                      onClick={connectGoogleDrive}
                      className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition text-sm"
                    >
                      {language === 'ar' ? 'إعادة الربط' : 'Reconnect'}
                    </button>
                    <button
                      onClick={disconnectGoogleDrive}
                      className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition text-sm"
                    >
                      {language === 'ar' ? 'فصل الاتصال' : 'Disconnect'}
                    </button>
                  </>
                )}
              </div>
            </div>

            {googleDrive.connected && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-gray-700">
                  <strong>{language === 'ar' ? 'ملاحظة:' : 'Note:'}</strong>{' '}
                  {language === 'ar'
                    ? 'إذا ظهر خطأ "رمز التوصيل غير موجود"، اضغط على زر "إعادة الربط" لتجديد الاتصال بحساب Google Drive'
                    : 'If you see "Access token missing" error, click "Reconnect" to refresh the connection to Google Drive'}
                </p>
              </div>
            )}

            <div>
              <label className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  checked={googleDrive.enabled}
                  onChange={(e) => setGoogleDrive({ ...googleDrive, enabled: e.target.checked })}
                  className="w-4 h-4"
                  disabled={!googleDrive.connected}
                />
                <span className="font-medium text-gray-900">
                  {language === 'ar' ? 'تفعيل الرفع التلقائي إلى Google Drive' : 'Enable auto-upload to Google Drive'}
                </span>
              </label>
              <p className="text-sm text-gray-600 mr-6">
                {language === 'ar'
                  ? 'عند تفعيل هذا الخيار، سيتم رفع نسخة من كل backup إلى Google Drive تلقائياً'
                  : 'When enabled, a copy of each backup will be automatically uploaded to Google Drive'}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {language === 'ar' ? 'معرّف المجلد (اختياري)' : 'Folder ID (Optional)'}
              </label>
              <input
                type="text"
                value={googleDrive.folderId}
                onChange={(e) => setGoogleDrive({ ...googleDrive, folderId: e.target.value })}
                placeholder={language === 'ar' ? 'اتركه فارغاً للحفظ في الجذر' : 'Leave empty to save in root'}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                disabled={!googleDrive.connected}
              />
              <p className="text-xs text-gray-500 mt-1">
                {language === 'ar'
                  ? 'يمكنك الحصول على معرف المجلد من رابط URL للمجلد في Google Drive'
                  : 'You can get the folder ID from the URL of the folder in Google Drive'}
              </p>
            </div>

            <button
              onClick={saveBackupSettings}
              disabled={savingSettings || !googleDrive.connected}
              className="w-full bg-teal-600 text-white py-2 rounded-lg hover:bg-teal-700 transition disabled:bg-gray-300"
            >
              {savingSettings
                ? (language === 'ar' ? 'جاري الحفظ...' : 'Saving...')
                : (language === 'ar' ? 'حفظ إعدادات النسخ الاحتياطي' : 'Save Backup Settings')}
            </button>

            {googleDrive.connected && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm text-gray-700 mb-3">
                  {language === 'ar'
                    ? 'لتجربة رفع نسخة احتياطية إلى Google Drive الآن:'
                    : 'To test uploading a backup to Google Drive now:'}
                </p>
                <button
                  onClick={uploadToGoogleDrive}
                  disabled={googleDriveLoading}
                  className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-medium transition ${
                    googleDriveLoading
                      ? 'bg-gray-300 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {googleDriveLoading ? (
                    <>
                      <Loader className="w-5 h-5 animate-spin" />
                      {language === 'ar' ? 'جاري الرفع...' : 'Uploading...'}
                    </>
                  ) : (
                    <>
                      <Cloud className="w-5 h-5" />
                      {language === 'ar' ? 'رفع نسخة احتياطية إلى Google Drive' : 'Upload Backup to Google Drive'}
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

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

              {backupResult.google_drive_upload && (
                <div className={`p-4 rounded-lg mb-4 ${
                  backupResult.google_drive_upload.success
                    ? 'bg-green-100 border border-green-300'
                    : 'bg-yellow-100 border border-yellow-300'
                }`}>
                  <div className="flex items-center gap-2">
                    <Cloud className={`w-5 h-5 ${
                      backupResult.google_drive_upload.success ? 'text-green-700' : 'text-yellow-700'
                    }`} />
                    <span className={`font-medium ${
                      backupResult.google_drive_upload.success ? 'text-green-900' : 'text-yellow-900'
                    }`}>
                      {backupResult.google_drive_upload.success
                        ? (language === 'ar' ? 'تم رفع النسخة إلى Google Drive بنجاح' : 'Successfully uploaded to Google Drive')
                        : (language === 'ar' ? 'فشل الرفع إلى Google Drive: ' : 'Google Drive upload failed: ') + (backupResult.google_drive_upload.error || '')}
                    </span>
                  </div>
                </div>
              )}

              {backupResult.backup_data && (
                <div className="space-y-2">
                  <button
                    onClick={() => downloadBackup(backupResult.backup_data, backupResult.filename)}
                    className="w-full flex items-center justify-center gap-2 bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 transition font-medium"
                  >
                    <Download className="w-5 h-5" />
                    {language === 'ar' ? 'تحميل النسخة (JSON)' : 'Download Backup (JSON)'}
                  </button>
                </div>
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
