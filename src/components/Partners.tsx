import { useEffect, useState, useRef } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useCanEdit } from '../hooks/useCanEdit';
import { supabase } from '../lib/supabase';
import { uploadFile, getFileUrl } from '../lib/fileUpload';
import { AttachmentPreviewModal } from './AttachmentPreviewModal';
import { Users, Plus, DollarSign, X, ShieldAlert, Trash2, FileSpreadsheet, Camera, Eye, Paperclip } from 'lucide-react';
import * as XLSX from 'xlsx';

interface Partner {
  id: string;
  name: string;
  name_ar: string;
  share_percentage: number;
  email: string | null;
  phone: string | null;
}

interface SetupExpense {
  id: string;
  partner_id: string | null;
  category: string;
  description: string;
  description_ar: string | null;
  amount: number;
  expense_date: string;
  attachment: string | null;
  expense_type: string;
  notes: string | null;
  created_at: string;
  partner?: {
    name: string;
    name_ar: string;
  };
}

const EXPENSE_TYPES = {
  capital: { ar: 'رأس مال', en: 'Capital' },
  asset: { ar: 'أصول ثابتة', en: 'Fixed Assets' },
  operational: { ar: 'تشغيلي', en: 'Operational' }
};

export function Partners() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const canEdit = useCanEdit();
  const isRTL = language === 'ar';

  const [partners, setPartners] = useState<Partner[]>([]);
  const [expenses, setExpenses] = useState<SetupExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<{ url: string; type: string; name?: string; filePath?: string } | null>(null);

  // Form fields
  const [partnerId, setPartnerId] = useState('');
  const [expenseType, setExpenseType] = useState('capital');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [descriptionAr, setDescriptionAr] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    checkUserRole();
    loadData();
  }, [user]);

  const checkUserRole = async () => {
    if (!user) return;
    try {
      const { data: userData } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();
      setIsAdmin(userData?.role === 'admin');
    } catch (err) {
      console.error('Error checking user role:', err);
    }
  };

  const loadData = async () => {
    try {
      const [partnersRes, expensesRes] = await Promise.all([
        supabase.from('partners').select('*').order('name'),
        supabase.from('setup_expenses').select(`
          *,
          partner:partners(name, name_ar)
        `).order('expense_date', { ascending: false })
      ]);

      if (partnersRes.data) setPartners(partnersRes.data);
      if (expensesRes.data) setExpenses(expensesRes.data);
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partnerId || !amount || !description) return;

    if (!isAdmin) {
      alert(isRTL ? 'يتطلب صلاحيات المدير' : 'Admin privileges required');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      let attachmentPath = null;
      if (attachmentFile) {
        console.log('Uploading attachment:', attachmentFile.name);
        attachmentPath = await uploadFile(attachmentFile, 'setup_expenses');
        if (!attachmentPath) {
          console.warn('File upload failed, continuing without attachment');
        } else {
          console.log('Attachment uploaded successfully:', attachmentPath);
        }
      }

      const expenseData = {
        partner_id: partnerId,
        expense_type: expenseType,
        category: category || expenseType,
        description,
        description_ar: descriptionAr || description,
        amount: parseFloat(amount),
        expense_date: expenseDate,
        attachment: attachmentPath,
        notes,
      };

      const { error } = await supabase.from('setup_expenses').insert([expenseData]);

      if (error) throw error;

      setShowForm(false);
      resetForm();
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!isAdmin) {
      alert(isRTL ? 'يتطلب صلاحيات المدير' : 'Admin privileges required');
      return;
    }

    try {
      const { error } = await supabase.from('setup_expenses').delete().eq('id', id);
      if (error) throw error;
      setDeleteConfirm(null);
      await loadData();
    } catch (err) {
      console.error('Error deleting expense:', err);
    }
  };

  const resetForm = () => {
    setPartnerId('');
    setExpenseType('capital');
    setCategory('');
    setDescription('');
    setDescriptionAr('');
    setAmount('');
    setExpenseDate(new Date().toISOString().split('T')[0]);
    setNotes('');
    setAttachmentFile(null);
    setError('');
  };

  const handleViewAttachment = (attachmentPath: string) => {
    const url = getFileUrl(attachmentPath);
    const fileType = attachmentPath.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image';
    setPreviewAttachment({
      url,
      type: fileType,
      name: attachmentPath.split('/').pop(),
      filePath: attachmentPath,
    });
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'decimal', minimumFractionDigits: 2 }).format(amount);

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString(isRTL ? 'ar-SA' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  const exportToExcel = () => {
    const workbook = XLSX.utils.book_new();
    const data = [
      [isRTL ? 'تقرير مصاريف التأسيس ورأس المال' : 'Setup and Capital Expenses Report'],
      [isRTL ? 'نظام بلوف المحاسبي' : 'BLOOV Accounting System'],
      [isRTL ? `التاريخ: ${new Date().toLocaleDateString('ar-SA')}` : `Date: ${new Date().toLocaleDateString('en-US')}`],
      [],
      [
        isRTL ? 'التاريخ' : 'Date',
        isRTL ? 'الشريك' : 'Partner',
        isRTL ? 'نوع المصروف' : 'Type',
        isRTL ? 'الفئة' : 'Category',
        isRTL ? 'الوصف' : 'Description',
        isRTL ? 'المبلغ' : 'Amount'
      ]
    ];

    expenses.forEach((expense) => {
      const partner = partners.find(p => p.id === expense.partner_id);
      data.push([
        formatDate(expense.expense_date),
        partner ? (isRTL ? partner.name_ar : partner.name) : (isRTL ? 'عام' : 'General'),
        isRTL ? EXPENSE_TYPES[expense.expense_type as keyof typeof EXPENSE_TYPES]?.ar : EXPENSE_TYPES[expense.expense_type as keyof typeof EXPENSE_TYPES]?.en,
        expense.category,
        isRTL ? (expense.description_ar || expense.description) : expense.description,
        Number(expense.amount).toFixed(2)
      ]);
    });

    data.push([]);
    data.push([
      isRTL ? 'الإجمالي' : 'Total',
      '',
      '',
      '',
      '',
      expenses.reduce((sum, exp) => sum + Number(exp.amount), 0).toFixed(2)
    ]);

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 30 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(workbook, ws, isRTL ? 'مصاريف التأسيس' : 'Setup Expenses');
    XLSX.writeFile(workbook, `Setup_Expenses_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Users className="w-16 h-16 mx-auto text-gray-300 mb-4 animate-pulse" />
          <p className="mt-4 text-gray-600">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md">
          <div className="bg-red-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-10 h-10 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {isRTL ? 'غير مصرح' : 'Access Restricted'}
          </h2>
          <p className="text-gray-500">
            {isRTL ? 'هذا القسم متاح فقط للمدير' : 'This section is only available for administrators'}
          </p>
        </div>
      </div>
    );
  }

  const totalExpenses = expenses.reduce((sum, exp) => sum + Number(exp.amount), 0);
  const capitalExpenses = expenses.filter(e => e.expense_type === 'capital').reduce((sum, exp) => sum + Number(exp.amount), 0);
  const assetExpenses = expenses.filter(e => e.expense_type === 'asset').reduce((sum, exp) => sum + Number(exp.amount), 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {isRTL ? 'الشركاء ومصاريف التأسيس' : 'Partners & Setup Expenses'}
          </h2>
          <p className="text-gray-500 mt-1">
            {isRTL ? 'سجل مصاريف التأسيس ورأس المال والأصول' : 'Track setup, capital, and asset expenses'}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={exportToExcel}
            disabled={expenses.length === 0}
            className="flex items-center gap-2 bg-green-600 text-white px-4 py-2.5 rounded-lg hover:bg-green-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileSpreadsheet className="w-5 h-5" />
            {isRTL ? 'تصدير Excel' : 'Export Excel'}
          </button>
          {canEdit && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 bg-teal-600 text-white px-4 py-2.5 rounded-lg hover:bg-teal-700 transition font-medium"
            >
              <Plus className="w-5 h-5" />
              {isRTL ? 'إضافة مصروف' : 'Add Expense'}
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-teal-50 p-2.5 rounded-lg">
              <DollarSign className="w-5 h-5 text-teal-600" />
            </div>
            <p className="text-sm text-gray-500">{isRTL ? 'إجمالي المصاريف' : 'Total Expenses'}</p>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {formatCurrency(totalExpenses)} <span className="text-sm font-normal text-gray-500">{isRTL ? 'ر.س' : 'SAR'}</span>
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-blue-50 p-2.5 rounded-lg">
              <DollarSign className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-sm text-gray-500">{isRTL ? 'رأس المال' : 'Capital'}</p>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {formatCurrency(capitalExpenses)} <span className="text-sm font-normal text-gray-500">{isRTL ? 'ر.س' : 'SAR'}</span>
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-purple-50 p-2.5 rounded-lg">
              <DollarSign className="w-5 h-5 text-purple-600" />
            </div>
            <p className="text-sm text-gray-500">{isRTL ? 'الأصول الثابتة' : 'Fixed Assets'}</p>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {formatCurrency(assetExpenses)} <span className="text-sm font-normal text-gray-500">{isRTL ? 'ر.س' : 'SAR'}</span>
          </p>
        </div>
      </div>

      {/* Expenses Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="py-3 px-6 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  {isRTL ? 'التاريخ' : 'Date'}
                </th>
                <th className="py-3 px-6 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  {isRTL ? 'الشريك' : 'Partner'}
                </th>
                <th className="py-3 px-6 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  {isRTL ? 'نوع المصروف' : 'Type'}
                </th>
                <th className="py-3 px-6 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  {isRTL ? 'الوصف' : 'Description'}
                </th>
                <th className="py-3 px-6 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  {isRTL ? 'المبلغ' : 'Amount'}
                </th>
                <th className="py-3 px-6 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  {isRTL ? 'المرفق' : 'Attachment'}
                </th>
                <th className="py-3 px-6 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  {isRTL ? 'إجراءات' : 'Actions'}
                </th>
              </tr>
            </thead>
            <tbody>
              {expenses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-500">
                    {isRTL ? 'لا توجد مصاريف' : 'No expenses found'}
                  </td>
                </tr>
              ) : (
                expenses.map((expense) => {
                  const partner = partners.find(p => p.id === expense.partner_id);
                  const typeColor = expense.expense_type === 'capital' ? 'blue' : expense.expense_type === 'asset' ? 'purple' : 'green';

                  return (
                    <tr key={expense.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition">
                      <td className="py-3 px-6 text-sm text-gray-600">
                        {formatDate(expense.expense_date)}
                      </td>
                      <td className="py-3 px-6 text-sm text-gray-900 font-medium">
                        {partner ? (isRTL ? partner.name_ar : partner.name) : (isRTL ? 'عام' : 'General')}
                      </td>
                      <td className="py-3 px-6 text-sm">
                        <span className={`px-2 py-1 bg-${typeColor}-100 text-${typeColor}-800 rounded-full text-xs font-medium`}>
                          {isRTL ? EXPENSE_TYPES[expense.expense_type as keyof typeof EXPENSE_TYPES]?.ar : EXPENSE_TYPES[expense.expense_type as keyof typeof EXPENSE_TYPES]?.en}
                        </span>
                      </td>
                      <td className="py-3 px-6 text-sm text-gray-900">
                        {isRTL ? (expense.description_ar || expense.description) : expense.description}
                        {expense.notes && (
                          <p className="text-xs text-gray-500 mt-1">{expense.notes}</p>
                        )}
                      </td>
                      <td className="py-3 px-6 text-sm font-bold text-teal-900">
                        {formatCurrency(Number(expense.amount))} {isRTL ? 'ر.س' : 'SAR'}
                      </td>
                      <td className="py-3 px-6 text-center">
                        {expense.attachment ? (
                          <button
                            onClick={() => handleViewAttachment(expense.attachment!)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                            title={isRTL ? 'عرض المرفق' : 'View attachment'}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        ) : (
                          <span className="text-gray-400 text-xs">-</span>
                        )}
                      </td>
                      <td className="py-3 px-6 text-center">
                        {deleteConfirm === expense.id ? (
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleDelete(expense.id)}
                              className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                            >
                              {isRTL ? 'تأكيد' : 'Confirm'}
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="px-2 py-1 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300"
                            >
                              {isRTL ? 'إلغاء' : 'Cancel'}
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(expense.id)}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition"
                            title={isRTL ? 'حذف' : 'Delete'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Expense Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white">
              <h3 className="text-lg font-bold text-gray-900">
                {isRTL ? 'إضافة مصروف تأسيسي' : 'Add Setup Expense'}
              </h3>
              <button
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {isRTL ? 'الشريك *' : 'Partner *'}
                  </label>
                  <select
                    value={partnerId}
                    onChange={(e) => setPartnerId(e.target.value)}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  >
                    <option value="">{isRTL ? 'اختر شريك' : 'Select Partner'}</option>
                    {partners.map((partner) => (
                      <option key={partner.id} value={partner.id}>
                        {isRTL ? partner.name_ar : partner.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {isRTL ? 'نوع المصروف *' : 'Expense Type *'}
                  </label>
                  <select
                    value={expenseType}
                    onChange={(e) => setExpenseType(e.target.value)}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  >
                    {Object.entries(EXPENSE_TYPES).map(([key, value]) => (
                      <option key={key} value={key}>
                        {isRTL ? value.ar : value.en}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {isRTL ? 'الوصف *' : 'Description *'}
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder={isRTL ? 'أدخل الوصف' : 'Enter description'}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {isRTL ? 'الوصف بالعربي' : 'Arabic Description'}
                </label>
                <input
                  type="text"
                  value={descriptionAr}
                  onChange={(e) => setDescriptionAr(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder={isRTL ? 'أدخل الوصف بالعربي' : 'Enter Arabic description'}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {isRTL ? 'المبلغ (ر.س) *' : 'Amount (SAR) *'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {isRTL ? 'التاريخ *' : 'Date *'}
                  </label>
                  <input
                    type="date"
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {isRTL ? 'ملاحظات' : 'Notes'}
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
                  placeholder={isRTL ? 'ملاحظات إضافية (اختياري)' : 'Additional notes (optional)'}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {isRTL ? 'المرفق' : 'Attachment'}
                </label>
                <div className="flex gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)}
                    accept="image/*,application/pdf"
                    className="hidden"
                  />
                  <input
                    type="file"
                    ref={cameraInputRef}
                    onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)}
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg hover:border-teal-500 hover:bg-teal-50 transition"
                  >
                    <Paperclip className="w-4 h-4" />
                    {attachmentFile ? attachmentFile.name : (isRTL ? 'اختر ملف' : 'Choose File')}
                  </button>
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg hover:border-teal-500 hover:bg-teal-50 transition"
                  >
                    <Camera className="w-4 h-4" />
                  </button>
                </div>
                {attachmentFile && (
                  <button
                    type="button"
                    onClick={() => setAttachmentFile(null)}
                    className="mt-2 text-sm text-red-600 hover:underline"
                  >
                    {isRTL ? 'إزالة المرفق' : 'Remove attachment'}
                  </button>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    resetForm();
                  }}
                  className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition font-medium"
                >
                  {isRTL ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition font-medium disabled:opacity-50"
                >
                  {submitting ? (isRTL ? 'جاري الحفظ...' : 'Saving...') : (isRTL ? 'حفظ' : 'Save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Attachment Preview Modal */}
      <AttachmentPreviewModal
        isOpen={!!previewAttachment}
        attachment={previewAttachment}
        onClose={() => setPreviewAttachment(null)}
        isRTL={isRTL}
      />
    </div>
  );
}
