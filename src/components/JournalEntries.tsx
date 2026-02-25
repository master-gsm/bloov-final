import { useState, useEffect } from 'react';
import {
  BookOpen, Search, Filter, ChevronDown, ChevronUp,
  RotateCcw, X, Loader2, AlertTriangle, CheckCircle,
  Clock, Ban, Calendar, Building2, Eye, EyeOff,
  ShoppingCart, Package, Users, CreditCard, DollarSign,
  Briefcase, RefreshCw, TrendingUp, TrendingDown,
  ArrowRightLeft, Wrench, FileText, Layers,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Pagination } from './Pagination';

interface JournalEntry {
  id: string;
  entry_number: string;
  date: string;
  description: string;
  status: 'Draft' | 'Posted' | 'Void';
  branch_id: string | null;
  currency_code: string;
  original_entry_id: string | null;
  reverse_entry_id: string | null;
  created_by: string | null;
  posted_by: string | null;
  created_at: string;
  posted_at: string | null;
  voided_at: string | null;
  branches?: { name: string } | null;
  creator?: { full_name: string } | null;
  poster?: { full_name: string } | null;
}

interface JournalLine {
  id: string;
  journal_entry_id: string;
  account_id: string;
  debit: number;
  credit: number;
  description: string | null;
  line_number: number;
  accounts?: { code: string; name: string; name_ar: string } | null;
}

interface ReverseModalState {
  entryId: string;
  entryNumber: string;
  open: boolean;
}

interface OperationType {
  label_ar: string;
  label_en: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
  impactAr: (entry: JournalEntry, amount: number) => string;
  impactEn: (entry: JournalEntry, amount: number) => string;
}

const resolveOperationType = (entryNumber: string): string => {
  if (!entryNumber) return 'other';
  const n = entryNumber.toUpperCase();
  if (n.startsWith('JE-SALE') || n.startsWith('JE-ATOMIC-SALE')) return 'sale';
  if (n.startsWith('JE-PURCHASE')) return 'purchase';
  if (n.startsWith('JE-PARTNER-CAPITAL') || n.startsWith('JE-PARTNER-CASH')) return 'partner-capital';
  if (n.startsWith('JE-PARTNER-INVENTORY')) return 'partner-inventory';
  if (n.startsWith('JE-PARTNER-ASSET')) return 'partner-asset';
  if (n.startsWith('JE-PARTNER-OPERATIONAL') || n.startsWith('JE-PARTNER-EXPENSE') || n.startsWith('JE-PARTNER-OP')) return 'partner-expense';
  if (n.startsWith('JE-PARTNER')) return 'partner-capital';
  if (n.startsWith('JE-PAYROLL')) return 'payroll';
  if (n.startsWith('JE-EXPENSE') || n.startsWith('JE-OPEX')) return 'expense';
  if (n.startsWith('JE-ASSET') || n.startsWith('JE-DEPREC')) return 'asset';
  if (n.startsWith('JE-VAT') || n.startsWith('JE-TAX')) return 'vat';
  if (n.startsWith('JE-VOID') || n.startsWith('JE-REV')) return 'reversal';
  if (n.startsWith('JE-ALLOC')) return 'allocation';
  return 'other';
};

