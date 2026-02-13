import { useEffect, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useCanEdit } from '../hooks/useCanEdit';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Users, Plus, Search, Edit, Trash2, X, Phone, Mail, MapPin, Download } from 'lucide-react';

interface Customer {
  id: string;
  code: string;
  name: string;
  name_ar: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  address_ar: string | null;
  city: string | null;
  city_ar: string | null;
  notes: string | null;
  notes_ar: string | null;
  credit_limit: number;
  current_balance: number;
  is_active: boolean;
  created_at: string;
}

const emptyForm = {
  code: '',
  name: '',
  name_ar: '',
  email: '',
  phone: '',
  address: '',
  address_ar: '',
  city: '',
  city_ar: '',
  notes: '',
  notes_ar: '',
  credit_limit: 0,
};

export function Customers() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const canEdit = useCanEdit();
  const isRTL = language === 'ar';
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (data) setCustomers(data);
    } catch (err) {
      console.error('Error loading customers:', err);
    } finally {
      setLoading(false);
    }
  };

  const generateCode = () => {
    const num = customers.length + 1;
    return `CUST-${String(num).padStart(4, '0')}`;
  };

  const openAddModal = () => {
    setEditingCustomer(null);
    setFormData({ ...emptyForm, code: generateCode() });
    setError('');
    setShowModal(true);
  };

  const openEditModal = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({
      code: customer.code,
      name: customer.name,
      name_ar: customer.name_ar || '',
      email: customer.email || '',
      phone: customer.phone || '',
      address: customer.address || '',
      address_ar: customer.address_ar || '',
      city: customer.city || '',
      city_ar: customer.city_ar || '',
      notes: customer.notes || '',
      notes_ar: customer.notes_ar || '',
      credit_limit: customer.credit_limit,
    });
    setError('');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const payload = {
        code: formData.code,
        name: formData.name,
        name_ar: formData.name_ar || null,
        email: formData.email || null,
        phone: formData.phone || null,
        address: formData.address || null,
        address_ar: formData.address_ar || null,
        city: formData.city || null,
        city_ar: formData.city_ar || null,
        notes: formData.notes || null,
        notes_ar: formData.notes_ar || null,
        credit_limit: formData.credit_limit,
        created_by: user?.id,
      };

      if (editingCustomer) {
        const { error } = await supabase
          .from('customers')
          .update(payload)
          .eq('id', editingCustomer.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('customers')
          .insert(payload);
        if (error) throw error;
      }

      setShowModal(false);
      loadCustomers();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('customers').update({ is_active: false }).eq('id', id);
      if (error) throw error;
      setDeleteConfirm(null);
      loadCustomers();
    } catch (err) {
      console.error('Error deleting customer:', err);
    }
  };

  const filtered = customers.filter((c) => {
    if (!c.is_active) return false;
    const s = searchTerm.toLowerCase();
    return (
      c.name.toLowerCase().includes(s) ||
      (c.name_ar && c.name_ar.includes(searchTerm)) ||
      c.code.toLowerCase().includes(s) ||
      (c.phone && c.phone.includes(s)) ||
      (c.email && c.email.toLowerCase().includes(s))
    );
  });

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat(isRTL ? 'ar-SA' : 'en-US', {
      style: 'decimal',
      minimumFractionDigits: 2,
    }).format(amount);

  const exportToExcel = () => {
    const activeCustomers = customers.filter((c) => c.is_active);
    const headers = ['Code', 'Name', 'Name (Arabic)', 'Email', 'Phone', 'City', 'Credit Limit', 'Balance'];
    const rows = activeCustomers.map((c) => [
      c.code,
      c.name,
      c.name_ar || '',
      c.email || '',
      c.phone || '',
      c.city || c.city_ar || '',
      c.credit_limit.toString(),
      c.current_balance.toString(),
    ]);

    const BOM = '\uFEFF';
    const csvContent = BOM + [headers.join(','), ...rows.map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `BLOOV_Customers_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-gray-600">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('nav.customers')}</h2>
          <p className="text-gray-500 mt-1">{isRTL ? 'إدارة بيانات العملاء' : 'Manage customer information'}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={exportToExcel}
            className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2.5 rounded-lg hover:bg-gray-200 transition font-medium"
          >
            <Download className="w-5 h-5" />
            {isRTL ? 'تصدير Excel' : 'Export Excel'}
          </button>
          {canEdit && (
            <button
              onClick={openAddModal}
              className="flex items-center gap-2 bg-teal-600 text-white px-4 py-2.5 rounded-lg hover:bg-teal-700 transition font-medium"
            >
              <Plus className="w-5 h-5" />
              {isRTL ? 'إضافة عميل' : 'Add Customer'}
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder={t('common.search')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Users className="w-16 h-16 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">{isRTL ? 'لا يوجد عملاء' : 'No customers found'}</p>
            <p className="text-sm mt-1">{isRTL ? 'أضف عميل جديد للبدء' : 'Add a new customer to get started'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((customer) => (
              <div key={customer.id} className="border border-gray-200 rounded-xl p-5 hover:shadow-md transition group">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-gray-900">
                      {isRTL ? customer.name_ar || customer.name : customer.name}
                    </h3>
                    <p className="text-xs text-gray-400 font-mono">{customer.code}</p>
                  </div>
                  {canEdit && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button
                        onClick={() => openEditModal(customer)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(customer.id)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5 text-sm text-gray-600">
                  {customer.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-gray-400" />
                      <span dir="ltr">{customer.phone}</span>
                    </div>
                  )}
                  {customer.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-gray-400" />
                      <span>{customer.email}</span>
                    </div>
                  )}
                  {(customer.city || customer.city_ar) && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-gray-400" />
                      <span>{isRTL ? customer.city_ar || customer.city : customer.city}</span>
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-400">{isRTL ? 'الرصيد' : 'Balance'}</p>
                    <p className={`font-bold ${customer.current_balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatCurrency(customer.current_balance)} {isRTL ? 'ر.س' : 'SAR'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">{isRTL ? 'حد الائتمان' : 'Credit Limit'}</p>
                    <p className="font-medium text-gray-700">{formatCurrency(customer.credit_limit)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 text-center">
            <Trash2 className="w-12 h-12 text-red-500 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              {isRTL ? 'تأكيد الحذف' : 'Confirm Delete'}
            </h3>
            <p className="text-gray-500 mb-6 text-sm">
              {isRTL ? 'هل أنت متأكد من حذف هذا العميل؟' : 'Are you sure you want to delete this customer?'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 bg-red-600 text-white py-2.5 rounded-lg hover:bg-red-700 transition font-medium"
              >
                {isRTL ? 'حذف' : 'Delete'}
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-lg hover:bg-gray-200 transition font-medium"
              >
                {isRTL ? 'إلغاء' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-xl">
              <h3 className="text-xl font-bold text-gray-900">
                {editingCustomer
                  ? (isRTL ? 'تعديل العميل' : 'Edit Customer')
                  : (isRTL ? 'إضافة عميل جديد' : 'Add New Customer')}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isRTL ? 'الكود' : 'Code'}
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    disabled={!canEdit}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent font-mono"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isRTL ? 'حد الائتمان' : 'Credit Limit'}
                  </label>
                  <input
                    type="number"
                    value={formData.credit_limit}
                    onChange={(e) => setFormData({ ...formData, credit_limit: parseFloat(e.target.value) || 0 })}
                    disabled={!canEdit}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isRTL ? 'الاسم (إنجليزي)' : 'Name (English)'}
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    disabled={!canEdit}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isRTL ? 'الاسم (عربي)' : 'Name (Arabic)'}
                  </label>
                  <input
                    type="text"
                    value={formData.name_ar}
                    onChange={(e) => setFormData({ ...formData, name_ar: e.target.value })}
                    disabled={!canEdit}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    dir="rtl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isRTL ? 'البريد الإلكتروني' : 'Email'}
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    disabled={!canEdit}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isRTL ? 'الهاتف' : 'Phone'}
                  </label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    disabled={!canEdit}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isRTL ? 'المدينة (إنجليزي)' : 'City (English)'}
                  </label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    disabled={!canEdit}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isRTL ? 'المدينة (عربي)' : 'City (Arabic)'}
                  </label>
                  <input
                    type="text"
                    value={formData.city_ar}
                    onChange={(e) => setFormData({ ...formData, city_ar: e.target.value })}
                    disabled={!canEdit}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    dir="rtl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isRTL ? 'العنوان (إنجليزي)' : 'Address (English)'}
                  </label>
                  <textarea
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    disabled={!canEdit}
                    rows={2}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isRTL ? 'العنوان (عربي)' : 'Address (Arabic)'}
                  </label>
                  <textarea
                    value={formData.address_ar}
                    onChange={(e) => setFormData({ ...formData, address_ar: e.target.value })}
                    disabled={!canEdit}
                    rows={2}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
                    dir="rtl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isRTL ? 'ملاحظات' : 'Notes'}
                </label>
                <textarea
                  value={isRTL ? formData.notes_ar : formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, [isRTL ? 'notes_ar' : 'notes']: e.target.value })
                  }
                  disabled={!canEdit}
                  rows={2}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                {canEdit && (
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 bg-teal-600 text-white py-2.5 rounded-lg hover:bg-teal-700 transition disabled:opacity-50 font-medium"
                  >
                    {submitting
                      ? (isRTL ? 'جاري الحفظ...' : 'Saving...')
                      : (isRTL ? 'حفظ' : 'Save')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-lg hover:bg-gray-200 transition font-medium"
                >
                  {isRTL ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
