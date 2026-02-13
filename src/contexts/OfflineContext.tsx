import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { syncManager } from '../lib/syncManager';
import { offlineStorage } from '../lib/offlineStorage';

interface OfflineContextType {
  isOnline: boolean;
  isSyncing: boolean;
  pendingOperationsCount: number;
  syncNow: () => Promise<void>;
  addPendingOperation: (table: string, operation: 'insert' | 'update' | 'delete', data: any) => Promise<string>;
}

const OfflineContext = createContext<OfflineContextType | undefined>(undefined);

export function OfflineProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingOperationsCount, setPendingOperationsCount] = useState(0);

  useEffect(() => {
    offlineStorage.init().catch(console.error);

    const updateOnlineStatus = () => {
      const online = navigator.onLine;
      setIsOnline(online);

      if (online) {
        setTimeout(() => {
          syncManager.syncPendingOperations().catch(console.error);
        }, 1000);
      }
    };

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    const syncInterval = setInterval(async () => {
      const count = await syncManager.getPendingCount();
      setPendingOperationsCount(count);
      setIsSyncing(syncManager.getIsSyncing());
    }, 2000);

    const savedSyncInterval = localStorage.getItem('autoSyncInterval');
    const intervalMinutes = savedSyncInterval ? parseInt(savedSyncInterval) : 10;
    syncManager.startAutoSync(intervalMinutes);

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
      clearInterval(syncInterval);
      syncManager.stopAutoSync();
    };
  }, []);

  const syncNow = async () => {
    setIsSyncing(true);
    try {
      await syncManager.syncPendingOperations();
      const count = await syncManager.getPendingCount();
      setPendingOperationsCount(count);
    } finally {
      setIsSyncing(false);
    }
  };

  const addPendingOperation = async (
    table: string,
    operation: 'insert' | 'update' | 'delete',
    data: any
  ): Promise<string> => {
    const id = await offlineStorage.addPendingOperation({ table, operation, data });
    const count = await syncManager.getPendingCount();
    setPendingOperationsCount(count);
    return id;
  };

  return (
    <OfflineContext.Provider
      value={{
        isOnline,
        isSyncing,
        pendingOperationsCount,
        syncNow,
        addPendingOperation,
      }}
    >
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  const context = useContext(OfflineContext);
  if (context === undefined) {
    throw new Error('useOffline must be used within an OfflineProvider');
  }
  return context;
}
