import { useState, useEffect } from 'react';
import {
  Plus, X, Loader2, CheckCircle, Banknote, Trash2, Download, Ban,
  Users, DollarSign, TrendingDown, ChevronDown, ChevronUp, AlertCircle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import * as XLSX from 'xlsx';

interface PayrollRun {
  id: string;
  run_number: string;
  period_month: number;
  period_year: number;
  branch_id: string;
  status: 'draft' | 'approved' | 'paid' | 'cancelled';
  total_base_salary: number;
  total_commissions: number;
  total_loan_deductions: number;
  total_deductions: number;
  net_pay: number;
  total_net_amount: number;
  payment_method: string;
  created_at: string;
  paid_at: string | null;
  branches?: { name: string };
}

interface PayrollItem {
  id: string;
  employee_id: string;
  base_salary: number;
  commission_amount: number;
  commission_total: number;
  loan_deduction: number;
  unpaid_leave_deduction: number;
  deductions: number;
  net_salary: number;
  net_pay: number;
  employees?: { full_name: string; position: string };
}

const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const MONTHS_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];

interface Props {
  isRTL: boolean;
  userProfile: any;
  branches: any[];
}

export function PayrollTab({ isRTL, userProfile, branches }: Props) {
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [items, setItems] = useState<Record<string, PayrollItem[]>>({});
  const [error, setError] = useState('');

  const now = new Date();
  const [newForm, setNewForm] = useState({
    branch_id: userProfile?.branch_id || '',
    month: now.getMonth() + 1,
    year: now.getFullYear(),
  });

  const cur = isRTL ? 'ر.س' : 'SAR';
  const fmt = (n: number) => (n || 0).toLocaleString('ar-SA', { minimumFractionDigits: 2 });

  useEffect(() => { loadRuns(); }, []);

  const loadRuns = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('payroll_runs')
      .select('*, branches(name)')
      .neq('status', 'cancelled')
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false });
    setRuns((data || []) as any[]);
    setLoading(false);
  };

  const loadItems = async (runId: string) => {
    if (items[runId]) return;
    const { data } = await supabase
      .from('payroll_items')
      .select('*, employees(full_name, position)')
      .eq('payroll_run_id', runId)
      .order('created_at');
    setItems(prev => ({ ...prev, [runId]: (data || []) as any[] }));
  };

  const toggleExpand = async (runId: string) => {
    if (expandedRun === runId) {
      setExpandedRun(null);
    } else {
      setExpandedRun(runId);
      await loadItems(runId);
    }
  };

  const handleGenerate = async () => {
    if (!newForm.branch_id) { setError(isRTL ? 'اختر الفرع' : 'Select branch'); return; }
    setGenerating(true);
    setError('');
    try {
      const { data, error: err } = await supabase.rpc('generate_payroll_run', {
        p_branch_id: newForm.branch_id,
        p_month: newForm.month,
        p_year: newForm.year,
      });
      if (err) throw err;
      setShowNewModal(false);
      loadRuns();
    } catch (e: any) {
      setError(e.message || 'Error generating payroll');
    } finally {
      setGenerating(false);
    }
  };

  const handleApprove = async (runId: string) => {
    setProcessing(runId);
    try {
      const { error: err } = await supabase.rpc('approve_payroll_run', { p_run_id: runId });
      if (err) throw err;
      loadRuns();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setProcessing(null);
    }
  };

  const handlePay = async (run: PayrollRun) => {
    const method = run.payment_method || 'bank_transfer';
    if (!confirm(isRTL
      ? `تأكيد دفع مسير ${MONTHS_AR[run.period_month - 1]} ${run.period_year}؟ سيتم إنشاء مصاريف تلقائياً.`
      : `Confirm payment of ${MONTHS_EN[run.period_month - 1]} ${run.period_year} payroll? Expenses will be created automatically.`
    )) return;
    setProcessing(run.id);
    try {
      const { error: err } = await supabase.rpc('pay_payroll_run', {
        p_run_id: run.id,
        p_payment_method: method,
      });
      if (err) throw err;
      loadRuns();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setProcessing(null);
    }
  };

  const [cancelReason, setCancelReason] = useState('');
  const [showCancelModal, setShowCancelModal] = useState<string | null>(null);

  const handleCancelRun = async (runId: string) => {
    if (!cancelReason.trim()) {
      setError(isRTL ? 'يرجى إدخال سبب الإلغاء' : 'Please enter a cancellation reason');
      return;
    }
    setProcessing(runId);
    try {
      const { error: err } = await supabase.rpc('cancel_draft_payroll_run', {
        p_run_id: runId,
        p_reason: cancelReason.trim(),
      });
      if (err) throw err;
      setShowCancelModal(null);
      setCancelReason('');
      loadRuns();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setProcessing(null);
    }
  };

  const handleExport = (run: PayrollRun) => {
    const runItems = items[run.id] || [];
    const rows = runItems.map(it => ({
      [isRTL ? 'الموظف' : 'Employee']:         it.employees?.full_name || '',
      [isRTL ? 'المنصب' : 'Position']:          it.employees?.position || '',
      [isRTL ? 'الراتب الأساسي' : 'Base Salary']:  fmt(it.base_salary),
      [isRTL ? 'العمولات' : 'Commissions']:     fmt(it.commission_amount ?? it.commission_total ?? 0),
      [isRTL ? 'خصم السلفة' : 'Loan Deduction']:fmt(it.loan_deduction ?? 0),
      [isRTL ? 'خصم إجازة' : 'Leave Deduction']:fmt(it.unpaid_leave_deduction ?? 0),
      [isRTL ? 'خصومات أخرى' : 'Other Ded.']:   fmt((it.deductions ?? 0) - (it.loan_deduction ?? 0) - (it.unpaid_leave_deduction ?? 0)),
      [isRTL ? 'صافي الراتب' : 'Net Salary']:    fmt(it.net_salary ?? it.net_pay ?? 0),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, isRTL ? 'مسير الرواتب' : 'Payroll');
    XLSX.writeFile(wb, `payroll-${run.period_year}-${String(run.period_month).padStart(2,'0')}.xlsx`);
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { ar: string; en: string; cls: string }> = {
      draft:     { ar: 'مسودة',  en: 'Draft',     cls: 'bg-gray-100 text-gray-700' },
      approved:  { ar: 'معتمد',  en: 'Approved',  cls: 'bg-blue-100 text-blue-700' },
      paid:      { ar: 'مدفوع', en: 'Paid',      cls: 'bg-green-100 text-green-700' },
      cancelled: { ar: 'ملغى',  en: 'Cancelled', cls: 'bg-red-100 text-red-700' },
    };
    const s = map[status] || map['draft'];
    return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${s.cls}`}>{isRTL ? s.ar : s.en}</span>;
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => { setError(''); setShowNewModal(true); }}
          className="flex items-center gap-2 bg-teal-600 text-white px-5 py-2.5 rounded-lg hover:bg-teal-700 transition text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          {isRTL ? 'إنشاء مسير رواتب' : 'New Payroll Run'}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-teal-600" /></div>
      ) : runs.length === 0 ? (
        <div className="bg-white rounded-xl border shadow-sm py-16 text-center text-gray-400">
          <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-30" />
          {isRTL ? 'لا يوجد مسير رواتب بعد' : 'No payroll runs yet'}
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map(run => {
            const netVal = run.total_net_amount ?? run.net_pay ?? 0;
            const commVal = run.total_commissions ?? 0;
            const baseVal = run.total_base_salary ?? run.total_salaries ?? 0;
            const loanVal = run.total_loan_deductions ?? 0;
            const isExpanded = expandedRun === run.id;
            const busy = processing === run.id;

            return (
              <div key={run.id} className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="p-4">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <button onClick={() => toggleExpand(run.id)} className="p-1 hover:bg-gray-100 rounded">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-900 text-sm">{run.run_number}</span>
                          {statusBadge(run.status)}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {isRTL ? MONTHS_AR[run.period_month - 1] : MONTHS_EN[run.period_month - 1]} {run.period_year}
                          {run.branches?.name && ` — ${run.branches.name}`}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-sm">
                      <div className="text-center">
                        <p className="text-xs text-gray-400">{isRTL ? 'رواتب' : 'Salaries'}</p>
                        <p className="font-semibold text-gray-700">{fmt(baseVal)} {cur}</p>
                      </div>
                      {commVal > 0 && (
                        <div className="text-center">
                          <p className="text-xs text-gray-400">{isRTL ? 'عمولات' : 'Commissions'}</p>
                          <p className="font-semibold text-green-600">{fmt(commVal)} {cur}</p>
                        </div>
                      )}
                      {loanVal > 0 && (
                        <div className="text-center">
                          <p className="text-xs text-gray-400">{isRTL ? 'سلف' : 'Loans'}</p>
                          <p className="font-semibold text-red-600">-{fmt(loanVal)} {cur}</p>
                        </div>
                      )}
                      <div className="text-center border-r pr-4 mr-1">
                        <p className="text-xs text-gray-400">{isRTL ? 'الصافي' : 'Net'}</p>
                        <p className="font-bold text-teal-700 text-base">{fmt(netVal)} {cur}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {run.status === 'draft' && (
                        <>
                          <button
                            onClick={() => handleApprove(run.id)}
                            disabled={busy}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                            title={isRTL ? 'اعتماد' : 'Approve'}
                          >
                            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={() => { setShowCancelModal(run.id); setCancelReason(''); setError(''); }}
                            disabled={busy}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-red-600 hover:bg-red-50 rounded text-xs font-medium"
                            title={isRTL ? 'إلغاء المسير' : 'Cancel Run'}
                          >
                            <Ban className="w-3.5 h-3.5" />
                            {isRTL ? 'إلغاء' : 'Cancel'}
                          </button>
                        </>
                      )}
                      {run.status === 'approved' && (
                        <button
                          onClick={() => handlePay(run)}
                          disabled={busy}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 disabled:opacity-50"
                        >
                          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Banknote className="w-3.5 h-3.5" />}
                          {isRTL ? 'دفع' : 'Pay'}
                        </button>
                      )}
                      {items[run.id] && items[run.id].length > 0 && (
                        <button
                          onClick={() => handleExport(run)}
                          className="p-1.5 text-gray-500 hover:bg-gray-100 rounded"
                          title={isRTL ? 'تصدير Excel' : 'Export Excel'}
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t">
                    {!items[run.id] ? (
                      <div className="py-6 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-teal-500" /></div>
                    ) : items[run.id].length === 0 ? (
                      <div className="py-6 text-center text-gray-400 text-sm">{isRTL ? 'لا يوجد موظفين' : 'No employees'}</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              {[
                                isRTL ? 'الموظف' : 'Employee',
                                isRTL ? 'الراتب الأساسي' : 'Base Salary',
                                isRTL ? 'العمولات' : 'Commissions',
                                isRTL ? 'خصم السلفة' : 'Loan Ded.',
                                isRTL ? 'خصم إجازة' : 'Leave Ded.',
                                isRTL ? 'صافي الراتب' : 'Net Salary',
                              ].map((h, i) => (
                                <th key={i} className="px-4 py-2.5 text-right font-medium text-gray-600">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {items[run.id].map(it => {
                              const comm  = it.commission_amount ?? it.commission_total ?? 0;
                              const net   = it.net_salary ?? it.net_pay ?? 0;
                              const loan  = it.loan_deduction ?? 0;
                              const leave = it.unpaid_leave_deduction ?? 0;
                              return (
                                <tr key={it.id} className="hover:bg-gray-50">
                                  <td className="px-4 py-2.5 font-medium text-gray-900">
                                    {it.employees?.full_name}
                                    {it.employees?.position && <span className="text-xs text-gray-400 ml-1">({it.employees.position})</span>}
                                  </td>
                                  <td className="px-4 py-2.5 text-gray-700">{fmt(it.base_salary)} {cur}</td>
                                  <td className="px-4 py-2.5 text-green-600">{comm > 0 ? `+${fmt(comm)}` : '—'} {comm > 0 ? cur : ''}</td>
                                  <td className="px-4 py-2.5 text-red-500">{loan > 0 ? `-${fmt(loan)} ${cur}` : '—'}</td>
                                  <td className="px-4 py-2.5 text-red-500">{leave > 0 ? `-${fmt(leave)} ${cur}` : '—'}</td>
                                  <td className="px-4 py-2.5 font-bold text-teal-700">{fmt(net)} {cur}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot className="bg-teal-50 border-t-2">
                            <tr>
                              <td className="px-4 py-2.5 font-bold text-gray-700">{isRTL ? 'الإجمالي' : 'Total'}</td>
                              <td className="px-4 py-2.5 font-bold">{fmt(baseVal)} {cur}</td>
                              <td className="px-4 py-2.5 font-bold text-green-600">{commVal > 0 ? `+${fmt(commVal)} ${cur}` : '—'}</td>
                              <td className="px-4 py-2.5 font-bold text-red-500">{loanVal > 0 ? `-${fmt(loanVal)} ${cur}` : '—'}</td>
                              <td className="px-4 py-2.5"></td>
                              <td className="px-4 py-2.5 font-bold text-teal-700 text-base">{fmt(netVal)} {cur}</td>
                            </tr>
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

      {showNewModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">
                {isRTL ? 'إنشاء مسير رواتب جديد' : 'New Payroll Run'}
              </h3>
              <button onClick={() => setShowNewModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'الفرع *' : 'Branch *'}</label>
                <select
                  value={newForm.branch_id}
                  onChange={e => setNewForm({ ...newForm, branch_id: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">{isRTL ? 'اختر الفرع' : 'Select branch'}</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'الشهر *' : 'Month *'}</label>
                  <select
                    value={newForm.month}
                    onChange={e => setNewForm({ ...newForm, month: parseInt(e.target.value) })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  >
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>{isRTL ? MONTHS_AR[i] : MONTHS_EN[i]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'السنة *' : 'Year *'}</label>
                  <select
                    value={newForm.year}
                    onChange={e => setNewForm({ ...newForm, year: parseInt(e.target.value) })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  >
                    {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
                <Users className="w-4 h-4 inline mr-1" />
                {isRTL
                  ? 'سيتم سحب جميع الموظفين النشطين وعمولاتهم وخصم السلف تلقائياً.'
                  : 'All active employees, their commissions and loan deductions will be pulled automatically.'}
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowNewModal(false)}
                className="flex-1 px-4 py-2.5 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
              >
                {isRTL ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="flex-1 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-medium flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {isRTL ? 'إنشاء المسير' : 'Generate Run'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCancelModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Ban className="w-5 h-5 text-red-500" />
                {isRTL ? 'إلغاء مسير الرواتب' : 'Cancel Payroll Run'}
              </h3>
              <button onClick={() => setShowCancelModal(null)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
              <AlertCircle className="w-4 h-4 inline mr-1" />
              {isRTL
                ? 'سيتم إلغاء هذا المسير نهائياً ولا يمكن التراجع عن هذا الإجراء.'
                : 'This payroll run will be permanently cancelled. This action cannot be undone.'}
            </div>

            {error && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {isRTL ? 'سبب الإلغاء *' : 'Cancellation Reason *'}
              </label>
              <textarea
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder={isRTL ? 'أدخل سبب إلغاء المسير...' : 'Enter reason for cancellation...'}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                rows={3}
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowCancelModal(null)}
                className="flex-1 px-4 py-2.5 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
              >
                {isRTL ? 'تراجع' : 'Go Back'}
              </button>
              <button
                onClick={() => handleCancelRun(showCancelModal)}
                disabled={processing === showCancelModal}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {processing === showCancelModal
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Ban className="w-4 h-4" />}
                {isRTL ? 'تأكيد الإلغاء' : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
