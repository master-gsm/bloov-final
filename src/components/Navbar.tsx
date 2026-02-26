import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useOffline } from '../contexts/OfflineFirstContext';
import { useBranch } from '../contexts/BranchContext';
import { LogOut, Globe, Wifi, WifiOff, RefreshCw, AlertCircle, Building2, ChevronDown } from 'lucide-react';
import { ConnectionStatusButton } from './ConnectionStatusButton';
import { NotificationBell } from './NotificationCenter';
import { useState, useEffect } from 'react';

export function Navbar() {
  const { signOut } = useAuth();
  const { language, setLanguage, t, isRTL } = useLanguage();
  const { isOnline, isSyncing, pendingOperationsCount, syncError } = useOffline();
  const { isAdmin, allBranches, selectedBranchFilter, setSelectedBranchFilter, currentBranchId } = useBranch();
  const [showConnectionMenu, setShowConnectionMenu] = useState(false);
  const [showBranchMenu, setShowBranchMenu] = useState(false);
  const [actualOnline, setActualOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setActualOnline(true);
    const handleOffline = () => setActualOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

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
        return 'text-red-400 bg-red-500/10 border-red-500/20 hover:bg-red-500/15';
      case 'syncing':
        return 'text-blue-400 bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/15';
      case 'pending':
        return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20 hover:bg-yellow-500/15';
      default:
        return 'text-green-400 bg-green-500/10 border-green-500/20 hover:bg-green-500/15';
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
    <nav className="bg-dark-surface/95 backdrop-blur-xl border-b border-dark-border sticky top-0 z-50 shadow-dark-md">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img
              src="/لقطة_شاشة_2026-02-11_184526.png"
              alt="BLOOV"
              className="h-10 w-auto"
            />
            <div>
              <h1 className="text-xl font-bold text-mauve-50">{t('app.name')}</h1>
              <p className="text-xs text-mauve-400">{t('app.tagline')}</p>
            </div>
          </div>

          <div className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <div className="relative">
              <button
                onClick={() => setShowConnectionMenu(!showConnectionMenu)}
                className={`relative flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${getConnectionColor()} min-w-[100px]`}
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
                  <span className="absolute top-1 right-1 w-5 h-5 bg-yellow-500 text-dark-bg text-xs font-bold rounded-full flex items-center justify-center">
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
                    className={`absolute ${isRTL ? 'left-0' : 'right-0'} mt-2 w-80 bg-dark-surface/98 backdrop-blur-xl rounded-xl shadow-dark-xl border border-dark-border z-40`}
                  >
                    <div className="p-4 space-y-3">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-mauve-50">
                          {isRTL ? 'حالة الاتصال' : 'Connection Status'}
                        </h3>
                      </div>

                      <div className="bg-dark-hover rounded-xl p-3 flex items-center justify-between border border-dark-border">
                        <span className="text-sm text-mauve-300">
                          {isRTL ? 'الحالة' : 'Status'}
                        </span>
                        <div className="flex items-center gap-2">
                          {state === 'offline' ? (
                            <>
                              <WifiOff className="w-4 h-4 text-red-400" />
                              <span className="font-medium text-red-400">
                                {isRTL ? 'غير متصل' : 'Offline'}
                              </span>
                            </>
                          ) : state === 'syncing' ? (
                            <>
                              <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />
                              <span className="font-medium text-blue-400">
                                {isRTL ? 'جاري المزامنة' : 'Syncing'}
                              </span>
                            </>
                          ) : (
                            <>
                              <Wifi className="w-4 h-4 text-green-400" />
                              <span className="font-medium text-green-400">
                                {isRTL ? 'متصل' : 'Online'}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {pendingOperationsCount > 0 && (
                        <div className="bg-dark-hover rounded-xl p-3 border border-dark-border">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-mauve-300">
                              {isRTL ? 'عمليات معلقة' : 'Pending Operations'}
                            </span>
                            <span className="font-bold text-accent-light">
                              {pendingOperationsCount}
                            </span>
                          </div>
                          <p className="text-xs text-muted mt-1">
                            {isRTL
                              ? 'سيتم مزامنتها عند الاتصال'
                              : 'Will sync when online'}
                          </p>
                        </div>
                      )}

                      {syncError && (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex gap-2">
                          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs font-medium text-red-300">
                              {isRTL ? 'خطأ في المزامنة' : 'Sync Error'}
                            </p>
                            <p className="text-xs text-red-400/70 mt-1">{syncError}</p>
                          </div>
                        </div>
                      )}

                      {!isOnline && (
                        <div className="bg-dark-hover rounded-xl p-3 text-xs text-mauve-300 border border-dark-border">
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

            {isAdmin && allBranches.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowBranchMenu(!showBranchMenu)}
                  className="flex items-center gap-2 px-3 py-2 text-mauve-300 hover:bg-dark-hover rounded-xl border border-dark-border transition-all text-sm"
                >
                  <Building2 className="w-4 h-4 text-accent-light" />
                  <span className="hidden sm:inline font-medium max-w-[120px] truncate">
                    {selectedBranchFilter
                      ? (allBranches.find(b => b.id === selectedBranchFilter)?.name || (isRTL ? 'فرع' : 'Branch'))
                      : (isRTL ? 'كل الفروع' : 'All Branches')}
                  </span>
                  <ChevronDown className="w-4 h-4 text-muted" />
                </button>
                {showBranchMenu && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setShowBranchMenu(false)} />
                    <div className={`absolute ${isRTL ? 'left-0' : 'right-0'} mt-2 w-52 bg-dark-surface/98 backdrop-blur-xl rounded-xl shadow-dark-xl border border-dark-border z-40 overflow-hidden`}>
                      <div className="p-2">
                        <button
                          onClick={() => { setSelectedBranchFilter(null); setShowBranchMenu(false); }}
                          className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all ${!selectedBranchFilter ? 'bg-accent/15 text-accent-light font-medium' : 'text-mauve-300 hover:bg-dark-hover'}`}
                        >
                          {isRTL ? 'كل الفروع' : 'All Branches'}
                        </button>
                        {allBranches.map(branch => (
                          <button
                            key={branch.id}
                            onClick={() => { setSelectedBranchFilter(branch.id); setShowBranchMenu(false); }}
                            className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all ${selectedBranchFilter === branch.id ? 'bg-accent/15 text-accent-light font-medium' : 'text-mauve-300 hover:bg-dark-hover'}`}
                          >
                            {branch.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            <NotificationBell />

            <button
              onClick={toggleLanguage}
              className="flex items-center gap-2 px-3 py-2 text-mauve-300 hover:bg-dark-hover rounded-xl transition-all border border-dark-border"
            >
              <Globe className="w-5 h-5" />
              <span className="text-sm font-medium hidden sm:inline">
                {language === 'en' ? 'العربية' : 'English'}
              </span>
            </button>

            <button
              onClick={signOut}
              className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-xl hover:bg-accent-hover transition-all shadow-glow-sm hover:shadow-glow-md"
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
