import { useState } from 'react';
import { PartnerAccount, ProfitDistribution, PartnerWithdrawal, MONTH_NAMES_AR, MONTH_NAMES_EN } from './types';
import { FileText, TrendingUp, Wallet, BarChart2, X, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  accounts: PartnerAccount[];
  distributions: ProfitDistribution[];
  withdrawals: PartnerWithdrawal[];
  isRTL: boolean;
  language: string;
}

function fmt(val: number) {
  return new Intl.NumberFormat('en-US', { style: 'decimal', minimumFractionDigits: 2 }).format(val);
}

function fmtDate(d: string, isRTL: boolean) {
  return new Date(d).toLocaleDateString(isRTL ? 'ar-SA' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

type ReportType = 'current_account' | 'profit_distribution' | 'capital' | 'summary';

export function PartnerReports({ accounts, distributions, withdrawals, isRTL, language }: Props) {
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState<ReportType>('summary');

  const reports: { id: ReportType; label: string; icon: React.ComponentType<any> }[] = [
    { id: 'summary', label: isRTL ? 'ملخص الشراكة' : 'Partnership Summary', icon: BarChart2 },
    { id: 'current_account', label: isRTL ? 'الحساب الجاري' : 'Current Account', icon: Wallet },
    { id: 'profit_distribution', label: isRTL ? 'توزيع الأرباح' : 'Profit Distribution', icon: TrendingUp },
    { id: 'capital', label: isRTL ? 'تقرير رأس المال' : 'Capital Report', icon: FileText },
  ];

  const totalCapital = accounts.reduce((s, a) => s + Number(a.capital_contribution), 0);
  const totalDistributed = accounts.reduce((s, a) => s + Number(a.total_profit_distributed), 0);
  const totalWithdrawn = accounts.reduce((s, a) => s + Number(a.total_withdrawals), 0);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition"
      >
        <div className="flex items-center gap-3">
          <div className="bg-blue-50 p-2 rounded-lg">
            <BarChart2 className="w-5 h-5 text-blue-600" />
          </div>
          <div className="text-left">
            <p className="font-bold text-gray-900 text-sm">
              {isRTL ? 'تقارير الشراكة' : 'Partner Reports'}
            </p>
            <p className="text-xs text-gray-400">
              {isRTL ? '4 تقارير احترافية' : '4 professional reports'}
            </p>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {open && (
        <div className="border-t border-gray-100 p-6 space-y-4">
          <div className="flex gap-2 flex-wrap">
            {reports.map(r => {
              const Icon = r.icon;
              return (
                <button
                  key={r.id}
                  onClick={() => setReport(r.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition border ${
                    report === r.id
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {r.label}
                </button>
              );
            })}
          </div>

          {report === 'summary' && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: isRTL ? 'إجمالي رأس المال' : 'Total Capital', val: totalCapital, color: 'teal' },
                  { label: isRTL ? 'إجمالي الأرباح الموزعة' : 'Total Distributed', val: totalDistributed, color: 'green' },
                  { label: isRTL ? 'إجمالي المسحوبات' : 'Total Withdrawn', val: totalWithdrawn, color: 'red' },
                ].map((item, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs text-gray-500 mb-1">{item.label}</p>
                    <p className="text-lg font-bold text-gray-900">{fmt(item.val)}</p>
                    <p className="text-xs text-gray-400">{isRTL ? 'ر.س' : 'SAR'}</p>
                  </div>
                ))}
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500">
                    <th className="px-3 py-2 text-left">{isRTL ? 'الشريك' : 'Partner'}</th>
                    <th className="px-3 py-2 text-right">{isRTL ? 'الملكية' : 'Ownership'}</th>
                    <th className="px-3 py-2 text-right">{isRTL ? 'الأرباح' : 'Profit'}</th>
                    <th className="px-3 py-2 text-right">{isRTL ? 'الحساب الجاري' : 'Current Acc.'}</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map(a => (
                    <tr key={a.partner_id} className="border-t border-gray-100">
                      <td className="px-3 py-2.5 font-medium text-gray-900">{isRTL ? a.name_ar : a.name}</td>
                      <td className="px-3 py-2.5 text-right text-gray-600">{a.ownership_percentage}%</td>
                      <td className="px-3 py-2.5 text-right text-green-700 font-medium">{fmt(Number(a.total_profit_distributed))}</td>
                      <td className={`px-3 py-2.5 text-right font-bold ${Number(a.current_account_balance) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                        {Number(a.current_account_balance) >= 0 ? '+' : ''}{fmt(Number(a.current_account_balance))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {report === 'current_account' && (
            <div className="space-y-4">
              {accounts.map(a => (
                <div key={a.partner_id} className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
                    <span className="font-bold text-gray-900">{isRTL ? a.name_ar : a.name}</span>
                    <span className={`text-sm font-bold ${Number(a.current_account_balance) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {Number(a.current_account_balance) >= 0 ? '+' : ''}{fmt(Number(a.current_account_balance))} {isRTL ? 'ر.س' : 'SAR'}
                    </span>
                  </div>
                  <div className="p-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="flex justify-between"><span className="text-gray-500">{isRTL ? 'رأس المال' : 'Capital'}</span><span className="font-medium">{fmt(Number(a.capital_contribution))}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">{isRTL ? 'أرباح موزعة' : 'Distributed'}</span><span className="font-medium text-green-600">+{fmt(Number(a.total_profit_distributed))}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">{isRTL ? 'مسحوبات' : 'Withdrawals'}</span><span className="font-medium text-red-600">-{fmt(Number(a.total_withdrawals))}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">{isRTL ? 'تسويات صافية' : 'Net Settlements'}</span><span className="font-medium">{fmt(Number(a.total_settlements_received) - Number(a.total_settlements_paid))}</span></div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {report === 'profit_distribution' && (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500">
                  <th className="px-3 py-2 text-left">{isRTL ? 'الشريك' : 'Partner'}</th>
                  <th className="px-3 py-2 text-left">{isRTL ? 'الفترة' : 'Period'}</th>
                  <th className="px-3 py-2 text-right">{isRTL ? 'الربح الأساسي' : 'Base Profit'}</th>
                  <th className="px-3 py-2 text-right">{isRTL ? 'النسبة' : 'Share %'}</th>
                  <th className="px-3 py-2 text-right">{isRTL ? 'المبلغ' : 'Amount'}</th>
                </tr>
              </thead>
              <tbody>
                {distributions.length === 0 ? (
                  <tr><td colSpan={5} className="py-8 text-center text-gray-400 text-sm">{isRTL ? 'لا توجد توزيعات' : 'No distributions yet'}</td></tr>
                ) : distributions.map(d => (
                  <tr key={d.id} className="border-t border-gray-100">
                    <td className="px-3 py-2.5 font-medium text-gray-900">
                      {d.partner ? (isRTL ? d.partner.name_ar : d.partner.name) : '-'}
                    </td>
                    <td className="px-3 py-2.5 text-gray-600">
                      {isRTL ? MONTH_NAMES_AR[d.period_month] : MONTH_NAMES_EN[d.period_month]} {d.period_year}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-600">{fmt(Number(d.net_profit_base))}</td>
                    <td className="px-3 py-2.5 text-right text-gray-600">{d.share_percentage}%</td>
                    <td className="px-3 py-2.5 text-right font-bold text-green-700">{fmt(Number(d.amount_distributed))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {report === 'capital' && (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500">
                  <th className="px-3 py-2 text-left">{isRTL ? 'الشريك' : 'Partner'}</th>
                  <th className="px-3 py-2 text-right">{isRTL ? 'نسبة الملكية' : 'Ownership %'}</th>
                  <th className="px-3 py-2 text-right">{isRTL ? 'رأس المال المساهم' : 'Capital Contrib.'}</th>
                  <th className="px-3 py-2 text-right">{isRTL ? 'نسبة الأرباح' : 'Profit Share %'}</th>
                  <th className="px-3 py-2 text-center">{isRTL ? 'الحالة' : 'Status'}</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map(a => (
                  <tr key={a.partner_id} className="border-t border-gray-100">
                    <td className="px-3 py-2.5 font-medium text-gray-900">{isRTL ? a.name_ar : a.name}</td>
                    <td className="px-3 py-2.5 text-right font-bold text-teal-700">{a.ownership_percentage}%</td>
                    <td className="px-3 py-2.5 text-right font-medium">{fmt(Number(a.capital_contribution))}</td>
                    <td className="px-3 py-2.5 text-right">{a.profit_share_percentage}%</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${a.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {a.is_active ? (isRTL ? 'نشط' : 'Active') : (isRTL ? 'موقوف' : 'Inactive')}
                      </span>
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">
                  <td className="px-3 py-2.5">{isRTL ? 'الإجمالي' : 'Total'}</td>
                  <td className="px-3 py-2.5 text-right">{accounts.reduce((s, a) => s + Number(a.ownership_percentage), 0).toFixed(1)}%</td>
                  <td className="px-3 py-2.5 text-right">{fmt(totalCapital)}</td>
                  <td className="px-3 py-2.5 text-right">{accounts.reduce((s, a) => s + Number(a.profit_share_percentage), 0).toFixed(1)}%</td>
                  <td />
                </tr>
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
