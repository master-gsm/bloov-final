import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, MapPin, Phone, User, Calendar, Building2, CheckCircle, Loader2, Settings2, DollarSign } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useLanguage } from '../contexts/LanguageContext';

interface Branch {
  id: string;
  name: string;
  code: string;
  location: string | null;
  city: string | null;
  phone: string | null;
  manager_id: string | null;
  is_active: boolean;
  opening_date: string;
  metadata: any;
  created_at: string;
  updated_at: string;
  manager?: { full_name: string };
  settings?: BranchSettings | null;
  has_cash_register?: boolean;
}

interface BranchSettings {
  tax_rate: number;
  invoice_prefix: string;
  invoice_number_format: string;
  currency: string;
  allow_credit_sales: boolean;
  allow_discount: boolean;
  max_discount_percent: number;
}

interface UserRecord {
  id: string;
  full_name: string;
  role: string;
}

interface OnboardingStatus {
  branch_settings: boolean;
  cash_register: boolean;
}

export default function Branches() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [onboardingStatus, setOnboardingStatus] = useState<OnboardingStatus | null>(null);
  const { language } = useLanguage();

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    location: '',
    city: '',
    phone: '',
    manager_id: '',
    is_active: true,
    opening_date: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    loadBranches();
    loadUsers();
  }, []);

  useEffect(() => {
    if (successMessage || errorMessage) {
      const t = setTimeout(() => {
        setSuccessMessage(null);
        setErrorMessage(null);
      }, 5000);
      return () => clearTimeout(t);
    }
  }, [successMessage, errorMessage]);

  const loadBranches = async () => {
    try {
      setLoading(true);
      const { data: branchData, error } = await supabase
        .from('branches')
        .select(`
          *,
          manager:users!branches_manager_id_fkey(full_name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const branchIds = (branchData || []).map((b: any) => b.id);

      const [settingsRes, crRes] = await Promise.all([
        supabase.from('branch_settings').select('*').in('branch_id', branchIds),
        supabase.from('cash_registers').select('id, branch_id').in('branch_id', branchIds),
      ]);

      const settingsMap: Record<string, BranchSettings> = {};
      (settingsRes.data || []).forEach((s: any) => { settingsMap[s.branch_id] = s; });

      const crSet = new Set((crRes.data || []).map((r: any) => r.branch_id));

      const enriched = (branchData || []).map((b: any) => ({
        ...b,
        settings: settingsMap[b.id] ?? null,
        has_cash_register: crSet.has(b.id),
      }));

      setBranches(enriched as Branch[]);
    } catch (error: any) {
      console.error('Error loading branches:', error);
      setErrorMessage(language === 'ar' ? 'خطأ في تحميل الفروع' : 'Error loading branches');
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, role')
        .eq('is_active', true)
        .in('role', ['admin', 'manager'])
        .order('full_name');

      if (error) throw error;
      setUsers(data || []);
    } catch (error: any) {
      console.error('Error loading users:', error);
    }
  };

  const verifyOnboarding = async (branchId: string): Promise<OnboardingStatus> => {
    const [settingsRes, crRes] = await Promise.all([
      supabase.from('branch_settings').select('id').eq('branch_id', branchId).maybeSingle(),
      supabase.from('cash_registers').select('id').eq('branch_id', branchId).maybeSingle(),
    ]);

    return {
      branch_settings: !!settingsRes.data,
      cash_register: !!crRes.data,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setOnboardingStatus(null);

    try {
      if (editingBranch) {
        const { error } = await supabase
          .from('branches')
          .update(formData)
          .eq('id', editingBranch.id);

        if (error) throw error;
        setSuccessMessage(language === 'ar' ? 'تم تحديث الفرع بنجاح' : 'Branch updated successfully');
      } else {
        const { data: inserted, error } = await supabase
          .from('branches')
          .insert([formData])
          .select('id')
          .single();

        if (error) throw error;

        const status = await verifyOnboarding(inserted.id);
        setOnboardingStatus(status);

        const allOk = status.branch_settings && status.cash_register;
        setSuccessMessage(
          language === 'ar'
            ? `تم إنشاء الفرع وتهيئته بنجاح${allOk ? ' — إعدادات الفرع وسجل الصندوق جاهزان' : ''}`
            : `Branch created and initialized${allOk ? ' — settings and cash register are ready' : ''}`
        );
      }

      setShowForm(false);
      setEditingBranch(null);
      resetForm();
      loadBranches();
    } catch (error: any) {
      console.error('Error saving branch:', error);
      setErrorMessage(error.message || (language === 'ar' ? 'خطأ في حفظ الفرع' : 'Error saving branch'));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (branch: Branch) => {
    setEditingBranch(branch);
    setFormData({
      name: branch.name,
      code: branch.code,
      location: branch.location || '',
      city: branch.city || '',
      phone: branch.phone || '',
      manager_id: branch.manager_id || '',
      is_active: branch.is_active,
      opening_date: branch.opening_date,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(language === 'ar' ? 'هل أنت متأكد من حذف هذا الفرع؟' : 'Are you sure you want to delete this branch?')) {
      return;
    }

    try {
      const { error } = await supabase.from('branches').delete().eq('id', id);
      if (error) throw error;
      setSuccessMessage(language === 'ar' ? 'تم حذف الفرع بنجاح' : 'Branch deleted successfully');
      loadBranches();
    } catch (error: any) {
      console.error('Error deleting branch:', error);
      setErrorMessage(error.message || (language === 'ar' ? 'خطأ في حذف الفرع' : 'Error deleting branch'));
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      code: '',
      location: '',
      city: '',
      phone: '',
      manager_id: '',
      is_active: true,
      opening_date: new Date().toISOString().split('T')[0],
    });
    setEditingBranch(null);
    setOnboardingStatus(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          {language === 'ar' ? 'جاري التحميل...' : 'Loading...'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">
          {language === 'ar' ? 'إدارة الفروع' : 'Branch Management'}
        </h2>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          {language === 'ar' ? 'إضافة فرع' : 'Add Branch'}
        </button>
      </div>

      {successMessage && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">
          <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
          <span className="text-sm font-medium">{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
          <span className="text-sm font-medium">{errorMessage}</span>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Building2 className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">
                  {editingBranch
                    ? (language === 'ar' ? 'تعديل فرع' : 'Edit Branch')
                    : (language === 'ar' ? 'إضافة فرع جديد' : 'Add New Branch')}
                </h3>
                {!editingBranch && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {language === 'ar'
                      ? 'سيتم إنشاء صندوق نقدي وإعدادات الفرع تلقائياً'
                      : 'A cash register and branch settings will be created automatically'}
                  </p>
                )}
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {language === 'ar' ? 'اسم الفرع' : 'Branch Name'} *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {language === 'ar' ? 'رمز الفرع' : 'Branch Code'} *
                  </label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {language === 'ar' ? 'المدينة' : 'City'}
                  </label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {language === 'ar' ? 'رقم الهاتف' : 'Phone Number'}
                  </label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {language === 'ar' ? 'مدير الفرع' : 'Branch Manager'}
                  </label>
                  <select
                    value={formData.manager_id}
                    onChange={(e) => setFormData({ ...formData, manager_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">{language === 'ar' ? 'اختر مدير' : 'Select Manager'}</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>{user.full_name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {language === 'ar' ? 'تاريخ الافتتاح' : 'Opening Date'}
                  </label>
                  <input
                    type="date"
                    value={formData.opening_date}
                    onChange={(e) => setFormData({ ...formData, opening_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {language === 'ar' ? 'العنوان' : 'Address'}
                </label>
                <textarea
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="rounded border-gray-300 text-blue-600"
                />
                <label htmlFor="is_active" className="text-sm font-medium text-gray-700">
                  {language === 'ar' ? 'فرع نشط' : 'Active Branch'}
                </label>
              </div>

              {!editingBranch && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm font-semibold text-blue-800 mb-2">
                    {language === 'ar' ? 'سيتم تهيئة الفرع تلقائياً بـ:' : 'Branch will be automatically initialized with:'}
                  </p>
                  <ul className="space-y-1 text-sm text-blue-700">
                    <li className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-blue-500" />
                      {language === 'ar' ? 'إعدادات الفرع (ضريبة 15%، عملة SAR، صيغة فاتورة)' : 'Branch settings (15% VAT, SAR currency, invoice format)'}
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-blue-500" />
                      {language === 'ar' ? 'صندوق نقدي مغلق جاهز للفتح' : 'Closed cash register ready to open'}
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-blue-500" />
                      {language === 'ar' ? 'تسجيل عملية الإنشاء في سجل المراجعة' : 'Creation event logged in audit trail'}
                    </li>
                  </ul>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setEditingBranch(null); resetForm(); }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  disabled={saving}
                >
                  {language === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {saving
                    ? (language === 'ar' ? 'جاري الحفظ...' : 'Saving...')
                    : editingBranch
                      ? (language === 'ar' ? 'تحديث' : 'Update')
                      : (language === 'ar' ? 'إنشاء الفرع' : 'Create Branch')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {branches.map((branch) => (
          <div
            key={branch.id}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 leading-tight">{branch.name}</h3>
                  <span className="bg-gray-100 px-2 py-0.5 rounded font-mono text-xs text-gray-500">{branch.code}</span>
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => handleEdit(branch)}
                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                  title={language === 'ar' ? 'تعديل' : 'Edit'}
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                {branch.code !== 'MAIN' && (
                  <button
                    onClick={() => handleDelete(branch.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                    title={language === 'ar' ? 'حذف' : 'Delete'}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-2 text-sm text-gray-600">
              {branch.city && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
                  <span>{branch.city}</span>
                </div>
              )}

              {branch.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-gray-400 shrink-0" />
                  <span dir="ltr">{branch.phone}</span>
                </div>
              )}

              {branch.manager && (
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-gray-400 shrink-0" />
                  <span>{branch.manager.full_name}</span>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
                <span>
                  {language === 'ar' ? 'افتتح في:' : 'Opened:'}{' '}
                  {new Date(branch.opening_date).toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-US')}
                </span>
              </div>

              {branch.location && (
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs text-gray-400">{branch.location}</p>
                </div>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between gap-2 flex-wrap">
              <span className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full ${
                branch.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {branch.is_active
                  ? (language === 'ar' ? 'نشط' : 'Active')
                  : (language === 'ar' ? 'غير نشط' : 'Inactive')}
              </span>

              <div className="flex items-center gap-2">
                {branch.settings && (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-600 text-xs rounded-full"
                    title={language === 'ar' ? 'الإعدادات مهيأة' : 'Settings configured'}
                  >
                    <Settings2 className="w-3 h-3" />
                    {`${Math.round(branch.settings.tax_rate * 100)}% VAT`}
                  </span>
                )}
                {branch.has_cash_register && (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-600 text-xs rounded-full"
                    title={language === 'ar' ? 'الصندوق النقدي موجود' : 'Cash register exists'}
                  >
                    <DollarSign className="w-3 h-3" />
                    {language === 'ar' ? 'صندوق' : 'Register'}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {branches.length === 0 && (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <Building2 className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          <p className="text-gray-400 font-medium">
            {language === 'ar' ? 'لا توجد فروع مضافة' : 'No branches added yet'}
          </p>
        </div>
      )}
    </div>
  );
}
