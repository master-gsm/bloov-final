import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { expenseCategories, getCategoryLabel } from '../lib/expenseCategories';
import { Receipt, Plus, Trash2, Search, Calendar, DollarSign, FileText, Filter, Download, Users } from 'lucide-react';
import * as XLSX from 'xlsx';

interface OperatingExpense {
  id: string;
  expense_number: string;
  expense_type: string;
  description: string;
  description_ar?: string;
  amount: number;
  expense_date: string;
  payment_method?: string;
  notes?: string;
  notes_ar?: string;
  partner_contribution_id?: string | null;
  created_at: string;
}

export default function Expenses() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const isRTL = language === 'ar';

  const [expenses, setExpenses] = useState<OperatingExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    expense_type: 'other',
    description: '',
    description_ar: '',
    amount: '',
    expense_date: new Date().toISOString().split('T')[0],
    payment_method: 'cash',
    notes: '',
    notes_ar: '',
  });

  useEffect(() => {
    loadExpenses();
  }, []);

  const loadExpenses = async () => {
    try {
      const { data, error } = await supabase
        .from('operating_expenses')
        .select('*')
        .order('expense_date', { ascending: false });

      if (error) throw error;
      if (data) setExpenses(data);
    } catch (err) {
      console.error('Error loading expenses:', err);
    } finally {
      setLoading(false);
    }
  };

  const generateExpenseNumber = async () => {
    const { data, error } = await supabase.rpc('generate_expense_number');
    if (error) throw error;
    return data;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.description || !formData.amount) {
      alert(isRTL ? 'يرجى ملء جميع الحقول المطلوبة' : 'Please fill all required fields');
      return;
    }

    try {
      const expenseNumber = await generateExpenseNumber();

      const { error } = await supabase.from('operating_expenses').insert([
        {
          expense_number: expenseNumber,
          expense_type: formData.expense_type,
          description: formData.description,
          description_ar: formData.description_ar || formData.description,
          amount: parseFloat(formData.amount),
          expense_date: formData.expense_date,
          payment_method: formData.payment_method,
          notes: formData.notes,
          notes_ar: formData.notes_ar,
          created_by: user?.id,
        },
      ]);

      if (error) throw error;

      setFormData({
        expense_type: 'other',
        description: '',
        description_ar: '',
        amount: '',
        expense_date: new Date().toISOString().split('T')[0],
        payment_method: 'cash',
        notes: '',
        notes_ar: '',
      });
      setShowForm(false);
      loadExpenses();
    } catch (err) {
      console.error('Error adding expense:', err);
      alert(isRTL ? 'حدث خطأ أثناء إضافة المصروف' : 'Error adding expense');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('operating_expenses').delete().eq('id', id);

      if (error) throw error;
      loadExpenses();
      setDeleteConfirm(null);
    } catch (err) {
      console.error('Error deleting expense:', err);
      alert(isRTL ? 'حدث خطأ أثناء حذف المصروف' : 'Error deleting expense');
    }
  };

  const exportToExcel = () => {
    const data = filteredExpenses.map((exp) => ({
      [isRTL ? 'رقم المصروف' : 'Expense Number']: exp.expense_number,
      [isRTL ? 'التاريخ' : 'Date']: exp.expense_date,
      [isRTL ? 'النوع' : 'Type']: getCategoryLabel(exp.expense_type, isRTL),
      [isRTL ? 'الوصف' : 'Description']: isRTL ? exp.description_ar || exp.description : exp.description,
      [isRTL ? 'المبلغ (ر.س)' : 'Amount (SAR)']: Number(exp.amount).toFixed(2),
      [isRTL ? 'طريقة الدفع' : 'Payment Method']: exp.payment_method,
      [isRTL ? 'ملاحظات' : 'Notes']: isRTL ? exp.notes_ar || exp.notes : exp.notes,
      [isRTL ? 'من الشركاء' : 'From Partners']: exp.partner_contribution_id ? (isRTL ? 'نعم' : 'Yes') : (isRTL ? 'لا' : 'No'),
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, isRTL ? 'المصاريف' : 'Expenses');
    XLSX.writeFile(wb, `expenses_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const filteredExpenses = expenses.filter((exp) => {
    const matchesSearch =
      exp.expense_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      exp.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (exp.description_ar && exp.description_ar.includes(searchTerm));

    const matchesFilter = filterType === 'all' || exp.expense_type === filterType;

    return matchesSearch && matchesFilter;
  });

  const totalExpenses = filteredExpenses.reduce((sum, exp) => sum + Number(exp.amount), 0);

  const formatCurrency = (value: number) => value.toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">{isRTL ? 'جاري التحميل...' : 'Loading...'}</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-orange-100 w-12 h-12 rounded-xl flex items-center justify-center">
            <Receipt className="w-6 h-6 text-orange-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isRTL ? 'المصاريف التشغيلية' : 'Operating Expenses'}
            </h1>
            <p className="text-sm text-gray-500">
              {isRTL ? 'إدارة المصاريف التشغيلية (غير المشتريات)' : 'Manage operating expenses (non-purchases)'}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition"
        >
          <Plus className="w-4 h-4" />
          {isRTL ? 'إضافة مصروف' : 'Add Expense'}
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">
            {isRTL ? 'إضافة مصروف جديد' : 'Add New Expense'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {isRTL ? 'نوع المصروف *' : 'Expense Type *'}
                </label>
                <select
                  value={formData.expense_type}
                  onChange={(e) => setFormData({ ...formData, expense_type: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  required
                >
                  {expenseCategories.map((type) => (
                    <option key={type.value} value={type.value}>
                      {isRTL ? type.labelAr : type.labelEn}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {isRTL ? 'المبلغ (ر.س) *' : 'Amount (SAR) *'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {isRTL ? 'التاريخ *' : 'Date *'}
                </label>
                <input
                  type="date"
                  value={formData.expense_date}
                  onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {isRTL ? 'طريقة الدفع' : 'Payment Method'}
                </label>
                <select
                  value={formData.payment_method}
                  onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                >
                  <option value="cash">{isRTL ? 'نقدي' : 'Cash'}</option>
                  <option value="bank_transfer">{isRTL ? 'تحويل بنكي' : 'Bank Transfer'}</option>
                  <option value="credit_card">{isRTL ? 'بطاقة ائتمانية' : 'Credit Card'}</option>
                  <option value="check">{isRTL ? 'شيك' : 'Check'}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {isRTL ? 'الوصف (إنجليزي) *' : 'Description (English) *'}
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {isRTL ? 'الوصف (عربي)' : 'Description (Arabic)'}
                </label>
                <input
                  type="text"
                  value={formData.description_ar}
                  onChange={(e) => setFormData({ ...formData, description_ar: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {isRTL ? 'ملاحظات' : 'Notes'}
                </label>
                <textarea
                  value={isRTL ? formData.notes_ar : formData.notes}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      [isRTL ? 'notes_ar' : 'notes']: e.target.value,
                    })
                  }
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-6 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition"
              >
                {isRTL ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition"
              >
                {isRTL ? 'حفظ' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder={isRTL ? 'بحث...' : 'Search...'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pr-10 pl-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>
          </div>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          >
            <option value="all">{isRTL ? 'جميع الأنواع' : 'All Types'}</option>
            {expenseCategories.map((type) => (
              <option key={type.value} value={type.value}>
                {isRTL ? type.labelAr : type.labelEn}
              </option>
            ))}
          </select>

          <button
            onClick={exportToExcel}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
          >
            <Download className="w-4 h-4" />
            {isRTL ? 'تصدير Excel' : 'Export Excel'}
          </button>
        </div>

        <div className="bg-orange-50 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <span className="text-gray-700 font-medium">
              {isRTL ? 'إجمالي المصاريف:' : 'Total Expenses:'}
            </span>
            <span className="text-2xl font-bold text-orange-600">
              {formatCurrency(totalExpenses)} {isRTL ? 'ر.س' : 'SAR'}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-right py-3 px-4 font-semibold text-gray-700">
                  {isRTL ? 'رقم المصروف' : 'Expense #'}
                </th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700">{isRTL ? 'التاريخ' : 'Date'}</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700">{isRTL ? 'النوع' : 'Type'}</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700">{isRTL ? 'الوصف' : 'Description'}</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700">{isRTL ? 'المبلغ' : 'Amount'}</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700">{isRTL ? 'طريقة الدفع' : 'Payment'}</th>
                <th className="text-center py-3 px-4 font-semibold text-gray-700">{isRTL ? 'إجراءات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {filteredExpenses.map((exp) => (
                <tr key={exp.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 text-gray-900 font-medium">{exp.expense_number}</td>
                  <td className="py-3 px-4 text-gray-600">{exp.expense_date}</td>
                  <td className="py-3 px-4 text-gray-600">
                    {isRTL
                      ? expenseCategories.find((t) => t.value === exp.expense_type)?.labelAr
                      : expenseCategories.find((t) => t.value === exp.expense_type)?.labelEn}
                  </td>
                  <td className="py-3 px-4 text-gray-600">
                    <div className="flex items-center gap-2">
                      {exp.partner_contribution_id && (
                        <Users
                          className="w-4 h-4 text-teal-600"
                          title={isRTL ? 'من دفعات الشركاء' : 'From partner contributions'}
                        />
                      )}
                      <span>{isRTL ? exp.description_ar || exp.description : exp.description}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-gray-900 font-bold">
                    {formatCurrency(Number(exp.amount))} {isRTL ? 'ر.س' : 'SAR'}
                  </td>
                  <td className="py-3 px-4 text-gray-600">{exp.payment_method}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-center gap-2">
                      {exp.partner_contribution_id ? (
                        <span
                          className="text-xs text-gray-400 italic"
                          title={isRTL ? 'لا يمكن حذف المصاريف المرتبطة بدفعات الشركاء' : 'Cannot delete expenses from partner contributions'}
                        >
                          {isRTL ? 'من الشركاء' : 'From Partners'}
                        </span>
                      ) : deleteConfirm === exp.id ? (
                        <>
                          <button
                            onClick={() => handleDelete(exp.id)}
                            className="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition"
                          >
                            {isRTL ? 'تأكيد' : 'Confirm'}
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="px-3 py-1 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300 transition"
                          >
                            {isRTL ? 'إلغاء' : 'Cancel'}
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(exp.id)}
                          className="p-2 text-red-500 hover:bg-red-50 rounded transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredExpenses.length === 0 && (
            <div className="text-center py-12">
              <Receipt className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">{isRTL ? 'لا توجد مصاريف' : 'No expenses found'}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
