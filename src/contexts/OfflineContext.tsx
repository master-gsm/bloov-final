import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { syncManager, SyncStatus } from '../lib/syncManager';
import { offlineStorage } from '../lib/offlineStorage';

interface OfflineContextType {
  isOnline: boolean;
  isSyncing: boolean;
  pendingOperationsCount: number;
  lastSyncTime: number | null;
  lastBackupTime: number | null;
  syncError: string | null;
  syncNow: () => Promise<void>;
  addPendingOperation: (table: string, operation: 'insert' | 'update' | 'delete', data: any) => Promise<string>;
}

const OfflineContext = createContext<OfflineContextType | undefined>(undefined);

export function OfflineProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingOperationsCount, setPendingOperationsCount] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [lastBackupTime, setLastBackupTime] = useState<number | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    offlineStorage.init().catch(console.error);

    const updateOnlineStatus = async () => {
      const online = navigator.onLine;
      const previouslyOnline = isOnline;

      setIsOnline(online);

      if (online && !previouslyOnline) {
        console.log('Connection restored, triggering sync...');
        setWasOffline(false);

        setTimeout(async () => {
          try {
            const result = await syncManager.syncPendingOperations();
            if (result.success > 0) {
              console.log(`Successfully synced ${result.success} operations`);
            }
            if (result.failed > 0) {
              console.warn(`Failed to sync ${result.failed} operations`);
            }
          } catch (error) {
            console.error('Auto-sync failed:', error);
          }
        }, 300);
      } else if (!online) {
        setWasOffline(true);
        setSyncError('No internet connection');
      }
    };

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    const unsubscribe = syncManager.onSyncStatusChange((status: SyncStatus) => {
      setIsSyncing(status.isSyncing);
      setPendingOperationsCount(status.pendingCount);
      setLastSyncTime(status.lastSyncTime);
      setLastBackupTime(status.lastBackupTime);
      setSyncError(status.error);
    });

    const statusInterval = setInterval(async () => {
      const count = await syncManager.getPendingCount();
      setPendingOperationsCount(count);
      setIsSyncing(syncManager.getIsSyncing());
      setLastSyncTime(syncManager.getLastSyncTime());
      setLastBackupTime(syncManager.getLastBackupTime());
    }, 3000);

    const savedSyncInterval = localStorage.getItem('autoSyncInterval');
    const intervalMinutes = savedSyncInterval ? parseInt(savedSyncInterval) : 10;
    syncManager.startAutoSync(intervalMinutes);

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
      unsubscribe();
      clearInterval(statusInterval);
      syncManager.stopAutoSync();
    };
  }, []);

  const syncNow = async () => {
    if (!navigator.onLine) {
      setSyncError('Cannot sync while offline');
      return;
    }

    setIsSyncing(true);
    setSyncError(null);

    try {
      const result = await syncManager.syncPendingOperations();
      const count = await syncManager.getPendingCount();
      setPendingOperationsCount(count);

      if (result.failed > 0) {
        setSyncError(`${result.failed} operations failed to sync`);
      }
    } catch (error) {
      setSyncError((error as Error).message);
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

    if (navigator.onLine && count > 0) {
      setTimeout(() => {
        syncManager.syncPendingOperations().catch(console.error);
      }, 500);
    }

    return id;
  };

  return (
    <OfflineContext.Provider
      value={{
        isOnline,
        isSyncing,
        pendingOperationsCount,
        lastSyncTime,
        lastBackupTime,
        syncError,
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
