import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, DollarSign, Calendar, FileText, Building2, Paperclip, Upload } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useLanguage } from '../contexts/LanguageContext';
import ExcelImport from './partners/ExcelImport';

interface SetupExpense {
  id: string;
  branch_id: string | null;
  category: string;
  description: string;
  amount: number;
  expense_date: string;
  supplier_id: string | null;
  payment_method: string | null;
  receipt_number: string | null;
  attachment: string | null;
  is_amortizable: boolean;
  amortization_months: number;
  notes: string | null;
  created_at: string;
  branch?: {
    name: string;
  };
  supplier?: {
    name: string;
  };
}

interface Branch {
  id: string;
  name: string;
}

interface Supplier {
  id: string;
  name: string;
}

const SETUP_EXPENSE_CATEGORIES = [
  { value: 'Furniture', label_en: 'Furniture', label_ar: 'الأثاث' },
  { value: 'Equipment', label_en: 'Equipment', label_ar: 'المعدات' },
  { value: 'Renovation', label_en: 'Renovation', label_ar: 'التجديد' },
  { value: 'Licenses', label_en: 'Licenses & Permits', label_ar: 'التراخيص والتصاريح' },
  { value: 'Technology', label_en: 'Technology & Software', label_ar: 'التكنولوجيا والبرمجيات' },
  { value: 'Signage', label_en: 'Signage & Branding', label_ar: 'اللافتات والعلامة التجارية' },
  { value: 'Security', label_en: 'Security Systems', label_ar: 'أنظمة الأمان' },
  { value: 'Initial_Stock', label_en: 'Initial Stock', label_ar: 'المخزون الأولي' },
  { value: 'Other', label_en: 'Other', label_ar: 'أخرى' },
];

