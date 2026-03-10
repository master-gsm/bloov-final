import { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAlerts, Alert } from '../hooks/useAlerts';
import {
  Bell, X, RefreshCw, AlertTriangle, AlertCircle, Info, Zap,
  Clock, FileText, DollarSign, Users, Wallet, Package,
} from 'lucide-react';

const SEVERITY_CONFIG = {
  urgent: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    badge: 'bg-red-600',
    text: 'text-red-700',
    icon: Zap,
    iconColor: 'text-red-600',
  },
  critical: {
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    badge: 'bg-orange-500',
    text: 'text-orange-700',
    icon: AlertCircle,
    iconColor: 'text-orange-500',
  },
  warning: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    badge: 'bg-amber-400',
    text: 'text-amber-700',
    icon: AlertTriangle,
    iconColor: 'text-amber-500',
  },
  info: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    badge: 'bg-blue-500',
    text: 'text-blue-700',
    icon: Info,
    iconColor: 'text-blue-500',
  },
};

const TYPE_ICONS: Record<string, React.ComponentType<any>> = {
  iqama_expiry: Users,
  payroll_missing: DollarSign,
  draft_journal: FileText,
  open_shift: Wallet,
  vat_quarter: Clock,
  vat_unsettled: AlertTriangle,
  low_stock: Package,
};

function AlertItem({ alert, isRTL }: { alert: Alert; isRTL: boolean }) {
  const cfg = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.info;
  const Icon = cfg.icon;
  const TypeIcon = TYPE_ICONS[alert.type] || Info;
  const title = isRTL && alert.title_ar ? alert.title_ar : alert.title;
  const message = isRTL && alert.message_ar ? alert.message_ar : alert.message;

  return (
    <div className={`flex gap-3 p-3 rounded-lg border ${cfg.bg} ${cfg.border} transition-all`}>
      <div className="flex-shrink-0 mt-0.5">
        <div className="relative">
          <TypeIcon className={`w-4 h-4 ${cfg.iconColor}`} />
          <Icon className={`w-3 h-3 absolute -bottom-1 -right-1 ${cfg.iconColor}`} />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${cfg.text} leading-snug`}>{title}</p>
        <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{message}</p>
      </div>
      <span className={`flex-shrink-0 self-start text-xs px-1.5 py-0.5 rounded-full text-white font-medium ${cfg.badge}`}>
        {isRTL ? severityLabelAr(alert.severity) : severityLabel(alert.severity)}
      </span>
    </div>
  );
}

function severityLabel(s: string) {
  switch (s) {
    case 'urgent': return 'Urgent';
    case 'critical': return 'Critical';
    case 'warning': return 'Warning';
    default: return 'Info';
  }
}

function severityLabelAr(s: string) {
  switch (s) {
    case 'urgent': return 'عاجل';
    case 'critical': return 'حرج';
    case 'warning': return 'تحذير';
    default: return 'معلومة';
  }
}

export function NotificationBell() {
  const { isRTL } = useLanguage();
  const { alerts, loading, criticalCount, totalCount, refresh } = useAlerts();
  const [open, setOpen] = useState(false);

  const badgeCount = criticalCount > 0 ? criticalCount : totalCount;
  const badgeColor = criticalCount > 0 ? 'bg-red-500' : 'bg-amber-400';

  return (
    <div className="relative flex-shrink-0 w-10 h-10">
      <button
        onClick={() => setOpen(v => !v)}
        className="relative flex items-center justify-center w-10 h-10 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
        title={isRTL ? 'التنبيهات' : 'Alerts'}
      >
        <Bell className={`w-5 h-5 ${totalCount > 0 ? 'text-gray-700' : 'text-gray-400'}`} />
        {badgeCount > 0 && (
          <span className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] ${badgeColor} text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 animate-pulse pointer-events-none`}>
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className={`fixed ${isRTL ? 'left-auto right-4' : 'right-4'} top-16 w-96 bg-white rounded-xl shadow-2xl border border-gray-200 z-40 flex flex-col max-h-[80vh]`}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-teal-600" />
                <h3 className="font-bold text-gray-900 text-sm">
                  {isRTL ? 'مركز التنبيهات' : 'Alert Center'}
                </h3>
                {totalCount > 0 && (
                  <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full font-medium">
                    {totalCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={refresh}
                  className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
                  title={isRTL ? 'تحديث' : 'Refresh'}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <button onClick={() => setOpen(false)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1">
              {loading && alerts.length === 0 ? (
                <div className="py-8 text-center text-gray-400">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                  <p className="text-sm">{isRTL ? 'جاري التحميل...' : 'Loading...'}</p>
                </div>
              ) : alerts.length === 0 ? (
                <div className="py-10 text-center">
                  <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Bell className="w-6 h-6 text-green-500" />
                  </div>
                  <p className="text-sm font-medium text-gray-700">
                    {isRTL ? 'لا توجد تنبيهات' : 'All clear!'}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {isRTL ? 'النظام يعمل بشكل طبيعي' : 'No issues detected'}
                  </p>
                </div>
              ) : (
                <div className="p-3 space-y-2">
                  {alerts.map(alert => (
                    <AlertItem key={alert.alert_id} alert={alert} isRTL={isRTL} />
                  ))}
                </div>
              )}
            </div>

            {alerts.length > 0 && (
              <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 rounded-b-xl">
                <p className="text-xs text-gray-400 text-center">
                  {isRTL
                    ? 'يتم التحديث تلقائياً كل 5 دقائق'
                    : 'Auto-refreshes every 5 minutes'}
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function AlertsPanel() {
  const { isRTL } = useLanguage();
  const { alerts, loading, refresh } = useAlerts();

  if (loading) return null;
  if (alerts.length === 0) return null;

  const urgent = alerts.filter(a => a.severity === 'urgent' || a.severity === 'critical');
  const shown = urgent.length > 0 ? urgent.slice(0, 3) : alerts.slice(0, 3);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="bg-red-50 p-2 rounded-lg">
            <Bell className="w-4 h-4 text-red-500" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 text-sm">
              {isRTL ? 'تنبيهات النظام' : 'System Alerts'}
            </h3>
            <p className="text-xs text-gray-400">
              {alerts.length} {isRTL ? 'تنبيه نشط' : 'active alerts'}
            </p>
          </div>
        </div>
        <button
          onClick={refresh}
          className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg transition"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="space-y-2">
        {shown.map(alert => (
          <AlertItem key={alert.alert_id} alert={alert} isRTL={isRTL} />
        ))}
        {alerts.length > 3 && (
          <p className="text-xs text-center text-teal-600 mt-2">
            {isRTL ? `+ ${alerts.length - 3} تنبيهات أخرى` : `+ ${alerts.length - 3} more alerts`}
          </p>
        )}
      </div>
    </div>
  );
}
