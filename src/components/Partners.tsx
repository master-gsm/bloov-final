import { useEffect, useState, useRef } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useCanEdit } from '../hooks/useCanEdit';
import { supabase } from '../lib/supabase';
import { uploadFile, getFileUrl } from '../lib/fileUpload';
import { AttachmentPreviewModal } from './AttachmentPreviewModal';
import {
  Users, Plus, DollarSign, X, ShieldAlert, Trash2, FileSpreadsheet,
  Camera, Eye, Paperclip, ArrowRightLeft, Ban, Edit3, Check, AlertTriangle,
  PieChart, Percent, TrendingUp, UserPlus, Save,
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface Partner {
  id: string;
  name: string;
  name_ar: string;
  ownership_percentage: number;
  profit_share_percentage: number;
  capital_contribution: number;
  share_percentage: number;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface PartnerBalance {
  partner_id: string;
  name: string;
  name_ar: string;
  share_percentage: number;
  profit_share_percentage: number;
  capital_contribution: number;
  is_active: boolean;
  total_paid: number;
  fair_share: number;
  settlements_paid: number;
  settlements_received: number;
  current_balance: number;
}

interface PartnerSettlement {
  id: string;
  from_partner_id: string;
  to_partner_id: string;
  amount: number;
  description: string;
  description_ar: string | null;
  settlement_date: string;
  attachment_url: string | null;
  status: string;
  created_at: string;
  from_partner?: { name: string; name_ar: string };
  to_partner?: { name: string; name_ar: string };
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
  partner?: { name: string; name_ar: string };
}

const EXPENSE_TYPES = {
  capital: { ar: 'رأس مال نقدي', en: 'Cash Capital' },
  inventory: { ar: 'مخزون', en: 'Inventory' },
  asset: { ar: 'أصول ثابتة', en: 'Fixed Assets' },
  operational: { ar: 'مصروف تشغيلي', en: 'Operational Expense' },
};

type Tab = 'partners' | 'expenses' | 'settlements';

export function Partners() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const canEdit = useCanEdit();
  const isRTL = language === 'ar';

  const [partners, setPartners] = useState<Partner[]>([]);
  const [partnerBalances, setPartnerBalances] = useState<PartnerBalance[]>([]);
  const [settlements, setSettlements] = useState<PartnerSettlement[]>([]);
  const [expenses, setExpenses] = useState<SetupExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('partners');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [showPartnerForm, setShowPartnerForm] = useState(false);
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showSettlementForm, setShowSettlementForm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [voidConfirm, setVoidConfirm] = useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<{ url: string; type: string; name?: string; filePath?: string } | null>(null);

  const [partnerName, setPartnerName] = useState('');
  const [partnerNameAr, setPartnerNameAr] = useState('');
  const [ownershipPct, setOwnershipPct] = useState('');
  const [profitSharePct, setProfitSharePct] = useState('');
  const [capitalContribution, setCapitalContribution] = useState('');
  const [partnerEmail, setPartnerEmail] = useState('');
  const [partnerPhone, setPartnerPhone] = useState('');

  const [partnerId, setPartnerId] = useState('');
  const [expenseType, setExpenseType] = useState('capital');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [descriptionAr, setDescriptionAr] = useState('');
  const [amount, setAmount] = useState('');
  const [vatAmount, setVatAmount] = useState('');
  const [vatCategory, setVatCategory] = useState<'standard' | 'zero_rated' | 'exempt'>('exempt');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);

  const [fromPartnerId, setFromPartnerId] = useState('');
  const [toPartnerId, setToPartnerId] = useState('');
  const [settlementAmount, setSettlementAmount] = useState('');
  const [settlementDate, setSettlementDate] = useState(new Date().toISOString().split('T')[0]);
  const [settlementDescription, setSettlementDescription] = useState('');
  const [settlementDescriptionAr, setSettlementDescriptionAr] = useState('');
  const [settlementAttachmentFile, setSettlementAttachmentFile] = useState<File | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const settlementFileInputRef = useRef<HTMLInputElement>(null);
  const settlementCameraInputRef = useRef<HTMLInputElement>(null);

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
        .maybeSingle();
      setIsAdmin(userData?.role === 'admin');
    } catch (err) {
      console.error('Error checking user role:', err);
    }
  };

  const loadData = async () => {
    try {
      const [partnersRes, balancesRes, settlementsRes, expensesRes] = await Promise.all([
        supabase.from('partners').select('*').order('name'),
        supabase.from('v_partner_balances' as any).select('*').order('name'),
        supabase.from('partner_settlements').select(`
          *,
          from_partner:partners!from_partner_id(name, name_ar),
          to_partner:partners!to_partner_id(name, name_ar)
        `).order('settlement_date', { ascending: false }),
        supabase.from('setup_expenses').select(`
          *,
          partner:partners(name, name_ar)
        `).eq('is_deleted', false).order('expense_date', { ascending: false }),
      ]);

      if (partnersRes.data) setPartners(partnersRes.data as any[]);
      if (balancesRes.data) setPartnerBalances(balancesRes.data as any[]);
      if (settlementsRes.data) setSettlements(settlementsRes.data as any[]);
      if (expensesRes.data) setExpenses(expensesRes.data as any[]);
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const totalOwnership = partners
    .filter(p => p.is_active)
    .reduce((sum, p) => sum + Number(p.ownership_percentage || 0), 0);

  const remainingOwnership = 100 - totalOwnership;

  const openPartnerForm = (partner?: Partner) => {
    if (partner) {
      setEditingPartner(partner);
      setPartnerName(partner.name);
      setPartnerNameAr(partner.name_ar);
      setOwnershipPct(String(partner.ownership_percentage));
      setProfitSharePct(String(partner.profit_share_percentage));
      setCapitalContribution(String(partner.capital_contribution));
      setPartnerEmail(partner.email || '');
      setPartnerPhone(partner.phone || '');
    } else {
      setEditingPartner(null);
      setPartnerName('');
      setPartnerNameAr('');
      setOwnershipPct('');
      setProfitSharePct('');
      setCapitalContribution('0');
      setPartnerEmail('');
      setPartnerPhone('');
    }
    setError('');
    setShowPartnerForm(true);
  };

  const handlePartnerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partnerName || !partnerNameAr || !ownershipPct) return;

    setSubmitting(true);
    setError('');

    try {
      const ownership = parseFloat(ownershipPct);
      const profitShare = profitSharePct ? parseFloat(profitSharePct) : ownership;

      const otherPartnersTotal = partners
        .filter(p => p.is_active && (!editingPartner || p.id !== editingPartner.id))
        .reduce((sum, p) => sum + Number(p.ownership_percentage || 0), 0);

      if (otherPartnersTotal + ownership > 100) {
        setError(isRTL
          ? `المجموع سيكون ${(otherPartnersTotal + ownership).toFixed(2)}% وهو يتجاوز 100%. المتبقي المتاح: ${(100 - otherPartnersTotal).toFixed(2)}%`
          : `Total would be ${(otherPartnersTotal + ownership).toFixed(2)}% which exceeds 100%. Available: ${(100 - otherPartnersTotal).toFixed(2)}%`
        );
        setSubmitting(false);
        return;
      }

      const partnerData = {
        name: partnerName,
        name_ar: partnerNameAr,
        ownership_percentage: ownership,
        profit_share_percentage: profitShare,
        capital_contribution: capitalContribution ? parseFloat(capitalContribution) : 0,
        email: partnerEmail || null,
        phone: partnerPhone || null,
      };

      if (editingPartner) {
        const { error: err } = await supabase
          .from('partners')
          .update(partnerData)
          .eq('id', editingPartner.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase
          .from('partners')
          .insert([{ ...partnerData, is_active: true }]);
        if (err) throw err;
      }

      setShowPartnerForm(false);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partnerId || !amount || !description) return;
    setSubmitting(true);
    setError('');
    try {
      let attachmentPath = null;
      if (attachmentFile) {
        attachmentPath = await uploadFile(attachmentFile, 'setup_expenses');
      }
      const parsedAmount = parseFloat(amount);
      const parsedVat = vatCategory === 'standard' && vatAmount ? parseFloat(vatAmount) : 0;
      const expenseData = {
        partner_id: partnerId,
        expense_type: expenseType,
        category: category || expenseType,
        description,
        description_ar: descriptionAr || description,
        amount: parsedAmount,
        vat_amount: parsedVat,
        vat_category: vatCategory,
        payment_method: paymentMethod,
        expense_date: expenseDate,
        attachment: attachmentPath,
        notes,
        created_by: user?.id,
      };
      const { error } = await supabase.from('setup_expenses').insert([expenseData]);
      if (error) throw error;
      setShowExpenseForm(false);
      resetExpenseForm();
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!isAdmin) return;
    try {
      const { data, error } = await supabase.rpc('void_partner_operation_atomic' as any, {
        p_expense_id: id,
        p_reason: 'Voided via Partners UI',
      } as any);
      if (error) throw error;
      const result = data as any;
      if (!result?.success) {
        throw new Error(result?.message || (isRTL ? 'فشل إلغاء المصروف' : 'Failed to void expense'));
      }
      setDeleteConfirm(null);
      await loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSettlementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromPartnerId || !toPartnerId || !settlementAmount) return;
    setSubmitting(true);
    setError('');
    try {
      let attachmentPath = null;
      if (settlementAttachmentFile) {
        attachmentPath = await uploadFile(settlementAttachmentFile, 'receipts');
      }
      const { error } = await supabase.from('partner_settlements').insert([{
        from_partner_id: fromPartnerId,
        to_partner_id: toPartnerId,
        amount: parseFloat(settlementAmount),
        settlement_date: settlementDate,
        description: settlementDescription || 'Settlement payment',
        description_ar: settlementDescriptionAr || settlementDescription || 'تسوية بين الشركاء',
        attachment_url: attachmentPath,
        status: 'active',
      }]);
      if (error) throw error;
      setShowSettlementForm(false);
      resetSettlementForm();
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleVoidSettlement = async (id: string) => {
    if (!isAdmin) return;
    try {
      const { error } = await supabase.rpc('void_partner_settlement' as any, {
        p_settlement_id: id,
        p_void_reason: 'Voided via Partners UI',
      } as any);
      if (error) throw error;
      setVoidConfirm(null);
      await loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const resetExpenseForm = () => {
    setPartnerId('');
    setExpenseType('capital');
    setCategory('');
    setDescription('');
    setDescriptionAr('');
    setAmount('');
    setVatAmount('');
    setVatCategory('exempt');
    setPaymentMethod('cash');
    setExpenseDate(new Date().toISOString().split('T')[0]);
    setNotes('');
    setAttachmentFile(null);
    setError('');
  };

  const resetSettlementForm = () => {
    setFromPartnerId('');
    setToPartnerId('');
    setSettlementAmount('');
    setSettlementDate(new Date().toISOString().split('T')[0]);
    setSettlementDescription('');
    setSettlementDescriptionAr('');
    setSettlementAttachmentFile(null);
    setError('');
  };

  const handleViewAttachment = (path: string) => {
    const url = getFileUrl(path);
    setPreviewAttachment({
      url,
      type: path.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image',
      name: path.split('/').pop(),
      filePath: path,
    });
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-US', { style: 'decimal', minimumFractionDigits: 2 }).format(val);

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
        isRTL ? 'الوصف' : 'Description',
        isRTL ? 'المبلغ' : 'Amount',
      ],
    ];
    expenses.forEach((expense) => {
      const partner = partners.find(p => p.id === expense.partner_id);
      data.push([
        formatDate(expense.expense_date),
        partner ? (isRTL ? partner.name_ar : partner.name) : (isRTL ? 'عام' : 'General'),
        isRTL ? EXPENSE_TYPES[expense.expense_type as keyof typeof EXPENSE_TYPES]?.ar : EXPENSE_TYPES[expense.expense_type as keyof typeof EXPENSE_TYPES]?.en,
        isRTL ? (expense.description_ar || expense.description) : expense.description,
        Number(expense.amount).toFixed(2),
      ]);
    });
    data.push([], [
      isRTL ? 'الإجمالي' : 'Total', '', '', '',
      expenses.reduce((sum, exp) => sum + Number(exp.amount), 0).toFixed(2),
    ]);
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 30 }, { wch: 15 }];
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
  const inventoryExpenses = expenses.filter(e => e.expense_type === 'inventory').reduce((sum, exp) => sum + Number(exp.amount), 0);
  const assetExpenses = expenses.filter(e => e.expense_type === 'asset').reduce((sum, exp) => sum + Number(exp.amount), 0);
  const operationalExpenses = expenses.filter(e => e.expense_type === 'operational').reduce((sum, exp) => sum + Number(exp.amount), 0);

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'partners', label: isRTL ? 'الشركاء' : 'Partners', count: partners.length },
    { id: 'expenses', label: isRTL ? 'المصاريف' : 'Expenses', count: expenses.length },
    { id: 'settlements', label: isRTL ? 'التسويات' : 'Settlements', count: settlements.length },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {isRTL ? 'إدارة الشركاء' : 'Partner Management'}
          </h2>
          <p className="text-gray-500 mt-1">
            {isRTL ? 'إدارة الملكية والنسب والمصاريف التأسيسية' : 'Manage ownership, shares, and setup expenses'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportToExcel}
            disabled={expenses.length === 0}
            className="flex items-center gap-2 bg-green-600 text-white px-4 py-2.5 rounded-lg hover:bg-green-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileSpreadsheet className="w-5 h-5" />
            <span className="hidden sm:inline">{isRTL ? 'تصدير Excel' : 'Export'}</span>
          </button>
        </div>
      </div>

      {/* Ownership Overview */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="bg-teal-50 p-2.5 rounded-xl">
              <PieChart className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">{isRTL ? 'توزيع الملكية' : 'Ownership Distribution'}</h3>
              <p className="text-xs text-gray-500">
                {isRTL ? `مستخدم ${totalOwnership.toFixed(1)}% من 100%` : `${totalOwnership.toFixed(1)}% of 100% allocated`}
              </p>
            </div>
          </div>
          {totalOwnership < 100 && (
            <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm font-medium">
                {isRTL ? `متبقي ${remainingOwnership.toFixed(1)}%` : `${remainingOwnership.toFixed(1)}% remaining`}
              </span>
            </div>
          )}
          {totalOwnership === 100 && (
            <div className="flex items-center gap-2 text-green-600 bg-green-50 px-3 py-1.5 rounded-lg">
              <Check className="w-4 h-4" />
              <span className="text-sm font-medium">
                {isRTL ? 'مكتمل 100%' : '100% Allocated'}
              </span>
            </div>
          )}
        </div>

        <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
          <div className="flex h-full">
            {partners.filter(p => p.is_active).map((p, i) => {
              const colors = ['bg-teal-500', 'bg-sky-500', 'bg-amber-500', 'bg-rose-500', 'bg-emerald-500'];
              return (
                <div
                  key={p.id}
                  className={`${colors[i % colors.length]} h-full transition-all duration-500`}
                  style={{ width: `${Number(p.ownership_percentage)}%` }}
                  title={`${isRTL ? p.name_ar : p.name}: ${p.ownership_percentage}%`}
                />
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap gap-4 mt-3">
          {partners.filter(p => p.is_active).map((p, i) => {
            const colors = ['text-teal-600', 'text-sky-600', 'text-amber-600', 'text-rose-600', 'text-emerald-600'];
            const bgColors = ['bg-teal-500', 'bg-sky-500', 'bg-amber-500', 'bg-rose-500', 'bg-emerald-500'];
            return (
              <div key={p.id} className="flex items-center gap-2 text-sm">
                <div className={`w-3 h-3 rounded-full ${bgColors[i % bgColors.length]}`} />
                <span className={`font-medium ${colors[i % colors.length]}`}>
                  {isRTL ? p.name_ar : p.name}
                </span>
                <span className="text-gray-400">{Number(p.ownership_percentage).toFixed(1)}%</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                activeTab === tab.id ? 'bg-teal-100 text-teal-700' : 'bg-gray-200 text-gray-600'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Partners Tab */}
      {activeTab === 'partners' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            {canEdit && (
              <button
                onClick={() => openPartnerForm()}
                className="flex items-center gap-2 bg-teal-600 text-white px-4 py-2.5 rounded-lg hover:bg-teal-700 transition font-medium"
              >
                <UserPlus className="w-5 h-5" />
                {isRTL ? 'إضافة شريك' : 'Add Partner'}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {partners.map((partner, i) => {
              const balance = partnerBalances.find(b => b.partner_id === partner.id);
              const borderColors = ['border-l-teal-500', 'border-l-sky-500', 'border-l-amber-500', 'border-l-rose-500', 'border-l-emerald-500'];

              return (
                <div
                  key={partner.id}
                  className={`bg-white rounded-xl shadow-sm border border-gray-100 border-l-4 ${borderColors[i % borderColors.length]} overflow-hidden`}
                >
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h4 className="text-lg font-bold text-gray-900">
                          {isRTL ? partner.name_ar : partner.name}
                        </h4>
                        <p className="text-sm text-gray-500">{isRTL ? partner.name : partner.name_ar}</p>
                      </div>
                      {canEdit && (
                        <button
                          onClick={() => openPartnerForm(partner)}
                          className="p-2 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Percent className="w-3.5 h-3.5 text-teal-500" />
                          <span className="text-xs text-gray-500">{isRTL ? 'نسبة الملكية' : 'Ownership'}</span>
                        </div>
                        <p className="text-xl font-bold text-gray-900">{Number(partner.ownership_percentage).toFixed(1)}%</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <TrendingUp className="w-3.5 h-3.5 text-sky-500" />
                          <span className="text-xs text-gray-500">{isRTL ? 'نسبة الأرباح' : 'Profit Share'}</span>
                        </div>
                        <p className="text-xl font-bold text-gray-900">{Number(partner.profit_share_percentage).toFixed(1)}%</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <DollarSign className="w-3.5 h-3.5 text-amber-500" />
                          <span className="text-xs text-gray-500">{isRTL ? 'رأس المال' : 'Capital'}</span>
                        </div>
                        <p className="text-lg font-bold text-gray-900">
                          {formatCurrency(Number(partner.capital_contribution))}
                        </p>
                      </div>
                      {balance && (
                        <div className="bg-gray-50 rounded-lg p-3">
                          <div className="flex items-center gap-1.5 mb-1">
                            <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
                            <span className="text-xs text-gray-500">{isRTL ? 'الرصيد' : 'Balance'}</span>
                          </div>
                          <p className={`text-lg font-bold ${balance.current_balance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                            {balance.current_balance >= 0 ? '+' : ''}{formatCurrency(balance.current_balance)}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {balance.current_balance >= 0
                              ? (isRTL ? 'له مستحق' : 'Owed to them')
                              : (isRTL ? 'عليه مستحق' : 'They owe')}
                          </p>
                        </div>
                      )}
                    </div>

                    {(partner.email || partner.phone) && (
                      <div className="mt-3 pt-3 border-t border-gray-100 flex gap-4 text-sm text-gray-500">
                        {partner.email && <span>{partner.email}</span>}
                        {partner.phone && <span dir="ltr">{partner.phone}</span>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {partners.length === 0 && (
            <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
              <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-700 mb-2">
                {isRTL ? 'لا يوجد شركاء' : 'No Partners Yet'}
              </h3>
              <p className="text-gray-500 mb-4">
                {isRTL ? 'ابدأ بإضافة شريك جديد' : 'Start by adding a new partner'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Expenses Tab */}
      {activeTab === 'expenses' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            {canEdit && (
              <button
                onClick={() => { resetExpenseForm(); setShowExpenseForm(true); }}
                className="flex items-center gap-2 bg-teal-600 text-white px-4 py-2.5 rounded-lg hover:bg-teal-700 transition font-medium"
              >
                <Plus className="w-5 h-5" />
                {isRTL ? 'إضافة مصروف' : 'Add Expense'}
              </button>
            )}
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: isRTL ? 'رأس المال' : 'Cash Capital', val: capitalExpenses, color: 'teal', acc: '1110' },
              { label: isRTL ? 'مخزون' : 'Inventory', val: inventoryExpenses, color: 'green', acc: '1132' },
              { label: isRTL ? 'أصول ثابتة' : 'Fixed Assets', val: assetExpenses, color: 'blue', acc: '1213' },
              { label: isRTL ? 'تشغيلية' : 'Operational', val: operationalExpenses, color: 'orange', acc: '6000' },
            ].map((item, idx) => (
              <div key={idx} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`bg-${item.color}-50 p-2 rounded-lg`}>
                    <DollarSign className={`w-4 h-4 text-${item.color}-600`} />
                  </div>
                  <p className="text-xs text-gray-500">{item.label}</p>
                </div>
                <p className="text-xl font-bold text-gray-900">{formatCurrency(item.val)}</p>
                <p className="text-xs text-gray-400 mt-0.5">{isRTL ? `ح/ ${item.acc}` : `Acc ${item.acc}`}</p>
              </div>
            ))}
          </div>

          {/* Expenses Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="py-3 px-6 text-left text-xs font-semibold text-gray-700 uppercase">{isRTL ? 'التاريخ' : 'Date'}</th>
                    <th className="py-3 px-6 text-left text-xs font-semibold text-gray-700 uppercase">{isRTL ? 'الشريك' : 'Partner'}</th>
                    <th className="py-3 px-6 text-left text-xs font-semibold text-gray-700 uppercase">{isRTL ? 'النوع' : 'Type'}</th>
                    <th className="py-3 px-6 text-left text-xs font-semibold text-gray-700 uppercase">{isRTL ? 'الوصف' : 'Description'}</th>
                    <th className="py-3 px-6 text-left text-xs font-semibold text-gray-700 uppercase">{isRTL ? 'المبلغ' : 'Amount'}</th>
                    <th className="py-3 px-6 text-center text-xs font-semibold text-gray-700 uppercase">{isRTL ? 'المرفق' : 'Attach'}</th>
                    <th className="py-3 px-6 text-center text-xs font-semibold text-gray-700 uppercase">{isRTL ? 'إجراء' : 'Action'}</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.length === 0 ? (
                    <tr><td colSpan={7} className="py-12 text-center text-gray-500">{isRTL ? 'لا توجد مصاريف' : 'No expenses'}</td></tr>
                  ) : expenses.map(expense => {
                    const partner = partners.find(p => p.id === expense.partner_id);
                    const typeColor: Record<string, string> = { capital: 'teal', inventory: 'green', asset: 'blue', operational: 'orange' };
                    const c = typeColor[expense.expense_type] || 'gray';
                    return (
                      <tr key={expense.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition">
                        <td className="py-3 px-6 text-sm text-gray-600">{formatDate(expense.expense_date)}</td>
                        <td className="py-3 px-6 text-sm text-gray-900 font-medium">
                          {partner ? (isRTL ? partner.name_ar : partner.name) : (isRTL ? 'عام' : 'General')}
                        </td>
                        <td className="py-3 px-6 text-sm">
                          <span className={`px-2 py-1 bg-${c}-100 text-${c}-800 rounded-full text-xs font-medium`}>
                            {isRTL ? EXPENSE_TYPES[expense.expense_type as keyof typeof EXPENSE_TYPES]?.ar : EXPENSE_TYPES[expense.expense_type as keyof typeof EXPENSE_TYPES]?.en}
                          </span>
                        </td>
                        <td className="py-3 px-6 text-sm text-gray-900">
                          {isRTL ? (expense.description_ar || expense.description) : expense.description}
                          {expense.notes && <p className="text-xs text-gray-500 mt-1">{expense.notes}</p>}
                        </td>
                        <td className="py-3 px-6 text-sm font-bold text-teal-900">{formatCurrency(Number(expense.amount))} {isRTL ? 'ر.س' : 'SAR'}</td>
                        <td className="py-3 px-6 text-center">
                          {expense.attachment ? (
                            <button onClick={() => handleViewAttachment(expense.attachment!)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition">
                              <Eye className="w-4 h-4" />
                            </button>
                          ) : <span className="text-gray-400 text-xs">-</span>}
                        </td>
                        <td className="py-3 px-6 text-center">
                          {deleteConfirm === expense.id ? (
                            <div className="flex items-center justify-center gap-2">
                              <button onClick={() => handleDeleteExpense(expense.id)} className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700">
                                {isRTL ? 'تأكيد' : 'Confirm'}
                              </button>
                              <button onClick={() => setDeleteConfirm(null)} className="px-2 py-1 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300">
                                {isRTL ? 'إلغاء' : 'Cancel'}
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => setDeleteConfirm(expense.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Settlements Tab */}
      {activeTab === 'settlements' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            {canEdit && (
              <button
                onClick={() => { resetSettlementForm(); setShowSettlementForm(true); }}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 transition font-medium"
              >
                <ArrowRightLeft className="w-5 h-5" />
                {isRTL ? 'دفعة من شريك' : 'Partner Payment'}
              </button>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="py-3 px-6 text-left text-xs font-semibold text-gray-700 uppercase">{isRTL ? 'التاريخ' : 'Date'}</th>
                    <th className="py-3 px-6 text-left text-xs font-semibold text-gray-700 uppercase">{isRTL ? 'من' : 'From'}</th>
                    <th className="py-3 px-6 text-left text-xs font-semibold text-gray-700 uppercase">{isRTL ? 'إلى' : 'To'}</th>
                    <th className="py-3 px-6 text-left text-xs font-semibold text-gray-700 uppercase">{isRTL ? 'المبلغ' : 'Amount'}</th>
                    <th className="py-3 px-6 text-left text-xs font-semibold text-gray-700 uppercase">{isRTL ? 'الحالة' : 'Status'}</th>
                    <th className="py-3 px-6 text-center text-xs font-semibold text-gray-700 uppercase">{isRTL ? 'إجراء' : 'Action'}</th>
                  </tr>
                </thead>
                <tbody>
                  {settlements.length === 0 ? (
                    <tr><td colSpan={6} className="py-12 text-center text-gray-500">{isRTL ? 'لا توجد تسويات' : 'No settlements'}</td></tr>
                  ) : settlements.map(settlement => {
                    const isVoided = settlement.status === 'voided';
                    return (
                      <tr key={settlement.id} className={`border-b border-gray-50 hover:bg-gray-50/50 transition ${isVoided ? 'opacity-50' : ''}`}>
                        <td className="py-3 px-6 text-sm text-gray-600">{formatDate(settlement.settlement_date)}</td>
                        <td className="py-3 px-6 text-sm text-gray-900 font-medium">
                          {settlement.from_partner ? (isRTL ? settlement.from_partner.name_ar : settlement.from_partner.name) : '-'}
                        </td>
                        <td className="py-3 px-6 text-sm text-gray-900 font-medium">
                          {settlement.to_partner ? (isRTL ? settlement.to_partner.name_ar : settlement.to_partner.name) : '-'}
                        </td>
                        <td className="py-3 px-6 text-sm font-bold text-blue-900">{formatCurrency(Number(settlement.amount))} {isRTL ? 'ر.س' : 'SAR'}</td>
                        <td className="py-3 px-6 text-sm">
                          {isVoided ? (
                            <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium">{isRTL ? 'ملغى' : 'Voided'}</span>
                          ) : (
                            <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">{isRTL ? 'نشط' : 'Active'}</span>
                          )}
                        </td>
                        <td className="py-3 px-6 text-center">
                          {!isVoided && (
                            voidConfirm === settlement.id ? (
                              <div className="flex items-center justify-center gap-2">
                                <button onClick={() => handleVoidSettlement(settlement.id)} className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700">
                                  {isRTL ? 'تأكيد' : 'Confirm'}
                                </button>
                                <button onClick={() => setVoidConfirm(null)} className="px-2 py-1 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300">
                                  {isRTL ? 'إلغاء' : 'Cancel'}
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => setVoidConfirm(settlement.id)} className="p-1.5 text-orange-500 hover:bg-orange-50 rounded-lg transition">
                                <Ban className="w-4 h-4" />
                              </button>
                            )
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Partner Form Modal */}
      {showPartnerForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
              <h3 className="text-lg font-bold text-gray-900">
                {editingPartner
                  ? (isRTL ? 'تعديل الشريك' : 'Edit Partner')
                  : (isRTL ? 'إضافة شريك جديد' : 'Add New Partner')}
              </h3>
              <button onClick={() => setShowPartnerForm(false)} className="p-2 hover:bg-gray-100 rounded-lg transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handlePartnerSubmit} className="p-6 space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                {isRTL
                  ? `الملكية الحالية المخصصة: ${totalOwnership.toFixed(1)}% — المتبقي: ${editingPartner
                      ? (100 - totalOwnership + Number(editingPartner.ownership_percentage)).toFixed(1)
                      : remainingOwnership.toFixed(1)}%`
                  : `Current allocated: ${totalOwnership.toFixed(1)}% — Available: ${editingPartner
                      ? (100 - totalOwnership + Number(editingPartner.ownership_percentage)).toFixed(1)
                      : remainingOwnership.toFixed(1)}%`}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{isRTL ? 'الاسم (إنجليزي) *' : 'Name (English) *'}</label>
                  <input type="text" value={partnerName} onChange={e => setPartnerName(e.target.value)} required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{isRTL ? 'الاسم (عربي) *' : 'Name (Arabic) *'}</label>
                  <input type="text" value={partnerNameAr} onChange={e => setPartnerNameAr(e.target.value)} required dir="rtl"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{isRTL ? 'نسبة الملكية % *' : 'Ownership % *'}</label>
                  <input type="number" step="0.01" min="0" max="100" value={ownershipPct} onChange={e => {
                    setOwnershipPct(e.target.value);
                    if (!profitSharePct || profitSharePct === ownershipPct) setProfitSharePct(e.target.value);
                  }} required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent" placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{isRTL ? 'نسبة الأرباح %' : 'Profit Share %'}</label>
                  <input type="number" step="0.01" min="0" max="100" value={profitSharePct} onChange={e => setProfitSharePct(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent" placeholder="0.00" />
                  <p className="text-xs text-gray-400 mt-1">{isRTL ? 'تلقائياً = نسبة الملكية' : 'Defaults to ownership %'}</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{isRTL ? 'رأس المال المساهم (ر.س)' : 'Capital Contribution (SAR)'}</label>
                <input type="number" step="0.01" min="0" value={capitalContribution} onChange={e => setCapitalContribution(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent" placeholder="0.00" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{isRTL ? 'البريد الإلكتروني' : 'Email'}</label>
                  <input type="email" value={partnerEmail} onChange={e => setPartnerEmail(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{isRTL ? 'رقم الهاتف' : 'Phone'}</label>
                  <input type="tel" value={partnerPhone} onChange={e => setPartnerPhone(e.target.value)} dir="ltr"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button type="button" onClick={() => setShowPartnerForm(false)}
                  className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition font-medium">
                  {isRTL ? 'إلغاء' : 'Cancel'}
                </button>
                <button type="submit" disabled={submitting}
                  className="flex items-center gap-2 px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition font-medium disabled:opacity-50">
                  <Save className="w-4 h-4" />
                  {submitting ? (isRTL ? 'جاري الحفظ...' : 'Saving...') : (isRTL ? 'حفظ' : 'Save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Expense Form Modal */}
      {showExpenseForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
              <h3 className="text-lg font-bold text-gray-900">{isRTL ? 'إضافة مصروف تأسيسي' : 'Add Setup Expense'}</h3>
              <button onClick={() => { setShowExpenseForm(false); resetExpenseForm(); }} className="p-2 hover:bg-gray-100 rounded-lg transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleExpenseSubmit} className="p-6 space-y-4">
              {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{isRTL ? 'الشريك *' : 'Partner *'}</label>
                  <select value={partnerId} onChange={e => setPartnerId(e.target.value)} required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent">
                    <option value="">{isRTL ? 'اختر شريك' : 'Select Partner'}</option>
                    {partners.map(p => <option key={p.id} value={p.id}>{isRTL ? p.name_ar : p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{isRTL ? 'نوع المصروف *' : 'Expense Type *'}</label>
                  <select value={expenseType} onChange={e => setExpenseType(e.target.value)} required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent">
                    {Object.entries(EXPENSE_TYPES).map(([key, val]) => <option key={key} value={key}>{isRTL ? val.ar : val.en}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{isRTL ? 'الوصف *' : 'Description *'}</label>
                <input type="text" value={description} onChange={e => setDescription(e.target.value)} required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{isRTL ? 'الوصف بالعربي' : 'Arabic Description'}</label>
                <input type="text" value={descriptionAr} onChange={e => setDescriptionAr(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{isRTL ? 'المبلغ (ر.س) *' : 'Amount (SAR) *'}</label>
                  <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent" placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{isRTL ? 'التاريخ *' : 'Date *'}</label>
                  <input type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{isRTL ? 'فئة الضريبة' : 'VAT Category'}</label>
                  <select value={vatCategory} onChange={e => { setVatCategory(e.target.value as any); if (e.target.value !== 'standard') setVatAmount(''); }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent">
                    <option value="exempt">{isRTL ? 'معفى' : 'Exempt'}</option>
                    <option value="standard">{isRTL ? 'ضريبة 15%' : 'Standard 15%'}</option>
                    <option value="zero_rated">{isRTL ? 'صفر %' : 'Zero Rated'}</option>
                  </select>
                </div>
                {vatCategory === 'standard' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{isRTL ? 'مبلغ الضريبة' : 'VAT Amount'}</label>
                    <input type="number" step="0.01" value={vatAmount} onChange={e => setVatAmount(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent" placeholder="0.00" />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{isRTL ? 'طريقة الدفع' : 'Payment Method'}</label>
                  <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent">
                    <option value="cash">{isRTL ? 'نقدي' : 'Cash'}</option>
                    <option value="partner">{isRTL ? 'من الشريك' : 'From Partner'}</option>
                    <option value="bank_transfer">{isRTL ? 'تحويل بنكي' : 'Bank Transfer'}</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{isRTL ? 'ملاحظات' : 'Notes'}</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{isRTL ? 'المرفق' : 'Attachment'}</label>
                <div className="flex gap-2">
                  <input type="file" ref={fileInputRef} onChange={e => setAttachmentFile(e.target.files?.[0] || null)} accept="image/*,application/pdf" className="hidden" />
                  <input type="file" ref={cameraInputRef} onChange={e => setAttachmentFile(e.target.files?.[0] || null)} accept="image/*" capture="environment" className="hidden" />
                  <button type="button" onClick={() => fileInputRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg hover:border-teal-500 hover:bg-teal-50 transition">
                    <Paperclip className="w-4 h-4" />{attachmentFile ? attachmentFile.name : (isRTL ? 'اختر ملف' : 'Choose File')}
                  </button>
                  <button type="button" onClick={() => cameraInputRef.current?.click()}
                    className="px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg hover:border-teal-500 hover:bg-teal-50 transition">
                    <Camera className="w-4 h-4" />
                  </button>
                </div>
                {attachmentFile && <button type="button" onClick={() => setAttachmentFile(null)} className="mt-2 text-sm text-red-600 hover:underline">{isRTL ? 'إزالة المرفق' : 'Remove'}</button>}
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button type="button" onClick={() => { setShowExpenseForm(false); resetExpenseForm(); }}
                  className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition font-medium">{isRTL ? 'إلغاء' : 'Cancel'}</button>
                <button type="submit" disabled={submitting}
                  className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition font-medium disabled:opacity-50">
                  {submitting ? (isRTL ? 'جاري الحفظ...' : 'Saving...') : (isRTL ? 'حفظ' : 'Save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Settlement Form Modal */}
      {showSettlementForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
              <h3 className="text-lg font-bold text-gray-900">{isRTL ? 'إضافة دفعة من شريك' : 'Add Partner Payment'}</h3>
              <button onClick={() => { setShowSettlementForm(false); resetSettlementForm(); }} className="p-2 hover:bg-gray-100 rounded-lg transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSettlementSubmit} className="p-6 space-y-4">
              {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{isRTL ? 'من (الدافع) *' : 'From (Payer) *'}</label>
                  <select value={fromPartnerId} onChange={e => setFromPartnerId(e.target.value)} required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                    <option value="">{isRTL ? 'اختر الشريك' : 'Select partner'}</option>
                    {partners.map(p => <option key={p.id} value={p.id}>{isRTL ? p.name_ar : p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{isRTL ? 'إلى (المستلم) *' : 'To (Receiver) *'}</label>
                  <select value={toPartnerId} onChange={e => setToPartnerId(e.target.value)} required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                    <option value="">{isRTL ? 'اختر الشريك' : 'Select partner'}</option>
                    {partners.map(p => <option key={p.id} value={p.id}>{isRTL ? p.name_ar : p.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{isRTL ? 'المبلغ (ر.س) *' : 'Amount (SAR) *'}</label>
                  <input type="number" step="0.01" value={settlementAmount} onChange={e => setSettlementAmount(e.target.value)} required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{isRTL ? 'التاريخ *' : 'Date *'}</label>
                  <input type="date" value={settlementDate} onChange={e => setSettlementDate(e.target.value)} required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{isRTL ? 'الوصف' : 'Description'}</label>
                <input type="text" value={settlementDescription} onChange={e => setSettlementDescription(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{isRTL ? 'الوصف بالعربي' : 'Arabic Description'}</label>
                <input type="text" value={settlementDescriptionAr} onChange={e => setSettlementDescriptionAr(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{isRTL ? 'المرفق' : 'Attachment'}</label>
                <div className="flex gap-2">
                  <input type="file" ref={settlementFileInputRef} onChange={e => setSettlementAttachmentFile(e.target.files?.[0] || null)} accept="image/*,application/pdf" className="hidden" />
                  <input type="file" ref={settlementCameraInputRef} onChange={e => setSettlementAttachmentFile(e.target.files?.[0] || null)} accept="image/*" capture="environment" className="hidden" />
                  <button type="button" onClick={() => settlementFileInputRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition">
                    <Paperclip className="w-4 h-4" />{settlementAttachmentFile ? settlementAttachmentFile.name : (isRTL ? 'اختر ملف' : 'Choose File')}
                  </button>
                  <button type="button" onClick={() => settlementCameraInputRef.current?.click()}
                    className="px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition">
                    <Camera className="w-4 h-4" />
                  </button>
                </div>
                {settlementAttachmentFile && <button type="button" onClick={() => setSettlementAttachmentFile(null)} className="mt-2 text-sm text-red-600 hover:underline">{isRTL ? 'إزالة المرفق' : 'Remove'}</button>}
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button type="button" onClick={() => { setShowSettlementForm(false); resetSettlementForm(); }}
                  className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition font-medium">{isRTL ? 'إلغاء' : 'Cancel'}</button>
                <button type="submit" disabled={submitting}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50">
                  {submitting ? (isRTL ? 'جاري الحفظ...' : 'Saving...') : (isRTL ? 'حفظ' : 'Save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AttachmentPreviewModal
        isOpen={!!previewAttachment}
        attachment={previewAttachment}
        onClose={() => setPreviewAttachment(null)}
        isRTL={isRTL}
      />
    </div>
  );
}
