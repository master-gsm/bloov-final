import { useState, useEffect } from 'react';
import {
  BookOpen, Search, Filter, ChevronDown, ChevronUp,
  RotateCcw, X, Loader2, AlertTriangle, CheckCircle,
  Clock, Ban, Calendar, Building2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

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

export default function JournalEntries() {
  const { user } = useAuth();
  const { isRTL } = useLanguage();

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [lines, setLines] = useState<Record<string, JournalLine[]>>({});
  const [linesLoading, setLinesLoading] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterAccount, setFilterAccount] = useState('');

  const [reverseModal, setReverseModal] = useState<ReverseModalState>({ entryId: '', entryNumber: '', open: false });
  const [reverseReason, setReverseReason] = useState('');
  const [reversing, setReversing] = useState(false);
  const [reverseError, setReverseError] = useState('');
  const [reverseSuccess, setReverseSuccess] = useState('');

  const [userRole, setUserRole] = useState<string>('');
  const [userBranchId, setUserBranchId] = useState<string | null>(null);

  const fmt = (n: number) =>
    (n ?? 0).toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  useEffect(() => {
    loadUserContext();
  }, [user]);

  const loadUserContext = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('users')
      .select('role, branch_id')
      .eq('id', user.id)
      .maybeSingle();
    if (data) {
      setUserRole(data.role);
      setUserBranchId(data.branch_id);
    }
    loadEntries(data?.role, data?.branch_id);
  };

  const loadEntries = async (role?: string, branchId?: string | null) => {
    setLoading(true);
    try {
      let query = supabase
        .from('journal_entries')
        .select(`
          *,
          branches(name),
          creator:users!journal_entries_created_by_fkey(full_name),
          poster:users!journal_entries_posted_by_fkey(full_name)
        `)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

      if (role !== 'super_admin' && role !== 'admin' && branchId) {
        query = query.eq('branch_id', branchId);
      }

      const { data, error } = await query;
      if (error) throw error;
      setEntries((data || []) as any[]);
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
      const { data, error } = await supabase.rpc('void_journal_entry', {
        p_entry_id: reverseModal.entryId,
        p_reason: reverseReason.trim(),
      });
      if (error) throw error;
      setReverseSuccess(
        isRTL
          ? `تم إنشاء قيد العكس بنجاح`
          : `Reverse entry created successfully`
      );
      loadEntries(userRole, userBranchId);
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
    Draft:  { label_ar: 'مسودة', label_en: 'Draft',  cls: 'bg-gray-100 text-gray-700',   icon: <Clock className="w-3 h-3" /> },
    Posted: { label_ar: 'مرحّل', label_en: 'Posted', cls: 'bg-green-100 text-green-700', icon: <CheckCircle className="w-3 h-3" /> },
    Void:   { label_ar: 'ملغى',  label_en: 'Void',   cls: 'bg-red-100 text-red-700',     icon: <Ban className="w-3 h-3" /> },
  };

  const filteredEntries = entries.filter(e => {
    const term = searchTerm.toLowerCase();
    const matchSearch =
      !term ||
      (e.entry_number || '').toLowerCase().includes(term) ||
      (e.description || '').toLowerCase().includes(term);

    const matchStatus = filterStatus === 'all' || e.status === filterStatus;

    const matchDateFrom = !filterDateFrom || e.date >= filterDateFrom;
    const matchDateTo   = !filterDateTo   || e.date <= filterDateTo;

    const matchAccount =
      !filterAccount ||
      (lines[e.id] || []).some(
        l =>
          (l.accounts?.code || '').toLowerCase().includes(filterAccount.toLowerCase()) ||
          (l.accounts?.name || '').toLowerCase().includes(filterAccount.toLowerCase()) ||
          (l.accounts?.name_ar || '').includes(filterAccount)
      );

    return matchSearch && matchStatus && matchDateFrom && matchDateTo && matchAccount;
  });

  const totalDebit = (entryLines: JournalLine[]) =>
    entryLines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = (entryLines: JournalLine[]) =>
    entryLines.reduce((s, l) => s + (l.credit || 0), 0);

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
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
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

          {/* Status filter */}
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

          {/* Date From */}
          <div className="relative">
            <Calendar className={`absolute top-2.5 ${isRTL ? 'right-3' : 'left-3'} w-4 h-4 text-gray-400`} />
            <input
              type="date"
              value={filterDateFrom}
              onChange={e => setFilterDateFrom(e.target.value)}
              className={`w-full border border-gray-200 rounded-lg py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 ${isRTL ? 'pr-9 pl-3' : 'pl-9 pr-3'}`}
            />
          </div>

          {/* Date To */}
          <div className="relative">
            <Calendar className={`absolute top-2.5 ${isRTL ? 'right-3' : 'left-3'} w-4 h-4 text-gray-400`} />
            <input
              type="date"
              value={filterDateTo}
              onChange={e => setFilterDateTo(e.target.value)}
              className={`w-full border border-gray-200 rounded-lg py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 ${isRTL ? 'pr-9 pl-3' : 'pl-9 pr-3'}`}
            />
          </div>

          {/* Account filter */}
          <div className="relative md:col-span-2 lg:col-span-4">
            <Building2 className={`absolute top-2.5 ${isRTL ? 'right-3' : 'left-3'} w-4 h-4 text-gray-400`} />
            <input
              type="text"
              value={filterAccount}
              onChange={e => setFilterAccount(e.target.value)}
              placeholder={isRTL ? 'فلترة حسب الحساب (رقم أو اسم)...' : 'Filter by account (code or name)...'}
              className={`w-full border border-gray-200 rounded-lg py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 ${isRTL ? 'pr-9 pl-3 text-right' : 'pl-9 pr-3'}`}
            />
          </div>
        </div>

        {(filterStatus !== 'all' || filterDateFrom || filterDateTo || filterAccount || searchTerm) && (
          <div className="mt-3 flex justify-end">
            <button
              onClick={() => {
                setSearchTerm('');
                setFilterStatus('all');
                setFilterDateFrom('');
                setFilterDateTo('');
                setFilterAccount('');
              }}
              className="text-xs text-teal-600 hover:text-teal-800 flex items-center gap-1"
            >
              <X className="w-3 h-3" />
              {isRTL ? 'مسح الفلاتر' : 'Clear filters'}
            </button>
          </div>
        )}
      </div>

      {/* Table */}
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
              const isLoading = linesLoading === entry.id;
              const canReverse = entry.status === 'Posted' && !entry.reverse_entry_id;

              return (
                <div key={entry.id}>
                  {/* Entry Row */}
                  <div
                    className={`px-5 py-4 hover:bg-gray-50 cursor-pointer transition-colors ${isExpanded ? 'bg-teal-50/40' : ''}`}
                    onClick={() => toggleExpand(entry.id)}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <button className="text-gray-400 hover:text-teal-600 flex-shrink-0">
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-sm font-semibold text-teal-700">
                              {entry.entry_number || '—'}
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
                          <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xs md:max-w-lg">
                            {entry.description || '—'}
                          </p>
                        </div>
                      </div>

                      <div className={`flex items-center gap-6 flex-shrink-0 ${isRTL ? 'flex-row-reverse' : ''}`}>
                        <div className="hidden md:block text-right">
                          <p className="text-xs text-gray-400">{isRTL ? 'التاريخ' : 'Date'}</p>
                          <p className="text-sm font-medium text-gray-700">{entry.date}</p>
                        </div>

                        <div className="hidden lg:block text-right">
                          <p className="text-xs text-gray-400">{isRTL ? 'الفرع' : 'Branch'}</p>
                          <p className="text-sm text-gray-600">{entry.branches?.name || '—'}</p>
                        </div>

                        <div className="hidden lg:block text-right">
                          <p className="text-xs text-gray-400">{isRTL ? 'أُنشئ بواسطة' : 'Created by'}</p>
                          <p className="text-sm text-gray-600">{(entry.creator as any)?.full_name || '—'}</p>
                        </div>

                        <div className="hidden lg:block text-right">
                          <p className="text-xs text-gray-400">{isRTL ? 'رُحّل بواسطة' : 'Posted by'}</p>
                          <p className="text-sm text-gray-600">{(entry.poster as any)?.full_name || '—'}</p>
                        </div>

                        {canReverse && (
                          <button
                            onClick={e => { e.stopPropagation(); openReverseModal(entry); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 text-orange-700 border border-orange-200 rounded-lg text-xs font-medium hover:bg-orange-100 transition"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            {isRTL ? 'عكس' : 'Reverse'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Lines */}
                  {isExpanded && (
                    <div className="bg-gray-50 border-t border-gray-100 px-5 py-4">
                      {isLoading ? (
                        <div className="flex items-center justify-center py-6">
                          <Loader2 className="w-5 h-5 animate-spin text-teal-600" />
                        </div>
                      ) : entryLines.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-4">
                          {isRTL ? 'لا توجد بنود لهذا القيد' : 'No lines found for this entry'}
                        </p>
                      ) : (
                        <div className="overflow-x-auto rounded-lg border border-gray-200">
                          <table className="min-w-full text-sm">
                            <thead className="bg-white border-b border-gray-200">
                              <tr>
                                <th className={`py-2.5 px-4 text-xs font-semibold text-gray-500 uppercase ${isRTL ? 'text-right' : 'text-left'}`}>
                                  {isRTL ? 'رقم الحساب' : 'Account Code'}
                                </th>
                                <th className={`py-2.5 px-4 text-xs font-semibold text-gray-500 uppercase ${isRTL ? 'text-right' : 'text-left'}`}>
                                  {isRTL ? 'اسم الحساب' : 'Account Name'}
                                </th>
                                <th className={`py-2.5 px-4 text-xs font-semibold text-gray-500 uppercase ${isRTL ? 'text-right' : 'text-left'}`}>
                                  {isRTL ? 'الوصف' : 'Description'}
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
                                <tr key={line.id} className="hover:bg-white/60 transition">
                                  <td className={`py-2.5 px-4 font-mono text-xs text-gray-600 ${isRTL ? 'text-right' : ''}`}>
                                    {line.accounts?.code || '—'}
                                  </td>
                                  <td className={`py-2.5 px-4 text-gray-700 ${isRTL ? 'text-right' : ''}`}>
                                    {isRTL ? (line.accounts?.name_ar || line.accounts?.name) : (line.accounts?.name || line.accounts?.name_ar) || '—'}
                                  </td>
                                  <td className={`py-2.5 px-4 text-gray-500 text-xs ${isRTL ? 'text-right' : ''}`}>
                                    {line.description || '—'}
                                  </td>
                                  <td className="py-2.5 px-4 text-right font-mono">
                                    {line.debit > 0 ? (
                                      <span className="text-gray-900 font-semibold">{fmt(line.debit)}</span>
                                    ) : (
                                      <span className="text-gray-300">—</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-4 text-right font-mono">
                                    {line.credit > 0 ? (
                                      <span className="text-gray-900 font-semibold">{fmt(line.credit)}</span>
                                    ) : (
                                      <span className="text-gray-300">—</span>
                                    )}
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
                                  {fmt(totalDebit(entryLines))}
                                </td>
                                <td className="py-2.5 px-4 text-right font-mono font-bold text-gray-900">
                                  {fmt(totalCredit(entryLines))}
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
                  )}
                </div>
              );
            })}
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
                {reversing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RotateCcw className="w-4 h-4" />
                )}
                {isRTL ? 'تأكيد العكس' : 'Confirm Reversal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
