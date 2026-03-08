import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useCanEdit } from '../hooks/useCanEdit';
import { expenseCategories, getCategoryLabel } from '../lib/expenseCategories';
import { uploadFile, getFileUrl } from '../lib/fileUpload';
import { Receipt, Plus, Trash2, Search, Calendar, DollarSign, FileText, Filter, Download, Users, Paperclip, Camera, Printer, X, Eye } from 'lucide-react';
import * as XLSX from 'xlsx';
import { AttachmentPreviewModal } from './AttachmentPreviewModal';
import { Pagination } from './Pagination';

interface OperatingExpense {
  id: string;
  expense_number: string;
  expense_type: string;
  category: string;
  description: string;
  description_ar?: string;
  amount: number;
  expense_date: string;
  payment_method?: string;
  notes?: string;
  notes_ar?: string;
  partner_contribution_id?: string | null;
  attachment_url?: string | null;
  created_at: string;
}

export default function Expenses() {
  const { user, can } = useAuth();
  const { language } = useLanguage();
  const canEdit = useCanEdit('expenses');
  const isRTL = language === 'ar';
  const isAdmin = can('expenses', 'delete');
  const canViewAllBranches = can('branches', 'view');

  const [expenses, setExpenses] = useState<OperatingExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<{ url: string; type: string; name?: string; filePath?: string } | null>(null);
  const attachmentFileInputRef = useRef<HTMLInputElement>(null);
  const attachmentCameraInputRef = useRef<HTMLInputElement>(null);
  const [userBranchId, setUserBranchId] = useState<string | null>(null);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [partners, setPartners] = useState<{ id: string; name: string; name_ar: string }[]>([]);
  const [openCustodies, setOpenCustodies] = useState<any[]>([]);
  const [selectedCustodyId, setSelectedCustodyId] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);

  const [formData, setFormData] = useState({
    expense_type: 'other',
    description: '',
    description_ar: '',
    amount: '',
    expense_date: new Date().toISOString().split('T')[0],
    payment_method: 'cash',
    notes: '',
    notes_ar: '',
    partner_id: '',
  });

  useEffect(() => {
    loadUserBranch();
    loadBranches();
    loadPartners();
    loadOpenCustodies();
  }, []);

  useEffect(() => {
    loadExpenses();
  }, [currentPage, pageSize]);

  const loadUserBranch = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('users')
        .select('branch_id')
        .eq('id', user.id)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setUserBranchId(data.branch_id);
        if (data.branch_id) setSelectedBranchId(data.branch_id);
      }
    } catch (err) {
      console.error('Error loading user branch:', err);
    }
  };

  const loadBranches = async () => {
    const { data } = await supabase.from('branches').select('id, name').order('name');
    setBranches(data || []);
  };

  const loadPartners = async () => {
    const { data } = await supabase.from('partners').select('id, name, name_ar').eq('is_active', true).order('name');
    setPartners(data || []);
  };

  const loadOpenCustodies = async () => {
    const { data } = await supabase.rpc('get_employee_open_custodies');
    setOpenCustodies(data || []);
  };

  const loadExpenses = async () => {
    try {
      let query = supabase
        .from('expenses')
        .select('*', { count: 'exact' })
        .eq('is_deleted', false)
        .not('category', 'in', '(salaries,commissions,purchases)')
        .order('expense_date', { ascending: false });

      if (!canViewAllBranches && userBranchId) {
        query = query.eq('branch_id', userBranchId);
      }

      // Apply search filter
      if (searchTerm) {
        query = query.or(`expense_number.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%,description_ar.ilike.%${searchTerm}%`);
      }

      // Apply type filter
      if (filterType !== 'all') {
        query = query.eq('category', filterType);
      }

      // Apply pagination
      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;
      if (data) setExpenses(data.map((e: any) => ({ ...e, expense_type: e.category })) as any[]);
      if (count !== null) setTotalCount(count);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (submitting) return;

    if (!formData.description || !formData.amount) {
      alert(isRTL ? 'يرجى ملء جميع الحقول المطلوبة' : 'Please fill all required fields');
      return;
    }

    if (!selectedBranchId) {
      alert(isRTL ? 'يرجى اختيار الفرع' : 'Please select a branch');
      return;
    }

    setSubmitting(true);
    try {
      const expenseNumber = await generateExpenseNumber();

      let attachmentUrl = null;
      if (attachmentFile) {
        attachmentUrl = await uploadFile(attachmentFile, 'operating_expenses');
        if (!attachmentUrl) {
        } else {
        }
      }

      // If partner is selected, create partner_contribution first
      let partnerContributionId = null;
      if (formData.partner_id) {
        const { data: contributionData, error: contributionError } = await supabase
          .from('partner_contributions')
          .insert({
            partner_id: formData.partner_id,
            contribution_type: formData.expense_type,
            amount: parseFloat(formData.amount),
            description: formData.description,
            description_ar: formData.description_ar || formData.description,
            contribution_date: formData.expense_date,
          })
          .select()
          .single();

        if (contributionError) throw contributionError;
        partnerContributionId = contributionData.id;
      }

      const { error } = await supabase.from('expenses').insert([
        {
          expense_number: expenseNumber,
          category: formData.expense_type,
          description: formData.description,
          description_ar: formData.description_ar || formData.description,
          amount: parseFloat(formData.amount),
          expense_date: formData.expense_date,
          payment_method: formData.payment_method,
          notes: formData.notes,
          notes_ar: formData.notes_ar,
          attachment_url: attachmentUrl,
          branch_id: selectedBranchId,
          created_by: user?.id,
          partner_contribution_id: partnerContributionId,
        },
      ]);

      if (error) throw error;

      if (formData.payment_method === 'custody' && selectedCustodyId) {
        const { error: settlementError } = await supabase.rpc('add_custody_settlement_atomic', {
          p_custody_id: selectedCustodyId,
          p_settlement_type: 'expense',
          p_amount: parseFloat(formData.amount),
          p_description: formData.description,
          p_description_ar: formData.description_ar || formData.description,
          p_reference_type: 'expense',
          p_reference_id: null,
          p_notes: formData.notes || null,
        });
        if (settlementError) {
          console.error('Error creating custody settlement:', settlementError);
        }
      }

      setFormData({
        expense_type: 'other',
        description: '',
        description_ar: '',
        amount: '',
        expense_date: new Date().toISOString().split('T')[0],
        payment_method: 'cash',
        notes: '',
        notes_ar: '',
        partner_id: '',
      });
      setAttachmentFile(null);
      setSelectedCustodyId('');
      setShowForm(false);
      loadExpenses();
      loadOpenCustodies();
    } catch (err) {
      console.error('Error adding expense:', err);
      alert(isRTL ? 'حدث خطأ أثناء إضافة المصروف' : 'Error adding expense');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!isAdmin) {
      alert(isRTL ? 'يتطلب صلاحيات المدير لحذف المصاريف' : 'Admin privileges required to delete expenses');
      return;
    }
    try {
      const { data, error } = await supabase.rpc('void_expense', {
        p_expense_id: id,
        p_reason: 'Voided via UI',
      });
      if (error) throw error;
      loadExpenses();
      setDeleteConfirm(null);
    } catch (err: any) {
      console.error('Error voiding expense:', err);
      alert(err.message || (isRTL ? 'حدث خطأ أثناء إلغاء المصروف' : 'Error voiding expense'));
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

  // Server-side filtering is now applied in loadExpenses
  const filteredExpenses = expenses;

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
        {canEdit && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition"
          >
            <Plus className="w-4 h-4" />
            {isRTL ? 'إضافة مصروف' : 'Add Expense'}
          </button>
        )}
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
                  {isRTL ? 'الفرع *' : 'Branch *'}
                </label>
                <select
                  value={selectedBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                  disabled={!canViewAllBranches}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-gray-50"
                  required
                >
                  <option value="">{isRTL ? 'اختر الفرع' : 'Select Branch'}</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {isRTL ? 'نوع المصروف *' : 'Expense Type *'}
                </label>
                <select
                  value={formData.expense_type}
                  onChange={(e) => setFormData({ ...formData, expense_type: e.target.value })}
                  disabled={!canEdit}
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
                  disabled={!canEdit}
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
                  disabled={!canEdit}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {isRTL ? 'الشريك الدافع (اختياري)' : 'Paid by Partner (Optional)'}
                </label>
                <select
                  value={formData.partner_id}
                  onChange={(e) => setFormData({ ...formData, partner_id: e.target.value })}
                  disabled={!canEdit}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                >
                  <option value="">{isRTL ? 'مصروف مشترك (بدون شريك محدد)' : 'Shared expense (no specific partner)'}</option>
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {isRTL ? p.name_ar || p.name : p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {isRTL ? 'طريقة الدفع' : 'Payment Method'}
                </label>
                <select
                  value={formData.payment_method}
                  onChange={(e) => { setFormData({ ...formData, payment_method: e.target.value }); if (e.target.value !== 'custody') setSelectedCustodyId(''); }}
                  disabled={!canEdit}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                >
                  <option value="cash">{isRTL ? 'نقدي' : 'Cash'}</option>
                  <option value="bank_transfer">{isRTL ? 'تحويل بنكي' : 'Bank Transfer'}</option>
                  <option value="credit_card">{isRTL ? 'بطاقة ائتمانية' : 'Credit Card'}</option>
                  <option value="check">{isRTL ? 'شيك' : 'Check'}</option>
                  {openCustodies.length > 0 && <option value="custody">{isRTL ? 'من عهدة موظف' : 'From Employee Custody'}</option>}
                </select>
              </div>

              {formData.payment_method === 'custody' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {isRTL ? 'اختر العهدة' : 'Select Custody'}
                  </label>
                  <select
                    value={selectedCustodyId}
                    onChange={(e) => setSelectedCustodyId(e.target.value)}
                    disabled={!canEdit}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  >
                    <option value="">{isRTL ? 'اختر العهدة' : 'Select Custody'}</option>
                    {openCustodies.map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.employee_name} - {c.custody_number} ({isRTL ? 'متبقي:' : 'Remaining:'} {Number(c.remaining_balance).toLocaleString()})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {isRTL ? 'الوصف (إنجليزي) *' : 'Description (English) *'}
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  disabled={!canEdit}
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
                  disabled={!canEdit}
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
                  disabled={!canEdit}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Paperclip className="w-4 h-4 inline mr-1" />
                  {isRTL ? 'إرفاق إيصال' : 'Attach Receipt'}
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => attachmentFileInputRef.current?.click()}
                    className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2 text-sm"
                  >
                    <Paperclip className="w-4 h-4" />
                    {isRTL ? 'رفع ملف' : 'Upload File'}
                  </button>
                  <button
                    type="button"
                    onClick={() => attachmentCameraInputRef.current?.click()}
                    className="flex-1 px-4 py-2.5 border border-orange-300 bg-orange-50 rounded-lg hover:bg-orange-100 flex items-center justify-center gap-2 text-sm text-orange-700"
                  >
                    <Camera className="w-4 h-4" />
                    {isRTL ? 'التقاط صورة' : 'Take Photo'}
                  </button>
                </div>
                <input
                  ref={attachmentFileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
                <input
                  ref={attachmentCameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
                {attachmentFile && (
                  <p className="text-xs text-gray-500 mt-1">
                    {isRTL ? 'الملف المحدد: ' : 'Selected: '}{attachmentFile.name}
                  </p>
                )}
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
              {canEdit && (
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? (isRTL ? 'جاري الحفظ...' : 'Saving...') : (isRTL ? 'حفظ' : 'Save')}
                </button>
              )}
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
                <th className="text-center py-3 px-4 font-semibold text-gray-700">{isRTL ? 'المرفق' : 'Attachment'}</th>
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
                          {...{ title: isRTL ? 'من دفعات الشركاء' : 'From partner contributions' } as any}
                        />
                      )}
                      <span>{isRTL ? exp.description_ar || exp.description : exp.description}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-gray-900 font-bold">
                    {formatCurrency(Number(exp.amount))} {isRTL ? 'ر.س' : 'SAR'}
                  </td>
                  <td className="py-3 px-4 text-gray-600">{exp.payment_method}</td>
                  <td className="py-3 px-4 text-center">
                    {exp.attachment_url ? (
                      <button
                        onClick={() => handleViewAttachment(exp.attachment_url!)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition inline-flex items-center justify-center"
                        title={isRTL ? 'عرض المرفق' : 'View attachment'}
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    ) : (
                      <span className="text-gray-400 text-xs">-</span>
                    )}
                  </td>
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
                      ) : canEdit && isAdmin ? (
                        <button
                          onClick={() => setDeleteConfirm(exp.id)}
                          className="p-2 text-red-500 hover:bg-red-50 rounded transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      ) : null}
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

      <AttachmentPreviewModal
        isOpen={previewAttachment !== null}
        attachment={previewAttachment}
        onClose={() => setPreviewAttachment(null)}
        isRTL={isRTL}
      />
    </div>
  );
}
