import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { enhancedSyncManager } from '../lib/offline/enhancedSyncManager';
import { indexedDBManager } from '../lib/offline/indexedDBManager';

interface OfflineContextType {
  isOnline: boolean;
  isSyncing: boolean;
  pendingOperationsCount: number;
  lastSyncTime: number | null;
  lastBackupTime: number | null;
  syncError: string | null;
  syncNow: () => Promise<void>;
  addPendingOperation: (table: string, operation: 'insert' | 'update' | 'delete', data: any) => Promise<string>;
  clearAllPending: () => Promise<number>;
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
    indexedDBManager.init().catch(console.error);

    const updateOnlineStatus = async () => {
      const online = navigator.onLine;
      const previouslyOnline = isOnline;

      console.log(`[OfflineContext] Online status: ${online} (was: ${previouslyOnline})`);
      setIsOnline(online);

      if (online && !previouslyOnline) {
        console.warn('============================================================');
        console.warn('[OfflineContext] ONLINE EVENT DETECTED!');
        console.warn('============================================================');
        setWasOffline(false);
        setSyncError(null);

        const queueSize = await indexedDBManager.getQueueSize();
        console.log(`[OfflineContext] Queue size before sync: ${queueSize} operations`);

        if (queueSize > 0) {
          console.warn('[OfflineContext] Queue is NOT empty! Starting immediate sync...');

          const queueOps = await indexedDBManager.getQueuedOperations('pending');
          console.log(`[OfflineContext] Queue contents:`, queueOps.map((op: any) => ({ id: op.operationId, table: op.table, operation: op.operation })));

          try {
            console.log('[OfflineContext] Calling syncAll() with await...');
            const result = await enhancedSyncManager.syncAll({
              maxRetries: 3,
              shouldStopOnFirstError: false,
            });

            console.warn('✅ [OfflineContext] SYNC COMPLETE!');
            console.log(`[OfflineContext] Results: ${result.totalSynced}/${result.totalQueued} synced`);
            console.log(`[OfflineContext] Details - Synced: ${result.totalSynced}, Failed: ${result.totalFailed}, Duration: ${result.duration}ms`);

            if (result.totalFailed > 0) {
              console.error(`[OfflineContext] ❌ Sync errors:`, result.errors);
              setSyncError(`${result.totalFailed} operations failed to sync`);
            } else {
              console.log('[OfflineContext] ✅ All operations synced successfully');
            }

            const newQueueSize = await indexedDBManager.getQueueSize();
            console.log(`[OfflineContext] Queue size after sync: ${newQueueSize} operations`);
            setPendingOperationsCount(newQueueSize);
            console.warn('============================================================');
          } catch (error) {
            console.error('[OfflineContext] ❌ SYNC FAILED:', error);
            setSyncError((error as Error).message);
            console.warn('============================================================');
          }
        } else {
          console.warn('[OfflineContext] Queue is EMPTY, nothing to sync');
          setPendingOperationsCount(0);
          console.warn('============================================================');
        }
      } else if (!online) {
        console.warn('[OfflineContext] OFFLINE DETECTED');
        setWasOffline(true);
        setSyncError('No internet connection');
      }
    };

    const unsubscribeSync = enhancedSyncManager.onSyncingStateChange((isSyncing) => {
      console.log(`[OfflineContext] Sync state changed: ${isSyncing ? 'started' : 'stopped'}`);
      setIsSyncing(isSyncing);
    });

    const unsubscribeError = enhancedSyncManager.onSyncError((error) => {
      console.error(`[OfflineContext] Sync error: ${error}`);
      setSyncError(error);
    });

    const updateStatusInterval = setInterval(async () => {
      const count = await indexedDBManager.getQueueSize();
      setPendingOperationsCount(count);
      setIsSyncing(enhancedSyncManager.getIsSyncing());
    }, 3000);

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    const savedSyncInterval = localStorage.getItem('autoSyncInterval');
    const intervalSeconds = savedSyncInterval ? parseInt(savedSyncInterval) : 30;
    console.log(`[OfflineContext] Starting auto-sync with ${intervalSeconds}s interval`);
    enhancedSyncManager.startAutoSync(intervalSeconds);

    return () => {
      console.log('[OfflineContext] Cleaning up...');
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
      unsubscribeSync();
      unsubscribeError();
      clearInterval(updateStatusInterval);
      enhancedSyncManager.stopAutoSync();
    };
  }, []);

  const syncNow = async () => {
    if (!navigator.onLine) {
      console.warn('[OfflineContext] Cannot sync - offline');
      setSyncError('Cannot sync while offline');
      return;
    }

    console.log('[OfflineContext] Manual sync triggered');
    setIsSyncing(true);
    setSyncError(null);

    try {
      const result = await enhancedSyncManager.syncAll({
        maxRetries: 3,
        shouldStopOnFirstError: false,
      });

      console.log(`[OfflineContext] Manual sync result: ${result.totalSynced}/${result.totalQueued} synced`);

      const count = await indexedDBManager.getQueueSize();
      setPendingOperationsCount(count);

      if (result.totalFailed > 0) {
        console.error('[OfflineContext] Manual sync had failures:', result.errors);
        setSyncError(`${result.totalFailed} operations failed to sync`);
      } else {
        console.log('[OfflineContext] Manual sync completed successfully');
        setSyncError(null);
      }
    } catch (error) {
      console.error('[OfflineContext] Manual sync error:', error);
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
    console.log(`[OfflineContext] Adding operation: ${operation} on ${table}`);

    const operationId = await indexedDBManager.addOperationToQueue({
      operationId: crypto.randomUUID(),
      table,
      operation: operation as 'insert' | 'update' | 'delete',
      data,
      localVersion: Date.now(),
      remoteVersion: null,
      status: 'pending',
      retries: 0,
      maxRetries: 3,
      error: null,
      syncedAt: null,
      serverResponse: null,
    });

    const count = await indexedDBManager.getQueueSize();
    console.log(`[OfflineContext] Operation added. Queue size: ${count}`);
    setPendingOperationsCount(count);

    if (navigator.onLine && count > 0) {
      console.warn('[OfflineContext] ⚡ Online detected! Triggering sync in 500ms...');
      setTimeout(async () => {
        console.log('[OfflineContext] Executing queued sync with await...');
        try {
          const result = await enhancedSyncManager.syncAll({ maxRetries: 3 });
          console.log(`[OfflineContext] ✅ Queued sync completed: ${result.totalSynced}/${result.totalQueued} synced`);
        } catch (error) {
          console.error('[OfflineContext] ❌ Queued sync failed:', error);
        }
      }, 500);
    }

    return operationId;
  };

  const clearAllPending = async (): Promise<number> => {
    const allOps = await indexedDBManager.getQueuedOperations();
    for (const op of allOps) {
      await indexedDBManager.removeQueueItem(op.id);
    }
    setPendingOperationsCount(0);
    return allOps.length;
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
        clearAllPending,
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
