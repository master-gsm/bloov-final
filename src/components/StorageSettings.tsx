import React, { useState, useEffect } from 'react';
import { Database, HardDrive, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import {
  setStorageProvider,
  getStorageProvider,
  isStorageConnected,
  type StorageProvider
} from '../lib/storageProvider';
import { initializeGoogleDrive, getGoogleDriveInstance } from '../lib/googleDriveStorage';

const StorageSettings: React.FC = () => {
  const { language } = useLanguage();
  const [currentProvider, setCurrentProvider] = useState<StorageProvider>(getStorageProvider());
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // إعدادات Google Drive
  const [googleClientId, setGoogleClientId] = useState(
    localStorage.getItem('googleDriveClientId') || ''
  );
  const [googleApiKey, setGoogleApiKey] = useState(
    localStorage.getItem('googleDriveApiKey') || ''
  );
  const [googleFolderId, setGoogleFolderId] = useState(
    localStorage.getItem('googleDriveFolderId') || ''
  );

  const text = {
    ar: {
      title: 'إعدادات التخزين',
      subtitle: 'اختر مكان تخزين الملفات والمرفقات',
      provider: 'مزود التخزين',
      supabase: 'Supabase (افتراضي)',
      googledrive: 'Google Drive',
      status: 'الحالة',
      connected: 'متصل',
      disconnected: 'غير متصل',
      connect: 'ربط',
      testConnection: 'اختبار الاتصال',
      save: 'حفظ',
      googleSettings: 'إعدادات Google Drive',
      clientId: 'Client ID',
      apiKey: 'API Key',
      folderId: 'معرف المجلد (اختياري)',
      folderIdHint: 'اتركه فارغاً للتخزين في المجلد الرئيسي',
      howToGet: 'كيفية الحصول على المفاتيح؟',
      instructions: 'تعليمات الإعداد',
      step1: '1. اذهب إلى Google Cloud Console',
      step2: '2. أنشئ مشروع جديد أو اختر مشروع موجود',
      step3: '3. فعّل Drive API',
      step4: '4. أنشئ Client ID (OAuth 2.0)',
      step5: '5. أنشئ API Key',
      step6: '6. الصق المفاتيح هنا',
      success: 'تم حفظ الإعدادات بنجاح',
      error: 'حدث خطأ في الحفظ',
      testSuccess: 'الاتصال ناجح!',
      testError: 'فشل الاتصال',
    },
    en: {
      title: 'Storage Settings',
      subtitle: 'Choose where to store files and attachments',
      provider: 'Storage Provider',
      supabase: 'Supabase (Default)',
      googledrive: 'Google Drive',
      status: 'Status',
      connected: 'Connected',
      disconnected: 'Disconnected',
      connect: 'Connect',
      testConnection: 'Test Connection',
      save: 'Save',
      googleSettings: 'Google Drive Settings',
      clientId: 'Client ID',
      apiKey: 'API Key',
      folderId: 'Folder ID (Optional)',
      folderIdHint: 'Leave empty to store in root folder',
      howToGet: 'How to get credentials?',
      instructions: 'Setup Instructions',
      step1: '1. Go to Google Cloud Console',
      step2: '2. Create new project or select existing',
      step3: '3. Enable Drive API',
      step4: '4. Create Client ID (OAuth 2.0)',
      step5: '5. Create API Key',
      step6: '6. Paste credentials here',
      success: 'Settings saved successfully',
      error: 'Error saving settings',
      testSuccess: 'Connection successful!',
      testError: 'Connection failed',
    },
  };

  const t = text[language];

  useEffect(() => {
    checkConnection();
  }, [currentProvider]);

  const checkConnection = async () => {
    const connected = await isStorageConnected();
    setIsConnected(connected);
  };

  const handleProviderChange = (provider: StorageProvider) => {
    setCurrentProvider(provider);
    setStorageProvider(provider);
  };

  const handleGoogleDriveConnect = async () => {
    if (!googleClientId || !googleApiKey) {
      setMessage({ type: 'error', text: 'Please enter Client ID and API Key' });
      return;
    }

    setIsLoading(true);
    setMessage(null);

    try {
      // حفظ الإعدادات
      localStorage.setItem('googleDriveClientId', googleClientId);
      localStorage.setItem('googleDriveApiKey', googleApiKey);
      if (googleFolderId) {
        localStorage.setItem('googleDriveFolderId', googleFolderId);
      }

      // تهيئة Google Drive
      const googleDrive = initializeGoogleDrive({
        clientId: googleClientId,
        apiKey: googleApiKey,
        folderId: googleFolderId || undefined,
      });

      const initialized = await googleDrive.initialize();

      if (initialized) {
        const hasAccess = await googleDrive.requestAccess();
        if (hasAccess) {
          setIsConnected(true);
          setMessage({ type: 'success', text: t.testSuccess });
        } else {
          setMessage({ type: 'error', text: t.testError });
        }
      } else {
        setMessage({ type: 'error', text: t.testError });
      }
    } catch (error) {
      console.error('Error connecting to Google Drive:', error);
      setMessage({ type: 'error', text: t.testError });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      if (currentProvider === 'googledrive') {
        await handleGoogleDriveConnect();
      } else {
        const connected = await isStorageConnected();
        if (connected) {
          setIsConnected(true);
          setMessage({ type: 'success', text: t.testSuccess });
        } else {
          setMessage({ type: 'error', text: t.testError });
        }
      }
    } catch (error) {
      setMessage({ type: 'error', text: t.testError });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">{t.title}</h2>
        <p className="text-gray-600">{t.subtitle}</p>
      </div>

      {/* Storage Provider Selection */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t.provider}
          </label>
          <div className="space-y-3">
            <label className="flex items-center p-4 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
              <input
                type="radio"
                name="provider"
                value="supabase"
                checked={currentProvider === 'supabase'}
                onChange={() => handleProviderChange('supabase')}
                className="h-4 w-4 text-blue-600"
              />
              <Database className="ml-3 h-5 w-5 text-blue-600" />
              <span className="mr-3 font-medium">{t.supabase}</span>
            </label>

            <label className="flex items-center p-4 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
              <input
                type="radio"
                name="provider"
                value="googledrive"
                checked={currentProvider === 'googledrive'}
                onChange={() => handleProviderChange('googledrive')}
                className="h-4 w-4 text-blue-600"
              />
              <HardDrive className="ml-3 h-5 w-5 text-blue-600" />
              <span className="mr-3 font-medium">{t.googledrive}</span>
            </label>
          </div>
        </div>

        {/* Connection Status */}
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center">
            {isConnected ? (
              <CheckCircle className="h-5 w-5 text-green-600 ml-2" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-600 ml-2" />
            )}
            <span className="font-medium">
              {t.status}: {isConnected ? t.connected : t.disconnected}
            </span>
          </div>
          <button
            onClick={handleTestConnection}
            disabled={isLoading}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading && <Loader2 className="animate-spin h-4 w-4 ml-2" />}
            {t.testConnection}
          </button>
        </div>
      </div>

      {/* Google Drive Settings */}
      {currentProvider === 'googledrive' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold mb-4">{t.googleSettings}</h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t.clientId} *
              </label>
              <input
                type="text"
                value={googleClientId}
                onChange={(e) => setGoogleClientId(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="123456789-abcdefg.apps.googleusercontent.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t.apiKey} *
              </label>
              <input
                type="text"
                value={googleApiKey}
                onChange={(e) => setGoogleApiKey(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="AIzaSyXXXXXXXXXXXXXXXXXXXXX"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t.folderId}
              </label>
              <input
                type="text"
                value={googleFolderId}
                onChange={(e) => setGoogleFolderId(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="1ABC2DEF3GHI4JKL5MNO"
              />
              <p className="text-sm text-gray-500 mt-1">{t.folderIdHint}</p>
            </div>
          </div>

          {/* Instructions */}
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <h4 className="font-medium text-blue-900 mb-2">{t.instructions}</h4>
            <ol className="text-sm text-blue-800 space-y-1">
              <li>{t.step1}: <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="underline">console.cloud.google.com</a></li>
              <li>{t.step2}</li>
              <li>{t.step3}</li>
              <li>{t.step4}</li>
              <li>{t.step5}</li>
              <li>{t.step6}</li>
            </ol>
          </div>

          <button
            onClick={handleGoogleDriveConnect}
            disabled={isLoading || !googleClientId || !googleApiKey}
            className="w-full mt-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
          >
            {isLoading && <Loader2 className="inline animate-spin h-4 w-4 ml-2" />}
            {t.connect}
          </button>
        </div>
      )}

      {/* Messages */}
      {message && (
        <div
          className={`mt-4 p-4 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800'
              : 'bg-red-50 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
};

export default StorageSettings;
