import { useEffect, useState, useRef, useCallback } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useCanEdit } from '../hooks/useCanEdit';
import { useBranch } from '../contexts/BranchContext';
import { supabase } from '../lib/supabase';
import { uploadFile, getFileUrl } from '../lib/fileUpload';
import { AttachmentPreviewModal } from './AttachmentPreviewModal';
import { PartnerReports } from './partners/PartnerReports';
import PartnerSettlements from './partners/PartnerSettlements';
import {
  Partner, PartnerAccount, PartnerWithdrawal, ProfitDistribution,
  PartnerSettlement, SetupExpense, EXPENSE_TYPES, MONTH_NAMES_AR, MONTH_NAMES_EN,
  mapExpenseType,
} from './partners/types';
import {
  Users, Plus, DollarSign, X, ShieldAlert, FileSpreadsheet,
  Camera, Eye, Paperclip, ArrowRightLeft, Ban, Edit3, Check, AlertTriangle, AlertCircle,
  PieChart, Percent, TrendingUp, UserPlus, Save, ChevronDown, ChevronUp,
  ToggleLeft, ToggleRight, Landmark, Banknote, CalendarDays,
} from 'lucide-react';
import * as XLSX from 'xlsx';

const PARTNER_COLORS = ['teal', 'sky', 'amber', 'rose', 'emerald'] as const;
const BORDER_COLORS = ['border-l-teal-500', 'border-l-sky-500', 'border-l-amber-500', 'border-l-rose-500', 'border-l-emerald-500'];
const BG_DOTS = ['bg-teal-500', 'bg-sky-500', 'bg-amber-500', 'bg-rose-500', 'bg-emerald-500'];
const TEXT_COLORS = ['text-teal-600', 'text-sky-600', 'text-amber-600', 'text-rose-600', 'text-emerald-600'];
const BAR_COLORS = ['bg-teal-500', 'bg-sky-500', 'bg-amber-500', 'bg-rose-500', 'bg-emerald-500'];

