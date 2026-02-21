import React from 'react';
import { Wifi, WifiOff, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import { useOfflineFirst } from '../contexts/OfflineFirstContext';

export const OfflineStatusIndicator: React.FC = () => {
  const {
    isOnline,
    isHealthy,
    connectionQuality,
    latency,
    isSyncing,
    pendingOperationsCount,
    lastSyncTime,
    syncError,
    performSync,
    clearSyncError,
  } = useOfflineFirst();

  const getConnectionColor = () => {
    if (!isOnline) return 'bg-red-100 text-red-700 border-red-200';
    if (connectionQuality === 'excellent') return 'bg-green-100 text-green-700 border-green-200';
    if (connectionQuality === 'good') return 'bg-blue-100 text-blue-700 border-blue-200';
    if (connectionQuality === 'poor') return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    return 'bg-red-100 text-red-700 border-red-200';
  };

  const getStatusIcon = () => {
    if (!isOnline) return <WifiOff size={16} />;
    if (isSyncing) return <RefreshCw size={16} className="animate-spin" />;
    if (isHealthy) return <CheckCircle size={16} />;
    return <AlertCircle size={16} />;
  };

  const getStatusText = () => {
    if (!isOnline) return 'Offline - Changes will sync when online';
    if (isSyncing) return 'Syncing...';
    if (pendingOperationsCount > 0) return `${pendingOperationsCount} pending changes`;
    return 'All synced';
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className={`rounded-lg border p-3 shadow-lg ${getConnectionColor()} max-w-xs`}>
        <div className="flex items-center gap-2 mb-2">
          {getStatusIcon()}
          <div className="flex-1">
            <div className="font-semibold text-sm">{getStatusText()}</div>
            {latency >= 0 && isOnline && (
              <div className="text-xs opacity-75">Latency: {latency}ms</div>
            )}
          </div>
        </div>

        {syncError && (
          <div className="bg-red-50 border border-red-200 rounded p-2 mb-2 text-xs">
            <div className="font-semibold text-red-700">Sync Error</div>
            <div className="text-red-600">{syncError}</div>
            <button
              onClick={clearSyncError}
              className="text-red-700 underline text-xs mt-1"
            >
              Dismiss
            </button>
          </div>
        )}

        {isOnline && pendingOperationsCount > 0 && !isSyncing && (
          <button
            onClick={performSync}
            className="w-full bg-blue-500 hover:bg-blue-600 text-white text-xs py-1 rounded transition"
          >
            Sync Now
          </button>
        )}

        {lastSyncTime && !syncError && (
          <div className="text-xs opacity-60 mt-2">
            Last sync: {new Date(lastSyncTime).toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  );
};