const OP_TYPES: Record<string, OperationType> = {
  sale: {
    label_ar: 'عملية بيع',
    label_en: 'Sale',
    icon: <ShoppingCart className="w-4 h-4" />,
    color: 'text-emerald-700',
    bg: 'bg-emerald-50 border-emerald-200',
    impactAr: (_, a) => `تحصيل إيراد بيع بقيمة ${fmtN(a)} ر.س`,
    impactEn: (_, a) => `Sales revenue collected: ${fmtN(a)} SAR`,
  },
  purchase: {
    label_ar: 'مشتريات',
    label_en: 'Purchase',
    icon: <Package className="w-4 h-4" />,
    color: 'text-blue-700',
    bg: 'bg-blue-50 border-blue-200',
    impactAr: (_, a) => `إضافة مخزون بقيمة ${fmtN(a)} ر.س`,
    impactEn: (_, a) => `Inventory added: ${fmtN(a)} SAR`,
  },
  'partner-capital': {
    label_ar: 'مساهمة رأس مال',
    label_en: 'Capital Contribution',
    icon: <TrendingUp className="w-4 h-4" />,
    color: 'text-teal-700',
    bg: 'bg-teal-50 border-teal-200',
    impactAr: (_, a) => `زيادة رأس المال بمبلغ ${fmtN(a)} ر.س`,
    impactEn: (_, a) => `Capital increased by ${fmtN(a)} SAR`,
  },
  'partner-inventory': {
    label_ar: 'مساهمة مخزون',
    label_en: 'Inventory Contribution',
    icon: <Package className="w-4 h-4" />,
    color: 'text-green-700',
    bg: 'bg-green-50 border-green-200',
    impactAr: (_, a) => `إضافة مخزون من شريك بقيمة ${fmtN(a)} ر.س`,
    impactEn: (_, a) => `Inventory contributed by partner: ${fmtN(a)} SAR`,
  },
  'partner-asset': {
    label_ar: 'مساهمة أصل ثابت',
    label_en: 'Asset Contribution',
    icon: <Wrench className="w-4 h-4" />,
    color: 'text-blue-700',
    bg: 'bg-blue-50 border-blue-200',
    impactAr: (_, a) => `إضافة أصل ثابت من شريك بقيمة ${fmtN(a)} ر.س`,
    impactEn: (_, a) => `Fixed asset contributed by partner: ${fmtN(a)} SAR`,
  },
  'partner-expense': {
    label_ar: 'مصروف تشغيلي (شريك)',
    label_en: 'Operational Expense',
    icon: <TrendingDown className="w-4 h-4" />,
    color: 'text-orange-700',
    bg: 'bg-orange-50 border-orange-200',
    impactAr: (_, a) => `تسجيل مصروف تشغيلي بقيمة ${fmtN(a)} ر.س`,
    impactEn: (_, a) => `Operational expense recorded: ${fmtN(a)} SAR`,
  },
  payroll: {
    label_ar: 'رواتب وأجور',
    label_en: 'Payroll',
    icon: <Users className="w-4 h-4" />,
    color: 'text-rose-700',
    bg: 'bg-rose-50 border-rose-200',
    impactAr: (_, a) => `صرف رواتب بقيمة ${fmtN(a)} ر.س`,
    impactEn: (_, a) => `Payroll disbursed: ${fmtN(a)} SAR`,
  },
  expense: {
    label_ar: 'مصروف',
    label_en: 'Expense',
    icon: <CreditCard className="w-4 h-4" />,
    color: 'text-amber-700',
    bg: 'bg-amber-50 border-amber-200',
    impactAr: (_, a) => `تسجيل مصروف بقيمة ${fmtN(a)} ر.س`,
    impactEn: (_, a) => `Expense recorded: ${fmtN(a)} SAR`,
  },
  asset: {
    label_ar: 'أصول ثابتة / استهلاك',
    label_en: 'Assets / Depreciation',
    icon: <Briefcase className="w-4 h-4" />,
    color: 'text-slate-700',
    bg: 'bg-slate-50 border-slate-200',
    impactAr: (_, a) => `حركة أصول ثابتة بقيمة ${fmtN(a)} ر.س`,
    impactEn: (_, a) => `Fixed assets movement: ${fmtN(a)} SAR`,
  },
  vat: {
    label_ar: 'ضريبة القيمة المضافة',
    label_en: 'VAT',
    icon: <FileText className="w-4 h-4" />,
    color: 'text-cyan-700',
    bg: 'bg-cyan-50 border-cyan-200',
    impactAr: (_, a) => `قيد ضريبي بقيمة ${fmtN(a)} ر.س`,
    impactEn: (_, a) => `Tax entry: ${fmtN(a)} SAR`,
  },
  reversal: {
    label_ar: 'قيد عكسي',
    label_en: 'Reversal',
    icon: <RefreshCw className="w-4 h-4" />,
    color: 'text-orange-700',
    bg: 'bg-orange-50 border-orange-200',
    impactAr: (_, a) => `عكس قيد بقيمة ${fmtN(a)} ر.س`,
    impactEn: (_, a) => `Entry reversed: ${fmtN(a)} SAR`,
  },
  allocation: {
    label_ar: 'تخصيص / تسوية',
    label_en: 'Allocation',
    icon: <ArrowRightLeft className="w-4 h-4" />,
    color: 'text-violet-700',
    bg: 'bg-violet-50 border-violet-200',
    impactAr: (_, a) => `تخصيص مبلغ ${fmtN(a)} ر.س`,
    impactEn: (_, a) => `Allocation: ${fmtN(a)} SAR`,
  },
  other: {
    label_ar: 'قيد محاسبي',
    label_en: 'Journal Entry',
    icon: <Layers className="w-4 h-4" />,
    color: 'text-gray-700',
    bg: 'bg-gray-50 border-gray-200',
    impactAr: (_, a) => `حركة مالية بقيمة ${fmtN(a)} ر.س`,
    impactEn: (_, a) => `Financial movement: ${fmtN(a)} SAR`,
  },
};