export default function SetupExpenses() {
  const [expenses, setExpenses] = useState<SetupExpense[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [partners, setPartners] = useState<{ id: string; name: string; name_ar: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingExpense, setEditingExpense] = useState<SetupExpense | null>(null);
  const [partnerTotals, setPartnerTotals] = useState<Record<string, number>>({});
  const { language } = useLanguage();

  const [formData, setFormData] = useState({
    branch_id: '',
    category: '',
    description: '',
    amount: '',
    expense_date: new Date().toISOString().split('T')[0],
    supplier_id: '',
    payment_method: 'cash',
    receipt_number: '',
    is_amortizable: false,
    amortization_months: 0,
    notes: '',
    partner_id: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        loadExpenses(),
        loadBranches(),
        loadSuppliers(),
        loadPartners(),
      ]);
    } catch (error: any) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadExpenses = async () => {
    const { data, error } = await supabase
      .from('setup_expenses')
      .select(`
        *,
        branch:branches(name),
        supplier:suppliers(name),
        partner:partners(id, name, name_ar)
      `)
      .order('expense_date', { ascending: false });

    if (error) throw error;
    setExpenses((data || []) as any[]);

    // Calculate partner totals
    const totals: Record<string, number> = {};
    (data || []).forEach((expense: any) => {
      if (expense.partner_id) {
        totals[expense.partner_id] = (totals[expense.partner_id] || 0) + Number(expense.amount);
      }
    });
    setPartnerTotals(totals);
  };

  const loadBranches = async () => {
    const { data, error } = await supabase
      .from('branches')
      .select('id, name')
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    setBranches(data || []);
  };

  const loadSuppliers = async () => {
    const { data, error } = await supabase
      .from('suppliers')
      .select('id, name')
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    setSuppliers(data || []);
  };

  const loadPartners = async () => {
    const { data, error } = await supabase
      .from('partners')
      .select('id, name, name_ar')
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    setPartners(data || []);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const { data: { user } } = await supabase.auth.getUser();

      const expenseData = {
        ...formData,
        branch_id: formData.branch_id || null,
        supplier_id: formData.supplier_id || null,
        amount: parseFloat(formData.amount),
        amortization_months: formData.is_amortizable ? parseInt(formData.amortization_months.toString()) : 0,
        created_by: user?.id,
      };

      if (editingExpense) {
        const { error } = await supabase
          .from('setup_expenses')
          .update(expenseData)
          .eq('id', editingExpense.id);

        if (error) throw error;
        alert(language === 'ar' ? 'تم تحديث المصروف بنجاح' : 'Expense updated successfully');
      } else {
        const { error } = await supabase
          .from('setup_expenses')
          .insert([expenseData]);

        if (error) throw error;
        alert(language === 'ar' ? 'تم إضافة المصروف بنجاح' : 'Expense added successfully');
      }

      setShowForm(false);
      setEditingExpense(null);
      resetForm();
      loadExpenses();
    } catch (error: any) {
      console.error('Error saving expense:', error);
      alert(error.message || (language === 'ar' ? 'خطأ في حفظ المصروف' : 'Error saving expense'));
    }
  };

  const handleEdit = (expense: SetupExpense) => {
    setEditingExpense(expense);
    setFormData({
      branch_id: expense.branch_id || '',
      category: expense.category,
      description: expense.description,
      amount: expense.amount.toString(),
      expense_date: expense.expense_date,
      supplier_id: expense.supplier_id || '',
      payment_method: expense.payment_method || 'cash',
      receipt_number: expense.receipt_number || '',
      is_amortizable: expense.is_amortizable,
      amortization_months: expense.amortization_months,
      notes: expense.notes || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(language === 'ar' ? 'هل أنت متأكد من إلغاء هذا المصروف نهائياً؟' : 'Are you sure you want to void this expense?')) {
      return;
    }

    try {
      const { data, error } = await supabase.rpc('void_setup_expense', {
        p_expense_id: id,
        p_reason: 'Voided via UI',
      });
      if (error) throw error;
      alert(language === 'ar' ? 'تم إلغاء المصروف نهائياً' : 'Expense voided successfully');
      loadExpenses();
    } catch (error: any) {
      console.error('Error voiding expense:', error);
      alert(error.message || (language === 'ar' ? 'خطأ في إلغاء المصروف' : 'Error voiding expense'));
    }
  };

  const resetForm = () => {
    setFormData({
      branch_id: '',
      category: '',
      description: '',
      amount: '',
      expense_date: new Date().toISOString().split('T')[0],
      supplier_id: '',
      payment_method: 'cash',
      receipt_number: '',
      is_amortizable: false,
      amortization_months: 0,
      notes: '',
    });
    setEditingExpense(null);
  };

  const totalSetupExpenses = expenses.reduce((sum, exp) => sum + Number(exp.amount), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">{language === 'ar' ? 'جاري التحميل...' : 'Loading...'}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {language === 'ar' ? 'مصاريف التأسيس' : 'Setup Expenses'}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {language === 'ar'
              ? 'مصاريف التأسيس والرأسمالية (منفصلة عن المصاريف التشغيلية)'
              : 'Capital and founding expenses (Separate from operating expenses)'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
          >
            <Upload className="w-5 h-5" />
            {language === 'ar' ? 'استيراد Excel' : 'Import Excel'}
          </button>
          <button
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-5 h-5" />
            {language === 'ar' ? 'إضافة مصروف' : 'Add Expense'}
          </button>
        </div>
      </div>

      {/* Partner Payment Summary Cards */}
      {partners.length > 0 && Object.keys(partnerTotals).length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {partners.map(partner => {
            const total = partnerTotals[partner.id] || 0;
            if (total === 0) return null;
            return (
              <div key={partner.id} className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg p-5 border border-blue-200 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-xs text-gray-500 uppercase font-medium mb-1">
                      {language === 'ar' ? 'إجمالي مدفوعات' : 'Total Payments'}
                    </p>
                    <p className="text-lg font-bold text-gray-900">
                      {language === 'ar' ? partner.name_ar || partner.name : partner.name}
                    </p>
                  </div>
                  <DollarSign className="w-10 h-10 text-blue-600" />
                </div>
                <p className="text-2xl font-bold text-blue-900">
                  {total.toLocaleString(language === 'ar' ? 'ar-SA' : 'en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{' '}
                  <span className="text-lg">{language === 'ar' ? 'ر.س' : 'SAR'}</span>
                </p>
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-gradient-to-br from-slate-50 to-gray-50 rounded-lg p-6 border border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600 mb-1">
              {language === 'ar' ? 'إجمالي مصاريف التأسيس' : 'Total Setup Expenses'}
            </p>
            <p className="text-3xl font-bold text-gray-900">
              {totalSetupExpenses.toLocaleString(language === 'ar' ? 'ar-SA' : 'en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              {language === 'ar' ? 'ر.س' : 'SAR'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {expenses.length} {language === 'ar' ? 'مصروف' : 'expenses'}
            </p>
          </div>
          <DollarSign className="w-12 h-12 text-gray-600" />
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">
              {editingExpense
                ? language === 'ar' ? 'تعديل مصروف تأسيس' : 'Edit Setup Expense'
                : language === 'ar' ? 'إضافة مصروف تأسيس' : 'Add Setup Expense'}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {language === 'ar' ? 'الفئة' : 'Category'} *
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    required
                  >
                    <option value="">{language === 'ar' ? 'اختر فئة' : 'Select Category'}</option>
                    {SETUP_EXPENSE_CATEGORIES.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {language === 'ar' ? cat.label_ar : cat.label_en}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {language === 'ar' ? 'الفرع' : 'Branch'}
                  </label>
                  <select
                    value={formData.branch_id}
                    onChange={(e) => setFormData({ ...formData, branch_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="">{language === 'ar' ? 'عام (جميع الفروع)' : 'General (All Branches)'}</option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {language === 'ar' ? 'الوصف' : 'Description'} *
                  </label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {language === 'ar' ? 'المبلغ' : 'Amount'} *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {language === 'ar' ? 'التاريخ' : 'Date'} *
                  </label>
                  <input
                    type="date"
                    value={formData.expense_date}
                    onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {language === 'ar' ? 'المورد' : 'Supplier'}
                  </label>
                  <select
                    value={formData.supplier_id}
                    onChange={(e) => setFormData({ ...formData, supplier_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="">{language === 'ar' ? 'اختر مورد' : 'Select Supplier'}</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {language === 'ar' ? 'طريقة الدفع' : 'Payment Method'}
                  </label>
                  <select
                    value={formData.payment_method}
                    onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="cash">{language === 'ar' ? 'نقدي' : 'Cash'}</option>
                    <option value="transfer">{language === 'ar' ? 'تحويل بنكي' : 'Bank Transfer'}</option>
                    <option value="card">{language === 'ar' ? 'بطاقة' : 'Card'}</option>
                    <option value="check">{language === 'ar' ? 'شيك' : 'Check'}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {language === 'ar' ? 'رقم الإيصال' : 'Receipt Number'}
                  </label>
                  <input
                    type="text"
                    value={formData.receipt_number}
                    onChange={(e) => setFormData({ ...formData, receipt_number: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <input
                    type="checkbox"
                    id="is_amortizable"
                    checked={formData.is_amortizable}
                    onChange={(e) => setFormData({
                      ...formData,
                      is_amortizable: e.target.checked,
                      amortization_months: e.target.checked ? 12 : 0
                    })}
                    className="rounded border-gray-300"
                  />
                  <label htmlFor="is_amortizable" className="text-sm font-medium text-gray-700">
                    {language === 'ar' ? 'توزيع التكلفة على عدة أشهر' : 'Amortize over months'}
                  </label>
                </div>

                {formData.is_amortizable && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {language === 'ar' ? 'عدد الأشهر' : 'Number of Months'}
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="120"
                      value={formData.amortization_months}
                      onChange={(e) => setFormData({ ...formData, amortization_months: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      required={formData.is_amortizable}
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {language === 'ar' ? 'ملاحظات' : 'Notes'}
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingExpense(null);
                    resetForm();
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  {language === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {editingExpense
                    ? language === 'ar' ? 'تحديث' : 'Update'
                    : language === 'ar' ? 'حفظ' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {language === 'ar' ? 'التاريخ' : 'Date'}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {language === 'ar' ? 'الفئة' : 'Category'}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {language === 'ar' ? 'الوصف' : 'Description'}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {language === 'ar' ? 'الفرع' : 'Branch'}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {language === 'ar' ? 'المبلغ' : 'Amount'}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {language === 'ar' ? 'إجراءات' : 'Actions'}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {expenses.map((expense) => (
                <tr key={expense.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {new Date(expense.expense_date).toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-US')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-xs">
                      {SETUP_EXPENSE_CATEGORIES.find(c => c.value === expense.category)?.[language === 'ar' ? 'label_ar' : 'label_en'] || expense.category}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    <div className="max-w-xs truncate">{expense.description}</div>
                    {expense.is_amortizable && (
                      <span className="text-xs text-gray-500">
                        ({language === 'ar' ? 'موزع على' : 'Amortized over'} {expense.amortization_months} {language === 'ar' ? 'شهر' : 'months'})
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {expense.branch ? expense.branch.name : (language === 'ar' ? 'عام' : 'General')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {Number(expense.amount).toLocaleString(language === 'ar' ? 'ar-SA' : 'en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleEdit(expense)}
                      className="text-blue-600 hover:text-blue-900 mr-3"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(expense.id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {expenses.length === 0 && (
          <div className="text-center py-12">
            <DollarSign className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">
              {language === 'ar' ? 'لا توجد مصاريف تأسيس' : 'No setup expenses recorded'}
            </p>
          </div>
        )}
      </div>

      {/* Excel Import Modal */}
      {showImport && (
        <ExcelImport
          partners={partners}
          onClose={() => setShowImport(false)}
          onSuccess={() => {
            setShowImport(false);
            loadExpenses();
          }}
        />
      )}
    </div>
  );
}
