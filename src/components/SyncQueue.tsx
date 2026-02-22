import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Trash2, AlertCircle, CheckCircle, Clock, XCircle, Wifi, WifiOff } from 'lucide-react';
import { indexedDBManager, OperationQueueItem } from '../lib/offline/indexedDBManager';
import { enhancedSyncManager } from '../lib/offline/enhancedSyncManager';
import { useLanguage } from '../contexts/LanguageContext';

export function SyncQueue() {
  const { language } = useLanguage();
  const isRTL = language === 'ar';

  const [operations, setOperations] = useState<OperationQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const loadOperations = useCallback(async () => {
    try {
      const all = await indexedDBManager.getQueuedOperations();
      setOperations(all);
    } catch {
      setOperations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOperations();
    const interval = setInterval(loadOperations, 5000);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [loadOperations]);

  const handleRetryAll = async () => {
    if (!isOnline) return;
    setSyncing(true);
    try {
      await enhancedSyncManager.syncAll({ maxRetries: 3 });
      await loadOperations();
    } finally {
      setSyncing(false);
    }
  };

  const handleClearFailed = async () => {
    const failed = operations.filter(op => op.status === 'failed');
    for (const op of failed) {
      await indexedDBManager.removeQueueItem(op.id);
    }
    await loadOperations();
  };

  const handleRetryOne = async (op: OperationQueueItem) => {
    if (!isOnline) return;
    await indexedDBManager.updateQueueItemStatus(op.id, 'pending', { retries: 0, error: null });
    setSyncing(true);
    try {
      await enhancedSyncManager.syncAll({ maxRetries: 3 });
      await loadOperations();
    } finally {
      setSyncing(false);
    }
  };

  const handleRemoveOne = async (id: string) => {
    await indexedDBManager.removeQueueItem(id);
    await loadOperations();
  };

  const pending = operations.filter(op => op.status === 'pending' || op.status === 'syncing');
  const failed = operations.filter(op => op.status === 'failed');
  const succeeded = operations.filter(op => op.status === 'succeeded');

  const statusBadge = (status: string) => {
    const map: Record<string, { icon: React.ReactNode; cls: string; label: string; labelAr: string }> = {
      pending:   { icon: <Clock className="w-3.5 h-3.5" />,     cls: 'bg-yellow-100 text-yellow-700', label: 'Pending',   labelAr: 'انتظار' },
      syncing:   { icon: <RefreshCw className="w-3.5 h-3.5 animate-spin" />, cls: 'bg-blue-100 text-blue-700', label: 'Syncing', labelAr: 'جاري المزامنة' },
      succeeded: { icon: <CheckCircle className="w-3.5 h-3.5" />, cls: 'bg-green-100 text-green-700', label: 'Synced',  labelAr: 'تمت المزامنة' },
      failed:    { icon: <XCircle className="w-3.5 h-3.5" />,    cls: 'bg-red-100 text-red-700',     label: 'Failed',   labelAr: 'فشل' },
    };
    const s = map[status] || map['pending'];
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${s.cls}`}>
        {s.icon}
        {isRTL ? s.labelAr : s.label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-blue-100 w-12 h-12 rounded-xl flex items-center justify-center">
            <RefreshCw className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isRTL ? 'قائمة المزامنة' : 'Sync Queue'}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              {isOnline
                ? <><Wifi className="w-3.5 h-3.5 text-green-500" /><span className="text-xs text-green-600">{isRTL ? 'متصل' : 'Online'}</span></>
                : <><WifiOff className="w-3.5 h-3.5 text-red-500" /><span className="text-xs text-red-600">{isRTL ? 'غير متصل' : 'Offline'}</span></>
              }
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {failed.length > 0 && (
            <button
              onClick={handleClearFailed}
              className="flex items-center gap-2 px-4 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition text-sm"
            >
              <Trash2 className="w-4 h-4" />
              {isRTL ? `حذف الفاشلة (${failed.length})` : `Clear Failed (${failed.length})`}
            </button>
          )}
          <button
            onClick={handleRetryAll}
            disabled={syncing || !isOnline || pending.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {isRTL ? 'مزامنة الكل' : 'Sync All'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-100">
          <p className="text-xs text-yellow-600 font-medium">{isRTL ? 'انتظار' : 'Pending'}</p>
          <p className="text-2xl font-bold text-yellow-700">{pending.length}</p>
        </div>
        <div className="bg-red-50 rounded-xl p-4 border border-red-100">
          <p className="text-xs text-red-600 font-medium">{isRTL ? 'فشل' : 'Failed'}</p>
          <p className="text-2xl font-bold text-red-700">{failed.length}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4 border border-green-100">
          <p className="text-xs text-green-600 font-medium">{isRTL ? 'تمت' : 'Succeeded'}</p>
          <p className="text-2xl font-bold text-green-700">{succeeded.length}</p>
        </div>
      </div>

      {operations.length === 0 ? (
        <div className="bg-white rounded-xl border shadow-sm py-16 text-center">
          <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">{isRTL ? 'لا توجد عمليات معلقة' : 'No pending operations'}</p>
          <p className="text-gray-400 text-sm mt-1">{isRTL ? 'جميع البيانات متزامنة' : 'All data is synced'}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {isRTL ? 'الجدول' : 'Table'}
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {isRTL ? 'النوع' : 'Operation'}
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {isRTL ? 'الحالة' : 'Status'}
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {isRTL ? 'المحاولات' : 'Retries'}
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {isRTL ? 'آخر خطأ' : 'Last Error'}
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {isRTL ? 'إجراء' : 'Action'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {operations.map(op => (
                  <tr key={op.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-700">{op.table}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                        op.operation === 'insert' ? 'bg-blue-50 text-blue-700' :
                        op.operation === 'update' ? 'bg-orange-50 text-orange-700' :
                        'bg-red-50 text-red-700'
                      }`}>
                        {op.operation.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 px-4">{statusBadge(op.status)}</td>
                    <td className="py-3 px-4">
                      <span className={`text-sm font-medium ${op.retries >= 3 ? 'text-red-600' : 'text-gray-600'}`}>
                        {op.retries} / {op.maxRetries || 3}
                      </span>
                    </td>
                    <td className="py-3 px-4 max-w-xs">
                      {op.error ? (
                        <div className="flex items-start gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                          <span className="text-xs text-red-600 truncate" title={op.error}>{op.error}</span>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        {(op.status === 'failed' || op.status === 'pending') && (
                          <button
                            onClick={() => handleRetryOne(op)}
                            disabled={syncing || !isOnline}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded disabled:opacity-40 disabled:cursor-not-allowed transition"
                            title={isRTL ? 'إعادة المحاولة' : 'Retry'}
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {op.status === 'failed' && (
                          <button
                            onClick={() => handleRemoveOne(op.id)}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded transition"
                            title={isRTL ? 'حذف' : 'Remove'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
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