function fmtN(n: number): string {
  return (n ?? 0).toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function JournalEntries() {
  const { user, can } = useAuth();
  const { isRTL } = useLanguage();
  const canViewAllBranches = can('branches', 'view');

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [lines, setLines] = useState<Record<string, JournalLine[]>>({});
  const [linesLoading, setLinesLoading] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  const [reverseModal, setReverseModal] = useState<ReverseModalState>({ entryId: '', entryNumber: '', open: false });
  const [reverseReason, setReverseReason] = useState('');
  const [reversing, setReversing] = useState(false);
  const [reverseError, setReverseError] = useState('');
  const [reverseSuccess, setReverseSuccess] = useState('');

  const [userBranchId, setUserBranchId] = useState<string | null>(null);

  const [accountingMode, setAccountingMode] = useState<Record<string, boolean>>({});

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    loadUserContext();
  }, [user]);

  useEffect(() => {
    if (userBranchId !== undefined) {
      loadEntries(userBranchId);
    }
  }, [currentPage, pageSize]);

  const loadUserContext = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('users')
      .select('branch_id')
      .eq('id', user.id)
      .maybeSingle();
    if (data) {
      setUserBranchId(data.branch_id);
    }
    loadEntries(data?.branch_id);
  };

  const loadEntries = async (branchId?: string | null) => {
    setLoading(true);
    try {
      let query = supabase
        .from('journal_entries')
        .select(`
          *,
          branches(name),
          creator:users!journal_entries_created_by_fkey(full_name),
          poster:users!journal_entries_posted_by_fkey(full_name)
        `, { count: 'exact' })
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

      if (!canViewAllBranches && branchId) {
        query = query.eq('branch_id', branchId);
      }

      // Apply search filter
      if (searchTerm) {
        query = query.or(`entry_number.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`);
      }

      // Apply status filter
      if (filterStatus !== 'all') {
        query = query.eq('status', filterStatus);
      }

      // Apply date filters
      if (filterDateFrom) {
        query = query.gte('date', filterDateFrom);
      }
      if (filterDateTo) {
        query = query.lte('date', filterDateTo);
      }

      // Apply pagination
      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;
      if (error) throw error;
      setEntries((data || []) as any[]);
      if (count !== null) setTotalCount(count);
    } finally {
      setLoading(false);
    }
  };

  const loadLines = async (entryId: string) => {
    if (lines[entryId]) return;
    setLinesLoading(entryId);
    try {
      const { data } = await supabase
        .from('journal_lines')
        .select(`*, accounts(code, name, name_ar)`)
        .eq('journal_entry_id', entryId)
        .order('line_number');
      setLines(prev => ({ ...prev, [entryId]: (data || []) as any[] }));
    } finally {
      setLinesLoading(null);
    }
  };

  const toggleExpand = async (entryId: string) => {
    if (expandedEntry === entryId) {
      setExpandedEntry(null);
    } else {
      setExpandedEntry(entryId);
      await loadLines(entryId);
    }
  };

  const toggleAccountingMode = (entryId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setAccountingMode(prev => ({ ...prev, [entryId]: !prev[entryId] }));
    if (!lines[entryId]) loadLines(entryId);
  };

  const openReverseModal = (entry: JournalEntry) => {
    setReverseModal({ entryId: entry.id, entryNumber: entry.entry_number, open: true });
    setReverseReason('');
    setReverseError('');
    setReverseSuccess('');
  };

  const handleReverse = async () => {
    if (!reverseReason.trim()) {
      setReverseError(isRTL ? 'يجب إدخال سبب العكس' : 'Reason is required');
      return;
    }
    setReversing(true);
    setReverseError('');
    try {
      const { error } = await supabase.rpc('void_journal_entry', {
        p_entry_id: reverseModal.entryId,
        p_reason: reverseReason.trim(),
      });
      if (error) throw error;
      setReverseSuccess(
        isRTL ? 'تم إنشاء قيد العكس بنجاح' : 'Reverse entry created successfully'
      );
      loadEntries(userBranchId);
      setTimeout(() => {
        setReverseModal({ entryId: '', entryNumber: '', open: false });
        setReverseSuccess('');
      }, 1800);
    } catch (e: any) {
      setReverseError(e.message || (isRTL ? 'فشل إنشاء القيد العكسي' : 'Failed to create reversal'));
    } finally {
      setReversing(false);
    }
  };

  const statusConfig: Record<string, { label_ar: string; label_en: string; cls: string; icon: React.ReactNode }> = {
    Draft:  { label_ar: 'مسودة', label_en: 'Draft',  cls: 'bg-gray-100 text-gray-600',    icon: <Clock className="w-3 h-3" /> },
    Posted: { label_ar: 'مرحّل', label_en: 'Posted', cls: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle className="w-3 h-3" /> },
    Void:   { label_ar: 'ملغى',  label_en: 'Void',   cls: 'bg-red-100 text-red-600',      icon: <Ban className="w-3 h-3" /> },
  };

  // Server-side filtering is now applied in loadEntries
  const filteredEntries = entries;

  const totalDebit = (entryLines: JournalLine[]) =>
    entryLines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = (entryLines: JournalLine[]) =>
    entryLines.reduce((s, l) => s + (l.credit || 0), 0);

  const getEntryAmount = (entry: JournalEntry, entryLines: JournalLine[]): number => {
    if (entryLines.length > 0) return totalDebit(entryLines);
    return 0;
  };

  return (
    <div className={`p-6 space-y-6 ${isRTL ? 'rtl' : 'ltr'}`} dir={isRTL ? 'rtl' : 'ltr'}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-teal-600 rounded-xl flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {isRTL ? 'القيود اليومية' : 'Journal Entries'}
            </h1>
            <p className="text-sm text-gray-500">
              {isRTL ? `${filteredEntries.length} قيد` : `${filteredEntries.length} entries`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-gray-100 rounded-xl p-1">
          <button
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              Object.keys(accountingMode).length === 0 || Object.values(accountingMode).every(v => !v)
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setAccountingMode({})}
          >
            <Briefcase className="w-3.5 h-3.5" />
            {isRTL ? 'عرض الأعمال' : 'Business'}
          </button>
          <button
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filteredEntries.length > 0 && filteredEntries.every(e => accountingMode[e.id])
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => {
              const allIds = filteredEntries.reduce((acc, e) => {
                acc[e.id] = true;
                return acc;
              }, {} as Record<string, boolean>);
              setAccountingMode(allIds);
              filteredEntries.forEach(e => loadLines(e.id));
            }}
          >
            <DollarSign className="w-3.5 h-3.5" />
            {isRTL ? 'عرض محاسبي' : 'Accounting'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search className={`absolute top-2.5 ${isRTL ? 'right-3' : 'left-3'} w-4 h-4 text-gray-400`} />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder={isRTL ? 'بحث برقم أو وصف...' : 'Search by number or desc...'}
              className={`w-full border border-gray-200 rounded-lg py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 ${isRTL ? 'pr-9 pl-3 text-right' : 'pl-9 pr-3'}`}
            />
          </div>

          <div className="relative">
            <Filter className={`absolute top-2.5 ${isRTL ? 'right-3' : 'left-3'} w-4 h-4 text-gray-400`} />
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className={`w-full border border-gray-200 rounded-lg py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white ${isRTL ? 'pr-9 pl-3 text-right' : 'pl-9 pr-3'}`}
            >
              <option value="all">{isRTL ? 'جميع الحالات' : 'All Statuses'}</option>
              <option value="Draft">{isRTL ? 'مسودة' : 'Draft'}</option>
              <option value="Posted">{isRTL ? 'مرحّل' : 'Posted'}</option>
              <option value="Void">{isRTL ? 'ملغى' : 'Void'}</option>
            </select>
          </div>

          <div className="relative">
            <Calendar className={`absolute top-2.5 ${isRTL ? 'right-3' : 'left-3'} w-4 h-4 text-gray-400`} />
            <input
              type="date"
              value={filterDateFrom}
              onChange={e => setFilterDateFrom(e.target.value)}
              className={`w-full border border-gray-200 rounded-lg py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 ${isRTL ? 'pr-9 pl-3' : 'pl-9 pr-3'}`}
            />
          </div>

          <div className="relative">
            <Calendar className={`absolute top-2.5 ${isRTL ? 'right-3' : 'left-3'} w-4 h-4 text-gray-400`} />
            <input
              type="date"
              value={filterDateTo}
              onChange={e => setFilterDateTo(e.target.value)}
              className={`w-full border border-gray-200 rounded-lg py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 ${isRTL ? 'pr-9 pl-3' : 'pl-9 pr-3'}`}
            />
          </div>
        </div>

        {(filterStatus !== 'all' || filterDateFrom || filterDateTo || searchTerm) && (
          <div className="mt-3 flex justify-end">
            <button
              onClick={() => {
                setSearchTerm('');
                setFilterStatus('all');
                setFilterDateFrom('');
                setFilterDateTo('');
              }}
              className="text-xs text-teal-600 hover:text-teal-800 flex items-center gap-1"
            >
              <X className="w-3 h-3" />
              {isRTL ? 'مسح الفلاتر' : 'Clear filters'}
            </button>
          </div>
        )}
      </div>

      {/* Entries List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{isRTL ? 'لا توجد قيود تطابق البحث' : 'No journal entries found'}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredEntries.map(entry => {
              const sc = statusConfig[entry.status] || statusConfig['Draft'];
              const isExpanded = expandedEntry === entry.id;
              const entryLines = lines[entry.id] || [];
              const isLinesLoading = linesLoading === entry.id;
              const canReverse = entry.status === 'Posted' && !entry.reverse_entry_id;
              const opKey = resolveOperationType(entry.entry_number);
              const op = OP_TYPES[opKey] || OP_TYPES['other'];
              const amount = getEntryAmount(entry, entryLines);
              const isAccounting = accountingMode[entry.id] || false;

              return (
                <div key={entry.id} className="transition-colors">

                  {/* Entry Row */}
                  <div
                    className={`px-5 py-4 cursor-pointer hover:bg-gray-50/80 transition-colors ${isExpanded ? 'bg-teal-50/30' : ''}`}
                    onClick={() => toggleExpand(entry.id)}
                  >
                    <div className="flex items-center justify-between gap-4">

                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <button className="text-gray-400 hover:text-teal-600 flex-shrink-0 transition-colors">
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>

                        {/* Operation type badge */}
                        <div className={`hidden sm:flex items-center justify-center w-8 h-8 rounded-lg border flex-shrink-0 ${op.bg} ${op.color}`}>
                          {op.icon}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-sm font-semibold ${op.color}`}>
                              {isRTL ? op.label_ar : op.label_en}
                            </span>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${sc.cls}`}>
                              {sc.icon}
                              {isRTL ? sc.label_ar : sc.label_en}
                            </span>
                            {entry.original_entry_id && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                                <RotateCcw className="w-3 h-3" />
                                {isRTL ? 'قيد عكسي' : 'Reversal'}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5 font-mono">
                            {entry.entry_number || '—'} · {entry.date}
                            {entry.branches?.name && ` · ${entry.branches.name}`}
                          </p>
                        </div>
                      </div>

                      <div className={`flex items-center gap-3 flex-shrink-0 ${isRTL ? 'flex-row-reverse' : ''}`}>
                        {/* Amount */}
                        {amount > 0 && (
                          <div className="hidden sm:block text-right">
                            <p className="text-sm font-semibold text-gray-900 font-mono">
                              {fmtN(amount)}
                            </p>
                            <p className="text-xs text-gray-400">{isRTL ? 'ر.س' : 'SAR'}</p>
                          </div>
                        )}

                        {/* Toggle accounting details */}
                        <button
                          onClick={e => toggleAccountingMode(entry.id, e)}
                          title={isRTL ? 'تفاصيل محاسبية' : 'Accounting details'}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                            isAccounting
                              ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                              : 'bg-white text-gray-500 border-gray-200 hover:border-teal-300 hover:text-teal-600'
                          }`}
                        >
                          {isAccounting ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          <span className="hidden md:inline">
                            {isRTL ? (isAccounting ? 'إخفاء' : 'حسابات') : (isAccounting ? 'Hide' : 'Accounts')}
                          </span>
                        </button>

                        {canReverse && (
                          <button
                            onClick={e => { e.stopPropagation(); openReverseModal(entry); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 text-orange-700 border border-orange-200 rounded-lg text-xs font-medium hover:bg-orange-100 transition"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span className="hidden md:inline">{isRTL ? 'عكس' : 'Reverse'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Section */}
                  {isExpanded && (
                    <div className="border-t border-gray-100">

                      {isAccounting ? (
                        /* ── ACCOUNTING MODE: full GL lines ── */
                        <div className="bg-gray-50 px-5 py-4">
                          {isLinesLoading ? (
                            <div className="flex items-center justify-center py-6">
                              <Loader2 className="w-5 h-5 animate-spin text-teal-600" />
                            </div>
                          ) : entryLines.length === 0 ? (
                            <p className="text-sm text-gray-400 text-center py-4">
                              {isRTL ? 'لا توجد بنود' : 'No lines found'}
                            </p>
                          ) : (
                            <div className="overflow-x-auto rounded-lg border border-gray-200">
                              <table className="min-w-full text-sm">
                                <thead className="bg-white border-b border-gray-200">
                                  <tr>
                                    <th className={`py-2.5 px-4 text-xs font-semibold text-gray-500 uppercase ${isRTL ? 'text-right' : 'text-left'}`}>
                                      {isRTL ? 'رقم الحساب' : 'Code'}
                                    </th>
                                    <th className={`py-2.5 px-4 text-xs font-semibold text-gray-500 uppercase ${isRTL ? 'text-right' : 'text-left'}`}>
                                      {isRTL ? 'اسم الحساب' : 'Account'}
                                    </th>
                                    <th className={`py-2.5 px-4 text-xs font-semibold text-gray-500 uppercase ${isRTL ? 'text-right' : 'text-left'}`}>
                                      {isRTL ? 'البيان' : 'Description'}
                                    </th>
                                    <th className="py-2.5 px-4 text-xs font-semibold text-gray-500 uppercase text-right">
                                      {isRTL ? 'مدين' : 'Debit'}
                                    </th>
                                    <th className="py-2.5 px-4 text-xs font-semibold text-gray-500 uppercase text-right">
                                      {isRTL ? 'دائن' : 'Credit'}
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {entryLines.map(line => (
                                    <tr key={line.id} className="hover:bg-white/70 transition">
                                      <td className={`py-2.5 px-4 font-mono text-xs text-teal-700 font-semibold ${isRTL ? 'text-right' : ''}`}>
                                        {line.accounts?.code || '—'}
                                      </td>
                                      <td className={`py-2.5 px-4 text-gray-700 ${isRTL ? 'text-right' : ''}`}>
                                        {isRTL
                                          ? (line.accounts?.name_ar || line.accounts?.name || '—')
                                          : (line.accounts?.name || line.accounts?.name_ar || '—')}
                                      </td>
                                      <td className={`py-2.5 px-4 text-gray-400 text-xs ${isRTL ? 'text-right' : ''}`}>
                                        {line.description || '—'}
                                      </td>
                                      <td className="py-2.5 px-4 text-right font-mono">
                                        {line.debit > 0
                                          ? <span className="text-gray-900 font-semibold">{fmtN(line.debit)}</span>
                                          : <span className="text-gray-300">—</span>}
                                      </td>
                                      <td className="py-2.5 px-4 text-right font-mono">
                                        {line.credit > 0
                                          ? <span className="text-gray-900 font-semibold">{fmtN(line.credit)}</span>
                                          : <span className="text-gray-300">—</span>}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot className="bg-gray-100 border-t border-gray-200">
                                  <tr>
                                    <td colSpan={3} className={`py-2.5 px-4 text-xs font-bold text-gray-600 ${isRTL ? 'text-right' : ''}`}>
                                      {isRTL ? 'المجموع' : 'Total'}
                                    </td>
                                    <td className="py-2.5 px-4 text-right font-mono font-bold text-gray-900">
                                      {fmtN(totalDebit(entryLines))}
                                    </td>
                                    <td className="py-2.5 px-4 text-right font-mono font-bold text-gray-900">
                                      {fmtN(totalCredit(entryLines))}
                                    </td>
                                  </tr>
                                  {Math.abs(totalDebit(entryLines) - totalCredit(entryLines)) > 0.01 && (
                                    <tr>
                                      <td colSpan={5} className="py-2 px-4 text-center">
                                        <span className="inline-flex items-center gap-1.5 text-xs text-red-600 font-medium">
                                          <AlertTriangle className="w-3.5 h-3.5" />
                                          {isRTL ? 'القيد غير متوازن' : 'Entry is not balanced'}
                                        </span>
                                      </td>
                                    </tr>
                                  )}
                                </tfoot>
                              </table>
                            </div>
                          )}
                        </div>
                      ) : (
                        /* ── BUSINESS MODE: human-readable impact ── */
                        <div className="px-5 py-4 bg-white">
                          {isLinesLoading ? (
                            <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              {isRTL ? 'جارٍ التحميل...' : 'Loading...'}
                            </div>
                          ) : (
                            <div className="flex flex-col gap-4">
                              {/* Impact summary card */}
                              <div className={`flex items-center gap-4 p-4 rounded-xl border ${op.bg}`}>
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${op.color} bg-white shadow-sm`}>
                                  {op.icon}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className={`font-semibold text-base ${op.color}`}>
                                    {isRTL ? op.label_ar : op.label_en}
                                  </p>
                                  <p className="text-sm text-gray-600 mt-0.5">
                                    {isRTL
                                      ? op.impactAr(entry, amount > 0 ? amount : totalDebit(entryLines))
                                      : op.impactEn(entry, amount > 0 ? amount : totalDebit(entryLines))}
                                  </p>
                                  {entry.description && (
                                    <p className="text-xs text-gray-400 mt-1 truncate">{entry.description}</p>
                                  )}
                                </div>
                                <div className="text-right flex-shrink-0">
                                  <p className="text-xl font-bold text-gray-900 font-mono">
                                    {fmtN(totalDebit(entryLines) || 0)}
                                  </p>
                                  <p className="text-xs text-gray-400">{isRTL ? 'ر.س' : 'SAR'}</p>
                                </div>
                              </div>

                              {/* Simplified impact rows */}
                              {entryLines.length > 0 && (
                                <div className="space-y-2">
                                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                    {isRTL ? 'أثر العملية' : 'Transaction Impact'}
                                  </p>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {entryLines.map(line => {
                                      const isDebit = line.debit > 0;
                                      const acctName = isRTL
                                        ? (line.accounts?.name_ar || line.accounts?.name || '—')
                                        : (line.accounts?.name || line.accounts?.name_ar || '—');
                                      return (
                                        <div
                                          key={line.id}
                                          className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border ${
                                            isDebit
                                              ? 'bg-blue-50/60 border-blue-100'
                                              : 'bg-green-50/60 border-green-100'
                                          }`}
                                        >
                                          <div className="flex items-center gap-2 min-w-0">
                                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                                              isDebit ? 'bg-blue-200 text-blue-800' : 'bg-green-200 text-green-800'
                                            }`}>
                                              {isDebit ? (isRTL ? 'م' : 'D') : (isRTL ? 'د' : 'C')}
                                            </span>
                                            <span className="text-sm text-gray-700 truncate">{acctName}</span>
                                          </div>
                                          <span className={`font-mono text-sm font-semibold flex-shrink-0 ${
                                            isDebit ? 'text-blue-700' : 'text-green-700'
                                          }`}>
                                            {fmtN(isDebit ? line.debit : line.credit)}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Meta row */}
                              <div className="flex items-center gap-4 text-xs text-gray-400 pt-1 border-t border-gray-100 flex-wrap">
                                {(entry.creator as any)?.full_name && (
                                  <span>{isRTL ? 'أُنشئ بواسطة:' : 'By:'} <span className="text-gray-600">{(entry.creator as any).full_name}</span></span>
                                )}
                                {(entry.poster as any)?.full_name && (
                                  <span>{isRTL ? 'رُحّل بواسطة:' : 'Posted by:'} <span className="text-gray-600">{(entry.poster as any).full_name}</span></span>
                                )}
                                {entry.branches?.name && (
                                  <span className="flex items-center gap-1">
                                    <Building2 className="w-3 h-3" />
                                    {entry.branches.name}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {totalCount > pageSize && (
          <div className="mt-6 px-5">
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

      {/* Reverse Entry Modal */}
      {reverseModal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-orange-100 rounded-lg flex items-center justify-center">
                  <RotateCcw className="w-4 h-4 text-orange-600" />
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900">
                    {isRTL ? 'عكس القيد' : 'Reverse Entry'}
                  </h2>
                  <p className="text-xs text-gray-500">{reverseModal.entryNumber}</p>
                </div>
              </div>
              <button
                onClick={() => setReverseModal({ entryId: '', entryNumber: '', open: false })}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-orange-700">
                  {isRTL
                    ? 'سيتم إنشاء قيد جديد بقيم معكوسة (مدين ↔ دائن) وتحديث حالة القيد الأصلي إلى "ملغى".'
                    : 'A new entry with swapped debit/credit values will be created and the original entry will be marked as Void.'}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {isRTL ? 'سبب العكس *' : 'Reason for Reversal *'}
                </label>
                <textarea
                  value={reverseReason}
                  onChange={e => setReverseReason(e.target.value)}
                  rows={3}
                  placeholder={isRTL ? 'أدخل سبب العكس...' : 'Enter reason for reversal...'}
                  className={`w-full border border-gray-200 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none ${isRTL ? 'text-right' : ''}`}
                />
              </div>

              {reverseError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <p className="text-xs text-red-700">{reverseError}</p>
                </div>
              )}

              {reverseSuccess && (
                <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                  <p className="text-xs text-green-700">{reverseSuccess}</p>
                </div>
              )}
            </div>

            <div className="flex gap-3 p-5 border-t border-gray-100">
              <button
                onClick={() => setReverseModal({ entryId: '', entryNumber: '', open: false })}
                disabled={reversing}
                className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
              >
                {isRTL ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={handleReverse}
                disabled={reversing || !reverseReason.trim()}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 transition disabled:opacity-50"
              >
                {reversing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                {isRTL ? 'تأكيد العكس' : 'Confirm Reversal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
