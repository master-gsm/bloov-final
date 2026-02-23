import { useEffect, useState, useCallback } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabase';
import {
  ShieldCheck,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  RefreshCw,
  Database,
  BookOpen,
  Scale,
  Search,
  Copy,
  Receipt,
  Clock,
  Table2,
  Rows3,
  Link,
  KeyRound,
} from 'lucide-react';

interface HealthReport {
  generated_at: string;
  total_tables: number;
  row_counts: {
    sales: number;
    purchases: number;
    journal_entries: number;
    inventory: number;
    vat_transactions: number;
    payroll_runs: number;
  };
  last_journal_entry_date: string | null;
  last_backup_timestamp: string | null;
  trial_balance_difference: number;
  orphan_sale_items: number;
  orphan_purchase_items: number;
  duplicate_vat_transactions: number;
}

interface RestoreCheck {
  check_name: string;
  status: 'ok' | 'fail';
  failure_type: 'fk_violation' | 'duplicate_key' | 'orphan' | 'imbalance' | 'missing_schema' | 'ok';
  affected_table: string;
  detail: string;
}

interface RestoreReport {
  generated_at: string;
  total_checks: number;
  failed_checks: number;
  checks: RestoreCheck[];
}

type CheckStatus = 'ok' | 'warn' | 'error' | 'loading';

interface CheckItem {
  id: string;
  label: string;
  labelAr: string;
  status: CheckStatus;
  value: string;
  detail?: string;
}

function statusIcon(status: CheckStatus) {
  if (status === 'loading') return <RefreshCw className="w-4 h-4 animate-spin text-gray-400" />;
  if (status === 'ok') return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
  if (status === 'warn') return <AlertTriangle className="w-4 h-4 text-amber-500" />;
  return <XCircle className="w-4 h-4 text-red-500" />;
}

function statusBg(status: CheckStatus) {
  if (status === 'ok') return 'bg-emerald-50 border-emerald-200';
  if (status === 'warn') return 'bg-amber-50 border-amber-200';
  if (status === 'error') return 'bg-red-50 border-red-200';
  return 'bg-gray-50 border-gray-200';
}

function statusText(status: CheckStatus) {
  if (status === 'ok') return 'text-emerald-700';
  if (status === 'warn') return 'text-amber-700';
  if (status === 'error') return 'text-red-700';
  return 'text-gray-500';
}

function fmt(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString();
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString();
}

function overallStatus(checks: CheckItem[]): CheckStatus {
  if (checks.some(c => c.status === 'loading')) return 'loading';
  if (checks.some(c => c.status === 'error')) return 'error';
  if (checks.some(c => c.status === 'warn')) return 'warn';
  return 'ok';
}

const LOADING_CHECK: CheckItem = {
  id: '',
  label: '',
  labelAr: '',
  status: 'loading',
  value: '',
};

const FAILURE_TYPE_LABELS: Record<string, { label: string; labelAr: string; color: string }> = {
  fk_violation:  { label: 'FK Violation',   labelAr: 'انتهاك مفتاح خارجي', color: 'bg-red-100 text-red-700' },
  duplicate_key: { label: 'Duplicate Key',  labelAr: 'مفتاح مكرر',         color: 'bg-orange-100 text-orange-700' },
  orphan:        { label: 'Orphan Row',      labelAr: 'سجل معزول',           color: 'bg-orange-100 text-orange-700' },
  imbalance:     { label: 'Imbalance',       labelAr: 'عدم توازن',           color: 'bg-red-100 text-red-700' },
  missing_schema:{ label: 'Missing Schema',  labelAr: 'مخطط مفقود',          color: 'bg-red-100 text-red-700' },
  ok:            { label: 'OK',              labelAr: 'سليم',                color: 'bg-emerald-100 text-emerald-700' },
};

