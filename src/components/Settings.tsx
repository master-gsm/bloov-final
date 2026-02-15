import { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useOffline } from '../contexts/OfflineContext';
import { supabase } from '../lib/supabase';
import {
  Settings as SettingsIcon, Globe, Building2, Shield, Save, Receipt,
  Truck, Heart, Bell, Package, CreditCard, FileText, QrCode, CheckCircle, Loader2,
  Database, Download, Upload, HardDrive, Clock, Wifi, WifiOff, RefreshCw, FolderOpen, AlertCircle, MessageSquare, Brain, Sparkles
} from 'lucide-react';
import { createBackup, downloadBackupAsJSON, downloadBackupAsExcel, restoreFromBackup, getLastBackupTime } from '../lib/backup';
import { useAutoBackup } from '../hooks/useAutoBackup';
import { diskBackupManager } from '../lib/diskBackup';
import BackupSettings from './BackupSettings';
import { ResetTestDatabaseButton } from './ResetTestDatabaseButton';

type SettingsMap = Record<string, string>;

const TABS = ['business', 'tax', 'invoice', 'pos', 'inventory', 'loyalty', 'sms', 'ai', 'backup', 'language'] as const;
type Tab = typeof TABS[number];

export function Settings() {
  const { language, setLanguage } = useLanguage();
  const { user } = useAuth();
  const { isOnline, isSyncing, pendingOperationsCount, lastBackupTime, syncNow } = useOffline();
  const isRTL = language === 'ar';

  const [settings, setSettings] = useState<SettingsMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('business');

  const [backupInProgress, setBackupInProgress] = useState(false);
  const [restoreInProgress, setRestoreInProgress] = useState(false);
  const [backupMessage, setBackupMessage] = useState('');
  const [diskBackupPath, setDiskBackupPath] = useState<string | null>(null);
  const [selectingFolder, setSelectingFolder] = useState(false);
  const [isElectronAvailable, setIsElectronAvailable] = useState(false);

  const autoBackupSettings = {
    enabled: settings['auto_backup_enabled'] === 'true',
    intervalMinutes: parseInt(settings['auto_backup_interval'] || '60'),
    savePath: settings['backup_path'],
    saveToFileSystem: settings['backup_to_filesystem'] === 'true',
    saveToLocalStorage: settings['backup_to_localstorage'] === 'true',
  };

  const { lastBackup, isBackingUp, performBackup } = useAutoBackup(autoBackupSettings);

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    try {
      const { data: keyValueSettings, error: kvError } = await supabase.from('settings').select('key, value');
      const { data: globalSettings, error: gsError } = await supabase
        .from('settings')
        .select('salla_api_key, business_whatsapp, sms_api_key, sms_sender_id, sms_provider_url, sms_provider_name, sms_enabled, ai_enabled, ai_api_key, ai_model, ai_provider')
        .eq('id', 1)
        .maybeSingle();

      if (kvError && kvError.code !== 'PGRST116') throw kvError;

      const map: SettingsMap = {};
      keyValueSettings?.forEach(row => { map[row.key] = row.value; });

      if (globalSettings) {
        if (globalSettings.salla_api_key) map['salla_api_key'] = globalSettings.salla_api_key;
        if (globalSettings.business_whatsapp) map['business_whatsapp'] = globalSettings.business_whatsapp;
        if (globalSettings.sms_api_key) map['sms_api_key'] = globalSettings.sms_api_key;
        if (globalSettings.sms_sender_id) map['sms_sender_id'] = globalSettings.sms_sender_id;
        if (globalSettings.sms_provider_url) map['sms_provider_url'] = globalSettings.sms_provider_url;
        if (globalSettings.sms_provider_name) map['sms_provider_name'] = globalSettings.sms_provider_name;
        map['sms_enabled'] = globalSettings.sms_enabled ? 'true' : 'false';
        if (globalSettings.ai_api_key) map['ai_api_key'] = globalSettings.ai_api_key;
        if (globalSettings.ai_model) map['ai_model'] = globalSettings.ai_model;
        if (globalSettings.ai_provider) map['ai_provider'] = globalSettings.ai_provider;
        map['ai_enabled'] = globalSettings.ai_enabled ? 'true' : 'false';
      }

      setSettings(map);
    } catch (err) {
      console.error('Error loading settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = (key: string, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const globalSettingsKeys = ['salla_api_key', 'business_whatsapp', 'sms_api_key', 'sms_sender_id', 'sms_provider_url', 'sms_provider_name', 'sms_enabled', 'ai_enabled', 'ai_api_key', 'ai_model', 'ai_provider'];
      const globalSettingsUpdate: any = {};
      const keyValueUpdates: any[] = [];

      Object.entries(settings).forEach(([key, value]) => {
        if (globalSettingsKeys.includes(key)) {
          if (key === 'sms_enabled' || key === 'ai_enabled') {
            globalSettingsUpdate[key] = value === 'true';
          } else {
            globalSettingsUpdate[key] = value;
          }
        } else {
          keyValueUpdates.push({
            key,
            value,
            updated_by: user?.id,
            updated_at: new Date().toISOString(),
          });
        }
      });

      if (Object.keys(globalSettingsUpdate).length > 0) {
        await supabase
          .from('settings')
          .update(globalSettingsUpdate)
          .eq('id', 1);
      }

      for (const update of keyValueUpdates) {
        await supabase
          .from('settings')
          .upsert(update, { onConflict: 'key' });
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('Error saving settings:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleManualBackup = async (format: 'json' | 'excel') => {
    setBackupInProgress(true);
    setBackupMessage('');
    try {
      const backup = await createBackup();
      if (format === 'json') {
        downloadBackupAsJSON(backup);
        setBackupMessage(isRTL ? 'تم إنشاء النسخة الاحتياطية بنجاح (JSON)' : 'Backup created successfully (JSON)');
      } else {
        downloadBackupAsExcel(backup);
        setBackupMessage(isRTL ? 'تم إنشاء النسخة الاحتياطية بنجاح (Excel/CSV)' : 'Backup created successfully (Excel/CSV)');
      }
    } catch (err: any) {
      setBackupMessage(isRTL ? `خطأ: ${err.message}` : `Error: ${err.message}`);
    } finally {
      setBackupInProgress(false);
    }
  };

  const handleRestore = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setRestoreInProgress(true);
    setBackupMessage('');

    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      const result = await restoreFromBackup(backup);

      if (result.success) {
        setBackupMessage(isRTL ? 'تم استعادة النسخة الاحتياطية بنجاح' : 'Backup restored successfully');
        setTimeout(() => window.location.reload(), 2000);
      } else {
        setBackupMessage(isRTL
          ? `تمت الاستعادة مع أخطاء: ${result.errors.join(', ')}`
          : `Restored with errors: ${result.errors.join(', ')}`);
      }
    } catch (err: any) {
      setBackupMessage(isRTL ? `خطأ في الاستعادة: ${err.message}` : `Restore error: ${err.message}`);
    } finally {
      setRestoreInProgress(false);
      event.target.value = '';
    }
  };

  const handleSelectBackupFolder = async () => {
    setSelectingFolder(true);
    setBackupMessage('');
    try {
      const result = await diskBackupManager.selectBackupDirectory();
      if (result.success && result.path) {
        setDiskBackupPath(result.path);
        await diskBackupManager.setBackupPath(result.path);
        setBackupMessage(isRTL
          ? `تم اختيار المجلد: ${result.path}`
          : `Folder selected: ${result.path}`);
      } else if (result.error) {
        setBackupMessage(result.error);
      } else {
        setBackupMessage(isRTL
          ? 'تم إلغاء اختيار المجلد'
          : 'Folder selection cancelled');
      }
    } catch (err: any) {
      setBackupMessage(isRTL ? `خطأ: ${err.message}` : `Error: ${err.message}`);
    } finally {
      setSelectingFolder(false);
    }
  };

  const handleDiskBackup = async () => {
    setBackupInProgress(true);
    setBackupMessage('');
    try {
      const result = await diskBackupManager.performBackup();
      if (result.success) {
        setBackupMessage(isRTL
          ? `تم حفظ النسخة الاحتياطية في: ${result.path}`
          : `Backup saved to: ${result.path}`);
      } else {
        setBackupMessage(isRTL ? `خطأ: ${result.error}` : `Error: ${result.error}`);
      }
    } catch (err: any) {
      setBackupMessage(isRTL ? `خطأ: ${err.message}` : `Error: ${err.message}`);
    } finally {
      setBackupInProgress(false);
    }
  };

  const handleSyncNow = async () => {
    setBackupMessage('');
    try {
      await syncNow();
      setBackupMessage(isRTL
        ? 'تمت المزامنة بنجاح'
        : 'Sync completed successfully');
    } catch (err: any) {
      setBackupMessage(isRTL ? `خطأ في المزامنة: ${err.message}` : `Sync error: ${err.message}`);
    }
  };

  useEffect(() => {
    setIsElectronAvailable(!!window.electron);
    diskBackupManager.getBackupPath().then(path => {
      if (path) setDiskBackupPath(path);
    });
  }, []);

  const tabConfig: Record<Tab, { icon: typeof Building2; label: string; labelAr: string }> = {
    business: { icon: Building2, label: 'Business Info', labelAr: 'معلومات الشركة' },
    tax: { icon: FileText, label: 'Tax & ZATCA', labelAr: 'الضريبة وهيئة الزكاة' },
    invoice: { icon: Receipt, label: 'Invoice', labelAr: 'الفواتير' },
    pos: { icon: CreditCard, label: 'POS & Payments', labelAr: 'نقاط البيع والدفع' },
    inventory: { icon: Package, label: 'Inventory', labelAr: 'المخزون' },
    loyalty: { icon: Heart, label: 'Loyalty', labelAr: 'الولاء' },
    sms: { icon: MessageSquare, label: 'SMS Gateway', labelAr: 'الرسائل النصية' },
    ai: { icon: Brain, label: 'AI Analysis', labelAr: 'التحليل الذكي' },
    backup: { icon: Database, label: 'Backup & Restore', labelAr: 'النسخ الاحتياطي' },
    language: { icon: Globe, label: 'Language', labelAr: 'اللغة والعرض' },
  };

  const renderInput = (key: string, label: string, labelAr: string, opts?: { type?: string; placeholder?: string; dir?: string }) => (
    <div key={key}>
      <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? labelAr : label}</label>
      <input
        type={opts?.type || 'text'}
        value={settings[key] || ''}
        onChange={(e) => updateSetting(key, e.target.value)}
        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
        placeholder={opts?.placeholder}
        dir={opts?.dir || (isRTL ? 'rtl' : 'ltr')}
      />
    </div>
  );

  const renderToggle = (key: string, label: string, labelAr: string, description?: string, descriptionAr?: string) => (
    <div key={key} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition">
      <div>
        <p className="text-sm font-medium text-gray-900">{isRTL ? labelAr : label}</p>
        {(description || descriptionAr) && (
          <p className="text-xs text-gray-500 mt-0.5">{isRTL ? descriptionAr : description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => updateSetting(key, settings[key] === 'true' ? 'false' : 'true')}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition overflow-hidden ${settings[key] === 'true' ? 'bg-teal-600' : 'bg-gray-300'}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition ${settings[key] === 'true' ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  );

  const renderSelect = (key: string, label: string, labelAr: string, options: { value: string; label: string; labelAr: string }[]) => (
    <div key={key}>
      <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? labelAr : label}</label>
      <select
        value={settings[key] || ''}
        onChange={(e) => updateSetting(key, e.target.value)}
        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{isRTL ? opt.labelAr : opt.label}</option>
        ))}
      </select>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-16 h-16 border-4 border-teal-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{isRTL ? 'الإعدادات' : 'Settings'}</h2>
          <p className="text-gray-500 mt-1">{isRTL ? 'إعدادات النظام والتحكم بالبرنامج' : 'System settings and program controls'}</p>
        </div>
        <button
          onClick={saveSettings}
          disabled={saving}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition ${
            saved
              ? 'bg-green-600 text-white'
              : 'bg-teal-600 text-white hover:bg-teal-700'
          } disabled:opacity-50`}
        >
          {saving ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> {isRTL ? 'جاري الحفظ...' : 'Saving...'}</>
          ) : saved ? (
            <><CheckCircle className="w-5 h-5" /> {isRTL ? 'تم الحفظ' : 'Saved'}</>
          ) : (
            <><Save className="w-5 h-5" /> {isRTL ? 'حفظ الإعدادات' : 'Save Settings'}</>
          )}
        </button>
      </div>

      <div className="flex gap-2 border-b overflow-x-auto pb-px">
        {TABS.map(tab => {
          const config = tabConfig[tab];
          const Icon = config.icon;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition whitespace-nowrap ${
                activeTab === tab
                  ? 'border-teal-600 text-teal-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {isRTL ? config.labelAr : config.label}
            </button>
          );
        })}
      </div>

      <div className="space-y-6">
        {activeTab === 'business' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
              <h3 className="text-lg font-bold text-gray-900">{isRTL ? 'معلومات الشركة' : 'Company Information'}</h3>
              {renderInput('company_name', 'Company Name', 'اسم الشركة', { dir: 'ltr' })}
              {renderInput('company_name_ar', 'Company Name (Arabic)', 'اسم الشركة (عربي)', { dir: 'rtl' })}
              {renderInput('business_name', 'Business/Brand Name', 'اسم المحل/العلامة التجارية', { dir: 'ltr' })}
              {renderInput('business_name_ar', 'Business Name (Arabic)', 'اسم المحل (عربي)', { dir: 'rtl' })}
              {renderInput('business_type', 'Business Type', 'نوع النشاط', { dir: 'ltr' })}
              {renderInput('business_type_ar', 'Business Type (Arabic)', 'نوع النشاط (عربي)', { dir: 'rtl' })}
              {renderInput('commercial_register', 'Commercial Register', 'السجل التجاري', { dir: 'ltr' })}
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
              <h3 className="text-lg font-bold text-gray-900">{isRTL ? 'معلومات التواصل' : 'Contact Information'}</h3>
              {renderInput('business_phone', 'Phone', 'رقم الهاتف', { dir: 'ltr' })}
              <div>
                {renderInput('business_whatsapp', 'WhatsApp Number', 'رقم واتساب للتواصل', { dir: 'ltr', placeholder: '966501234567' })}
                <p className="text-xs text-gray-500 mt-1">
                  {isRTL
                    ? 'سيظهر في الفواتير المرسلة للعملاء. استخدم الرقم بصيغة دولية (مثال: 966501234567)'
                    : 'Will appear in invoices sent to customers. Use international format (e.g., 966501234567)'}
                </p>
              </div>
              {renderInput('business_address', 'Address', 'العنوان', { dir: 'ltr' })}
              {renderInput('business_address_ar', 'Address (Arabic)', 'العنوان (عربي)', { dir: 'rtl' })}
              {renderInput('business_city', 'City', 'المدينة', { dir: 'ltr' })}
              {renderInput('business_city_ar', 'City (Arabic)', 'المدينة (عربي)', { dir: 'rtl' })}
              {renderSelect('currency', 'Currency', 'العملة', [
                { value: 'SAR', label: 'Saudi Riyal (SAR)', labelAr: 'ريال سعودي (SAR)' },
                { value: 'AED', label: 'UAE Dirham (AED)', labelAr: 'درهم إماراتي (AED)' },
                { value: 'USD', label: 'US Dollar (USD)', labelAr: 'دولار أمريكي (USD)' },
              ])}
            </div>
          </div>
        )}

        {activeTab === 'tax' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2.5 bg-green-100 rounded-lg">
                  <FileText className="w-5 h-5 text-green-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">{isRTL ? 'الضريبة' : 'Tax Settings'}</h3>
              </div>
              {renderInput('tax_number', 'Tax Number (VAT)', 'الرقم الضريبي', { dir: 'ltr', placeholder: '300000000000003' })}
              {renderInput('tax_rate', 'Tax Rate (%)', 'نسبة الضريبة (%)', { type: 'number', dir: 'ltr' })}
              {renderToggle('show_tax_on_invoice', 'Show Tax on Invoice', 'عرض الضريبة في الفاتورة')}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-sm text-amber-800 font-medium">{isRTL ? 'ملاحظة' : 'Note'}</p>
                <p className="text-xs text-amber-700 mt-1">
                  {isRTL
                    ? 'الرقم الضريبي سيظهر في جميع الفواتير وفي رمز QR الخاص بهيئة الزكاة والضريبة.'
                    : 'The tax number will appear on all invoices and in the ZATCA QR code.'}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2.5 bg-teal-100 rounded-lg">
                  <QrCode className="w-5 h-5 text-teal-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">{isRTL ? 'هيئة الزكاة والضريبة والجمارك' : 'ZATCA Integration'}</h3>
              </div>
              {renderToggle('zatca_enabled', 'Enable ZATCA', 'تفعيل الربط مع الهيئة',
                'Connect to ZATCA for e-invoicing compliance', 'الربط مع هيئة الزكاة والضريبة والجمارك للفوترة الإلكترونية')}
              {renderSelect('zatca_mode', 'ZATCA Mode', 'وضع الربط', [
                { value: 'sandbox', label: 'Sandbox (Testing)', labelAr: 'اختبار (Sandbox)' },
                { value: 'simulation', label: 'Simulation', labelAr: 'محاكاة (Simulation)' },
                { value: 'production', label: 'Production', labelAr: 'إنتاج (Production)' },
              ])}
              {renderInput('zatca_otp', 'ZATCA OTP', 'رمز التحقق OTP', { dir: 'ltr' })}
              {renderSelect('invoice_type', 'Invoice Type', 'نوع الفاتورة', [
                { value: 'simplified', label: 'Simplified Tax Invoice', labelAr: 'فاتورة ضريبية مبسطة' },
                { value: 'standard', label: 'Standard Tax Invoice', labelAr: 'فاتورة ضريبية' },
              ])}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800 font-medium">{isRTL ? 'متطلبات الفوترة الإلكترونية' : 'E-invoicing Requirements'}</p>
                <ul className="text-xs text-blue-700 mt-2 space-y-1 list-disc list-inside">
                  <li>{isRTL ? 'اسم الشركة ورقم السجل التجاري' : 'Company name and commercial register'}</li>
                  <li>{isRTL ? 'الرقم الضريبي (VAT)' : 'Tax number (VAT)'}</li>
                  <li>{isRTL ? 'عنوان الشركة والمدينة' : 'Company address and city'}</li>
                  <li>{isRTL ? 'رمز QR يحتوي على بيانات ZATCA' : 'QR code with ZATCA data'}</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'invoice' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
              <h3 className="text-lg font-bold text-gray-900">{isRTL ? 'إعدادات الفاتورة' : 'Invoice Settings'}</h3>
              {renderInput('invoice_prefix', 'Invoice Prefix', 'بادئة رقم الفاتورة', { dir: 'ltr', placeholder: 'BLV' })}
              {renderToggle('auto_print_invoice', 'Auto Print Invoice', 'طباعة الفاتورة تلقائياً',
                'Automatically print invoice after sale', 'طباعة الفاتورة تلقائياً بعد إتمام البيع')}
              {renderToggle('barcode_enabled', 'Enable Barcode/QR', 'تفعيل الباركود/QR',
                'Show QR code on invoices', 'عرض رمز QR في الفواتير')}
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
              <h3 className="text-lg font-bold text-gray-900">{isRTL ? 'نص الفاتورة' : 'Invoice Text'}</h3>
              {renderInput('invoice_notes', 'Invoice Notes (English)', 'ملاحظات الفاتورة (إنجليزي)', { dir: 'ltr' })}
              {renderInput('invoice_notes_ar', 'Invoice Notes (Arabic)', 'ملاحظات الفاتورة (عربي)', { dir: 'rtl' })}
              {renderInput('receipt_footer', 'Receipt Footer (English)', 'تذييل الإيصال (إنجليزي)', { dir: 'ltr' })}
              {renderInput('receipt_footer_ar', 'Receipt Footer (Arabic)', 'تذييل الإيصال (عربي)', { dir: 'rtl' })}
            </div>
          </div>
        )}

        {activeTab === 'pos' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
              <h3 className="text-lg font-bold text-gray-900">{isRTL ? 'نقاط البيع' : 'Point of Sale'}</h3>
              {renderSelect('default_payment_method', 'Default Payment Method', 'طريقة الدفع الافتراضية', [
                { value: 'cash', label: 'Cash', labelAr: 'نقدي' },
                { value: 'card', label: 'Card', labelAr: 'بطاقة' },
                { value: 'transfer', label: 'Bank Transfer', labelAr: 'تحويل بنكي' },
              ])}
              {renderToggle('whatsapp_notifications', 'WhatsApp Notifications', 'إشعارات واتساب',
                'Send invoice via WhatsApp', 'إرسال الفاتورة عبر واتساب')}
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
              <h3 className="text-lg font-bold text-gray-900">{isRTL ? 'التوصيل والمناسبات' : 'Delivery & Events'}</h3>
              {renderToggle('delivery_enabled', 'Enable Delivery', 'تفعيل التوصيل')}
              {renderInput('default_delivery_charge', 'Default Delivery Charge', 'رسوم التوصيل الافتراضية', { type: 'number', dir: 'ltr' })}
              {renderToggle('event_orders_enabled', 'Enable Event Orders', 'تفعيل طلبات المناسبات',
                'Allow orders for weddings, birthdays, etc.', 'السماح بطلبات حفلات الزفاف وأعياد الميلاد وغيرها')}
            </div>
          </div>
        )}

        {activeTab === 'inventory' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
              <h3 className="text-lg font-bold text-gray-900">{isRTL ? 'إعدادات المخزون' : 'Inventory Settings'}</h3>
              {renderToggle('stock_alert_enabled', 'Low Stock Alerts', 'تنبيهات المخزون المنخفض',
                'Notify when stock is below threshold', 'التنبيه عندما ينخفض المخزون عن الحد الأدنى')}
              {renderInput('low_stock_threshold', 'Low Stock Threshold', 'حد المخزون المنخفض', { type: 'number', dir: 'ltr' })}
              {renderToggle('allow_negative_stock', 'Allow Negative Stock', 'السماح بمخزون سالب',
                'Allow sales when stock is zero', 'السماح بالبيع عندما يكون المخزون صفراً')}
            </div>
          </div>
        )}

        {activeTab === 'loyalty' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
              <h3 className="text-lg font-bold text-gray-900">{isRTL ? 'برنامج الولاء' : 'Loyalty Program'}</h3>
              {renderToggle('loyalty_enabled', 'Enable Loyalty Program', 'تفعيل برنامج الولاء',
                'Earn points on purchases', 'كسب نقاط على المشتريات')}
              {renderInput('loyalty_points_per_sar', 'Points per SAR', 'نقاط لكل ريال', { type: 'number', dir: 'ltr' })}
              {renderInput('loyalty_redemption_rate', 'Points for 1 SAR Discount', 'نقاط مقابل 1 ريال خصم', { type: 'number', dir: 'ltr' })}
            </div>
          </div>
        )}

        {activeTab === 'sms' && (
          <div className="grid grid-cols-1 gap-6">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6">
              <div className="flex items-start gap-3">
                <MessageSquare className="w-6 h-6 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">
                    {isRTL ? 'إعدادات بوابة الرسائل النصية' : 'SMS Gateway Configuration'}
                  </h3>
                  <p className="text-sm text-gray-600 mb-3">
                    {isRTL
                      ? 'قم بتكوين إعدادات بوابة الرسائل النصية لإرسال رسائل جماعية للعملاء عبر مزود خدمة احترافي مثل Unifonic أو Yamamah.'
                      : 'Configure SMS gateway settings to send bulk messages to customers through a professional SMS provider like Unifonic or Yamamah.'}
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs text-gray-600">
                    <span className="px-2 py-1 bg-white rounded border border-gray-200">✓ Unifonic</span>
                    <span className="px-2 py-1 bg-white rounded border border-gray-200">✓ Yamamah</span>
                    <span className="px-2 py-1 bg-white rounded border border-gray-200">✓ {isRTL ? 'مزودات أخرى' : 'Other Providers'}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
                <h3 className="text-lg font-bold text-gray-900">{isRTL ? 'الإعدادات الأساسية' : 'Basic Settings'}</h3>

                {renderToggle('sms_enabled', 'Enable SMS Feature', 'تفعيل خدمة الرسائل النصية',
                  'Enable bulk SMS messaging', 'تفعيل إرسال الرسائل النصية الجماعية')}

                {renderSelect('sms_provider_name', 'SMS Provider', 'مزود خدمة الرسائل', [
                  { value: 'Unifonic', label: 'Unifonic', labelAr: 'Unifonic' },
                  { value: 'Yamamah', label: 'Yamamah', labelAr: 'Yamamah' },
                  { value: 'Generic', label: 'Other/Generic', labelAr: 'آخر / عام' },
                ])}

                {renderInput('sms_sender_id', 'Sender ID/Name', 'اسم المرسل', {
                  dir: 'ltr',
                  placeholder: 'BLOOV'
                })}

                <div className="text-xs text-gray-500 p-3 bg-gray-50 rounded-lg">
                  <strong>{isRTL ? 'ملاحظة:' : 'Note:'}</strong> {isRTL
                    ? 'اسم المرسل هو ما يظهر للعميل عند استلام الرسالة (مثل: BLOOV). تأكد من تسجيله لدى مزود الخدمة.'
                    : 'Sender ID is what appears to customers when receiving SMS (e.g., BLOOV). Make sure it\'s registered with your provider.'}
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
                <h3 className="text-lg font-bold text-gray-900">{isRTL ? 'إعدادات API' : 'API Settings'}</h3>

                {renderInput('sms_api_key', 'API Key', 'مفتاح API', {
                  type: 'password',
                  dir: 'ltr',
                  placeholder: '••••••••••••••••'
                })}

                {renderInput('sms_provider_url', 'API Endpoint URL', 'رابط API', {
                  dir: 'ltr',
                  placeholder: 'https://api.unifonic.com/rest/SMS/messages'
                })}

                <div className="text-xs text-gray-500 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                  <AlertCircle className="w-4 h-4 inline mr-1 text-yellow-600" />
                  <strong>{isRTL ? 'مهم:' : 'Important:'}</strong> {isRTL
                    ? 'احتفظ بمفتاح API الخاص بك بشكل آمن. لا تشاركه مع أحد.'
                    : 'Keep your API key secure. Never share it with anyone.'}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">
                {isRTL ? 'إعدادات المزودات الشائعة' : 'Common Provider Settings'}
              </h3>

              <div className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                    Unifonic
                  </h4>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p><strong>{isRTL ? 'رابط API:' : 'API URL:'}</strong> <code className="bg-white px-2 py-0.5 rounded text-xs">https://api.unifonic.com/rest/SMS/messages</code></p>
                    <p><strong>{isRTL ? 'المعاملات:' : 'Parameters:'}</strong> AppSid, SenderID, Recipient, Body</p>
                  </div>
                </div>

                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                    Yamamah
                  </h4>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p><strong>{isRTL ? 'رابط API:' : 'API URL:'}</strong> <code className="bg-white px-2 py-0.5 rounded text-xs">{isRTL ? 'حسب مزود الخدمة' : 'Per provider documentation'}</code></p>
                    <p><strong>{isRTL ? 'المعاملات:' : 'Parameters:'}</strong> sender, recipient, message</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'ai' && (
          <div className="grid grid-cols-1 gap-6">
            <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
                  <Brain className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">
                    {isRTL ? 'إعدادات الذكاء الاصطناعي' : 'AI Analysis Settings'}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {isRTL ? 'تفعيل وتكوين ميزات التحليل الذكي' : 'Enable and configure AI-powered analysis features'}
                  </p>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 mb-6">
                <div className="flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-amber-900 mb-1">
                      {isRTL ? 'ماذا تحصل مع الذكاء الاصطناعي؟' : 'What You Get with AI:'}
                    </h4>
                    <ul className="text-sm text-amber-800 space-y-1 list-disc list-inside">
                      <li>{isRTL ? 'توقعات ذكية للمبيعات والمخزون' : 'Smart sales & inventory forecasts'}</li>
                      <li>{isRTL ? 'تصنيف تلقائي للمصروفات' : 'Auto-categorize expenses'}</li>
                      <li>{isRTL ? 'استعلامات باللغة الطبيعية' : 'Natural language queries'}</li>
                      <li>{isRTL ? 'تحليل العملاء وتحديد المعرضين للخطر' : 'Customer insights & at-risk detection'}</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
              <h3 className="text-lg font-bold text-gray-900">{isRTL ? 'الإعدادات الأساسية' : 'Basic Settings'}</h3>

              {renderToggle('ai_enabled', 'Enable AI Analysis', 'تفعيل التحليل الذكي',
                'Enable AI-powered features', 'تفعيل ميزات الذكاء الاصطناعي')}

              {renderSelect('ai_provider', 'AI Provider', 'مزود الذكاء الاصطناعي', [
                { value: 'openai', label: 'OpenAI' },
                { value: 'gemini', label: 'Google Gemini' },
              ])}

              {settings['ai_provider'] === 'openai' && renderSelect('ai_model', 'OpenAI Model', 'نموذج OpenAI', [
                { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Recommended)' },
                { value: 'gpt-4o', label: 'GPT-4o (Most Capable)' },
                { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
                { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo (Cheapest)' },
              ])}

              {renderInput('ai_api_key', 'API Key', 'مفتاح API', 'password', 'sk-...')}

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
                <h4 className="font-semibold text-blue-900 mb-2">
                  {isRTL ? 'كيفية الحصول على مفتاح API:' : 'How to Get API Key:'}
                </h4>
                <ol className="text-sm text-blue-800 space-y-2 list-decimal list-inside">
                  <li>
                    {isRTL ? 'اذهب إلى' : 'Go to'}{' '}
                    <a
                      href="https://platform.openai.com/api-keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline font-semibold hover:text-blue-600"
                    >
                      platform.openai.com/api-keys
                    </a>
                  </li>
                  <li>{isRTL ? 'سجل دخول أو أنشئ حساب جديد' : 'Sign in or create a new account'}</li>
                  <li>{isRTL ? 'انقر على "Create new secret key"' : 'Click "Create new secret key"'}</li>
                  <li>{isRTL ? 'انسخ المفتاح والصقه أعلاه' : 'Copy the key and paste it above'}</li>
                </ol>
                <p className="text-xs text-blue-700 mt-3">
                  {isRTL
                    ? 'ملاحظة: OpenAI تفرض رسوم بناءً على الاستخدام. GPT-4o Mini موصى به للتكلفة المناسبة.'
                    : 'Note: OpenAI charges per usage. GPT-4o Mini is recommended for cost-effectiveness.'}
                </p>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mt-4">
                <h4 className="font-semibold text-green-900 mb-2">
                  {isRTL ? 'التكلفة المتوقعة:' : 'Estimated Costs:'}
                </h4>
                <div className="text-sm text-green-800 space-y-1">
                  <p><strong>GPT-4o Mini:</strong> ~$0.01 per query (Budget-friendly)</p>
                  <p><strong>GPT-4o:</strong> ~$0.10 per query (High quality)</p>
                  <p className="text-xs mt-2">
                    {isRTL
                      ? 'هذه تقديرات تقريبية. التكلفة الفعلية تعتمد على طول وتعقيد الاستعلام.'
                      : 'These are approximate estimates. Actual costs depend on query length and complexity.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'backup' && (
          <div className="grid grid-cols-1 gap-6">
            {backupMessage && (
              <div className={`p-4 rounded-lg ${backupMessage.includes('خطأ') || backupMessage.includes('Error') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                {backupMessage}
              </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border p-6 space-y-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-100 rounded-lg">
                  <Database className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{isRTL ? 'النسخ الاحتياطي اليدوي' : 'Manual Backup'}</h3>
                  <p className="text-sm text-gray-500">{isRTL ? 'إنشاء نسخة احتياطية يدوياً' : 'Create a manual backup'}</p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => handleManualBackup('json')}
                  disabled={backupInProgress || isBackingUp}
                  className="flex-1 flex items-center justify-center gap-2 bg-teal-600 text-white px-6 py-3 rounded-lg hover:bg-teal-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download className="w-5 h-5" />
                  {backupInProgress ? (isRTL ? 'جاري النسخ...' : 'Creating...') : (isRTL ? 'تحميل (JSON)' : 'Download (JSON)')}
                </button>

                <button
                  onClick={() => handleManualBackup('excel')}
                  disabled={backupInProgress || isBackingUp}
                  className="flex-1 flex items-center justify-center gap-2 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download className="w-5 h-5" />
                  {backupInProgress ? (isRTL ? 'جاري النسخ...' : 'Creating...') : (isRTL ? 'تحميل (Excel/CSV)' : 'Download (Excel/CSV)')}
                </button>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800 font-medium">{isRTL ? 'ملاحظة' : 'Note'}</p>
                <ul className="text-xs text-blue-700 mt-2 space-y-1 list-disc list-inside">
                  <li>{isRTL ? 'JSON: صيغة كاملة تحتوي على جميع البيانات، يمكن استعادتها بالكامل' : 'JSON: Full format containing all data, can be fully restored'}</li>
                  <li>{isRTL ? 'Excel/CSV: صيغة مفتوحة للاطلاع على البيانات، لا يمكن استعادتها' : 'Excel/CSV: Open format for viewing data, cannot be restored'}</li>
                </ul>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-6 space-y-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-purple-100 rounded-lg">
                  <Upload className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{isRTL ? 'استعادة النسخة الاحتياطية' : 'Restore Backup'}</h3>
                  <p className="text-sm text-gray-500">{isRTL ? 'استعادة البيانات من نسخة احتياطية' : 'Restore data from a backup file'}</p>
                </div>
              </div>

              <div>
                <label className="flex items-center justify-center gap-2 bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                  <Upload className="w-5 h-5" />
                  {restoreInProgress ? (isRTL ? 'جاري الاستعادة...' : 'Restoring...') : (isRTL ? 'اختر ملف النسخة الاحتياطية' : 'Choose Backup File')}
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleRestore}
                    disabled={restoreInProgress}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-sm text-amber-800 font-medium">{isRTL ? 'تحذير' : 'Warning'}</p>
                <p className="text-xs text-amber-700 mt-2">
                  {isRTL
                    ? 'استعادة النسخة الاحتياطية سيؤدي إلى استبدال البيانات الحالية. تأكد من إنشاء نسخة احتياطية قبل الاستعادة.'
                    : 'Restoring a backup will replace current data. Make sure to create a backup before restoring.'}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-6 space-y-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-teal-100 rounded-lg">
                  <Clock className="w-5 h-5 text-teal-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{isRTL ? 'النسخ الاحتياطي التلقائي' : 'Automatic Backup'}</h3>
                  <p className="text-sm text-gray-500">{isRTL ? 'نسخ احتياطي تلقائي بشكل دوري' : 'Periodic automatic backup'}</p>
                </div>
              </div>

              <div className="space-y-4">
                {renderToggle('auto_backup_enabled', 'Enable Auto Backup', 'تفعيل النسخ التلقائي',
                  'Automatically backup data', 'نسخ احتياطي تلقائي للبيانات')}

                {renderInput('auto_backup_interval', 'Backup Interval (minutes)', 'فترة النسخ (بالدقائق)', { type: 'number', dir: 'ltr', placeholder: '60' })}

                {renderInput('backup_path', 'Backup Save Path', 'مسار حفظ النسخ الاحتياطية', { dir: 'ltr', placeholder: 'C:/BloovBackups' })}

                {renderToggle('backup_to_filesystem', 'Save to File System', 'الحفظ على القرص الصلب',
                  'Save backup to local computer', 'حفظ النسخة على الكمبيوتر المحلي')}

                {renderToggle('backup_to_localstorage', 'Save to Browser Storage', 'الحفظ في المتصفح',
                  'Save backup to browser storage', 'حفظ النسخة في ذاكرة المتصفح')}
              </div>

              {isBackingUp && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                  <p className="text-sm text-blue-800">{isRTL ? 'جاري إنشاء نسخة احتياطية...' : 'Creating backup...'}</p>
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800 font-medium">{isRTL ? 'إعدادات النسخ التلقائي' : 'Auto Backup Settings'}</p>
                <ul className="text-xs text-blue-700 mt-2 space-y-1 list-disc list-inside">
                  <li>{isRTL ? 'الحد الأدنى الموصى به: 5 دقائق' : 'Minimum recommended: 5 minutes'}</li>
                  <li>{isRTL ? 'للنسخ المتكرر جداً (دقيقة واحدة): قد يؤثر على الأداء' : 'For very frequent backup (1 minute): may affect performance'}</li>
                  <li>{isRTL ? 'احفظ الإعدادات بعد التعديل' : 'Save settings after modification'}</li>
                  <li>{isRTL ? 'النسخ الاحتياطي التلقائي يحفظ بصيغة JSON' : 'Auto backup saves in JSON format'}</li>
                </ul>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-6 space-y-6">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 ${isOnline ? 'bg-green-100' : 'bg-red-100'} rounded-lg`}>
                  {isOnline ? (
                    <Wifi className="w-5 h-5 text-green-600" />
                  ) : (
                    <WifiOff className="w-5 h-5 text-red-600" />
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{isRTL ? 'حالة الاتصال والأوفلاين' : 'Connection & Offline Status'}</h3>
                  <p className="text-sm text-gray-500">
                    {isRTL ? 'يعمل البرنامج أوفلاين ويزامن عند عودة الاتصال' : 'Works offline and syncs when online'}
                  </p>
                </div>
              </div>

              <div className={`p-4 rounded-lg ${isOnline ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-sm font-medium ${isOnline ? 'text-green-800' : 'text-amber-800'}`}>
                      {isOnline ? (isRTL ? 'متصل بالإنترنت' : 'Online') : (isRTL ? 'غير متصل بالإنترنت' : 'Offline')}
                    </p>
                    {!isOnline && (
                      <p className="text-xs text-amber-700 mt-1">
                        {isRTL ? 'جميع العمليات تُحفظ محلياً وسيتم رفعها عند عودة الاتصال' : 'All operations are saved locally and will sync when online'}
                      </p>
                    )}
                  </div>
                  {isOnline && (
                    <button
                      onClick={handleSyncNow}
                      disabled={isSyncing}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
                    >
                      <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                      {isSyncing ? (isRTL ? 'جاري المزامنة...' : 'Syncing...') : (isRTL ? 'مزامنة الآن' : 'Sync Now')}
                    </button>
                  )}
                </div>
              </div>

              {lastBackupTime && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm text-green-800 font-medium">{isRTL ? 'آخر نسخة احتياطية' : 'Last Backup'}</p>
                  <p className="text-xs text-green-700 mt-1">
                    {new Date(lastBackupTime).toLocaleString(isRTL ? 'ar-SA' : 'en-US', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      hour12: true
                    })}
                  </p>
                </div>
              )}

              {pendingOperationsCount > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-blue-600" />
                  <div>
                    <p className="text-sm font-medium text-blue-800">
                      {isRTL ? `${pendingOperationsCount} عملية معلقة` : `${pendingOperationsCount} pending operations`}
                    </p>
                    <p className="text-xs text-blue-700 mt-1">
                      {isRTL ? 'سيتم رفعها تلقائياً عند عودة الاتصال' : 'Will be synced automatically when online'}
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm font-medium text-gray-900">{isRTL ? '📌 العمل الأوفلاين' : '📌 Offline Mode'}</p>
                  <p className="text-xs text-gray-600 mt-1">
                    {isRTL
                      ? 'البرنامج يعمل مع أو بدون اتصال بالإنترنت. جميع العمليات تُحفظ محلياً وتُزامن تلقائياً عند عودة الاتصال.'
                      : 'The program works with or without internet connection. All operations are saved locally and synced automatically when online.'}
                  </p>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm font-medium text-gray-900">{isRTL ? '💾 النسخ الاحتياطي المحلي' : '💾 Local Backup'}</p>
                  <p className="text-xs text-gray-600 mt-1">
                    {isRTL
                      ? 'يمكنك حفظ نسخة احتياطية محلية على القرص الصلب للاحتفاظ بنسخة من بياناتك واستعادتها في حالة الحاجة.'
                      : 'You can save a local backup on your hard drive to keep a copy of your data and restore it if needed.'}
                  </p>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm font-medium text-gray-900">{isRTL ? '🔐 أمان البيانات' : '🔐 Data Security'}</p>
                  <p className="text-xs text-gray-600 mt-1">
                    {isRTL
                      ? 'جميع البيانات محمية ومشفرة. النسخ الاحتياطي المحفوظ على جهازك هو ملكك الخاص واحتفظ به في مكان آمن.'
                      : 'All data is protected and encrypted. The backup saved on your device is your own property - keep it in a safe place.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-6 space-y-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-100 rounded-lg">
                  <HardDrive className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{isRTL ? 'الحفظ على القرص الصلب' : 'Save to Hard Drive'}</h3>
                  <p className="text-sm text-gray-500">
                    {isRTL ? 'حفظ النسخ الاحتياطية على الكمبيوتر' : 'Save backups to your computer'}
                  </p>
                </div>
              </div>

              {!isElectronAvailable && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-800">
                        {isRTL ? 'تحذير: هذه الميزة تحتاج إلى تطبيق Electron' : 'Warning: This feature requires Electron app'}
                      </p>
                      <p className="text-xs text-amber-700 mt-1">
                        {isRTL
                          ? 'لاستخدام ميزة اختيار المجلد والحفظ على القرص الصلب، يجب تشغيل البرنامج كتطبيق سطح مكتب.'
                          : 'To use folder selection and save to hard drive, you must run the program as a desktop app.'}
                      </p>
                      <p className="text-xs text-amber-700 mt-2 font-mono bg-amber-100 px-2 py-1 rounded">
                        npm run electron:dev
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {diskBackupPath && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                  <p className="text-sm font-medium text-indigo-800">{isRTL ? 'مسار الحفظ الحالي:' : 'Current backup path:'}</p>
                  <p className="text-xs text-indigo-700 mt-1 font-mono break-all">{diskBackupPath}</p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleSelectBackupFolder}
                  disabled={selectingFolder}
                  className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 transition disabled:opacity-50"
                >
                  <FolderOpen className="w-5 h-5" />
                  {selectingFolder ? (isRTL ? 'جاري الاختيار...' : 'Selecting...') : (isRTL ? 'اختر المجلد' : 'Select Folder')}
                </button>

                <button
                  onClick={handleDiskBackup}
                  disabled={backupInProgress || !diskBackupPath}
                  className="flex-1 flex items-center justify-center gap-2 bg-teal-600 text-white px-6 py-3 rounded-lg hover:bg-teal-700 transition disabled:opacity-50"
                >
                  <HardDrive className="w-5 h-5" />
                  {backupInProgress ? (isRTL ? 'جاري الحفظ...' : 'Saving...') : (isRTL ? 'حفظ نسخة احتياطية' : 'Save Backup')}
                </button>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800 font-medium">{isRTL ? 'معلومات' : 'Information'}</p>
                <ul className="text-xs text-blue-700 mt-2 space-y-1 list-disc list-inside">
                  <li>{isRTL ? 'اختر المجلد الذي تريد حفظ النسخ الاحتياطية فيه' : 'Select the folder where you want to save backups'}</li>
                  <li>{isRTL ? 'يمكنك تغيير المجلد في أي وقت' : 'You can change the folder at any time'}</li>
                  <li>{isRTL ? 'النسخ الاحتياطية تُحفظ بصيغة JSON' : 'Backups are saved in JSON format'}</li>
                  <li>{isRTL ? 'المجلد الافتراضي: المستندات/BloovBackups' : 'Default folder: Documents/BloovBackups'}</li>
                </ul>
              </div>
            </div>

            <div className="bg-gradient-to-r from-red-50 to-orange-50 rounded-xl shadow-sm border-2 border-red-200 p-6 space-y-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-red-100 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-red-900">{isRTL ? 'تنظيف بيانات التجربة (Test Mode فقط)' : 'Reset Test Database (Test Mode Only)'}</h3>
                  <p className="text-sm text-red-700">
                    {isRTL ? 'حذف جميع البيانات التجريبية - للمسؤولين فقط' : 'Delete all test data - Admins only'}
                  </p>
                </div>
              </div>

              <div className="bg-red-100 border-2 border-red-300 rounded-lg p-4">
                <p className="text-sm font-bold text-red-900 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5" />
                  {isRTL ? '⚠️ تحذير شديد' : '⚠️ Critical Warning'}
                </p>
                <ul className="text-xs text-red-800 mt-2 space-y-1 list-disc list-inside">
                  <li>{isRTL ? 'هذا الإجراء سيحذف جميع البيانات بشكل نهائي' : 'This action will permanently delete all data'}</li>
                  <li>{isRTL ? 'لا يمكن التراجع بعد التنفيذ' : 'Cannot be undone after execution'}</li>
                  <li>{isRTL ? 'متاح فقط في وضع التجربة (Test Mode)' : 'Available only in Test Mode'}</li>
                  <li>{isRTL ? 'يُسجل تلقائياً في سجل الأحداث' : 'Automatically logged in audit logs'}</li>
                </ul>
              </div>

              <ResetTestDatabaseButton isRTL={isRTL} setBackupMessage={setBackupMessage} />
            </div>

            <BackupSettings />
          </div>
        )}

        {activeTab === 'language' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
              <h3 className="text-lg font-bold text-gray-900">{isRTL ? 'اللغة والعرض' : 'Language & Display'}</h3>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'اللغة' : 'Language'}</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as 'en' | 'ar')}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                >
                  <option value="ar">العربية</option>
                  <option value="en">English</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'اتجاه الصفحة' : 'Page Direction'}</label>
                <input type="text" value={isRTL ? 'من اليمين إلى اليسار (RTL)' : 'Left to Right (LTR)'} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-50" readOnly />
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
              <h3 className="text-lg font-bold text-gray-900">{isRTL ? 'معلومات الحساب' : 'Account Info'}</h3>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'البريد الإلكتروني' : 'Email'}</label>
                <input type="text" value={user?.email || ''} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-50" readOnly dir="ltr" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'الإصدار' : 'Version'}</label>
                <input type="text" value="1.0.0 - BLOOV Accounting System" className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-50" readOnly />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
