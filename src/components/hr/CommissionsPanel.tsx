import { useState, useEffect } from 'react';
import {
  Loader2, CheckCircle, Clock, X, TrendingUp, DollarSign, Users,
  ChevronDown, ChevronUp, FileText,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Commission } from './types';
import * as XLSX from 'xlsx';

interface CommissionSummary {
  employee_id: string;
  full_name: string;
  position: string;
  total_transactions: number;
  total_commission: number;
  paid_commission: number;
  pending_commission: number;
}

interface Props {
  isRTL: boolean;
  commissions: Commission[];
  loading: boolean;
}

const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

export function CommissionsPanel({ isRTL, commissions, loading }: Props) {
  const [view, setView] = useState<'summary' | 'details' | 'monthly'>('summary');
  const [summaries, setSummaries] = useState<CommissionSummary[]>([]);
  const [monthlies, setMonthlies] = useState<any[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null);

  const cur = isRTL ? 'ر.س' : 'SAR';
  const fmt = (n: number) => (n || 0).toLocaleString('ar-SA', { minimumFractionDigits: 2 });

  useEffect(() => {
    loadSummaries();
  }, []);

  const loadSummaries = async () => {
    setLoadingSummary(true);
    const [sumRes, monthRes] = await Promise.all([
      supabase.from('v_commission_summary').select('*').order('total_commission', { ascending: false }),
      supabase.from('v_commission_monthly').select('*').order('year', { ascending: false }).order('month', { ascending: false }),
    ]);
    setSummaries((sumRes.data || []) as any[]);
    setMonthlies(monthRes.data || []);
    setLoadingSummary(false);
  };

  const totalAll = commissions.filter(c => (c as any).status !== 'void').reduce((s, c) => s + (c.commission_amount ?? 0), 0);
  const totalPaid = commissions.filter(c => ((c as any).status === 'approved' || c.is_paid) && (c as any).status !== 'void').reduce((s, c) => s + (c.commission_amount ?? 0), 0);
  const totalPending = totalAll - totalPaid;

  const handleExportMonthly = () => {
    const rows = monthlies.map(m => ({
      [isRTL ? 'الموظف' : 'Employee']: m.full_name,
      [isRTL ? 'السنة' : 'Year']: m.year,
      [isRTL ? 'الشهر' : 'Month']: isRTL ? MONTHS_AR[(m.month || 1) - 1] : m.month,
      [isRTL ? 'عدد المعاملات' : 'Transactions']: m.transaction_count,
      [isRTL ? 'الإجمالي' : 'Total']: fmt(m.total_amount),
      [isRTL ? 'المدفوع' : 'Paid']: fmt(m.paid_amount),
      [isRTL ? 'المستحق' : 'Pending']: fmt(m.pending_amount),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, isRTL ? 'تقرير العمولات' : 'Commission Report');
    XLSX.writeFile(wb, `commissions-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const employeeCommissions = (empId: string) =>
    commissions.filter(c => c.employee_id === empId && (c as any).status !== 'void');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-teal-50"><DollarSign className="w-4 h-4 text-teal-600" /></div>
            <p className="text-sm text-gray-500">{isRTL ? 'إجمالي العمولات' : 'Total Commissions'}</p>
          </div>
          <p className="text-2xl font-bold text-teal-700">{fmt(totalAll)} {cur}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-green-50"><CheckCircle className="w-4 h-4 text-green-600" /></div>
            <p className="text-sm text-gray-500">{isRTL ? 'المدفوع' : 'Paid'}</p>
          </div>
          <p className="text-2xl font-bold text-green-600">{fmt(totalPaid)} {cur}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-amber-50"><Clock className="w-4 h-4 text-amber-600" /></div>
            <p className="text-sm text-gray-500">{isRTL ? 'المستحق' : 'Pending'}</p>
          </div>
          <p className="text-2xl font-bold text-amber-600">{fmt(totalPending)} {cur}</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {[
            { key: 'summary' as const, labelAr: 'ملخص الموظفين', labelEn: 'Employee Summary' },
            { key: 'monthly' as const, labelAr: 'تقرير شهري', labelEn: 'Monthly Report' },
            { key: 'details' as const, labelAr: 'جميع المعاملات', labelEn: 'All Transactions' },
          ].map(v => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition ${
                view === v.key ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {isRTL ? v.labelAr : v.labelEn}
            </button>
          ))}
        </div>
        {view === 'monthly' && (
          <button
            onClick={handleExportMonthly}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg transition font-medium"
          >
            <FileText className="w-4 h-4" />
            {isRTL ? 'تصدير Excel' : 'Export Excel'}
          </button>
        )}
      </div>

      {view === 'summary' && (
        <div className="space-y-3">
          {loadingSummary ? (
            <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-teal-600" /></div>
          ) : summaries.length === 0 ? (
            <div className="bg-white rounded-xl border shadow-sm py-16 text-center text-gray-400">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              {isRTL ? 'لا توجد عمولات بعد' : 'No commissions yet'}
            </div>
          ) : summaries.map(s => {
            const isExpanded = expandedEmployee === s.employee_id;
            const empComms = isExpanded ? employeeCommissions(s.employee_id) : [];
            return (
              <div key={s.employee_id} className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <button
                  onClick={() => setExpandedEmployee(isExpanded ? null : s.employee_id)}
                  className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-bold text-sm">
                      {s.full_name?.charAt(0)}
                    </div>
                    <div className={`text-${isRTL ? 'right' : 'left'}`}>
                      <p className="font-semibold text-gray-900 text-sm">{s.full_name}</p>
                      <p className="text-xs text-gray-500">{s.position} — {s.total_transactions} {isRTL ? 'معاملة' : 'txns'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-center">
                      <p className="text-xs text-gray-400">{isRTL ? 'الإجمالي' : 'Total'}</p>
                      <p className="font-bold text-gray-900 text-sm">{fmt(s.total_commission)} {cur}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-400">{isRTL ? 'مدفوع' : 'Paid'}</p>
                      <p className="font-semibold text-green-600 text-sm">{fmt(s.paid_commission)} {cur}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-400">{isRTL ? 'مستحق' : 'Pending'}</p>
                      <p className="font-semibold text-amber-600 text-sm">{fmt(s.pending_commission)} {cur}</p>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </div>
                </button>
                {isExpanded && empComms.length > 0 && (
                  <div className="border-t">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          {[
                            isRTL ? 'مبلغ البيع' : 'Sale Amount',
                            isRTL ? 'النسبة' : 'Rate',
                            isRTL ? 'العمولة' : 'Commission',
                            isRTL ? 'الحالة' : 'Status',
                            isRTL ? 'التاريخ' : 'Date',
                          ].map((h, i) => (
                            <th key={i} className="px-4 py-2 text-right font-medium text-gray-600">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {empComms.map(c => (
                          <tr key={c.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-gray-900">{(c.sale_amount ?? 0).toLocaleString()} {cur}</td>
                            <td className="px-4 py-2 text-gray-600">{c.commission_rate}%</td>
                            <td className="px-4 py-2 font-semibold text-green-600">{(c.commission_amount ?? 0).toLocaleString()} {cur}</td>
                            <td className="px-4 py-2">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                (c as any).status === 'approved' || c.is_paid ? 'bg-green-100 text-green-700' :
                                (c as any).status === 'void' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                              }`}>
                                {(c as any).status === 'approved' || c.is_paid
                                  ? <><CheckCircle className="w-3 h-3" />{isRTL ? 'مدفوعة' : 'Paid'}</>
                                  : <><Clock className="w-3 h-3" />{isRTL ? 'معلقة' : 'Pending'}</>}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-gray-500">{new Date(c.created_at).toLocaleDateString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {view === 'monthly' && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {[
                    isRTL ? 'الموظف' : 'Employee',
                    isRTL ? 'الفترة' : 'Period',
                    isRTL ? 'المعاملات' : 'Txns',
                    isRTL ? 'الإجمالي' : 'Total',
                    isRTL ? 'المدفوع' : 'Paid',
                    isRTL ? 'المستحق' : 'Pending',
                  ].map((h, i) => (
                    <th key={i} className="px-4 py-3 text-right text-sm font-medium text-gray-700">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {loadingSummary ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-teal-600" /></td></tr>
                ) : monthlies.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">{isRTL ? 'لا توجد بيانات' : 'No data'}</td></tr>
                ) : monthlies.map((m, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{m.full_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {isRTL ? MONTHS_AR[(m.month || 1) - 1] : m.month}/{m.year}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-center">{m.transaction_count}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900">{fmt(m.total_amount)} {cur}</td>
                    <td className="px-4 py-3 text-sm text-green-600">{fmt(m.paid_amount)} {cur}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-amber-600">{fmt(m.pending_amount)} {cur}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === 'details' && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {[
                    isRTL ? 'الموظف' : 'Employee',
                    isRTL ? 'مبلغ البيع' : 'Sale Amount',
                    isRTL ? 'النسبة' : 'Rate',
                    isRTL ? 'العمولة' : 'Commission',
                    isRTL ? 'الحالة' : 'Status',
                    isRTL ? 'التاريخ' : 'Date',
                  ].map((h, i) => (
                    <th key={i} className="px-4 py-3 text-right text-sm font-medium text-gray-700">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-teal-600" /></td></tr>
                ) : commissions.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">{isRTL ? 'لا يوجد عمولات' : 'No commissions'}</td></tr>
                ) : commissions.map(comm => (
                  <tr key={comm.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{comm.employees?.full_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{(comm.sale_amount ?? 0).toLocaleString()} {cur}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{comm.commission_rate}%</td>
                    <td className="px-4 py-3 text-sm font-bold text-green-600">{(comm.commission_amount ?? 0).toLocaleString()} {cur}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                        (comm as any).status === 'approved' || comm.is_paid ? 'bg-green-100 text-green-700' :
                        (comm as any).status === 'void' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {(comm as any).status === 'approved' || comm.is_paid
                          ? <><CheckCircle className="w-3 h-3" />{isRTL ? 'مدفوعة' : 'Paid'}</>
                          : (comm as any).status === 'void'
                            ? <><X className="w-3 h-3" />{isRTL ? 'ملغاة' : 'Void'}</>
                            : <><Clock className="w-3 h-3" />{isRTL ? 'معلقة' : 'Pending'}</>}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{new Date(comm.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
