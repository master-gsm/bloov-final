import { useOffline } from '../contexts/OfflineContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Wifi, WifiOff, RefreshCw, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { useEffect, useState } from 'react';

export function ConnectionStatusBar() {
  const { isOnline, isSyncing, pendingOperationsCount, lastSyncTime, lastBackupTime, syncError } = useOffline();
  const { language } = useLanguage();
  const isRTL = language === 'ar';
  const [showBar, setShowBar] = useState(false);

  useEffect(() => {
    setShowBar(!isOnline || isSyncing || pendingOperationsCount > 0 || !!syncError);
  }, [isOnline, isSyncing, pendingOperationsCount, syncError]);

  const formatLastSync = (timestamp: number | null) => {
    if (!timestamp) return isRTL ? 'لم يتم النسخ الاحتياطي بعد' : 'Not backed up yet';

    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);

    if (minutes > 0) {
      return isRTL ? `منذ ${minutes} دقيقة` : `${minutes}m ago`;
    }
    return isRTL ? `منذ ${seconds} ثانية` : `${seconds}s ago`;
  };

  if (!showBar) {
    return (
      <div className={`fixed top-16 ${isRTL ? 'left-4' : 'right-4'} z-40`}>
        <div className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg shadow-sm">
          {isOnline ? (
            <Wifi className="w-4 h-4 text-green-600" />
          ) : (
            <WifiOff className="w-4 h-4 text-red-600" />
          )}
          {lastBackupTime && (
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatLastSync(lastBackupTime)}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed top-16 left-0 right-0 z-40 px-4">
      <div
        className={`max-w-4xl mx-auto rounded-lg shadow-lg border transition-all duration-300 ${
          isOnline
            ? isSyncing
              ? 'bg-blue-50 border-blue-200'
              : pendingOperationsCount > 0
              ? 'bg-yellow-50 border-yellow-200'
              : 'bg-green-50 border-green-200'
            : 'bg-red-50 border-red-200'
        }`}
      >
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isSyncing ? (
              <>
                <RefreshCw className="w-5 h-5 text-blue-600 animate-spin" />
                <div>
                  <p className="text-sm font-medium text-blue-900">
                    {isRTL ? 'جاري المزامنة...' : 'Syncing...'}
                  </p>
                  <p className="text-xs text-blue-700">
                    {isRTL
                      ? `${pendingOperationsCount} عملية معلقة`
                      : `${pendingOperationsCount} pending operations`}
                  </p>
                </div>
              </>
            ) : !isOnline ? (
              <>
                <WifiOff className="w-5 h-5 text-red-600" />
                <div>
                  <p className="text-sm font-medium text-red-900">
                    {isRTL ? 'غير متصل بالإنترنت' : 'Offline'}
                  </p>
                  <p className="text-xs text-red-700">
                    {isRTL
                      ? 'سيتم حفظ التغييرات محلياً'
                      : 'Changes will be saved locally'}
                  </p>
                </div>
              </>
            ) : syncError ? (
              <>
                <AlertCircle className="w-5 h-5 text-red-600" />
                <div>
                  <p className="text-sm font-medium text-red-900">
                    {isRTL ? 'خطأ في المزامنة' : 'Sync Error'}
                  </p>
                  <p className="text-xs text-red-700">{syncError}</p>
                </div>
              </>
            ) : pendingOperationsCount > 0 ? (
              <>
                <Clock className="w-5 h-5 text-yellow-600" />
                <div>
                  <p className="text-sm font-medium text-yellow-900">
                    {isRTL ? 'في انتظار المزامنة' : 'Pending Sync'}
                  </p>
                  <p className="text-xs text-yellow-700">
                    {isRTL
                      ? `${pendingOperationsCount} عملية في الانتظار`
                      : `${pendingOperationsCount} operations waiting`}
                  </p>
                </div>
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5 text-green-600" />
                <div>
                  <p className="text-sm font-medium text-green-900">
                    {isRTL ? 'متصل ومحفوظ' : 'Connected & Backed Up'}
                  </p>
                  {lastBackupTime && (
                    <p className="text-xs text-green-700">
                      {isRTL ? 'آخر نسخة احتياطية:' : 'Last backup:'} {formatLastSync(lastBackupTime)}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>

          {isOnline && (
            <Wifi className="w-5 h-5 text-green-600" />
          )}
        </div>

        {pendingOperationsCount > 0 && isOnline && !isSyncing && (
          <div className="px-4 pb-3">
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div
                className="bg-blue-600 h-1.5 rounded-full transition-all duration-500"
                style={{ width: '0%' }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