export function SystemHealth() {
  const { isRTL } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<HealthReport | null>(null);
  const [dbOnline, setDbOnline] = useState<boolean | null>(null);
  const [checks, setChecks] = useState<CheckItem[]>(Array(6).fill(LOADING_CHECK));

  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreReport, setRestoreReport] = useState<RestoreReport | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreExpanded, setRestoreExpanded] = useState(false);

  const runHealthCheck = useCallback(async () => {
    setLoading(true);
    setError(null);
    setChecks(Array(6).fill(LOADING_CHECK));

    try {
      const { data, error: rpcError } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .rpc('get_db_health_report' as any);

      if (rpcError) throw rpcError;

      const r = data as unknown as HealthReport;
      setReport(r);
      setDbOnline(true);

      const diff = Number(r.trial_balance_difference ?? 0);
      const absDiff = Math.abs(diff);

      const built: CheckItem[] = [
        {
          id: 'connection',
          label: 'Database Connection',
          labelAr: 'اتصال قاعدة البيانات',
          status: 'ok',
          value: isRTL ? 'متصل' : 'Connected',
          detail: isRTL
            ? `${r.total_tables} جدول في النظام`
            : `${r.total_tables} tables in schema`,
        },
        {
          id: 'last_je',
          label: 'Last Journal Entry',
          labelAr: 'آخر قيد محاسبي',
          status: r.last_journal_entry_date ? 'ok' : 'warn',
          value: r.last_journal_entry_date
            ? new Date(r.last_journal_entry_date).toLocaleDateString()
            : (isRTL ? 'لا توجد قيود' : 'No entries'),
          detail: isRTL
            ? `إجمالي القيود: ${fmt(r.row_counts.journal_entries)}`
            : `Total entries: ${fmt(r.row_counts.journal_entries)}`,
        },
        {
          id: 'trial_balance',
          label: 'Trial Balance',
          labelAr: 'ميزان المراجعة',
          status: absDiff === 0 ? 'ok' : absDiff < 0.01 ? 'warn' : 'error',
          value: absDiff === 0
            ? (isRTL ? 'متوازن' : 'Balanced')
            : `Δ ${diff.toFixed(4)}`,
          detail: absDiff === 0
            ? (isRTL ? 'مجموع المدين = مجموع الدائن' : 'Debit total equals credit total')
            : (isRTL ? 'يوجد فرق في ميزان المراجعة' : 'Imbalance detected in posted journal lines'),
        },
        {
          id: 'orphans',
          label: 'Orphan Detection',
          labelAr: 'الكشف عن السجلات المعزولة',
          status: r.orphan_sale_items === 0 && r.orphan_purchase_items === 0 ? 'ok' : 'error',
          value: r.orphan_sale_items === 0 && r.orphan_purchase_items === 0
            ? (isRTL ? 'لا توجد سجلات معزولة' : 'None found')
            : `${r.orphan_sale_items + r.orphan_purchase_items} orphans`,
          detail: isRTL
            ? `بنود مبيعات معزولة: ${r.orphan_sale_items} | بنود مشتريات معزولة: ${r.orphan_purchase_items}`
            : `Sale items: ${r.orphan_sale_items} | Purchase items: ${r.orphan_purchase_items}`,
        },
        {
          id: 'vat_dup',
          label: 'Duplicate VAT Detection',
          labelAr: 'كشف ضريبة القيمة المضافة المكررة',
          status: r.duplicate_vat_transactions === 0 ? 'ok' : 'error',
          value: r.duplicate_vat_transactions === 0
            ? (isRTL ? 'لا يوجد تكرار' : 'No duplicates')
            : `${r.duplicate_vat_transactions} duplicate groups`,
          detail: isRTL
            ? 'مجموعات معاملات ضريبية مكررة بنفس المصدر والاتجاه'
            : 'Groups sharing same source_type + source_id + direction',
        },
        {
          id: 'backup',
          label: 'Last Backup',
          labelAr: 'آخر نسخة احتياطية',
          status: r.last_backup_timestamp ? 'ok' : 'warn',
          value: r.last_backup_timestamp
            ? fmtDate(r.last_backup_timestamp)
            : (isRTL ? 'لا توجد نسخ مسجلة' : 'No backup recorded'),
          detail: isRTL ? 'استناداً إلى جدول النسخ الاحتياطي' : 'Based on backups table',
        },
      ];

      setChecks(built);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setDbOnline(false);
      setChecks([
        {
          id: 'connection',
          label: 'Database Connection',
          labelAr: 'اتصال قاعدة البيانات',
          status: 'error',
          value: isRTL ? 'تعذّر الاتصال' : 'Connection failed',
          detail: msg,
        },
        ...Array(5).fill({ id: '', label: '—', labelAr: '—', status: 'error' as CheckStatus, value: '—' }),
      ]);
    } finally {
      setLoading(false);
    }
  }, [isRTL]);

  const runRestoreValidator = useCallback(async () => {
    setRestoreLoading(true);
    setRestoreError(null);
    try {
      const { data, error: rpcError } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .rpc('validate_restore_readiness' as any);
      if (rpcError) throw rpcError;
      setRestoreReport(data as unknown as RestoreReport);
      setRestoreExpanded(true);
    } catch (err: unknown) {
      setRestoreError(err instanceof Error ? err.message : String(err));
    } finally {
      setRestoreLoading(false);
    }
  }, []);

  useEffect(() => {
    runHealthCheck();
  }, [runHealthCheck]);

  const overall = overallStatus(checks);

  const overallBanner = {
    ok:      { bg: 'bg-emerald-600', icon: <ShieldCheck className="w-7 h-7 text-white" />, label: isRTL ? 'النظام سليم' : 'System Healthy',           sub: isRTL ? 'جميع الفحوصات اجتازت بنجاح' : 'All checks passed' },
    warn:    { bg: 'bg-amber-500',   icon: <AlertTriangle className="w-7 h-7 text-white" />, label: isRTL ? 'يحتاج انتباه' : 'Attention Required',      sub: isRTL ? 'بعض الفحوصات تحتاج مراجعة' : 'Some checks need review' },
    error:   { bg: 'bg-red-600',     icon: <XCircle className="w-7 h-7 text-white" />,       label: isRTL ? 'توجد مشكلة حرجة' : 'Critical Issue Detected', sub: isRTL ? 'يجب معالجة الأخطاء فوراً' : 'Errors must be resolved immediately' },
    loading: { bg: 'bg-gray-500',    icon: <RefreshCw className="w-7 h-7 text-white animate-spin" />, label: isRTL ? 'جارٍ الفحص...' : 'Running checks...', sub: '' },
  }[overall];

  const checkIcons: Record<string, JSX.Element> = {
    connection:    <Database className="w-4 h-4" />,
    last_je:       <BookOpen className="w-4 h-4" />,
    trial_balance: <Scale className="w-4 h-4" />,
    orphans:       <Search className="w-4 h-4" />,
    vat_dup:       <Copy className="w-4 h-4" />,
    backup:        <Receipt className="w-4 h-4" />,
  };

  const failureTypeIcon = (type: string) => {
    if (type === 'fk_violation')  return <Link className="w-3.5 h-3.5" />;
    if (type === 'duplicate_key') return <KeyRound className="w-3.5 h-3.5" />;
    if (type === 'orphan')        return <Search className="w-3.5 h-3.5" />;
    if (type === 'imbalance')     return <Scale className="w-3.5 h-3.5" />;
    return <CheckCircle2 className="w-3.5 h-3.5" />;
  };

  const rowCountItems = report
    ? [
        { label: isRTL ? 'المبيعات' : 'Sales',                      value: report.row_counts.sales },
        { label: isRTL ? 'المشتريات' : 'Purchases',                  value: report.row_counts.purchases },
        { label: isRTL ? 'القيود المحاسبية' : 'Journal Entries',     value: report.row_counts.journal_entries },
        { label: isRTL ? 'المخزون' : 'Inventory',                    value: report.row_counts.inventory },
        { label: isRTL ? 'معاملات ض.ق.م' : 'VAT Transactions',       value: report.row_counts.vat_transactions },
        { label: isRTL ? 'دفعات الرواتب' : 'Payroll Runs',           value: report.row_counts.payroll_runs },
      ]
    : [];

  const failedRestoreChecks = restoreReport?.checks.filter(c => c.status === 'fail') ?? [];

  return (
    <div className={`p-6 max-w-5xl mx-auto space-y-6 ${isRTL ? 'rtl' : 'ltr'}`}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isRTL ? 'فحص صحة النظام' : 'System Health Check'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {isRTL
              ? 'نظرة عامة على سلامة قاعدة البيانات والبيانات المالية'
              : 'Database and financial data integrity overview'}
          </p>
        </div>
        <button
          onClick={runHealthCheck}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 transition text-sm font-medium"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {isRTL ? 'إعادة الفحص' : 'Re-run Checks'}
        </button>
      </div>

      {/* Overall Banner */}
      <div className={`${overallBanner.bg} rounded-xl p-5 flex items-center gap-4 shadow`}>
        {overallBanner.icon}
        <div>
          <p className="text-white font-bold text-lg leading-tight">{overallBanner.label}</p>
          {overallBanner.sub && <p className="text-white/80 text-sm">{overallBanner.sub}</p>}
        </div>
        {report && (
          <div className={`${isRTL ? 'mr-auto' : 'ml-auto'} text-white/70 text-xs`}>
            <div className="flex items-center gap-1 justify-end">
              <Clock className="w-3 h-3" />
              <span>{fmtDate(report.generated_at)}</span>
            </div>
            <div className="flex items-center gap-1 mt-0.5 justify-end">
              {dbOnline
                ? <><CheckCircle2 className="w-3 h-3 text-white" /><span>{isRTL ? 'قاعدة البيانات متصلة' : 'DB Online'}</span></>
                : <><XCircle className="w-3 h-3" /><span>{isRTL ? 'غير متصل' : 'DB Offline'}</span></>
              }
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          <strong>{isRTL ? 'خطأ: ' : 'Error: '}</strong>{error}
        </div>
      )}

      {/* Check Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {checks.map((check, idx) => (
          <div key={check.id || idx} className={`border rounded-xl p-4 ${statusBg(check.status)} transition`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className={statusText(check.status)}>
                  {checkIcons[check.id] ?? <Database className="w-4 h-4" />}
                </span>
                <span className="text-sm font-semibold text-gray-700">
                  {isRTL ? check.labelAr : check.label}
                </span>
              </div>
              {statusIcon(check.status)}
            </div>
            <p className={`mt-2 text-base font-bold ${statusText(check.status)}`}>{check.value}</p>
            {check.detail && <p className="mt-1 text-xs text-gray-500 leading-snug">{check.detail}</p>}
          </div>
        ))}
      </div>

      {/* Row Counts */}
      {report && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <Rows3 className="w-4 h-4 text-gray-500" />
            <h2 className="font-semibold text-gray-800 text-sm">
              {isRTL ? 'إحصاءات الجداول الحيوية' : 'Critical Table Row Counts'}
            </h2>
            <span className="text-xs text-gray-400 ml-auto">
              {isRTL ? `${report.total_tables} جدول` : `${report.total_tables} tables in schema`}
            </span>
          </div>
          <div className="divide-y divide-gray-50">
            {rowCountItems.map((item) => (
              <div key={item.label} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition">
                <div className="flex items-center gap-2">
                  <Table2 className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-sm text-gray-700">{item.label}</span>
                </div>
                <span className="text-sm font-semibold text-gray-900 tabular-nums">{fmt(item.value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===================================================================
          RESTORE READINESS VALIDATOR
      ==================================================================== */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-teal-600" />
            <h2 className="font-semibold text-gray-800 text-sm">
              {isRTL ? 'فحص جاهزية الاستعادة (Restore Readiness)' : 'Restore Readiness Validator'}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {restoreReport && (
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                restoreReport.failed_checks === 0
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-red-100 text-red-700'
              }`}>
                {restoreReport.failed_checks === 0
                  ? (isRTL ? `${restoreReport.total_checks} فحص — سليم` : `${restoreReport.total_checks} checks — all passed`)
                  : (isRTL ? `${restoreReport.failed_checks} فشل من ${restoreReport.total_checks}` : `${restoreReport.failed_checks} of ${restoreReport.total_checks} failed`)
                }
              </span>
            )}
            <button
              onClick={runRestoreValidator}
              disabled={restoreLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 transition text-xs font-medium"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${restoreLoading ? 'animate-spin' : ''}`} />
              {isRTL ? 'تشغيل الفحص' : 'Run Validator'}
            </button>
          </div>
        </div>

        {/* Description */}
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
          <p className="text-xs text-gray-500 leading-relaxed">
            {isRTL
              ? 'يفحص 24 نقطة تحقق: انتهاكات المفاتيح الخارجية، المفاتيح المكررة، السجلات المعزولة، وتوازن الميزانية. يُحدد المشاكل التي تسبب فشل الاستعادة الجزئية.'
              : 'Runs 24 checks: FK chain violations, duplicate key constraints, orphan rows, and trial balance. Identifies the exact root cause of partial restore failures.'
            }
          </p>
        </div>

        {restoreError && (
          <div className="px-5 py-3 bg-red-50 border-b border-red-100 text-red-700 text-xs">
            <strong>{isRTL ? 'خطأ: ' : 'Error: '}</strong>{restoreError}
          </div>
        )}

        {/* Failed checks highlighted */}
        {restoreReport && failedRestoreChecks.length > 0 && (
          <div className="px-5 py-4 border-b border-gray-100 space-y-2">
            <p className="text-xs font-semibold text-red-700 mb-2">
              {isRTL ? 'الفحوصات الفاشلة:' : 'Failed checks:'}
            </p>
            {failedRestoreChecks.map((c, i) => {
              const ft = FAILURE_TYPE_LABELS[c.failure_type] ?? FAILURE_TYPE_LABELS.ok;
              return (
                <div key={i} className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-3">
                  <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${ft.color}`}>
                    {failureTypeIcon(c.failure_type)}
                    <span>{isRTL ? ft.labelAr : ft.label}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-800 truncate">{c.affected_table}</p>
                    <p className="text-xs text-gray-600 mt-0.5 leading-snug">{c.detail}</p>
                    <p className="text-xs text-gray-400 mt-0.5 font-mono truncate">{c.check_name}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* All checks table (expandable) */}
        {restoreReport && (
          <>
            <button
              onClick={() => setRestoreExpanded(v => !v)}
              className="w-full px-5 py-3 text-left text-xs font-medium text-gray-500 hover:bg-gray-50 transition flex items-center justify-between"
            >
              <span>{isRTL ? 'عرض جميع الفحوصات' : `Show all ${restoreReport.total_checks} checks`}</span>
              <span className="text-gray-400">{restoreExpanded ? '▲' : '▼'}</span>
            </button>
            {restoreExpanded && (
              <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
                {restoreReport.checks.map((c, i) => {
                  const ft = FAILURE_TYPE_LABELS[c.failure_type] ?? FAILURE_TYPE_LABELS.ok;
                  return (
                    <div key={i} className={`flex items-start gap-3 px-5 py-3 text-xs ${c.status === 'fail' ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                      <div className="shrink-0 mt-0.5">
                        {c.status === 'ok'
                          ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          : <XCircle className="w-3.5 h-3.5 text-red-500" />
                        }
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-gray-500 shrink-0">{c.affected_table}</span>
                          {c.status === 'fail' && (
                            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${ft.color}`}>
                              {isRTL ? ft.labelAr : ft.label}
                            </span>
                          )}
                        </div>
                        <p className="text-gray-500 mt-0.5 leading-snug">{c.detail}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {!restoreReport && !restoreLoading && (
          <div className="px-5 py-6 text-center text-sm text-gray-400">
            {isRTL
              ? 'انقر على "تشغيل الفحص" للتحقق من جاهزية الاستعادة'
              : 'Click "Run Validator" to check restore readiness'
            }
          </div>
        )}
        {restoreLoading && (
          <div className="px-5 py-6 text-center text-sm text-gray-400 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>{isRTL ? 'جارٍ تشغيل 24 فحص...' : 'Running 24 checks...'}</span>
          </div>
        )}
      </div>

      {/* Export Guide */}
      <div className="bg-gray-900 text-gray-100 rounded-xl p-5 shadow">
        <div className="flex items-center gap-2 mb-2">
          <Database className="w-4 h-4 text-teal-400" />
          <h2 className="font-semibold text-sm text-teal-300">
            {isRTL ? 'أمر التصدير الحتمي (Deterministic Export)' : 'Deterministic Export Command'}
          </h2>
        </div>
        <p className="text-xs text-gray-400 mb-3">
          {isRTL
            ? 'يُغلّف جميع بيانات COPY بـ SET CONSTRAINTS ALL DEFERRED لحل 13 مشكلة استعادة معروفة.'
            : 'Wraps all COPY blocks with SET CONSTRAINTS ALL DEFERRED to resolve all 13 known restore failures atomically.'
          }
        </p>
        <pre className="text-xs text-emerald-300 overflow-x-auto leading-relaxed whitespace-pre-wrap break-all">
{`PGPASSWORD="<password>" bash scripts/export-database.sh \\
  --host "db.<project-ref>.supabase.co" \\
  --user postgres \\
  --dbname postgres`}
        </pre>
        <div className="mt-3 pt-3 border-t border-gray-700">
          <p className="text-xs text-gray-400 mb-1.5">
            {isRTL ? 'للتحقق بعد الاستعادة:' : 'Post-restore verification:'}
          </p>
          <pre className="text-xs text-amber-300 overflow-x-auto">
{`SELECT public.validate_restore_readiness();
-- Expected: { "failed_checks": 0, "total_checks": 24 }`}
          </pre>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          {isRTL
            ? 'انظر scripts/export-database.sql لقائمة كاملة بترتيب التبعيات وخطوات التحقق.'
            : 'See scripts/export-database.sql for the full dependency order and verification steps.'}
        </p>
      </div>

    </div>
  );
}

export default SystemHealth;
