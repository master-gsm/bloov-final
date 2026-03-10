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
  Bug,
  FileText,
  User,
  Calendar,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  Lock,
  Unlock,
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

interface ErrorLogEntry {
  id: string;
  error_code: string | null;
  error_message: string;
  error_type: string;
  severity: string;
  component: string | null;
  occurrence_count: number;
  first_seen_at: string;
  last_seen_at: string;
  is_resolved: boolean;
  affected_user: string | null;
  branch_name: string | null;
}

interface AuditLogEntry {
  id: string;
  created_at: string;
  action: string;
  table_name: string;
  record_id: string;
  user_name: string | null;
  user_role: string | null;
  branch_name: string | null;
  severity: string;
}

interface AccountingPeriod {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_closed: boolean;
  status: string;
  closed_at: string | null;
  closed_by_name: string | null;
  total_entries: number;
  posted_entries: number;
  unposted_entries: number;
  sales_count: number;
  purchases_count: number;
}

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

  const [activeTab, setActiveTab] = useState<'health' | 'errors' | 'audit' | 'periods'>('health');
  const [errorLogs, setErrorLogs] = useState<ErrorLogEntry[]>([]);
  const [errorLogsLoading, setErrorLogsLoading] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditLogsLoading, setAuditLogsLoading] = useState(false);
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [periodsLoading, setPeriodsLoading] = useState(false);
  const [closingPeriodId, setClosingPeriodId] = useState<string | null>(null);

  const runHealthCheck = useCallback(async () => {
    setLoading(true);
    setError(null);
    setChecks(Array(6).fill(LOADING_CHECK));

    // Step 1: verify the DB is actually reachable with SELECT 1
    let dbReachable = false;
    try {
      const { error: pingError } = await supabase.from('settings').select('id').limit(1);
      if (pingError) {
        console.error('[SystemHealth] DB ping failed:', pingError);
      } else {
        dbReachable = true;
      }
    } catch (pingErr) {
      console.error('[SystemHealth] DB ping exception:', pingErr);
    }

    setDbOnline(dbReachable);

    if (!dbReachable) {
      const msg = isRTL ? 'تعذّر الاتصال بقاعدة البيانات' : 'Database connection failed';
      setError(msg);
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
      setLoading(false);
      return;
    }

    // Step 2: run health report RPC
    try {
      const { data, error: rpcError } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .rpc('get_db_health_report' as any);

      if (rpcError) {
        console.error('[SystemHealth] get_db_health_report RPC error:', rpcError);
        const msg = rpcError.message || JSON.stringify(rpcError);
        setError(msg);
        setChecks([
          {
            id: 'connection',
            label: 'Database Connection',
            labelAr: 'اتصال قاعدة البيانات',
            status: 'warn',
            value: isRTL ? 'متصل — خطأ في الدالة' : 'Connected — function error',
            detail: msg,
          },
          ...Array(5).fill({ id: '', label: '—', labelAr: '—', status: 'loading' as CheckStatus, value: '—' }),
        ]);
        return;
      }

      const r = data as unknown as HealthReport;
      setReport(r);

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
      console.error('[SystemHealth] Unexpected error in health check:', err);
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      setError(msg);
      setChecks([
        {
          id: 'connection',
          label: 'Database Connection',
          labelAr: 'اتصال قاعدة البيانات',
          status: 'warn',
          value: isRTL ? 'متصل — خطأ غير متوقع' : 'Connected — unexpected error',
          detail: msg,
        },
        ...Array(5).fill({ id: '', label: '—', labelAr: '—', status: 'loading' as CheckStatus, value: '—' }),
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
      if (rpcError) throw new Error(rpcError.message || JSON.stringify(rpcError));
      setRestoreReport(data as unknown as RestoreReport);
      setRestoreExpanded(true);
    } catch (err: unknown) {
      console.error('[SystemHealth] validate_restore_readiness error:', err);
      setRestoreError(err instanceof Error ? err.message : JSON.stringify(err));
    } finally {
      setRestoreLoading(false);
    }
  }, []);

  const loadErrorLogs = useCallback(async () => {
    setErrorLogsLoading(true);
    try {
      const { data, error: err } = await supabase
        .from('v_error_dashboard')
        .select('*')
        .order('last_seen_at', { ascending: false })
        .limit(50);
      if (err) throw err;
      setErrorLogs((data || []) as ErrorLogEntry[]);
    } catch (err) {
      console.error('[SystemHealth] Error loading error logs:', err);
    } finally {
      setErrorLogsLoading(false);
    }
  }, []);

  const loadAuditLogs = useCallback(async () => {
    setAuditLogsLoading(true);
    try {
      const { data, error: err } = await supabase
        .from('v_audit_logs_detailed')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (err) throw err;
      setAuditLogs((data || []) as AuditLogEntry[]);
    } catch (err) {
      console.error('[SystemHealth] Error loading audit logs:', err);
    } finally {
      setAuditLogsLoading(false);
    }
  }, []);

  const loadPeriods = useCallback(async () => {
    setPeriodsLoading(true);
    try {
      const { data, error: err } = await supabase
        .from('v_accounting_periods_status')
        .select('*')
        .order('start_date', { ascending: false });
      if (err) throw err;
      setPeriods((data || []) as AccountingPeriod[]);
    } catch (err) {
      console.error('[SystemHealth] Error loading periods:', err);
    } finally {
      setPeriodsLoading(false);
    }
  }, []);

  const handleClosePeriod = async (periodId: string) => {
    if (!confirm(isRTL ? 'هل تريد إغلاق هذه الفترة المحاسبية؟ لن يمكن تعديل القيود بعد الإغلاق.' : 'Are you sure you want to close this period? Journal entries cannot be modified after closing.')) {
      return;
    }
    setClosingPeriodId(periodId);
    try {
      const { error: err } = await supabase.rpc('fn_close_accounting_period', {
        p_period_id: periodId,
        p_reason: 'Monthly close via System Health'
      });
      if (err) throw err;
      await loadPeriods();
    } catch (err) {
      console.error('[SystemHealth] Error closing period:', err);
      alert(isRTL ? 'فشل إغلاق الفترة' : 'Failed to close period');
    } finally {
      setClosingPeriodId(null);
    }
  };

  const handleResolveError = async (errorId: string) => {
    try {
      const { error: err } = await supabase.rpc('fn_resolve_error', {
        p_error_id: errorId,
        p_resolution_notes: 'Resolved via System Health dashboard'
      });
      if (err) throw err;
      await loadErrorLogs();
    } catch (err) {
      console.error('[SystemHealth] Error resolving error:', err);
    }
  };

  useEffect(() => {
    runHealthCheck();
  }, [runHealthCheck]);

  useEffect(() => {
    if (activeTab === 'errors') loadErrorLogs();
    if (activeTab === 'audit') loadAuditLogs();
    if (activeTab === 'periods') loadPeriods();
  }, [activeTab, loadErrorLogs, loadAuditLogs, loadPeriods]);

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

  const severityBadge = (severity: string) => {
    const colors: Record<string, string> = {
      critical: 'bg-red-100 text-red-700',
      error: 'bg-red-100 text-red-700',
      warning: 'bg-amber-100 text-amber-700',
      info: 'bg-blue-100 text-blue-700',
      success: 'bg-emerald-100 text-emerald-700',
      danger: 'bg-red-100 text-red-700',
    };
    return colors[severity] || 'bg-gray-100 text-gray-700';
  };

  const tabs = [
    { id: 'health', label: isRTL ? 'صحة النظام' : 'Health', icon: ShieldCheck },
    { id: 'errors', label: isRTL ? 'سجل الأخطاء' : 'Errors', icon: Bug },
    { id: 'audit', label: isRTL ? 'سجل التدقيق' : 'Audit Log', icon: FileText },
    { id: 'periods', label: isRTL ? 'الفترات المحاسبية' : 'Periods', icon: Calendar },
  ] as const;

  return (
    <div className={`p-6 max-w-6xl mx-auto space-y-6 ${isRTL ? 'rtl' : 'ltr'}`}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isRTL ? 'مركز التحكم والمراقبة' : 'System Control Center'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {isRTL
              ? 'مراقبة صحة النظام، الأخطاء، التدقيق، والفترات المحاسبية'
              : 'Monitor system health, errors, audit trail, and accounting periods'}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-white text-teal-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Health Tab Content */}
      {activeTab === 'health' && (
        <>
          {/* Overall Banner */}
          <div className="flex items-center justify-end mb-4">
            <button
              onClick={runHealthCheck}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 transition text-sm font-medium"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              {isRTL ? 'إعادة الفحص' : 'Re-run Checks'}
            </button>
          </div>
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
        </>
      )}

      {/* Errors Tab Content */}
      {activeTab === 'errors' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              {isRTL ? 'سجل الأخطاء' : 'Error Log'}
            </h2>
            <button
              onClick={loadErrorLogs}
              disabled={errorLogsLoading}
              className="flex items-center gap-2 px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 transition text-xs font-medium"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${errorLogsLoading ? 'animate-spin' : ''}`} />
              {isRTL ? 'تحديث' : 'Refresh'}
            </button>
          </div>

          {errorLogsLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : errorLogs.length === 0 ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-8 text-center">
              <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <p className="text-emerald-700 font-medium">
                {isRTL ? 'لا توجد أخطاء مسجلة' : 'No errors recorded'}
              </p>
              <p className="text-emerald-600 text-sm mt-1">
                {isRTL ? 'النظام يعمل بشكل طبيعي' : 'System is running smoothly'}
              </p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="divide-y divide-gray-100">
                {errorLogs.map((err) => (
                  <div key={err.id} className={`p-4 hover:bg-gray-50 ${err.is_resolved ? 'opacity-60' : ''}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${severityBadge(err.severity)}`}>
                            {err.severity}
                          </span>
                          {err.component && (
                            <span className="text-xs text-gray-500 font-mono">{err.component}</span>
                          )}
                          {err.occurrence_count > 1 && (
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                              x{err.occurrence_count}
                            </span>
                          )}
                          {err.is_resolved && (
                            <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                              {isRTL ? 'تم الحل' : 'Resolved'}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-900 font-medium truncate">{err.error_message}</p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {fmtDate(err.last_seen_at)}
                          </span>
                          {err.affected_user && (
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {err.affected_user}
                            </span>
                          )}
                        </div>
                      </div>
                      {!err.is_resolved && (
                        <button
                          onClick={() => handleResolveError(err.id)}
                          className="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition"
                        >
                          {isRTL ? 'تم الحل' : 'Resolve'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Audit Log Tab Content */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              {isRTL ? 'سجل التدقيق' : 'Audit Trail'}
            </h2>
            <button
              onClick={loadAuditLogs}
              disabled={auditLogsLoading}
              className="flex items-center gap-2 px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 transition text-xs font-medium"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${auditLogsLoading ? 'animate-spin' : ''}`} />
              {isRTL ? 'تحديث' : 'Refresh'}
            </button>
          </div>

          {auditLogsLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : auditLogs.length === 0 ? (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600 font-medium">
                {isRTL ? 'لا توجد سجلات تدقيق' : 'No audit records'}
              </p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-right font-medium text-gray-600">
                        {isRTL ? 'التاريخ' : 'Date'}
                      </th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600">
                        {isRTL ? 'الإجراء' : 'Action'}
                      </th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600">
                        {isRTL ? 'الجدول' : 'Table'}
                      </th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600">
                        {isRTL ? 'المستخدم' : 'User'}
                      </th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600">
                        {isRTL ? 'الفرع' : 'Branch'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {fmtDate(log.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${severityBadge(log.severity)}`}>
                            {log.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                          {log.table_name}
                        </td>
                        <td className="px-4 py-3 text-gray-900">
                          {log.user_name || '-'}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {log.branch_name || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Periods Tab Content */}
      {activeTab === 'periods' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              {isRTL ? 'الفترات المحاسبية' : 'Accounting Periods'}
            </h2>
            <button
              onClick={loadPeriods}
              disabled={periodsLoading}
              className="flex items-center gap-2 px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 transition text-xs font-medium"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${periodsLoading ? 'animate-spin' : ''}`} />
              {isRTL ? 'تحديث' : 'Refresh'}
            </button>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-medium mb-1">
                  {isRTL ? 'تنبيه مهم' : 'Important Notice'}
                </p>
                <p>
                  {isRTL
                    ? 'إغلاق الفترة المحاسبية يمنع أي تعديل على المبيعات، المشتريات، المصروفات، والقيود المحاسبية في تلك الفترة. لا يمكن التراجع إلا بواسطة المسؤول الأعلى.'
                    : 'Closing an accounting period prevents any modifications to sales, purchases, expenses, and journal entries within that period. Only super admin can reopen.'}
                </p>
              </div>
            </div>
          </div>

          {periodsLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : periods.length === 0 ? (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
              <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600 font-medium">
                {isRTL ? 'لا توجد فترات محاسبية' : 'No accounting periods'}
              </p>
              <p className="text-gray-500 text-sm mt-1">
                {isRTL ? 'أنشئ فترات محاسبية من الإعدادات' : 'Create accounting periods from settings'}
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {periods.map((period) => (
                <div
                  key={period.id}
                  className={`bg-white border rounded-xl p-5 ${
                    period.is_closed ? 'border-gray-200' : 'border-emerald-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        {period.is_closed ? (
                          <Lock className="w-5 h-5 text-gray-500" />
                        ) : (
                          <Unlock className="w-5 h-5 text-emerald-500" />
                        )}
                        <h3 className="font-semibold text-gray-900">{period.name}</h3>
                        <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${
                          period.is_closed
                            ? 'bg-gray-100 text-gray-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {period.is_closed
                            ? (isRTL ? 'مغلقة' : 'Closed')
                            : (isRTL ? 'مفتوحة' : 'Open')}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600 mb-3">
                        {new Date(period.start_date).toLocaleDateString()} - {new Date(period.end_date).toLocaleDateString()}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500">{isRTL ? 'القيود' : 'Entries'}</span>
                          <p className="font-semibold text-gray-900">{period.total_entries}</p>
                        </div>
                        <div>
                          <span className="text-gray-500">{isRTL ? 'المعتمدة' : 'Posted'}</span>
                          <p className="font-semibold text-emerald-600">{period.posted_entries}</p>
                        </div>
                        <div>
                          <span className="text-gray-500">{isRTL ? 'المبيعات' : 'Sales'}</span>
                          <p className="font-semibold text-gray-900">{period.sales_count}</p>
                        </div>
                        <div>
                          <span className="text-gray-500">{isRTL ? 'المشتريات' : 'Purchases'}</span>
                          <p className="font-semibold text-gray-900">{period.purchases_count}</p>
                        </div>
                      </div>
                      {period.is_closed && period.closed_at && (
                        <div className="mt-3 text-xs text-gray-500">
                          {isRTL ? 'أُغلقت بواسطة' : 'Closed by'} {period.closed_by_name || '-'} {isRTL ? 'في' : 'on'} {fmtDate(period.closed_at)}
                        </div>
                      )}
                    </div>
                    {!period.is_closed && (
                      <button
                        onClick={() => handleClosePeriod(period.id)}
                        disabled={closingPeriodId === period.id || period.unposted_entries > 0}
                        className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm font-medium"
                        title={period.unposted_entries > 0 ? (isRTL ? 'يوجد قيود غير معتمدة' : 'Unposted entries exist') : ''}
                      >
                        {closingPeriodId === period.id ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Lock className="w-4 h-4" />
                        )}
                        {isRTL ? 'إغلاق الفترة' : 'Close Period'}
                      </button>
                    )}
                  </div>
                  {!period.is_closed && period.unposted_entries > 0 && (
                    <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                      <AlertTriangle className="w-4 h-4 inline-block mr-2" />
                      {isRTL
                        ? `لا يمكن إغلاق الفترة: ${period.unposted_entries} قيد غير معتمد`
                        : `Cannot close: ${period.unposted_entries} unposted entries`}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}

export default SystemHealth;
