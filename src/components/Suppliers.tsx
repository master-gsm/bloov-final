import { useEffect, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useCanEdit } from '../hooks/useCanEdit';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Truck, Plus, Search, Edit, Trash2, X, Phone, Mail, MapPin, Globe, FileText, DollarSign, Save } from 'lucide-react';
import { Pagination } from './Pagination';

interface Supplier {
  id: string;
  code: string;
  name: string;
  name_ar: string | null;
  email: string | null;
  phone: string | null;
  tax_number: string | null;
  address: string | null;
  address_ar: string | null;
  city: string | null;
  city_ar: string | null;
  country: string | null;
  country_ar: string | null;
  notes: string | null;
  notes_ar: string | null;
  vat_status: string;
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
  tax_number: '',
  city_ar: '',
  country_ar: '',
  notes: '',
  notes_ar: '',
  vat_status: 'standard',
};

export function Suppliers() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const canEdit = useCanEdit();
  const isRTL = language === 'ar';
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const [statementSupplier, setStatementSupplier] = useState<Supplier | null>(null);
  const [supplierPurchases, setSupplierPurchases] = useState<any[]>([]);
  const [supplierPayments, setSupplierPayments] = useState<any[]>([]);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    loadSuppliers();
  }, [currentPage, pageSize]);

  const loadSuppliers = async () => {
    try {
      let query = supabase
        .from('suppliers')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      // Apply search filter
      if (searchTerm) {
        query = query.or(`name.ilike.%${searchTerm}%,name_ar.ilike.%${searchTerm}%,code.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`);
      }

      // Apply pagination
      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;
      if (error) throw error;
      if (data) setSuppliers(data as any[]);
      if (count !== null) setTotalCount(count);
    } catch (err) {
      console.error('Error loading suppliers:', err);
    } finally {
      setLoading(false);
    }
  };

  const generateCode = () => {
    const num = suppliers.length + 1;
    return `SUP-${String(num).padStart(4, '0')}`;
  };

  const openAddModal = () => {
    setEditingSupplier(null);
    setFormData({ ...emptyForm, code: generateCode() });
    setError('');
    setShowModal(true);
  };

  const openEditModal = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      code: supplier.code,
      name: supplier.name,
      name_ar: supplier.name_ar || '',
      email: supplier.email || '',
      phone: supplier.phone || '',
      tax_number: supplier.tax_number || '',
      city_ar: supplier.city_ar || '',
      country_ar: supplier.country_ar || '',
      notes: supplier.notes || '',
      notes_ar: supplier.notes_ar || '',
      vat_status: supplier.vat_status || 'standard',
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
        tax_number: formData.tax_number || null,
        city_ar: formData.city_ar || null,
        country_ar: formData.country_ar || null,
        notes: formData.notes || null,
        notes_ar: formData.notes_ar || null,
        vat_status: formData.vat_status || 'standard',
        created_by: user?.id,
      };

      if (editingSupplier) {
        const { error } = await supabase.from('suppliers').update(payload).eq('id', editingSupplier.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('suppliers').insert(payload);
        if (error) throw error;
      }

      setShowModal(false);
      loadSuppliers();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('suppliers').update({ is_active: false }).eq('id', id);
      if (error) throw error;
      setDeleteConfirm(null);
      loadSuppliers();
    } catch (err) {
      console.error('Error deleting supplier:', err);
    }
  };

  const openStatement = async (supplier: Supplier) => {
    setStatementSupplier(supplier);
    const [pRes, pmRes] = await Promise.all([
      supabase.from('purchases').select('*').eq('supplier_id', supplier.id).order('purchase_date', { ascending: false }),
      supabase.from('supplier_payments').select('*').eq('supplier_id', supplier.id).order('payment_date', { ascending: false }),
    ]);
    setSupplierPurchases(pRes.data || []);
    setSupplierPayments(pmRes.data || []);
  };

  const addSupplierPayment = async () => {
    if (!statementSupplier || !paymentAmount) return;
    setSubmitting(true);
    const num = `SP-${Date.now().toString(36).toUpperCase()}`;
    const { error: payErr } = await supabase.from('supplier_payments').insert({
      payment_number: num,
      supplier_id: statementSupplier.id,
      amount: parseFloat(paymentAmount),
      payment_method: paymentMethod,
      reference: paymentReference || null,
      notes: paymentNotes || null,
      created_by: user?.id,
    });
    if (!payErr) {
      setShowPaymentForm(false);
      setPaymentAmount('');
      setPaymentReference('');
      setPaymentNotes('');
      await openStatement(statementSupplier);
      loadSuppliers();
    }
    setSubmitting(false);
  };

  const filtered = suppliers.filter((s) => {
    if (!s.is_active) return false;
    const term = searchTerm.toLowerCase();
    return (
      s.name.toLowerCase().includes(term) ||
      (s.name_ar && s.name_ar.includes(searchTerm)) ||
      s.code.toLowerCase().includes(term) ||
      (s.phone && s.phone.includes(term)) ||
      (s.email && s.email.toLowerCase().includes(term))
    );
  });

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat(isRTL ? 'ar-SA' : 'en-US', { style: 'decimal', minimumFractionDigits: 2 }).format(amount);

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
          <h2 className="text-2xl font-bold text-gray-900">{t('nav.suppliers')}</h2>
          <p className="text-gray-500 mt-1">{isRTL ? 'إدارة بيانات الموردين' : 'Manage supplier information'}</p>
        </div>
        {canEdit && (
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 bg-teal-600 text-white px-4 py-2.5 rounded-lg hover:bg-teal-700 transition font-medium"
          >
            <Plus className="w-5 h-5" />
            {isRTL ? 'إضافة مورد' : 'Add Supplier'}
          </button>
        )}
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
            <Truck className="w-16 h-16 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">{isRTL ? 'لا يوجد موردين' : 'No suppliers found'}</p>
            <p className="text-sm mt-1">{isRTL ? 'أضف مورد جديد للبدء' : 'Add a new supplier to get started'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((supplier) => (
              <div key={supplier.id} className="border border-gray-200 rounded-xl p-5 hover:shadow-md transition group">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-gray-900">
                      {isRTL ? supplier.name_ar || supplier.name : supplier.name}
                    </h3>
                    <p className="text-xs text-gray-400 font-mono">{supplier.code}</p>
                    <span className={`mt-1 inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      supplier.vat_status === 'standard' ? 'bg-teal-100 text-teal-700' :
                      supplier.vat_status === 'zero_rated' ? 'bg-blue-100 text-blue-700' :
                      supplier.vat_status === 'exempt' ? 'bg-gray-100 text-gray-600' :
                      'bg-orange-100 text-orange-700'
                    }`}>
                      {supplier.vat_status === 'standard' ? (isRTL ? 'خاضع 15%' : 'Standard 15%') :
                       supplier.vat_status === 'zero_rated' ? (isRTL ? 'نسبة صفر' : 'Zero Rated') :
                       supplier.vat_status === 'exempt' ? (isRTL ? 'معفى' : 'Exempt') :
                       (isRTL ? 'خارج النطاق' : 'Outside Scope')}
                    </span>
                  </div>
                  {canEdit && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button onClick={() => openEditModal(supplier)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button onClick={() => setDeleteConfirm(supplier.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5 text-sm text-gray-600">
                  {supplier.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-gray-400" />
                      <span dir="ltr">{supplier.phone}</span>
                    </div>
                  )}
                  {supplier.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-gray-400" />
                      <span>{supplier.email}</span>
                    </div>
                  )}
                  {supplier.country_ar && (
                    <div className="flex items-center gap-2">
                      <Globe className="w-3.5 h-3.5 text-gray-400" />
                      <span>{supplier.country_ar}</span>
                    </div>
                  )}
                  {supplier.city_ar && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-gray-400" />
                      <span>{supplier.city_ar}</span>
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-gray-100 flex items-end justify-between">
                  <div>
                    <p className="text-xs text-gray-400">{isRTL ? 'الرصيد المستحق' : 'Outstanding Balance'}</p>
                    <p className={`font-bold ${supplier.current_balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatCurrency(supplier.current_balance)} {isRTL ? 'ر.س' : 'SAR'}
                    </p>
                  </div>
                  <button onClick={() => openStatement(supplier)} className="text-xs text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5" /> {isRTL ? 'كشف حساب' : 'Statement'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {totalCount > pageSize && (
          <div className="mt-6">
            <Pagination
              currentPage={currentPage}
              totalPages={Math.ceil(totalCount / pageSize)}
              onPageChange={setCurrentPage}
              pageSize={pageSize}
              onPageSizeChange={setPageSize}
              totalItems={totalCount}
            />
          </div>
        )}
      </div>

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 text-center">
            <Trash2 className="w-12 h-12 text-red-500 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-gray-900 mb-2">{isRTL ? 'تأكيد الحذف' : 'Confirm Delete'}</h3>
            <p className="text-gray-500 mb-6 text-sm">
              {isRTL ? 'هل أنت متأكد من حذف هذا المورد؟' : 'Are you sure you want to delete this supplier?'}
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

      {statementSupplier && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-xl">
              <div>
                <h3 className="text-xl font-bold text-gray-900">{isRTL ? 'كشف حساب المورد' : 'Supplier Statement'}</h3>
                <p className="text-sm text-gray-500">{isRTL ? statementSupplier.name_ar || statementSupplier.name : statementSupplier.name}</p>
              </div>
              <div className="flex items-center gap-2">
                {canEdit && (
                  <button onClick={() => { setShowPaymentForm(true); }} className="flex items-center gap-1 bg-teal-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 transition">
                    <DollarSign className="w-4 h-4" /> {isRTL ? 'تسجيل دفعة' : 'Add Payment'}
                  </button>
                )}
                <button onClick={() => setStatementSupplier(null)} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
              </div>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-red-50 rounded-lg p-4 text-center">
                  <p className="text-xs text-red-600 mb-1">{isRTL ? 'إجمالي المشتريات' : 'Total Purchases'}</p>
                  <p className="text-lg font-bold text-red-700">{formatCurrency(supplierPurchases.reduce((s, p) => s + p.total, 0))}</p>
                </div>
                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <p className="text-xs text-green-600 mb-1">{isRTL ? 'إجمالي المدفوع' : 'Total Paid'}</p>
                  <p className="text-lg font-bold text-green-700">{formatCurrency(supplierPayments.reduce((s, p) => s + p.amount, 0))}</p>
                </div>
                <div className="bg-blue-50 rounded-lg p-4 text-center">
                  <p className="text-xs text-blue-600 mb-1">{isRTL ? 'الرصيد' : 'Balance'}</p>
                  <p className="text-lg font-bold text-blue-700">{formatCurrency(statementSupplier.current_balance)}</p>
                </div>
              </div>

              {supplierPurchases.length > 0 && (
                <div>
                  <h4 className="font-bold text-gray-800 mb-3">{isRTL ? 'المشتريات' : 'Purchases'}</h4>
                  <table className="w-full text-sm">
                    <thead><tr className="border-b bg-gray-50">
                      <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">{isRTL ? 'الرقم' : 'Number'}</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">{isRTL ? 'التاريخ' : 'Date'}</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">{isRTL ? 'الحالة' : 'Status'}</th>
                      <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">{isRTL ? 'المبلغ' : 'Amount'}</th>
                    </tr></thead>
                    <tbody>
                      {supplierPurchases.map((p: any) => (
                        <tr key={p.id} className="border-b border-gray-50">
                          <td className="py-2 px-3 font-mono">{p.purchase_number}</td>
                          <td className="py-2 px-3">{new Date(p.purchase_date).toLocaleDateString(isRTL ? 'ar-SA' : 'en-US')}</td>
                          <td className="py-2 px-3"><span className={`px-2 py-0.5 rounded-full text-xs ${p.status === 'received' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{p.status}</span></td>
                          <td className="py-2 px-3 text-right font-medium text-red-600">{formatCurrency(p.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {supplierPayments.length > 0 && (
                <div>
                  <h4 className="font-bold text-gray-800 mb-3">{isRTL ? 'المدفوعات' : 'Payments'}</h4>
                  <table className="w-full text-sm">
                    <thead><tr className="border-b bg-gray-50">
                      <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">{isRTL ? 'الرقم' : 'Number'}</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">{isRTL ? 'التاريخ' : 'Date'}</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">{isRTL ? 'الطريقة' : 'Method'}</th>
                      <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">{isRTL ? 'المبلغ' : 'Amount'}</th>
                    </tr></thead>
                    <tbody>
                      {supplierPayments.map((p: any) => (
                        <tr key={p.id} className="border-b border-gray-50">
                          <td className="py-2 px-3 font-mono">{p.payment_number}</td>
                          <td className="py-2 px-3">{new Date(p.payment_date).toLocaleDateString(isRTL ? 'ar-SA' : 'en-US')}</td>
                          <td className="py-2 px-3">{p.payment_method === 'cash' ? (isRTL ? 'نقدي' : 'Cash') : p.payment_method === 'transfer' ? (isRTL ? 'تحويل' : 'Transfer') : p.payment_method}</td>
                          <td className="py-2 px-3 text-right font-medium text-green-600">{formatCurrency(p.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {supplierPurchases.length === 0 && supplierPayments.length === 0 && (
                <p className="text-center text-gray-400 py-8">{isRTL ? 'لا توجد حركات' : 'No transactions'}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {showPaymentForm && statementSupplier && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-bold">{isRTL ? 'تسجيل دفعة للمورد' : 'Supplier Payment'}</h3>
              <button onClick={() => setShowPaymentForm(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'المبلغ (ر.س)' : 'Amount (SAR)'}</label>
                <input type="number" min="0" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent" dir="ltr" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'طريقة الدفع' : 'Payment Method'}</label>
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent">
                  <option value="cash">{isRTL ? 'نقدي' : 'Cash'}</option>
                  <option value="transfer">{isRTL ? 'تحويل' : 'Transfer'}</option>
                  <option value="check">{isRTL ? 'شيك' : 'Check'}</option>
                  <option value="card">{isRTL ? 'بطاقة' : 'Card'}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'المرجع' : 'Reference'}</label>
                <input type="text" value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'ملاحظات' : 'Notes'}</label>
                <input type="text" value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent" dir="rtl" />
              </div>
              {canEdit && (
                <button onClick={addSupplierPayment} disabled={submitting || !paymentAmount} className="w-full bg-teal-600 text-white py-2.5 rounded-lg hover:bg-teal-700 transition font-medium disabled:opacity-50 flex items-center justify-center gap-2">
                  <Save className="w-4 h-4" /> {submitting ? (isRTL ? 'جاري الحفظ...' : 'Saving...') : (isRTL ? 'حفظ الدفعة' : 'Save Payment')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-xl">
              <h3 className="text-xl font-bold text-gray-900">
                {editingSupplier ? (isRTL ? 'تعديل المورد' : 'Edit Supplier') : (isRTL ? 'إضافة مورد جديد' : 'Add New Supplier')}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'الكود' : 'Code'}</label>
                <input
                  type="text"
                  required
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'الاسم (إنجليزي)' : 'Name (English)'}</label>
                  <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'الاسم (عربي)' : 'Name (Arabic)'}</label>
                  <input type="text" value={formData.name_ar} onChange={(e) => setFormData({ ...formData, name_ar: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent" dir="rtl" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'البريد الإلكتروني' : 'Email'}</label>
                  <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'الهاتف' : 'Phone'}</label>
                  <input type="text" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent" dir="ltr" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'الرقم الضريبي' : 'Tax Number'}</label>
                  <input type="text" value={formData.tax_number} onChange={(e) => setFormData({ ...formData, tax_number: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent" dir="ltr" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'التصنيف الضريبي (VAT)' : 'VAT Status'}</label>
                  <select
                    value={formData.vat_status}
                    onChange={(e) => setFormData({ ...formData, vat_status: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  >
                    <option value="standard">{isRTL ? 'خاضع للضريبة (15%)' : 'Standard (15%)'}</option>
                    <option value="zero_rated">{isRTL ? 'نسبة صفرية (0%)' : 'Zero Rated (0%)'}</option>
                    <option value="exempt">{isRTL ? 'معفى من الضريبة' : 'Exempt'}</option>
                    <option value="outside_scope">{isRTL ? 'خارج نطاق الضريبة' : 'Outside Scope'}</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'الدولة' : 'Country'}</label>
                  <input type="text" value={formData.country_ar} onChange={(e) => setFormData({ ...formData, country_ar: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent" dir="rtl" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'المدينة' : 'City'}</label>
                  <input type="text" value={formData.city_ar} onChange={(e) => setFormData({ ...formData, city_ar: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent" dir="rtl" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'ملاحظات' : 'Notes'}</label>
                <textarea
                  value={isRTL ? formData.notes_ar : formData.notes}
                  onChange={(e) => setFormData({ ...formData, [isRTL ? 'notes_ar' : 'notes']: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                {canEdit && (
                  <button type="submit" disabled={submitting} className="flex-1 bg-teal-600 text-white py-2.5 rounded-lg hover:bg-teal-700 transition disabled:opacity-50 font-medium">
                    {submitting ? (isRTL ? 'جاري الحفظ...' : 'Saving...') : (isRTL ? 'حفظ' : 'Save')}
                  </button>
                )}
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-lg hover:bg-gray-200 transition font-medium">
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
