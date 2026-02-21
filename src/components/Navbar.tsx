import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useOffline } from '../contexts/OfflineContext';
import { LogOut, Globe, Wifi, WifiOff, RefreshCw, AlertCircle } from 'lucide-react';
import { ConnectionStatusButton } from './ConnectionStatusButton';
import { useState, useEffect } from 'react';

export function Navbar() {
  const { signOut } = useAuth();
  const { language, setLanguage, t, isRTL } = useLanguage();
  const { isOnline, isSyncing, pendingOperationsCount, syncError } = useOffline();
  const [showConnectionMenu, setShowConnectionMenu] = useState(false);
  const [actualOnline, setActualOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => {
      console.log('[Navbar] Connection restored detected');
      setActualOnline(true);
    };

    const handleOffline = () => {
      console.log('[Navbar] Connection lost detected');
      setActualOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const checkConnection = setInterval(() => {
      const wasOnline = actualOnline;
      const isNowOnline = navigator.onLine;

      if (wasOnline !== isNowOnline) {
        console.log(`[Navbar] Connection status changed: ${wasOnline} -> ${isNowOnline}`);
        setActualOnline(isNowOnline);
      }
    }, 1000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(checkConnection);
    };
  }, [actualOnline]);

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'ar' : 'en');
  };

  const getConnectionState = () => {
    if (!actualOnline) return 'offline';
    if (isSyncing) return 'syncing';
    if (pendingOperationsCount > 0) return 'pending';
    return 'online';
  };

  const state = getConnectionState();

  const getConnectionColor = () => {
    switch (state) {
      case 'offline':
        return 'text-red-600 bg-red-50 border-red-200 hover:bg-red-100';
      case 'syncing':
        return 'text-blue-600 bg-blue-50 border-blue-200 hover:bg-blue-100';
      case 'pending':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200 hover:bg-yellow-100';
      default:
        return 'text-green-600 bg-green-50 border-green-200 hover:bg-green-100';
    }
  };

  const getConnectionLabel = () => {
    switch (state) {
      case 'offline':
        return isRTL ? 'غير متصل' : 'Offline';
      case 'syncing':
        return isRTL ? 'جاري المزامنة' : 'Syncing';
      case 'pending':
        return isRTL ? `${pendingOperationsCount} معلق` : `${pendingOperationsCount} pending`;
      default:
        return isRTL ? 'متصل' : 'Online';
    }
  };

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img
              src="/لقطة_شاشة_2026-02-11_184526.png"
              alt="BLOOV"
              className="h-10 w-auto"
            />
            <div>
              <h1 className="text-xl font-bold text-gray-900">{t('app.name')}</h1>
              <p className="text-xs text-gray-500">{t('app.tagline')}</p>
            </div>
          </div>

          <div className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <div className="relative">
              <button
                onClick={() => setShowConnectionMenu(!showConnectionMenu)}
                className={`relative flex items-center gap-2 px-3 py-2 rounded-lg border transition ${getConnectionColor()}`}
                title={getConnectionLabel()}
              >
                {state === 'offline' ? (
                  <WifiOff className="w-5 h-5" />
                ) : state === 'syncing' ? (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                ) : (
                  <Wifi className="w-5 h-5" />
                )}
                <span className="text-sm font-medium hidden sm:inline">
                  {getConnectionLabel()}
                </span>
                {pendingOperationsCount > 0 && (
                  <span className="absolute top-1 right-1 w-5 h-5 bg-yellow-400 text-yellow-900 text-xs font-bold rounded-full flex items-center justify-center">
                    {pendingOperationsCount}
                  </span>
                )}
              </button>

              {showConnectionMenu && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setShowConnectionMenu(false)}
                  />
                  <div
                    className={`absolute ${isRTL ? 'left-0' : 'right-0'} mt-2 w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-40`}
                  >
                    <div className="p-4 space-y-3">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-gray-900">
                          {isRTL ? 'حالة الاتصال' : 'Connection Status'}
                        </h3>
                      </div>

                      <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
                        <span className="text-sm text-gray-600">
                          {isRTL ? 'الحالة' : 'Status'}
                        </span>
                        <div className="flex items-center gap-2">
                          {state === 'offline' ? (
                            <>
                              <WifiOff className="w-4 h-4 text-red-600" />
                              <span className="font-medium text-red-600">
                                {isRTL ? 'غير متصل' : 'Offline'}
                              </span>
                            </>
                          ) : state === 'syncing' ? (
                            <>
                              <RefreshCw className="w-4 h-4 text-blue-600 animate-spin" />
                              <span className="font-medium text-blue-600">
                                {isRTL ? 'جاري المزامنة' : 'Syncing'}
                              </span>
                            </>
                          ) : (
                            <>
                              <Wifi className="w-4 h-4 text-green-600" />
                              <span className="font-medium text-green-600">
                                {isRTL ? 'متصل' : 'Online'}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {pendingOperationsCount > 0 && (
                        <div className="bg-yellow-50 rounded-lg p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600">
                              {isRTL ? 'عمليات معلقة' : 'Pending Operations'}
                            </span>
                            <span className="font-bold text-yellow-600">
                              {pendingOperationsCount}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            {isRTL
                              ? 'سيتم مزامنتها عند الاتصال'
                              : 'Will sync when online'}
                          </p>
                        </div>
                      )}

                      {syncError && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2">
                          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs font-medium text-red-900">
                              {isRTL ? 'خطأ في المزامنة' : 'Sync Error'}
                            </p>
                            <p className="text-xs text-red-700 mt-1">{syncError}</p>
                          </div>
                        </div>
                      )}

                      {!isOnline && (
                        <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-800">
                          {isRTL
                            ? 'تحقق من اتصالك. التغييرات ستتم مزامنتها تلقائياً عند الاتصال.'
                            : 'Check your connection. Changes will sync automatically when online.'}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <button
              onClick={toggleLanguage}
              className="flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition"
            >
              <Globe className="w-5 h-5" />
              <span className="text-sm font-medium hidden sm:inline">
                {language === 'en' ? 'العربية' : 'English'}
              </span>
            </button>

            <button
              onClick={signOut}
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition"
            >
              <LogOut className="w-5 h-5" />
              <span className="text-sm font-medium hidden sm:inline">{t('auth.logout')}</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
