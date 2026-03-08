import { useState, useEffect, useCallback, useRef } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useBranch } from '../contexts/BranchContext';
import { supabase } from '../lib/supabase';
import {
  Wallet, Plus, X, Check, AlertCircle, Eye, Search, Loader2,
  ChevronDown, ChevronUp, Calendar, User, DollarSign, FileText,
  ArrowDownCircle, ArrowUpCircle, ShoppingCart, Package, Landmark,
  RotateCcw, Filter, Download,
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface Employee {
  id: string;
  full_name: string;
  branch_id: string;
}

interface Partner {
  id: string;
  name: string;
  name_ar: string;
}

interface Custody {
  id: string;
  custody_number: string;
  employee_id: string;
  branch_id: string;
  custody_date: string;
  amount: number;
  funding_source: 'cash' | 'bank' | 'partner';
  partner_id: string | null;
  payment_method: string;
  description: string | null;
  description_ar: string | null;
  total_spent: number;
  total_returned: number;
  remaining_balance: number;
  status: 'open' | 'partial' | 'settled' | 'cancelled';
  is_voided: boolean;
  created_at: string;
  employees?: { full_name: string };
  partners?: { name: string; name_ar: string };
}

interface Settlement {
  id: string;
  custody_id: string;
  settlement_date: string;
  settlement_type: 'expense' | 'purchase' | 'asset' | 'cash_return';
  account_code: string | null;
  amount: number;
  description: string | null;
  description_ar: string | null;
  is_voided: boolean;
  created_at: string;
}

interface Account {
  id: string;
  code: string;
  name: string;
  name_ar: string;
  type: string;
}

interface CustodySummary {
  employee_id: string;
  full_name: string;
  total_custodies: number;
  total_advanced: number;
  total_spent: number;
  total_returned: number;
  total_remaining: number;
  open_custodies: number;
  partial_custodies: number;
}

function fmt(val: number) {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(val);
}

function fmtDate(date: string | null, isRTL: boolean) {
  if (!date) return '-';
  return new Date(date).toLocaleDateString(isRTL ? 'ar-SA' : 'en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

const STATUS_LABELS = {
  open: { en: 'Open', ar: 'مفتوحة', color: 'bg-blue-100 text-blue-700' },
  partial: { en: 'Partial', ar: 'مسواة جزئياً', color: 'bg-amber-100 text-amber-700' },
  settled: { en: 'Settled', ar: 'مسواة', color: 'bg-emerald-100 text-emerald-700' },
  cancelled: { en: 'Cancelled', ar: 'ملغاة', color: 'bg-gray-100 text-gray-500' },
};

const SETTLEMENT_TYPE_LABELS = {
  expense: { en: 'Expense', ar: 'مصروف', icon: FileText, color: 'text-red-600' },
  purchase: { en: 'Purchase', ar: 'شراء مخزون', icon: ShoppingCart, color: 'text-blue-600' },
  asset: { en: 'Asset', ar: 'أصل', icon: Landmark, color: 'text-purple-600' },
  cash_return: { en: 'Cash Return', ar: 'إرجاع نقدي', icon: RotateCcw, color: 'text-emerald-600' },
};

const FUNDING_SOURCE_LABELS = {
  cash: { en: 'Cash', ar: 'الصندوق' },
  bank: { en: 'Bank', ar: 'البنك' },
  partner: { en: 'Partner', ar: 'شريك' },
};

export default function EmployeeCustody() {
  const { language } = useLanguage();
  const { can } = useAuth();
  const { currentBranchId } = useBranch();
  const isRTL = language === 'ar';
  const canEdit = can('custody', 'edit');

  const [custodies, setCustodies] = useState<Custody[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [summaries, setSummaries] = useState<CustodySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const [activeTab, setActiveTab] = useState<'custodies' | 'report'>('custodies');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [employeeFilter, setEmployeeFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const [showNewCustodyModal, setShowNewCustodyModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedCustody, setSelectedCustody] = useState<Custody | null>(null);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [showSettlementForm, setShowSettlementForm] = useState(false);

  const [newCustody, setNewCustody] = useState({
    employee_id: '',
    custody_date: new Date().toISOString().split('T')[0],
    amount: '',
    funding_source: 'cash' as 'cash' | 'bank' | 'partner',
    partner_id: '',
    payment_method: 'cash',
    description: '',
    description_ar: '',
  });

  const [newSettlement, setNewSettlement] = useState({
    settlement_type: 'expense' as 'expense' | 'purchase' | 'asset' | 'cash_return',
    settlement_date: new Date().toISOString().split('T')[0],
    amount: '',
    account_code: '',
    description: '',
    description_ar: '',
  });

  useEffect(() => {
    loadData();
  }, [currentBranchId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [custodiesRes, employeesRes, partnersRes, accountsRes, summaryRes] = await Promise.all([
        supabase
          .from('employee_custodies')
          .select('*, employees(full_name), partners(name, name_ar)')
          .order('custody_date', { ascending: false }),
        supabase.from('employees').select('id, full_name, branch_id').eq('is_active', true),
        supabase.from('partners').select('id, name, name_ar').eq('is_active', true),
        supabase.from('accounts').select('id, code, name, name_ar, type').eq('is_active', true),
        supabase.from('v_employee_custody_summary').select('*'),
      ]);

      if (custodiesRes.error) throw custodiesRes.error;
      if (employeesRes.error) throw employeesRes.error;
      if (partnersRes.error) throw partnersRes.error;
      if (accountsRes.error) throw accountsRes.error;

      setCustodies(custodiesRes.data || []);
      setEmployees(employeesRes.data || []);
      setPartners(partnersRes.data || []);
      setAccounts(accountsRes.data || []);
      setSummaries(summaryRes.data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadSettlements = async (custodyId: string) => {
    const { data, error } = await supabase
      .from('custody_settlements')
      .select('*')
      .eq('custody_id', custodyId)
      .order('settlement_date', { ascending: false });
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    setSettlements(data || []);
  };

  const handleOpenDetails = async (custody: Custody) => {
    setSelectedCustody(custody);
    await loadSettlements(custody.id);
    setShowDetailsModal(true);
  };

  const handleCreateCustody = async () => {
    if (!newCustody.employee_id || !newCustody.amount) {
      showToast(isRTL ? 'يرجى تعبئة الحقول المطلوبة' : 'Please fill required fields', 'error');
      return;
    }
    if (newCustody.funding_source === 'partner' && !newCustody.partner_id) {
      showToast(isRTL ? 'يرجى اختيار الشريك' : 'Please select a partner', 'error');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const { data, error } = await supabase.rpc('create_employee_custody_atomic', {
        p_employee_id: newCustody.employee_id,
        p_branch_id: currentBranchId,
        p_amount: parseFloat(newCustody.amount),
        p_funding_source: newCustody.funding_source,
        p_partner_id: newCustody.funding_source === 'partner' ? newCustody.partner_id : null,
        p_payment_method: newCustody.payment_method,
        p_description: newCustody.description || null,
        p_description_ar: newCustody.description_ar || null,
        p_custody_date: newCustody.custody_date,
      });

      if (error) throw error;
      const result = data as any;
      if (!result.success) throw new Error(result.message || 'Failed to create custody');

      showToast(isRTL ? 'تم إنشاء العهدة بنجاح' : 'Custody created successfully', 'success');
      setShowNewCustodyModal(false);
      resetNewCustodyForm();
      await loadData();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddSettlement = async () => {
    if (!selectedCustody || !newSettlement.amount) {
      showToast(isRTL ? 'يرجى إدخال المبلغ' : 'Please enter amount', 'error');
      return;
    }

    const amount = parseFloat(newSettlement.amount);
    if (amount > selectedCustody.remaining_balance) {
      showToast(isRTL ? 'المبلغ أكبر من المتبقي' : 'Amount exceeds remaining balance', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('add_custody_settlement_atomic', {
        p_custody_id: selectedCustody.id,
        p_settlement_type: newSettlement.settlement_type,
        p_amount: amount,
        p_account_code: newSettlement.account_code || null,
        p_description: newSettlement.description || null,
        p_description_ar: newSettlement.description_ar || null,
        p_settlement_date: newSettlement.settlement_date,
      });

      if (error) throw error;
      const result = data as any;
      if (!result.success) throw new Error(result.message || 'Failed to add settlement');

      showToast(isRTL ? 'تمت إضافة التسوية بنجاح' : 'Settlement added successfully', 'success');
      setShowSettlementForm(false);
      resetSettlementForm();
      await loadSettlements(selectedCustody.id);
      await loadData();

      const updated = custodies.find(c => c.id === selectedCustody.id);
      if (updated) {
        setSelectedCustody({ ...updated, remaining_balance: result.new_remaining });
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const resetNewCustodyForm = () => {
    setNewCustody({
      employee_id: '',
      custody_date: new Date().toISOString().split('T')[0],
      amount: '',
      funding_source: 'cash',
      partner_id: '',
      payment_method: 'cash',
      description: '',
      description_ar: '',
    });
  };

  const resetSettlementForm = () => {
    setNewSettlement({
      settlement_type: 'expense',
      settlement_date: new Date().toISOString().split('T')[0],
      amount: '',
      account_code: '',
      description: '',
      description_ar: '',
    });
  };

  const filteredCustodies = custodies.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (employeeFilter !== 'all' && c.employee_id !== employeeFilter) return false;
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      const empName = c.employees?.full_name?.toLowerCase() || '';
      const custNum = c.custody_number?.toLowerCase() || '';
      if (!empName.includes(search) && !custNum.includes(search)) return false;
    }
    return !c.is_voided;
  });

  const expenseAccounts = accounts.filter(a => a.type === 'Expense');
  const assetAccounts = accounts.filter(a => a.type === 'Asset' && a.code !== '1140');
  const inventoryAccounts = accounts.filter(a => a.code.startsWith('113'));

  const getAccountsForType = (type: string) => {
    switch (type) {
      case 'expense': return expenseAccounts;
      case 'purchase': return inventoryAccounts;
      case 'asset': return assetAccounts;
      default: return [];
    }
  };

  const exportToExcel = () => {
    const data = summaries.map(s => ({
      [isRTL ? 'الموظف' : 'Employee']: s.full_name,
      [isRTL ? 'إجمالي العهد' : 'Total Advanced']: s.total_advanced,
      [isRTL ? 'المصروف' : 'Total Spent']: s.total_spent,
      [isRTL ? 'المرتجع' : 'Total Returned']: s.total_returned,
      [isRTL ? 'المتبقي' : 'Remaining']: s.total_remaining,
      [isRTL ? 'العهد المفتوحة' : 'Open Custodies']: s.open_custodies,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, isRTL ? 'تقرير العهد' : 'Custody Report');
    XLSX.writeFile(wb, `custody_report_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      {toast && (
        <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-lg border backdrop-blur-sm transition-all duration-300 animate-[slideDown_0.3s_ease-out] ${
          toast.type === 'success' ? 'bg-emerald-50/95 border-emerald-200 text-emerald-800' :
          toast.type === 'error' ? 'bg-red-50/95 border-red-200 text-red-800' :
          'bg-blue-50/95 border-blue-200 text-blue-800'
        }`}>
          {toast.type === 'success' ? <Check className="w-5 h-5 text-emerald-500 shrink-0" /> :
           toast.type === 'error' ? <AlertCircle className="w-5 h-5 text-red-500 shrink-0" /> :
           <AlertCircle className="w-5 h-5 text-blue-500 shrink-0" />}
          <span className="text-sm font-medium">{toast.message}</span>
          <button onClick={() => setToast(null)} className="p-0.5 rounded-full hover:bg-black/5 transition shrink-0">
            <X className="w-4 h-4 opacity-60" />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{isRTL ? 'عهدة الموظفين' : 'Employee Custody'}</h2>
          <p className="text-gray-500 text-sm mt-0.5">{isRTL ? 'إدارة السلف والعهد المالية للموظفين' : 'Manage employee petty cash advances'}</p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowNewCustodyModal(true)}
            className="flex items-center gap-2 bg-teal-600 text-white px-4 py-2.5 rounded-xl hover:bg-teal-700 transition font-medium shadow-sm"
          >
            <Plus className="w-4 h-4" />
            {isRTL ? 'إنشاء عهدة' : 'New Custody'}
          </button>
        )}
      </div>

      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('custodies')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${
            activeTab === 'custodies'
              ? 'border-teal-600 text-teal-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Wallet className="w-4 h-4 inline-block mr-1.5" />
          {isRTL ? 'العهد' : 'Custodies'}
        </button>
        <button
          onClick={() => setActiveTab('report')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${
            activeTab === 'report'
              ? 'border-teal-600 text-teal-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <FileText className="w-4 h-4 inline-block mr-1.5" />
          {isRTL ? 'التقرير' : 'Report'}
        </button>
      </div>

      {activeTab === 'custodies' && (
        <>
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder={isRTL ? 'بحث...' : 'Search...'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
            >
              <option value="all">{isRTL ? 'جميع الحالات' : 'All Status'}</option>
              <option value="open">{isRTL ? 'مفتوحة' : 'Open'}</option>
              <option value="partial">{isRTL ? 'مسواة جزئياً' : 'Partial'}</option>
              <option value="settled">{isRTL ? 'مسواة' : 'Settled'}</option>
            </select>
            <select
              value={employeeFilter}
              onChange={(e) => setEmployeeFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
            >
              <option value="all">{isRTL ? 'جميع الموظفين' : 'All Employees'}</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.full_name}</option>
              ))}
            </select>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">{isRTL ? 'رقم العهدة' : 'Custody #'}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">{isRTL ? 'الموظف' : 'Employee'}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">{isRTL ? 'التاريخ' : 'Date'}</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">{isRTL ? 'المبلغ' : 'Amount'}</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">{isRTL ? 'المصروف' : 'Spent'}</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">{isRTL ? 'المرتجع' : 'Returned'}</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">{isRTL ? 'المتبقي' : 'Remaining'}</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">{isRTL ? 'الحالة' : 'Status'}</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">{isRTL ? 'إجراء' : 'Action'}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustodies.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-gray-400">
                        {isRTL ? 'لا توجد عهد' : 'No custodies found'}
                      </td>
                    </tr>
                  ) : filteredCustodies.map(custody => (
                    <tr key={custody.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-sm font-mono text-teal-700">{custody.custody_number}</td>
                      <td className="px-4 py-3 text-sm font-medium">{custody.employees?.full_name || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{fmtDate(custody.custody_date, isRTL)}</td>
                      <td className="px-4 py-3 text-sm text-right font-bold text-gray-900">{fmt(custody.amount)}</td>
                      <td className="px-4 py-3 text-sm text-right text-red-600">{fmt(custody.total_spent)}</td>
                      <td className="px-4 py-3 text-sm text-right text-blue-600">{fmt(custody.total_returned)}</td>
                      <td className="px-4 py-3 text-sm text-right font-bold text-teal-700">{fmt(custody.remaining_balance)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_LABELS[custody.status].color}`}>
                          {isRTL ? STATUS_LABELS[custody.status].ar : STATUS_LABELS[custody.status].en}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleOpenDetails(custody)}
                          className="p-1.5 text-teal-600 hover:bg-teal-50 rounded-lg transition"
                          title={isRTL ? 'عرض التفاصيل' : 'View Details'}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeTab === 'report' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">{isRTL ? 'تقرير عهد الموظفين' : 'Employee Custody Report'}</h3>
            <button
              onClick={exportToExcel}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition"
            >
              <Download className="w-4 h-4" />
              {isRTL ? 'تصدير' : 'Export'}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">{isRTL ? 'الموظف' : 'Employee'}</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">{isRTL ? 'إجمالي العهد' : 'Total Advanced'}</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">{isRTL ? 'المصروف منها' : 'Spent'}</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">{isRTL ? 'المرتجع' : 'Returned'}</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">{isRTL ? 'المتبقي' : 'Remaining'}</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">{isRTL ? 'عهد مفتوحة' : 'Open'}</th>
                </tr>
              </thead>
              <tbody>
                {summaries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-gray-400">
                      {isRTL ? 'لا توجد بيانات' : 'No data'}
                    </td>
                  </tr>
                ) : summaries.map(s => (
                  <tr key={s.employee_id} className="border-t border-gray-100 hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-sm font-medium">{s.full_name}</td>
                    <td className="px-4 py-3 text-sm text-right font-bold text-gray-900">{fmt(Number(s.total_advanced))}</td>
                    <td className="px-4 py-3 text-sm text-right text-red-600">{fmt(Number(s.total_spent))}</td>
                    <td className="px-4 py-3 text-sm text-right text-blue-600">{fmt(Number(s.total_returned))}</td>
                    <td className="px-4 py-3 text-sm text-right font-bold text-teal-700">{fmt(Number(s.total_remaining))}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${Number(s.open_custodies) > 0 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                        {s.open_custodies}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showNewCustodyModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold">{isRTL ? 'إنشاء عهدة جديدة' : 'Create New Custody'}</h3>
              <button onClick={() => { setShowNewCustodyModal(false); resetNewCustodyForm(); }} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'الموظف' : 'Employee'} *</label>
                <select
                  value={newCustody.employee_id}
                  onChange={(e) => setNewCustody({ ...newCustody, employee_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">{isRTL ? 'اختر الموظف' : 'Select Employee'}</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'التاريخ' : 'Date'}</label>
                  <input
                    type="date"
                    value={newCustody.custody_date}
                    onChange={(e) => setNewCustody({ ...newCustody, custody_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'المبلغ' : 'Amount'} *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newCustody.amount}
                    onChange={(e) => setNewCustody({ ...newCustody, amount: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'ممولة من' : 'Funding Source'}</label>
                <select
                  value={newCustody.funding_source}
                  onChange={(e) => setNewCustody({ ...newCustody, funding_source: e.target.value as any, partner_id: '' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                >
                  <option value="cash">{isRTL ? 'الصندوق' : 'Cash'}</option>
                  <option value="bank">{isRTL ? 'البنك' : 'Bank'}</option>
                  <option value="partner">{isRTL ? 'شريك' : 'Partner'}</option>
                </select>
              </div>
              {newCustody.funding_source === 'partner' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'الشريك' : 'Partner'} *</label>
                  <select
                    value={newCustody.partner_id}
                    onChange={(e) => setNewCustody({ ...newCustody, partner_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="">{isRTL ? 'اختر الشريك' : 'Select Partner'}</option>
                    {partners.map(p => (
                      <option key={p.id} value={p.id}>{isRTL ? p.name_ar : p.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'طريقة الدفع' : 'Payment Method'}</label>
                <select
                  value={newCustody.payment_method}
                  onChange={(e) => setNewCustody({ ...newCustody, payment_method: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                >
                  <option value="cash">{isRTL ? 'نقدي' : 'Cash'}</option>
                  <option value="bank_transfer">{isRTL ? 'تحويل بنكي' : 'Bank Transfer'}</option>
                  <option value="check">{isRTL ? 'شيك' : 'Check'}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'الوصف' : 'Description'}</label>
                <input
                  type="text"
                  value={newCustody.description}
                  onChange={(e) => setNewCustody({ ...newCustody, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  placeholder={isRTL ? 'الغرض من العهدة' : 'Purpose of custody'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'الوصف بالعربي' : 'Description (AR)'}</label>
                <input
                  type="text"
                  value={newCustody.description_ar}
                  onChange={(e) => setNewCustody({ ...newCustody, description_ar: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  dir="rtl"
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
              <button
                onClick={() => { setShowNewCustodyModal(false); resetNewCustodyForm(); }}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                {isRTL ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={handleCreateCustody}
                disabled={submitting}
                className="px-4 py-2 text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {isRTL ? 'إنشاء' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDetailsModal && selectedCustody && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">{isRTL ? 'تفاصيل العهدة' : 'Custody Details'}</h3>
                <p className="text-sm text-gray-500">{selectedCustody.custody_number}</p>
              </div>
              <button onClick={() => { setShowDetailsModal(false); setSelectedCustody(null); setSettlements([]); }} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1">{isRTL ? 'المبلغ الأصلي' : 'Original Amount'}</p>
                  <p className="text-lg font-bold text-gray-900">{fmt(selectedCustody.amount)}</p>
                </div>
                <div className="bg-red-50 rounded-xl p-4">
                  <p className="text-xs text-red-600 mb-1">{isRTL ? 'المصروف' : 'Spent'}</p>
                  <p className="text-lg font-bold text-red-700">{fmt(selectedCustody.total_spent)}</p>
                </div>
                <div className="bg-blue-50 rounded-xl p-4">
                  <p className="text-xs text-blue-600 mb-1">{isRTL ? 'المرتجع' : 'Returned'}</p>
                  <p className="text-lg font-bold text-blue-700">{fmt(selectedCustody.total_returned)}</p>
                </div>
                <div className="bg-teal-50 rounded-xl p-4">
                  <p className="text-xs text-teal-600 mb-1">{isRTL ? 'المتبقي' : 'Remaining'}</p>
                  <p className="text-lg font-bold text-teal-700">{fmt(selectedCustody.remaining_balance)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">{isRTL ? 'الموظف:' : 'Employee:'}</span>
                  <span className="font-medium ml-2">{selectedCustody.employees?.full_name}</span>
                </div>
                <div>
                  <span className="text-gray-500">{isRTL ? 'التاريخ:' : 'Date:'}</span>
                  <span className="font-medium ml-2">{fmtDate(selectedCustody.custody_date, isRTL)}</span>
                </div>
                <div>
                  <span className="text-gray-500">{isRTL ? 'مصدر التمويل:' : 'Funding:'}</span>
                  <span className="font-medium ml-2">
                    {isRTL ? FUNDING_SOURCE_LABELS[selectedCustody.funding_source].ar : FUNDING_SOURCE_LABELS[selectedCustody.funding_source].en}
                    {selectedCustody.funding_source === 'partner' && selectedCustody.partners && (
                      <> ({isRTL ? selectedCustody.partners.name_ar : selectedCustody.partners.name})</>
                    )}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">{isRTL ? 'الحالة:' : 'Status:'}</span>
                  <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_LABELS[selectedCustody.status].color}`}>
                    {isRTL ? STATUS_LABELS[selectedCustody.status].ar : STATUS_LABELS[selectedCustody.status].en}
                  </span>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-semibold text-gray-900">{isRTL ? 'سجل التسويات' : 'Settlement History'}</h4>
                  {canEdit && selectedCustody.status !== 'settled' && selectedCustody.remaining_balance > 0 && (
                    <button
                      onClick={() => setShowSettlementForm(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700"
                    >
                      <Plus className="w-4 h-4" />
                      {isRTL ? 'إضافة تسوية' : 'Add Settlement'}
                    </button>
                  )}
                </div>

                {showSettlementForm && (
                  <div className="bg-gray-50 rounded-xl p-4 mb-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">{isRTL ? 'نوع العملية' : 'Type'}</label>
                        <select
                          value={newSettlement.settlement_type}
                          onChange={(e) => setNewSettlement({ ...newSettlement, settlement_type: e.target.value as any, account_code: '' })}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
                        >
                          <option value="expense">{isRTL ? 'مصروف' : 'Expense'}</option>
                          <option value="purchase">{isRTL ? 'شراء مخزون' : 'Purchase'}</option>
                          <option value="asset">{isRTL ? 'أصل' : 'Asset'}</option>
                          <option value="cash_return">{isRTL ? 'إرجاع نقدي' : 'Cash Return'}</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">{isRTL ? 'التاريخ' : 'Date'}</label>
                        <input
                          type="date"
                          value={newSettlement.settlement_date}
                          onChange={(e) => setNewSettlement({ ...newSettlement, settlement_date: e.target.value })}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                    </div>
                    {newSettlement.settlement_type !== 'cash_return' && (
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">{isRTL ? 'الحساب' : 'Account'}</label>
                        <select
                          value={newSettlement.account_code}
                          onChange={(e) => setNewSettlement({ ...newSettlement, account_code: e.target.value })}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
                        >
                          <option value="">{isRTL ? 'اختر الحساب' : 'Select Account'}</option>
                          {getAccountsForType(newSettlement.settlement_type).map(acc => (
                            <option key={acc.id} value={acc.code}>{acc.code} - {isRTL ? acc.name_ar : acc.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">{isRTL ? 'المبلغ' : 'Amount'} (max: {fmt(selectedCustody.remaining_balance)})</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max={selectedCustody.remaining_balance}
                          value={newSettlement.amount}
                          onChange={(e) => setNewSettlement({ ...newSettlement, amount: e.target.value })}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">{isRTL ? 'الوصف' : 'Description'}</label>
                        <input
                          type="text"
                          value={newSettlement.description}
                          onChange={(e) => setNewSettlement({ ...newSettlement, description: e.target.value })}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => { setShowSettlementForm(false); resetSettlementForm(); }}
                        className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200 rounded-lg"
                      >
                        {isRTL ? 'إلغاء' : 'Cancel'}
                      </button>
                      <button
                        onClick={handleAddSettlement}
                        disabled={submitting}
                        className="px-3 py-1.5 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {submitting && <Loader2 className="w-3 h-3 animate-spin" />}
                        {isRTL ? 'حفظ' : 'Save'}
                      </button>
                    </div>
                  </div>
                )}

                {settlements.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-sm">
                    {isRTL ? 'لا توجد تسويات بعد' : 'No settlements yet'}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {settlements.filter(s => !s.is_voided).map(s => {
                      const typeInfo = SETTLEMENT_TYPE_LABELS[s.settlement_type];
                      const Icon = typeInfo.icon;
                      return (
                        <div key={s.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                          <div className={`p-2 rounded-lg bg-white ${typeInfo.color}`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium">{isRTL ? typeInfo.ar : typeInfo.en}</p>
                            <p className="text-xs text-gray-500">{s.description || fmtDate(s.settlement_date, isRTL)}</p>
                          </div>
                          <p className="text-sm font-bold text-gray-900">{fmt(s.amount)}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