function fmt(val: number) {
  return new Intl.NumberFormat('en-US', { style: 'decimal', minimumFractionDigits: 2 }).format(val);
}
function fmtDate(date: string | null, isRTL: boolean) {
  if (!date) return isRTL ? 'بدون تاريخ' : 'No date';
  return new Date(date).toLocaleDateString(isRTL ? 'ar-SA' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function Section({
  title, subtitle, icon: Icon, children, defaultOpen = true,
}: {
  title: string; subtitle?: string; icon: React.ComponentType<any>; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition"
      >
        <div className="flex items-center gap-3">
          <div className="bg-teal-50 p-2 rounded-lg">
            <Icon className="w-5 h-5 text-teal-600" />
          </div>
          <div className="text-left">
            <p className="font-bold text-gray-900 text-sm">{title}</p>
            {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && <div className="border-t border-gray-100">{children}</div>}
    </div>
  );
}

export function Partners() {
  const { language } = useLanguage();
  const { user, can } = useAuth();
  const canEdit = useCanEdit('partners');
  const { currentBranchId } = useBranch();
  const isRTL = language === 'ar';
  const canViewPartners = can('partners', 'view');

  const [partners, setPartners] = useState<Partner[]>([]);
  const [accounts, setAccounts] = useState<PartnerAccount[]>([]);
  const [settlements, setSettlements] = useState<PartnerSettlement[]>([]);
  const [expenses, setExpenses] = useState<SetupExpense[]>([]);
  const [withdrawals, setWithdrawals] = useState<PartnerWithdrawal[]>([]);
  const [distributions, setDistributions] = useState<ProfitDistribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'settlements'>('overview');
  const [previewAttachment, setPreviewAttachment] = useState<{ url: string; type: string; name?: string; filePath?: string } | null>(null);

  const [showPartnerForm, setShowPartnerForm] = useState(false);
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showImportExcel, setShowImportExcel] = useState(false);
  const [showSettlementForm, setShowSettlementForm] = useState(false);
  const [showWithdrawalForm, setShowWithdrawalForm] = useState(false);
  const [showDistributeModal, setShowDistributeModal] = useState(false);
  const [deactivateConfirm, setDeactivateConfirm] = useState<string | null>(null);
  const [deleteExpenseConfirm, setDeleteExpenseConfirm] = useState<string | null>(null);
  const [editingExpenseDateId, setEditingExpenseDateId] = useState<string | null>(null);
  const [editingExpenseDateVal, setEditingExpenseDateVal] = useState('');
  const [voidSettlementConfirm, setVoidSettlementConfirm] = useState<string | null>(null);

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importSubmitting, setImportSubmitting] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  const [partnerName, setPartnerName] = useState('');
  const [partnerNameAr, setPartnerNameAr] = useState('');
  const [ownershipPct, setOwnershipPct] = useState('');
  const [profitSharePct, setProfitSharePct] = useState('');
  const [capitalContribution, setCapitalContribution] = useState('0');
  const [partnerEmail, setPartnerEmail] = useState('');
  const [partnerPhone, setPartnerPhone] = useState('');

  const [wPartnerId, setWPartnerId] = useState('');
  const [wAmount, setWAmount] = useState('');
  const [wMethod, setWMethod] = useState<'cash' | 'bank'>('cash');
  const [wDescription, setWDescription] = useState('');
  const [wDescriptionAr, setWDescriptionAr] = useState('');
  const [wDate, setWDate] = useState(new Date().toISOString().split('T')[0]);

  const [distMonth, setDistMonth] = useState(String(new Date().getMonth() + 1));
  const [distYear, setDistYear] = useState(String(new Date().getFullYear()));
  const [distResult, setDistResult] = useState<any>(null);

  const [partnerId, setPartnerId] = useState('');
  const [expenseType, setExpenseType] = useState('capital');
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
    loadData();
  }, [user]);

  const loadData = useCallback(async () => {
    try {
      const [
        partnersRes, accountsRes, settlementsRes, expensesRes, withdrawalsRes, distributionsRes,
      ] = await Promise.all([
        supabase.from('partners').select('*').order('name'),
        supabase.from('v_partner_account' as any).select('*').order('name'),
        supabase.from('partner_settlements').select(`
          *, from_partner:partners!from_partner_id(name,name_ar),
          to_partner:partners!to_partner_id(name,name_ar)
        `).order('settlement_date', { ascending: false }),
        supabase.from('setup_expenses').select(`*, partner:partners(name,name_ar)`)
          .eq('is_deleted', false).order('expense_date', { ascending: false }),
        supabase.from('partner_withdrawals').select(`*, partner:partners(name,name_ar)`)
          .eq('is_voided', false).order('withdrawal_date', { ascending: false }),
        supabase.from('profit_distributions').select(`*, partner:partners(name,name_ar)`)
          .order('period_year', { ascending: false }).order('period_month', { ascending: false }),
      ]);

      if (partnersRes.data) setPartners(partnersRes.data as Partner[]);
      if (accountsRes.data) setAccounts(accountsRes.data as any[]);
      if (settlementsRes.data) setSettlements(settlementsRes.data as any[]);
      if (expensesRes.data) setExpenses(expensesRes.data as any[]);
      if (withdrawalsRes.data) setWithdrawals(withdrawalsRes.data as any[]);
      if (distributionsRes.data) setDistributions(distributionsRes.data as any[]);
    } catch (err) {
      console.error('Partners loadData error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const activePartners = partners.filter(p => p.is_active);
  const totalOwnership = activePartners.reduce((s, p) => s + Number(p.ownership_percentage || 0), 0);
  const remainingOwnership = 100 - totalOwnership;

  // Partner payment totals: SUM(amount) GROUP BY partner_id
  const partnerTotals = expenses.reduce<Record<string, number>>((acc, e) => {
    if (e.partner_id) {
      acc[e.partner_id] = (acc[e.partner_id] || 0) + Number(e.amount);
    }
    return acc;
  }, {});

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = ev.target?.result;
        const wb = XLSX.read(data, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(ws);

        const validated = rows.map((row, idx) => {
          const errors: string[] = [];
          const dateRaw = String(row.date || '').trim();
          let dateStr: string | null = null;
          if (dateRaw) {
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
              dateStr = dateRaw;
            } else {
              errors.push(isRTL ? 'صيغة التاريخ غير صحيحة (YYYY-MM-DD) أو اتركه فارغاً' : 'Invalid date format (YYYY-MM-DD) or leave empty');
            }
          }

          const partnerName = String(row.partner || '').trim();
          const foundPartner = partners.find(
            p => p.name.toLowerCase() === partnerName.toLowerCase() || p.name_ar === partnerName
          );
          if (!partnerName) errors.push(isRTL ? 'الشريك مطلوب' : 'Partner required');
          else if (!foundPartner) errors.push(isRTL ? `الشريك "${partnerName}" غير موجود` : `Partner not found`);

          const amt = parseFloat(row.amount);
          if (isNaN(amt) || amt <= 0) errors.push(isRTL ? 'المبلغ يجب أن يكون موجب' : 'Amount must be positive');

          if (!String(row.type || '').trim()) errors.push(isRTL ? 'النوع مطلوب' : 'Type required');
          if (!String(row.description || '').trim()) errors.push(isRTL ? 'الوصف مطلوب' : 'Description required');

          return {
            _row: idx + 2,
            _valid: errors.length === 0,
            _errors: errors,
            _partnerId: foundPartner?.id,
            date: dateStr,
            partner: partnerName,
            type: String(row.type || '').trim(),
            description: String(row.description || '').trim(),
            amount: isNaN(amt) ? 0 : amt,
          };
        });

        setImportPreview(validated);
      } catch (err) {
        alert(isRTL ? 'خطأ في قراءة الملف' : 'Error reading file');
      }
    };
    reader.readAsBinaryString(file);
    // reset so same file can be re-selected
    e.target.value = '';
  };

  const handleDownloadTemplate = () => {
    const firstPartner = activePartners[0];
    const secondPartner = activePartners[1] || activePartners[0];
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    const templateData = [
      { date: yesterday, partner: firstPartner?.name_ar || firstPartner?.name || 'سامي', type: 'capital', description: 'دفع حصة رأسمالية', amount: 10000 },
      { date: today, partner: secondPartner?.name_ar || secondPartner?.name || 'أنس', type: 'asset', description: 'شراء أصول ثابتة', amount: 5000 },
    ];

    const ws = XLSX.utils.json_to_sheet(templateData, { header: ['date', 'partner', 'type', 'description', 'amount'] });
    ws['!cols'] = [{ wch: 14 }, { wch: 16 }, { wch: 20 }, { wch: 30 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'import_template');
    XLSX.writeFile(wb, 'partner_expenses_template.xlsx');
  };

  const handleImportConfirm = async () => {
    const valid = importPreview.filter(r => r._valid);
    if (valid.length === 0) return;
    setImportSubmitting(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error('Not authenticated');

      const today = new Date().toISOString().split('T')[0];
      const records = valid.map(row => {
        const mapped = mapExpenseType(row.type || 'capital');
        return {
          branch_id: currentBranchId || null,
          category: mapped,
          expense_type: mapped,
          description: row.description,
          amount: row.amount,
          expense_date: row.date || today,
          payment_method: 'cash',
          partner_id: row._partnerId,
          created_by: authUser.id,
          notes: `Imported: ${importFile?.name || ''}`,
        };
      });

      const { error: insertError } = await supabase.from('setup_expenses').insert(records);
      if (insertError) throw insertError;

      setShowImportExcel(false);
      setImportFile(null);
      setImportPreview([]);
      await loadData();
    } catch (err: any) {
      setError(err.message || (isRTL ? 'خطأ في الاستيراد' : 'Import error'));
    } finally {
      setImportSubmitting(false);
    }
  };

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
      setPartnerName(''); setPartnerNameAr('');
      setOwnershipPct(''); setProfitSharePct('');
      setCapitalContribution('0');
      setPartnerEmail(''); setPartnerPhone('');
    }
    setError('');
    setShowPartnerForm(true);
  };

  const handlePartnerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const ownership = parseFloat(ownershipPct);
      const profitShare = profitSharePct ? parseFloat(profitSharePct) : ownership;

      const otherTotal = partners
        .filter(p => p.is_active && (!editingPartner || p.id !== editingPartner.id))
        .reduce((s, p) => s + Number(p.ownership_percentage || 0), 0);

      if (otherTotal + ownership > 100.001) {
        setError(isRTL
          ? `المجموع سيكون ${(otherTotal + ownership).toFixed(2)}%. المتبقي: ${(100 - otherTotal).toFixed(2)}%`
          : `Total would be ${(otherTotal + ownership).toFixed(2)}%. Available: ${(100 - otherTotal).toFixed(2)}%`);
        return;
      }

      const data = {
        name: partnerName, name_ar: partnerNameAr,
        ownership_percentage: ownership,
        profit_share_percentage: profitShare,
        capital_contribution: capitalContribution ? parseFloat(capitalContribution) : 0,
        email: partnerEmail || null,
        phone: partnerPhone || null,
      };

      if (editingPartner) {
        const { error: err } = await supabase.from('partners').update(data).eq('id', editingPartner.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from('partners').insert([{ ...data, is_active: true }]);
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

  const handleToggleActive = async (partner: Partner) => {
    try {
      const { error: err } = await supabase.from('partners')
        .update({ is_active: !partner.is_active })
        .eq('id', partner.id);
      if (err) throw err;
      setDeactivateConfirm(null);
      await loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleWithdrawalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wPartnerId || !wAmount || !wDescription) return;
    setSubmitting(true);
    setError('');
    try {
      const { data, error: err } = await supabase.rpc('fn_record_partner_withdrawal' as any, {
        p_partner_id: wPartnerId,
        p_amount: parseFloat(wAmount),
        p_method: wMethod,
        p_description: wDescription,
        p_description_ar: wDescriptionAr || wDescription,
        p_withdrawal_date: wDate,
        p_branch_id: currentBranchId,
      } as any);
      if (err) throw err;
      const result = data as any;
      if (!result?.success) throw new Error(result?.message || 'Failed');
      setShowWithdrawalForm(false);
      resetWithdrawalForm();
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const resetWithdrawalForm = () => {
    setWPartnerId(''); setWAmount(''); setWMethod('cash');
    setWDescription(''); setWDescriptionAr('');
    setWDate(new Date().toISOString().split('T')[0]);
    setError('');
  };

  const handleDistributeProfit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setDistResult(null);
    try {
      const { data, error: err } = await supabase.rpc('fn_distribute_monthly_profit' as any, {
        p_period_month: parseInt(distMonth),
        p_period_year: parseInt(distYear),
        p_branch_id: currentBranchId,
      } as any);
      if (err) throw err;
      const result = data as any;
      if (!result?.success) throw new Error(result?.message || 'Distribution failed');
      setDistResult(result);
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
      if (attachmentFile) attachmentPath = await uploadFile(attachmentFile, 'setup_expenses');
      const parsedAmount = parseFloat(amount);
      const parsedVat = vatCategory === 'standard' && vatAmount ? parseFloat(vatAmount) : 0;
      const { error: err } = await supabase.from('setup_expenses').insert([{
        partner_id: partnerId, expense_type: expenseType,
        category: expenseType, description, description_ar: descriptionAr || description,
        amount: parsedAmount, vat_amount: parsedVat, vat_category: vatCategory,
        payment_method: paymentMethod, expense_date: expenseDate, attachment: attachmentPath,
        notes, created_by: user?.id,
      }]);
      if (err) throw err;
      setShowExpenseForm(false);
      resetExpenseForm();
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const resetExpenseForm = () => {
    setPartnerId(''); setExpenseType('capital'); setDescription(''); setDescriptionAr('');
    setAmount(''); setVatAmount(''); setVatCategory('exempt'); setPaymentMethod('cash');
    setExpenseDate(new Date().toISOString().split('T')[0]); setNotes('');
    setAttachmentFile(null); setError('');
  };

  const handleDeleteExpense = async (id: string) => {
    try {
      const { data, error: err } = await supabase.rpc('void_partner_operation_atomic' as any, {
        p_expense_id: id, p_reason: 'Voided via Partners UI',
      } as any);
      if (err) throw err;
      const result = data as any;
      if (!result?.success) throw new Error(result?.message || 'Failed');
      setDeleteExpenseConfirm(null);
      await loadData();
    } catch (err: any) { alert(err.message); }
  };

  const handleUpdateExpenseDate = async (id: string) => {
    if (!editingExpenseDateVal) return;
    try {
      const { error: err } = await supabase
        .from('setup_expenses')
        .update({ expense_date: editingExpenseDateVal })
        .eq('id', id);
      if (err) throw err;
      setEditingExpenseDateId(null);
      setEditingExpenseDateVal('');
      await loadData();
    } catch (err: any) { alert(err.message); }
  };

  const handleSettlementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromPartnerId || !toPartnerId || !settlementAmount) return;
    setSubmitting(true);
    setError('');
    try {
      let attachmentPath = null;
      if (settlementAttachmentFile) attachmentPath = await uploadFile(settlementAttachmentFile, 'receipts');
      const { error: err } = await supabase.from('partner_settlements').insert([{
        from_partner_id: fromPartnerId, to_partner_id: toPartnerId,
        amount: parseFloat(settlementAmount), settlement_date: settlementDate,
        description: settlementDescription || 'Settlement payment',
        description_ar: settlementDescriptionAr || settlementDescription || 'تسوية',
        attachment_url: attachmentPath, status: 'active',
      }]);
      if (err) throw err;
      setShowSettlementForm(false);
      resetSettlementForm();
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const resetSettlementForm = () => {
    setFromPartnerId(''); setToPartnerId(''); setSettlementAmount('');
    setSettlementDate(new Date().toISOString().split('T')[0]);
    setSettlementDescription(''); setSettlementDescriptionAr('');
    setSettlementAttachmentFile(null); setError('');
  };

  const handleVoidSettlement = async (id: string) => {
    try {
      const { error: err } = await supabase.rpc('void_partner_settlement' as any, {
        p_settlement_id: id, p_void_reason: 'Voided via Partners UI',
      } as any);
      if (err) throw err;
      setVoidSettlementConfirm(null);
      await loadData();
    } catch (err: any) { alert(err.message); }
  };

  const handleViewAttachment = (path: string) => {
    const url = getFileUrl(path);
    setPreviewAttachment({ url, type: path.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image', name: path.split('/').pop(), filePath: path });
  };

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();
    const data: any[][] = [
      [isRTL ? 'تقرير مصاريف التأسيس' : 'Setup Expenses Report'],
      [],
      [isRTL ? 'التاريخ' : 'Date', isRTL ? 'الشريك' : 'Partner', isRTL ? 'النوع' : 'Type', isRTL ? 'الوصف' : 'Description', isRTL ? 'المبلغ' : 'Amount'],
    ];
    expenses.forEach(ex => {
      const p = partners.find(p => p.id === ex.partner_id);
      data.push([
        fmtDate(ex.expense_date, isRTL),
        p ? (isRTL ? p.name_ar : p.name) : '-',
        isRTL ? EXPENSE_TYPES[ex.expense_type as keyof typeof EXPENSE_TYPES]?.ar : EXPENSE_TYPES[ex.expense_type as keyof typeof EXPENSE_TYPES]?.en,
        isRTL ? (ex.description_ar || ex.description) : ex.description,
        Number(ex.amount).toFixed(2),
      ]);
    });
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 30 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, ws, isRTL ? 'المصاريف' : 'Expenses');
    XLSX.writeFile(wb, `Partners_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const MONTHS = isRTL ? MONTH_NAMES_AR : MONTH_NAMES_EN;

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <Users className="w-12 h-12 text-gray-300 animate-pulse" />
    </div>
  );

  if (!canViewPartners) return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <div className="bg-red-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">{isRTL ? 'وصول محظور' : 'Access Denied'}</h2>
        <p className="text-gray-500">{isRTL ? 'ليس لديك صلاحية لعرض هذا القسم' : 'You do not have permission to view this section'}</p>
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{isRTL ? 'إدارة الشركاء' : 'Partner Management'}</h2>
          <p className="text-gray-500 text-sm mt-0.5">{isRTL ? 'نظام شراكة ERP متكامل' : 'ERP-grade partnership management'}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportToExcel} className="flex items-center gap-2 bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 transition text-sm font-medium">
            <FileSpreadsheet className="w-4 h-4" />
            <span className="hidden sm:inline">{isRTL ? 'تصدير' : 'Export'}</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex-1 px-6 py-3 text-sm font-medium transition ${
              activeTab === 'overview'
                ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            {isRTL ? 'نظرة عامة' : 'Overview'}
          </button>
          <button
            onClick={() => setActiveTab('settlements')}
            className={`flex-1 px-6 py-3 text-sm font-medium transition ${
              activeTab === 'settlements'
                ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            {isRTL ? 'الحساب الجاري والتسويات' : 'Current Account & Settlements'}
          </button>
        </div>
      </div>

      {activeTab === 'overview' ? (
        <div className="space-y-5">

      {/* Ownership Distribution */}
      <Section title={isRTL ? 'توزيع الملكية' : 'Ownership Distribution'} icon={PieChart}
        subtitle={isRTL ? `${totalOwnership.toFixed(1)}% مخصص` : `${totalOwnership.toFixed(1)}% allocated`}
      >
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="w-full bg-gray-100 rounded-full h-4 overflow-hidden">
              <div className="flex h-full">
                {activePartners.map((p, i) => (
                  <div key={p.id} className={`${BAR_COLORS[i % BAR_COLORS.length]} h-full transition-all duration-500`}
                    style={{ width: `${Number(p.ownership_percentage)}%` }}
                    title={`${isRTL ? p.name_ar : p.name}: ${p.ownership_percentage}%`}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex flex-wrap gap-4">
              {activePartners.map((p, i) => (
                <div key={p.id} className="flex items-center gap-1.5 text-sm">
                  <div className={`w-2.5 h-2.5 rounded-full ${BG_DOTS[i % BG_DOTS.length]}`} />
                  <span className={`font-medium ${TEXT_COLORS[i % TEXT_COLORS.length]}`}>{isRTL ? p.name_ar : p.name}</span>
                  <span className="text-gray-400 text-xs">{Number(p.ownership_percentage).toFixed(1)}%</span>
                </div>
              ))}
            </div>
            {totalOwnership < 100 && (
              <div className="flex items-center gap-1.5 text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg text-sm flex-shrink-0">
                <AlertTriangle className="w-4 h-4" />
                <span className="font-medium">{isRTL ? `متبقي ${remainingOwnership.toFixed(1)}%` : `${remainingOwnership.toFixed(1)}% free`}</span>
              </div>
            )}
            {Math.abs(totalOwnership - 100) < 0.01 && (
              <div className="flex items-center gap-1.5 text-green-600 bg-green-50 px-3 py-1.5 rounded-lg text-sm flex-shrink-0">
                <Check className="w-4 h-4" />
                <span className="font-medium">{isRTL ? 'مكتمل 100%' : '100% allocated'}</span>
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* Partners List */}
      <Section title={isRTL ? 'قائمة الشركاء' : 'Partners'} icon={Users}
        subtitle={`${partners.length} ${isRTL ? 'شريك' : 'partners'}`}
      >
        <div className="p-6 space-y-4">
          {canEdit && (
            <div className="flex gap-2">
              <button onClick={() => openPartnerForm()}
                className="flex items-center gap-2 bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 transition text-sm font-medium">
                <UserPlus className="w-4 h-4" />
                {isRTL ? 'إضافة شريك' : 'Add Partner'}
              </button>
              <button onClick={() => { setShowWithdrawalForm(true); setError(''); }}
                className="flex items-center gap-2 bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition text-sm font-medium">
                <Banknote className="w-4 h-4" />
                {isRTL ? 'تسجيل سحب' : 'Record Withdrawal'}
              </button>
              <button onClick={() => { setShowDistributeModal(true); setDistResult(null); setError(''); }}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition text-sm font-medium">
                <TrendingUp className="w-4 h-4" />
                {isRTL ? 'توزيع أرباح' : 'Distribute Profit'}
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {partners.map((partner, i) => {
              const account = accounts.find(a => a.partner_id === partner.id);
              return (
                <div key={partner.id}
                  className={`bg-white rounded-xl border border-gray-100 border-l-4 ${BORDER_COLORS[i % BORDER_COLORS.length]} overflow-hidden ${!partner.is_active ? 'opacity-60' : ''}`}
                >
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-base font-bold text-gray-900">{isRTL ? partner.name_ar : partner.name}</h4>
                          {!partner.is_active && (
                            <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">{isRTL ? 'موقوف' : 'Inactive'}</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400">{isRTL ? partner.name : partner.name_ar}</p>
                        {(partner.email || partner.phone) && (
                          <p className="text-xs text-gray-400 mt-1">{partner.email}{partner.phone ? ` · ${partner.phone}` : ''}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {canEdit && (
                          <>
                            <button onClick={() => openPartnerForm(partner)}
                              className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition">
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            {deactivateConfirm === partner.id ? (
                              <div className="flex gap-1">
                                <button onClick={() => handleToggleActive(partner)}
                                  className="px-2 py-1 text-xs bg-orange-600 text-white rounded hover:bg-orange-700">
                                  {isRTL ? 'تأكيد' : 'Confirm'}
                                </button>
                                <button onClick={() => setDeactivateConfirm(null)}
                                  className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded">
                                  {isRTL ? 'إلغاء' : 'Cancel'}
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => setDeactivateConfirm(partner.id)}
                                className="p-1.5 text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition"
                                title={partner.is_active ? (isRTL ? 'تعطيل' : 'Deactivate') : (isRTL ? 'تفعيل' : 'Activate')}
                              >
                                {partner.is_active ? <ToggleRight className="w-4 h-4 text-green-500" /> : <ToggleLeft className="w-4 h-4 text-gray-400" />}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-gray-50 rounded-lg p-2.5">
                        <div className="flex items-center gap-1 mb-0.5">
                          <Percent className="w-3 h-3 text-teal-500" />
                          <span className="text-xs text-gray-400">{isRTL ? 'الملكية' : 'Ownership'}</span>
                        </div>
                        <p className="text-lg font-bold text-gray-900">{Number(partner.ownership_percentage).toFixed(1)}%</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-2.5">
                        <div className="flex items-center gap-1 mb-0.5">
                          <TrendingUp className="w-3 h-3 text-sky-500" />
                          <span className="text-xs text-gray-400">{isRTL ? 'نسبة الأرباح' : 'Profit Share'}</span>
                        </div>
                        <p className="text-lg font-bold text-gray-900">{Number(partner.profit_share_percentage).toFixed(1)}%</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-2.5">
                        <div className="flex items-center gap-1 mb-0.5">
                          <Landmark className="w-3 h-3 text-amber-500" />
                          <span className="text-xs text-gray-400">{isRTL ? 'رأس المال' : 'Capital'}</span>
                        </div>
                        <p className="text-sm font-bold text-gray-900">{fmt(Number(account?.capital_contribution ?? partner.capital_contribution))}</p>
                      </div>
                      {account && (
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <div className="flex items-center gap-1 mb-0.5">
                            <DollarSign className="w-3 h-3 text-emerald-500" />
                            <span className="text-xs text-gray-400">{isRTL ? 'الحساب الجاري' : 'Current Acc.'}</span>
                          </div>
                          {(() => {
                            const cap = Number(account.capital_contribution);
                            const bal = Number(account.current_account_balance);
                            const total = cap + bal;
                            return (
                              <p className={`text-sm font-bold ${total >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                {total >= 0 ? '+' : ''}{fmt(total)}
                              </p>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {partners.length === 0 && (
              <div className="col-span-2 text-center py-12 text-gray-400">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">{isRTL ? 'لا يوجد شركاء. أضف شريكاً جديداً.' : 'No partners yet. Add one to get started.'}</p>
              </div>
            )}
          </div>

          {/* Withdrawals Mini-Table */}
          {withdrawals.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-semibold text-gray-700 mb-2">{isRTL ? 'المسحوبات الأخيرة' : 'Recent Withdrawals'}</p>
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-500">{isRTL ? 'التاريخ' : 'Date'}</th>
                      <th className="px-3 py-2 text-left text-gray-500">{isRTL ? 'الشريك' : 'Partner'}</th>
                      <th className="px-3 py-2 text-left text-gray-500">{isRTL ? 'الطريقة' : 'Method'}</th>
                      <th className="px-3 py-2 text-right text-gray-500">{isRTL ? 'المبلغ' : 'Amount'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {withdrawals.slice(0, 5).map(w => (
                      <tr key={w.id} className="border-t border-gray-100">
                        <td className="px-3 py-2 text-gray-600">{fmtDate(w.withdrawal_date, isRTL)}</td>
                        <td className="px-3 py-2 font-medium text-gray-900">
                          {w.partner ? (isRTL ? w.partner.name_ar : w.partner.name) : '-'}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${w.method === 'bank' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                            {w.method === 'bank' ? (isRTL ? 'بنك' : 'Bank') : (isRTL ? 'نقدي' : 'Cash')}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-orange-700">{fmt(Number(w.amount))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* Expenses Section */}
      <Section title={isRTL ? 'مصاريف التأسيس' : 'Setup Expenses'} icon={DollarSign}
        subtitle={`${expenses.length} ${isRTL ? 'مصروف' : 'expenses'} · ${fmt(totalExpenses)} ${isRTL ? 'ر.س' : 'SAR'}`}
        defaultOpen={false}
      >
        <div className="p-6 space-y-4">
          {/* Partner Payment Summary Cards */}
          {activePartners.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {activePartners.map((p, i) => {
                const total = partnerTotals[p.id] || 0;
                const colorBgs = ['bg-teal-50', 'bg-sky-50', 'bg-amber-50', 'bg-rose-50', 'bg-emerald-50'];
                const colorBorders = ['border-teal-200', 'border-sky-200', 'border-amber-200', 'border-rose-200', 'border-emerald-200'];
                const colorTexts = ['text-teal-700', 'text-sky-700', 'text-amber-700', 'text-rose-700', 'text-emerald-700'];
                const colorAmounts = ['text-teal-900', 'text-sky-900', 'text-amber-900', 'text-rose-900', 'text-emerald-900'];
                const idx = i % 5;
                return (
                  <div key={p.id} className={`${colorBgs[idx]} border ${colorBorders[idx]} rounded-xl p-4 flex items-center justify-between`}>
                    <div>
                      <p className="text-xs text-gray-500 font-medium mb-0.5">
                        {isRTL ? 'إجمالي مدفوعات' : 'Total Payments'}
                      </p>
                      <p className={`text-base font-bold ${colorTexts[idx]}`}>
                        {isRTL ? p.name_ar : p.name}
                      </p>
                      <p className={`text-2xl font-extrabold ${colorAmounts[idx]} mt-1`}>
                        {fmt(total)} <span className="text-sm font-medium">{isRTL ? 'ر.س' : 'SAR'}</span>
                      </p>
                    </div>
                    <DollarSign className={`w-10 h-10 opacity-20 ${colorTexts[idx]}`} />
                  </div>
                );
              })}
            </div>
          )}

          {canEdit && (
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => { resetExpenseForm(); setShowExpenseForm(true); }}
                className="flex items-center gap-2 bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 transition text-sm font-medium">
                <Plus className="w-4 h-4" />
                {isRTL ? 'إضافة مصروف' : 'Add Expense'}
              </button>
              <button
                onClick={() => { setImportFile(null); setImportPreview([]); setShowImportExcel(true); }}
                className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition text-sm font-medium"
              >
                <FileSpreadsheet className="w-4 h-4" />
                {isRTL ? 'استيراد Excel' : 'Import Excel'}
              </button>
              <input
                ref={importFileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleImportFileChange}
              />
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { key: 'capital', color: 'teal' }, { key: 'inventory', color: 'green' },
              { key: 'asset', color: 'blue' }, { key: 'operational', color: 'orange' },
            ].map(({ key, color }) => {
              const val = expenses.filter(e => e.expense_type === key).reduce((s, e) => s + Number(e.amount), 0);
              return (
                <div key={key} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">
                    {isRTL ? EXPENSE_TYPES[key as keyof typeof EXPENSE_TYPES].ar : EXPENSE_TYPES[key as keyof typeof EXPENSE_TYPES].en}
                  </p>
                  <p className="text-base font-bold text-gray-900">{fmt(val)}</p>
                </div>
              );
            })}
          </div>
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs text-gray-500">{isRTL ? 'التاريخ' : 'Date'}</th>
                  <th className="px-4 py-2.5 text-left text-xs text-gray-500">{isRTL ? 'الشريك' : 'Partner'}</th>
                  <th className="px-4 py-2.5 text-left text-xs text-gray-500">{isRTL ? 'النوع' : 'Type'}</th>
                  <th className="px-4 py-2.5 text-left text-xs text-gray-500">{isRTL ? 'الوصف' : 'Desc.'}</th>
                  <th className="px-4 py-2.5 text-right text-xs text-gray-500">{isRTL ? 'المبلغ' : 'Amount'}</th>
                  <th className="px-4 py-2.5 text-center text-xs text-gray-500">{isRTL ? 'إجراء' : 'Act.'}</th>
                </tr>
              </thead>
              <tbody>
                {expenses.length === 0 ? (
                  <tr><td colSpan={6} className="py-8 text-center text-gray-400 text-sm">{isRTL ? 'لا توجد مصاريف' : 'No expenses'}</td></tr>
                ) : expenses.map(expense => {
                  const p = partners.find(pp => pp.id === expense.partner_id);
                  return (
                    <tr key={expense.id} className={`border-t border-gray-100 hover:bg-gray-50/50 ${!expense.expense_date ? 'bg-amber-50/30' : ''}`}>
                      <td className="px-4 py-2.5 text-xs">
                        {editingExpenseDateId === expense.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="date"
                              value={editingExpenseDateVal}
                              onChange={e => setEditingExpenseDateVal(e.target.value)}
                              className="border border-gray-300 rounded px-1.5 py-0.5 text-xs w-32"
                              autoFocus
                            />
                            <button
                              onClick={() => handleUpdateExpenseDate(expense.id)}
                              className="p-1 text-green-600 hover:bg-green-50 rounded"
                              disabled={!editingExpenseDateVal}
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => { setEditingExpenseDateId(null); setEditingExpenseDateVal(''); }}
                              className="p-1 text-gray-400 hover:bg-gray-100 rounded"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => canEdit ? (setEditingExpenseDateId(expense.id), setEditingExpenseDateVal(expense.expense_date || '')) : undefined}
                            className={`flex items-center gap-1 group ${!expense.expense_date ? 'text-amber-600 font-medium' : 'text-gray-600'} ${canEdit ? 'hover:text-blue-600 cursor-pointer' : 'cursor-default'}`}
                            title={canEdit ? (isRTL ? 'انقر لتعديل التاريخ' : 'Click to edit date') : undefined}
                          >
                            {!expense.expense_date && <CalendarDays className="w-3 h-3" />}
                            {fmtDate(expense.expense_date, isRTL)}
                            {canEdit && <Edit3 className="w-2.5 h-2.5 opacity-0 group-hover:opacity-50 ml-0.5" />}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-sm font-medium">{p ? (isRTL ? p.name_ar : p.name) : '-'}</td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded">
                          {isRTL ? EXPENSE_TYPES[expense.expense_type as keyof typeof EXPENSE_TYPES]?.ar : EXPENSE_TYPES[expense.expense_type as keyof typeof EXPENSE_TYPES]?.en}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-sm text-gray-700">
                        {isRTL ? (expense.description_ar || expense.description) : expense.description}
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold text-teal-800 text-sm">{fmt(Number(expense.amount))}</td>
                      <td className="px-4 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {expense.attachment && (
                            <button onClick={() => handleViewAttachment(expense.attachment!)} className="p-1 text-blue-500 hover:bg-blue-50 rounded">
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canEdit && (
                            deleteExpenseConfirm === expense.id ? (
                              <div className="flex gap-1">
                                <button onClick={() => handleDeleteExpense(expense.id)} className="px-2 py-0.5 text-xs bg-red-600 text-white rounded">
                                  {isRTL ? 'تأكيد' : 'OK'}
                                </button>
                                <button onClick={() => setDeleteExpenseConfirm(null)} className="px-2 py-0.5 text-xs bg-gray-200 rounded">
                                  {isRTL ? 'إلغاء' : 'No'}
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => setDeleteExpenseConfirm(expense.id)} className="p-1 text-red-400 hover:bg-red-50 rounded">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      {/* Settlements Section */}
      <Section title={isRTL ? 'التسويات بين الشركاء' : 'Partner Settlements'} icon={ArrowRightLeft}
        subtitle={`${settlements.filter(s => s.status === 'active').length} ${isRTL ? 'تسوية نشطة' : 'active settlements'}`}
        defaultOpen={false}
      >
        <div className="p-6 space-y-4">
          {canEdit && (
            <button onClick={() => { resetSettlementForm(); setShowSettlementForm(true); }}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition text-sm font-medium">
              <ArrowRightLeft className="w-4 h-4" />
              {isRTL ? 'دفعة بين الشركاء' : 'Partner Payment'}
            </button>
          )}
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs text-gray-500">{isRTL ? 'التاريخ' : 'Date'}</th>
                  <th className="px-4 py-2.5 text-left text-xs text-gray-500">{isRTL ? 'من' : 'From'}</th>
                  <th className="px-4 py-2.5 text-left text-xs text-gray-500">{isRTL ? 'إلى' : 'To'}</th>
                  <th className="px-4 py-2.5 text-right text-xs text-gray-500">{isRTL ? 'المبلغ' : 'Amount'}</th>
                  <th className="px-4 py-2.5 text-center text-xs text-gray-500">{isRTL ? 'الحالة' : 'Status'}</th>
                  <th className="px-4 py-2.5 text-center text-xs text-gray-500">{isRTL ? 'إجراء' : 'Act.'}</th>
                </tr>
              </thead>
              <tbody>
                {settlements.length === 0 ? (
                  <tr><td colSpan={6} className="py-8 text-center text-gray-400">{isRTL ? 'لا توجد تسويات' : 'No settlements'}</td></tr>
                ) : settlements.map(s => (
                  <tr key={s.id} className={`border-t border-gray-100 hover:bg-gray-50/50 ${s.status === 'voided' ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-2.5 text-xs text-gray-600">{fmtDate(s.settlement_date, isRTL)}</td>
                    <td className="px-4 py-2.5 font-medium">{s.from_partner ? (isRTL ? s.from_partner.name_ar : s.from_partner.name) : '-'}</td>
                    <td className="px-4 py-2.5 font-medium">{s.to_partner ? (isRTL ? s.to_partner.name_ar : s.to_partner.name) : '-'}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-blue-800">{fmt(Number(s.amount))}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.status === 'voided' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                        {s.status === 'voided' ? (isRTL ? 'ملغى' : 'Voided') : (isRTL ? 'نشط' : 'Active')}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {s.status !== 'voided' && canEdit && (
                        voidSettlementConfirm === s.id ? (
                          <div className="flex justify-center gap-1">
                            <button onClick={() => handleVoidSettlement(s.id)} className="px-2 py-0.5 text-xs bg-red-600 text-white rounded">{isRTL ? 'تأكيد' : 'OK'}</button>
                            <button onClick={() => setVoidSettlementConfirm(null)} className="px-2 py-0.5 text-xs bg-gray-200 rounded">{isRTL ? 'إلغاء' : 'No'}</button>
                          </div>
                        ) : (
                          <button onClick={() => setVoidSettlementConfirm(s.id)} className="p-1 text-orange-400 hover:bg-orange-50 rounded">
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      {/* Reports */}
      <PartnerReports accounts={accounts} distributions={distributions} withdrawals={withdrawals} isRTL={isRTL} language={language} />

      {/* Partner Form Modal */}
      {showPartnerForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
              <h3 className="text-lg font-bold text-gray-900">
                {editingPartner ? (isRTL ? 'تعديل الشريك' : 'Edit Partner') : (isRTL ? 'إضافة شريك' : 'Add Partner')}
              </h3>
              <button onClick={() => setShowPartnerForm(false)} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handlePartnerSubmit} className="p-6 space-y-4">
              {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex gap-2"><AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />{error}</div>}

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                {(() => {
                  const available = editingPartner
                    ? (100 - totalOwnership + Number(editingPartner.ownership_percentage)).toFixed(1)
                    : remainingOwnership.toFixed(1);
                  const current = ownershipPct ? parseFloat(ownershipPct) : 0;
                  const otherTotal = partners.filter(p => p.is_active && (!editingPartner || p.id !== editingPartner.id))
                    .reduce((s, p) => s + Number(p.ownership_percentage || 0), 0);
                  const projectedTotal = otherTotal + current;
                  return isRTL
                    ? `المتبقي المتاح: ${available}% · المجموع الحالي: ${projectedTotal.toFixed(1)}%`
                    : `Available: ${available}% · Projected total: ${projectedTotal.toFixed(1)}%`;
                })()}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'الاسم (إنجليزي) *' : 'Name (EN) *'}</label>
                  <input type="text" value={partnerName} onChange={e => setPartnerName(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'الاسم (عربي) *' : 'Name (AR) *'}</label>
                  <input type="text" value={partnerNameAr} onChange={e => setPartnerNameAr(e.target.value)} required dir="rtl" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'نسبة الملكية % *' : 'Ownership % *'}</label>
                  <input type="number" step="0.01" min="0" max="100" value={ownershipPct}
                    onChange={e => { setOwnershipPct(e.target.value); if (!profitSharePct || profitSharePct === ownershipPct) setProfitSharePct(e.target.value); }}
                    required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm" placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'نسبة الأرباح %' : 'Profit Share %'}</label>
                  <input type="number" step="0.01" min="0" max="100" value={profitSharePct} onChange={e => setProfitSharePct(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm" placeholder="0.00" />
                  <p className="text-xs text-gray-400 mt-0.5">{isRTL ? 'افتراضي = نسبة الملكية' : 'Defaults to ownership %'}</p>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'رأس المال (ر.س)' : 'Capital (SAR)'}</label>
                <input type="number" step="0.01" min="0" value={capitalContribution} onChange={e => setCapitalContribution(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm" placeholder="0.00" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'البريد' : 'Email'}</label>
                  <input type="email" value={partnerEmail} onChange={e => setPartnerEmail(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'الهاتف' : 'Phone'}</label>
                  <input type="tel" value={partnerPhone} onChange={e => setPartnerPhone(e.target.value)} dir="ltr" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm" />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2 border-t">
                <button type="button" onClick={() => setShowPartnerForm(false)} className="px-5 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm">{isRTL ? 'إلغاء' : 'Cancel'}</button>
                <button type="submit" disabled={submitting} className="flex items-center gap-2 px-5 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm font-medium disabled:opacity-50">
                  <Save className="w-4 h-4" />
                  {submitting ? (isRTL ? 'حفظ...' : 'Saving...') : (isRTL ? 'حفظ' : 'Save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Withdrawal Form Modal */}
      {showWithdrawalForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-bold text-gray-900">{isRTL ? 'تسجيل سحب شريك' : 'Record Partner Withdrawal'}</h3>
              <button onClick={() => { setShowWithdrawalForm(false); resetWithdrawalForm(); }} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleWithdrawalSubmit} className="p-6 space-y-4">
              {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                {isRTL ? 'يُنشئ قيداً: مدين ح/الشريك الجاري — دائن ح/النقدية أو البنك' : 'Creates GL: Dr Partner Current Account — Cr Cash/Bank'}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'الشريك *' : 'Partner *'}</label>
                <select value={wPartnerId} onChange={e => setWPartnerId(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  <option value="">{isRTL ? 'اختر الشريك' : 'Select Partner'}</option>
                  {partners.filter(p => p.is_active).map(p => <option key={p.id} value={p.id}>{isRTL ? p.name_ar : p.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'المبلغ (ر.س) *' : 'Amount (SAR) *'}</label>
                  <input type="number" step="0.01" min="0.01" value={wAmount} onChange={e => setWAmount(e.target.value)} required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'الطريقة *' : 'Method *'}</label>
                  <select value={wMethod} onChange={e => setWMethod(e.target.value as 'cash' | 'bank')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <option value="cash">{isRTL ? 'نقدي' : 'Cash'}</option>
                    <option value="bank">{isRTL ? 'بنك' : 'Bank'}</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'التاريخ *' : 'Date *'}</label>
                <input type="date" value={wDate} onChange={e => setWDate(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'الوصف *' : 'Description *'}</label>
                <input type="text" value={wDescription} onChange={e => setWDescription(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div className="flex justify-end gap-3 pt-2 border-t">
                <button type="button" onClick={() => { setShowWithdrawalForm(false); resetWithdrawalForm(); }} className="px-5 py-2 border border-gray-300 rounded-lg text-sm">{isRTL ? 'إلغاء' : 'Cancel'}</button>
                <button type="submit" disabled={submitting} className="flex items-center gap-2 px-5 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm font-medium disabled:opacity-50">
                  <Banknote className="w-4 h-4" />
                  {submitting ? (isRTL ? 'جاري...' : 'Saving...') : (isRTL ? 'تسجيل' : 'Record')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Profit Distribution Modal */}
      {showDistributeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-bold text-gray-900">{isRTL ? 'توزيع أرباح شهري' : 'Monthly Profit Distribution'}</h3>
              <button onClick={() => setShowDistributeModal(false)} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleDistributeProfit} className="p-6 space-y-4">
              {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
              {distResult && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-2">
                  <p className="font-semibold text-green-800 text-sm">{isRTL ? 'تم التوزيع بنجاح' : 'Distribution posted successfully'}</p>
                  <div className="text-xs text-green-700 space-y-1">
                    <p>{isRTL ? `صافي الربح: ${fmt(distResult.net_profit)} ر.س` : `Net profit: ${fmt(distResult.net_profit)} SAR`}</p>
                    <p>{isRTL ? `إجمالي موزع: ${fmt(distResult.total_distributed)} ر.س` : `Total distributed: ${fmt(distResult.total_distributed)} SAR`}</p>
                    <p>{isRTL ? `القيد: ${distResult.entry_number}` : `Entry: ${distResult.entry_number}`}</p>
                  </div>
                </div>
              )}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
                {isRTL
                  ? 'يُنشئ قيداً: مدين ح/الأرباح المحتجزة — دائن ح/الحساب الجاري للشركاء (بحسب نسبة الأرباح)'
                  : 'Creates GL: Dr Retained Earnings — Cr Partner Current Accounts (per profit share %)'}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'الشهر' : 'Month'}</label>
                  <select value={distMonth} onChange={e => setDistMonth(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                      <option key={m} value={m}>{isRTL ? MONTH_NAMES_AR[m] : MONTH_NAMES_EN[m]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'السنة' : 'Year'}</label>
                  <input type="number" value={distYear} onChange={e => setDistYear(e.target.value)} min="2020" max="2099"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
              </div>
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-500">{isRTL ? 'الشريك' : 'Partner'}</th>
                      <th className="px-3 py-2 text-right text-gray-500">{isRTL ? 'نسبة الأرباح' : 'Profit %'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {partners.filter(p => p.is_active).map(p => (
                      <tr key={p.id} className="border-t border-gray-100">
                        <td className="px-3 py-2 font-medium">{isRTL ? p.name_ar : p.name}</td>
                        <td className="px-3 py-2 text-right">{p.profit_share_percentage}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end gap-3 pt-2 border-t">
                <button type="button" onClick={() => setShowDistributeModal(false)} className="px-5 py-2 border border-gray-300 rounded-lg text-sm">{isRTL ? 'إغلاق' : 'Close'}</button>
                {!distResult && (
                  <button type="submit" disabled={submitting} className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50">
                    <CalendarDays className="w-4 h-4" />
                    {submitting ? (isRTL ? 'جاري...' : 'Processing...') : (isRTL ? 'توزيع الأرباح' : 'Distribute')}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Expense Modal */}
      {showExpenseForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
              <h3 className="text-lg font-bold text-gray-900">{isRTL ? 'إضافة مصروف تأسيسي' : 'Add Setup Expense'}</h3>
              <button onClick={() => { setShowExpenseForm(false); resetExpenseForm(); }} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleExpenseSubmit} className="p-6 space-y-4">
              {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'الشريك *' : 'Partner *'}</label>
                  <select value={partnerId} onChange={e => setPartnerId(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <option value="">{isRTL ? 'اختر شريك' : 'Select'}</option>
                    {partners.map(p => <option key={p.id} value={p.id}>{isRTL ? p.name_ar : p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'نوع المصروف *' : 'Expense Type *'}</label>
                  <select value={expenseType} onChange={e => setExpenseType(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    {Object.entries(EXPENSE_TYPES).map(([key, val]) => <option key={key} value={key}>{isRTL ? val.ar : val.en}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'الوصف *' : 'Description *'}</label>
                  <input type="text" value={description} onChange={e => setDescription(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'الوصف (عربي)' : 'Arabic Desc.'}</label>
                  <input type="text" value={descriptionAr} onChange={e => setDescriptionAr(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'المبلغ *' : 'Amount *'}</label>
                  <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'التاريخ *' : 'Date *'}</label>
                  <input type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'الدفع' : 'Payment'}</label>
                  <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <option value="cash">{isRTL ? 'نقدي' : 'Cash'}</option>
                    <option value="partner">{isRTL ? 'من الشريك' : 'Partner'}</option>
                    <option value="bank_transfer">{isRTL ? 'تحويل' : 'Bank'}</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'ملاحظات' : 'Notes'}</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'مرفق' : 'Attachment'}</label>
                <div className="flex gap-2">
                  <input type="file" ref={fileInputRef} onChange={e => setAttachmentFile(e.target.files?.[0] || null)} accept="image/*,application/pdf" className="hidden" />
                  <input type="file" ref={cameraInputRef} onChange={e => setAttachmentFile(e.target.files?.[0] || null)} accept="image/*" capture="environment" className="hidden" />
                  <button type="button" onClick={() => fileInputRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 border-2 border-dashed border-gray-300 rounded-lg hover:border-teal-400 text-sm text-gray-500">
                    <Paperclip className="w-4 h-4" />{attachmentFile ? attachmentFile.name : (isRTL ? 'اختر ملف' : 'Choose File')}
                  </button>
                  <button type="button" onClick={() => cameraInputRef.current?.click()}
                    className="px-3 py-2 border-2 border-dashed border-gray-300 rounded-lg hover:border-teal-400 text-gray-500">
                    <Camera className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2 border-t">
                <button type="button" onClick={() => { setShowExpenseForm(false); resetExpenseForm(); }} className="px-5 py-2 border border-gray-300 rounded-lg text-sm">{isRTL ? 'إلغاء' : 'Cancel'}</button>
                <button type="submit" disabled={submitting} className="px-5 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm font-medium disabled:opacity-50">
                  {submitting ? (isRTL ? 'حفظ...' : 'Saving...') : (isRTL ? 'حفظ' : 'Save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Settlement Form Modal */}
      {showSettlementForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
              <h3 className="text-lg font-bold text-gray-900">{isRTL ? 'إضافة دفعة تسوية' : 'Add Settlement Payment'}</h3>
              <button onClick={() => { setShowSettlementForm(false); resetSettlementForm(); }} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSettlementSubmit} className="p-6 space-y-4">
              {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'من *' : 'From *'}</label>
                  <select value={fromPartnerId} onChange={e => setFromPartnerId(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <option value="">{isRTL ? 'اختر' : 'Select'}</option>
                    {partners.map(p => <option key={p.id} value={p.id}>{isRTL ? p.name_ar : p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'إلى *' : 'To *'}</label>
                  <select value={toPartnerId} onChange={e => setToPartnerId(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <option value="">{isRTL ? 'اختر' : 'Select'}</option>
                    {partners.map(p => <option key={p.id} value={p.id}>{isRTL ? p.name_ar : p.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'المبلغ *' : 'Amount *'}</label>
                  <input type="number" step="0.01" value={settlementAmount} onChange={e => setSettlementAmount(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'التاريخ *' : 'Date *'}</label>
                  <input type="date" value={settlementDate} onChange={e => setSettlementDate(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'الوصف' : 'Description'}</label>
                <input type="text" value={settlementDescription} onChange={e => setSettlementDescription(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'مرفق' : 'Attachment'}</label>
                <div className="flex gap-2">
                  <input type="file" ref={settlementFileInputRef} onChange={e => setSettlementAttachmentFile(e.target.files?.[0] || null)} accept="image/*,application/pdf" className="hidden" />
                  <input type="file" ref={settlementCameraInputRef} onChange={e => setSettlementAttachmentFile(e.target.files?.[0] || null)} accept="image/*" capture="environment" className="hidden" />
                  <button type="button" onClick={() => settlementFileInputRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 text-sm text-gray-500">
                    <Paperclip className="w-4 h-4" />{settlementAttachmentFile ? settlementAttachmentFile.name : (isRTL ? 'اختر ملف' : 'Choose File')}
                  </button>
                  <button type="button" onClick={() => settlementCameraInputRef.current?.click()}
                    className="px-3 py-2 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 text-gray-500">
                    <Camera className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2 border-t">
                <button type="button" onClick={() => { setShowSettlementForm(false); resetSettlementForm(); }} className="px-5 py-2 border border-gray-300 rounded-lg text-sm">{isRTL ? 'إلغاء' : 'Cancel'}</button>
                <button type="submit" disabled={submitting} className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50">
                  {submitting ? (isRTL ? 'حفظ...' : 'Saving...') : (isRTL ? 'حفظ' : 'Save')}
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

      {/* Excel Import Modal */}
      {showImportExcel && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="bg-green-100 p-2 rounded-lg">
                  <FileSpreadsheet className="w-5 h-5 text-green-700" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">{isRTL ? 'استيراد من Excel' : 'Import from Excel'}</h3>
                  <p className="text-xs text-gray-400">{isRTL ? 'يدعم xlsx, xls, csv' : 'Supports xlsx, xls, csv'}</p>
                </div>
              </div>
              <button onClick={() => setShowImportExcel(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Instructions */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold mb-2">{isRTL ? 'الأعمدة المطلوبة:' : 'Required columns:'}</p>
                    <code className="font-mono bg-white px-2 py-0.5 rounded border border-blue-200 text-xs">
                      date | partner | type | description | amount
                    </code>
                    <p className="mt-2 text-xs text-blue-600">
                      {isRTL
                        ? 'التاريخ بصيغة YYYY-MM-DD · اسم الشريك كما هو في النظام · المبلغ رقم موجب'
                        : 'Date format: YYYY-MM-DD · Partner name as in system · Amount: positive number'}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {activePartners.map(p => (
                        <span key={p.id} className="px-2 py-0.5 bg-white border border-blue-200 rounded-full text-xs font-medium">
                          {isRTL ? p.name_ar : p.name}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={handleDownloadTemplate}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-100 transition text-xs font-semibold whitespace-nowrap shrink-0"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    {isRTL ? 'تحميل نموذج Excel' : 'Download Template'}
                  </button>
                </div>
              </div>

              {/* Upload */}
              {!importFile ? (
                <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl p-10 cursor-pointer hover:border-green-400 hover:bg-green-50/30 transition-all">
                  <FileSpreadsheet className="w-12 h-12 text-gray-300 mb-3" />
                  <span className="text-sm font-medium text-gray-600">{isRTL ? 'اضغط لاختيار الملف' : 'Click to choose file'}</span>
                  <span className="text-xs text-gray-400 mt-1">.xlsx · .xls · .csv</span>
                  <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImportFileChange} />
                </label>
              ) : (
                <div className="space-y-4">
                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-gray-50 rounded-xl p-3 text-center">
                      <p className="text-xs text-gray-500 mb-1">{isRTL ? 'الملف' : 'File'}</p>
                      <p className="text-sm font-bold text-gray-800 truncate">{importFile.name}</p>
                    </div>
                    <div className="bg-green-50 rounded-xl p-3 text-center">
                      <p className="text-xs text-gray-500 mb-1">{isRTL ? 'صحيح' : 'Valid'}</p>
                      <p className="text-2xl font-extrabold text-green-700">
                        {importPreview.filter(r => r._valid).length}
                      </p>
                    </div>
                    <div className={`rounded-xl p-3 text-center ${importPreview.filter(r => !r._valid).length > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
                      <p className="text-xs text-gray-500 mb-1">{isRTL ? 'خطأ' : 'Invalid'}</p>
                      <p className={`text-2xl font-extrabold ${importPreview.filter(r => !r._valid).length > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                        {importPreview.filter(r => !r._valid).length}
                      </p>
                    </div>
                  </div>

                  {/* Total amount */}
                  <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 flex items-center justify-between">
                    <span className="text-sm font-medium text-teal-700">{isRTL ? 'إجمالي المبالغ الصحيحة' : 'Total valid amount'}</span>
                    <span className="text-xl font-extrabold text-teal-900">
                      {fmt(importPreview.filter(r => r._valid).reduce((s, r) => s + r.amount, 0))} {isRTL ? 'ر.س' : 'SAR'}
                    </span>
                  </div>

                  {/* Preview table */}
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto max-h-72">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-right text-xs text-gray-500">#</th>
                            <th className="px-3 py-2 text-right text-xs text-gray-500">{isRTL ? 'التاريخ' : 'Date'}</th>
                            <th className="px-3 py-2 text-right text-xs text-gray-500">{isRTL ? 'الشريك' : 'Partner'}</th>
                            <th className="px-3 py-2 text-right text-xs text-gray-500">{isRTL ? 'النوع' : 'Type'}</th>
                            <th className="px-3 py-2 text-right text-xs text-gray-500">{isRTL ? 'الوصف' : 'Description'}</th>
                            <th className="px-3 py-2 text-right text-xs text-gray-500">{isRTL ? 'المبلغ' : 'Amount'}</th>
                            <th className="px-3 py-2 text-right text-xs text-gray-500">{isRTL ? 'الحالة' : 'Status'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importPreview.map(row => (
                            <tr key={row._row} className={`border-t border-gray-100 ${row._valid ? '' : 'bg-red-50'}`}>
                              <td className="px-3 py-2 text-xs text-gray-400">{row._row}</td>
                              <td className="px-3 py-2 text-xs">{row.date}</td>
                              <td className="px-3 py-2 text-xs font-medium">{row.partner}</td>
                              <td className="px-3 py-2 text-xs">{row.type}</td>
                              <td className="px-3 py-2 text-xs text-gray-600">{row.description}</td>
                              <td className="px-3 py-2 text-xs font-bold text-right">{fmt(row.amount)}</td>
                              <td className="px-3 py-2 text-xs">
                                {row._valid ? (
                                  <span className="flex items-center gap-1 text-green-600">
                                    <Check className="w-3 h-3" />
                                    {isRTL ? 'صحيح' : 'OK'}
                                  </span>
                                ) : (
                                  <div className="text-red-600">
                                    {row._errors.map((e: string, i: number) => <p key={i}>{e}</p>)}
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 space-y-3">
              {error && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                  <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-700">{error}</p>
                  <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={() => { setImportFile(null); setImportPreview([]); setError(''); }}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-100"
                >
                  {isRTL ? 'رفع ملف آخر' : 'Upload another'}
                </button>
                <div className="flex items-center gap-3">
                  <button onClick={() => { setShowImportExcel(false); setError(''); }} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-100">
                    {isRTL ? 'إلغاء' : 'Cancel'}
                  </button>
                  <button
                    onClick={handleImportConfirm}
                    disabled={importSubmitting || importPreview.filter(r => r._valid).length === 0}
                    className="flex items-center gap-2 px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {importSubmitting ? (
                      <><div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />{isRTL ? 'جاري الاستيراد...' : 'Importing...'}</>
                    ) : (
                      <><FileSpreadsheet className="w-4 h-4" />{isRTL ? `استيراد ${importPreview.filter(r => r._valid).length} سجل` : `Import ${importPreview.filter(r => r._valid).length} records`}</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
        </div>
      ) : (
        <PartnerSettlements />
      )}
    </div>
  );
}
