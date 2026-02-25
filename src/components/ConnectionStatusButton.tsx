import { useState } from 'react';
import { useOffline } from '../contexts/OfflineFirstContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Wifi, WifiOff, RefreshCw, AlertCircle, Trash2, X } from 'lucide-react';

export function ConnectionStatusButton() {
  const { isOnline, isSyncing, pendingOperationsCount, lastSyncTime, syncError, syncNow, clearAllPending } = useOffline();
  const { language, t } = useLanguage();
  const isRTL = language === 'ar';
  const [showPopover, setShowPopover] = useState(false);

  const getConnectionState = () => {
    if (!isOnline) return 'offline';
    if (isSyncing) return 'syncing';
    return 'online';
  };

  const state = getConnectionState();

  const getStatusColor = () => {
    switch (state) {
      case 'offline':
        return 'text-red-600';
      case 'syncing':
        return 'text-blue-600';
      default:
        return 'text-green-600';
    }
  };

  const getStatusLabel = () => {
    switch (state) {
      case 'offline':
        return isRTL ? 'غير متصل' : 'Offline';
      case 'syncing':
        return isRTL ? 'جاري المزامنة' : 'Syncing';
      default:
        return isRTL ? 'متصل' : 'Online';
    }
  };

  const formatLastSync = (timestamp: number | null) => {
    if (!timestamp) return isRTL ? 'لم يتم التزامن بعد' : 'Never synced';

    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return isRTL ? `منذ ${hours} ساعة` : `${hours}h ago`;
    }
    if (minutes > 0) {
      return isRTL ? `منذ ${minutes} دقيقة` : `${minutes}m ago`;
    }
    return isRTL ? `منذ ${seconds} ثانية` : `${seconds}s ago`;
  };

  const handleSync = async () => {
    await syncNow();
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowPopover(!showPopover)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition ${
          state === 'offline'
            ? 'bg-red-50 hover:bg-red-100'
            : state === 'syncing'
            ? 'bg-blue-50 hover:bg-blue-100'
            : 'bg-green-50 hover:bg-green-100'
        }`}
        title={getStatusLabel()}
      >
        {state === 'offline' ? (
          <WifiOff className={`w-5 h-5 ${getStatusColor()}`} />
        ) : state === 'syncing' ? (
          <RefreshCw className={`w-5 h-5 ${getStatusColor()} animate-spin`} />
        ) : (
          <Wifi className={`w-5 h-5 ${getStatusColor()}`} />
        )}
        {pendingOperationsCount > 0 && (
          <span className="text-xs font-bold text-gray-900 bg-yellow-300 px-2 py-0.5 rounded-full">
            {pendingOperationsCount}
          </span>
        )}
      </button>

      {showPopover && (
        <div
          className={`absolute ${isRTL ? 'left-0' : 'right-0'} mt-2 w-72 bg-white rounded-lg shadow-xl border border-gray-200 z-50`}
        >
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">
                {isRTL ? 'حالة الاتصال' : 'Connection Status'}
              </h3>
              <button
                onClick={() => setShowPopover(false)}
                className="p-1 hover:bg-gray-100 rounded transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">
                    {isRTL ? 'الحالة' : 'Status'}
                  </span>
                  <div className="flex items-center gap-2">
                    {state === 'offline' ? (
                      <WifiOff className="w-4 h-4 text-red-600" />
                    ) : state === 'syncing' ? (
                      <RefreshCw className="w-4 h-4 text-blue-600 animate-spin" />
                    ) : (
                      <Wifi className="w-4 h-4 text-green-600" />
                    )}
                    <span
                      className={`font-medium ${
                        state === 'offline'
                          ? 'text-red-600'
                          : state === 'syncing'
                          ? 'text-blue-600'
                          : 'text-green-600'
                      }`}
                    >
                      {getStatusLabel()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">
                    {isRTL ? 'العمليات المعلقة' : 'Pending Operations'}
                  </span>
                  <span className="font-bold text-gray-900">
                    {pendingOperationsCount}
                  </span>
                </div>
                {pendingOperationsCount > 0 && (
                  <>
                    <p className="text-xs text-gray-500 mt-1">
                      {isRTL
                        ? 'سيتم مزامنتها عند الاتصال بالإنترنت'
                        : 'Will sync when online'}
                    </p>
                    <button
                      onClick={async () => {
                        const ok = window.confirm(
                          isRTL
                            ? `هل تريد مسح ${pendingOperationsCount} عملية معلقة؟ هذا لن يؤثر على البيانات المحفوظة.`
                            : `Clear ${pendingOperationsCount} pending operations? This won't affect saved data.`
                        );
                        if (!ok) return;
                        const cleared = await clearAllPending();
                        alert(isRTL ? `تم مسح ${cleared} عملية` : `Cleared ${cleared} operations`);
                      }}
                      className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition text-sm font-medium"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {isRTL ? 'مسح العمليات المعلقة' : 'Clear Pending'}
                    </button>
                  </>
                )}
              </div>

              {lastSyncTime && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">
                      {isRTL ? 'آخر مزامنة' : 'Last Sync'}
                    </span>
                    <span className="text-sm font-medium text-gray-900">
                      {formatLastSync(lastSyncTime)}
                    </span>
                  </div>
                </div>
              )}

              {syncError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-red-900">
                        {isRTL ? 'خطأ' : 'Error'}
                      </p>
                      <p className="text-xs text-red-700 mt-1">{syncError}</p>
                    </div>
                  </div>
                </div>
              )}

              {isOnline && (pendingOperationsCount > 0 || syncError) && (
                <button
                  onClick={handleSync}
                  disabled={isSyncing}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`}
                  />
                  {isRTL ? 'مزامنة يدوية' : 'Manual Sync'}
                </button>
              )}

              {!isOnline && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-xs text-yellow-800">
                    {isRTL
                      ? 'تحقق من اتصال الإنترنت لديك. سيتم مزامنة التغييرات تلقائياً عند الاتصال.'
                      : 'Check your internet connection. Changes will sync automatically when online.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showPopover && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowPopover(false)}
        />
      )}
    </div>
  );
}
