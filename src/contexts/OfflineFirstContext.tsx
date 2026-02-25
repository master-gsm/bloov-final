import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import {
  indexedDBManager,
  enhancedSyncManager,
  healthCheckManager,
  operationExecutor,
  financialStateManager,
  initialSyncManager,
  type HealthCheckResult,
  type SyncResult,
} from '../lib/offline';

export interface OfflineContextType {
  isOnline: boolean;
  isHealthy: boolean;
  connectionQuality: 'excellent' | 'good' | 'poor' | 'offline';
  latency: number;
  isSyncing: boolean;
  pendingOperationsCount: number;
  lastSyncTime: number | null;
  lastBackupTime: number | null;
  syncError: string | null;
  canWrite: boolean;
  performSync: () => Promise<SyncResult>;
  syncNow: () => Promise<void>;
  clearSyncError: () => void;
  addPendingOperation: (table: string, operation: 'insert' | 'update' | 'delete', data: any) => Promise<string>;
  clearAllPending: () => Promise<number>;
  executorReady: boolean;
}

const OfflineFirstContext = createContext<OfflineContextType | undefined>(undefined);

export const OfflineFirstProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isHealthy, setIsHealthy] = useState(false);
  const [connectionQuality, setConnectionQuality] = useState<'excellent' | 'good' | 'poor' | 'offline'>('offline');
  const [latency, setLatency] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingOperationsCount, setPendingOperationsCount] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [lastBackupTime, setLastBackupTime] = useState<number | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [executorReady, setExecutorReady] = useState(false);

  useEffect(() => {
    const initializeOfflineSystem = async () => {
      try {
        await indexedDBManager.init();

        healthCheckManager.startPeriodicChecks(30);

        if (navigator.onLine) {
          const syncResult = await initialSyncManager.performInitialSync();
        }

        await enhancedSyncManager.startAutoSync(30);

        setExecutorReady(true);
      } catch (error) {
        console.error('[OfflineFirstContext] Initialization failed:', error);
        setExecutorReady(true);
      }
    };

    initializeOfflineSystem();

    return () => {
      healthCheckManager.stopPeriodicChecks();
      enhancedSyncManager.stopAutoSync();
    };
  }, []);

  useEffect(() => {
    const unsubscribeHealth = healthCheckManager.onHealthCheckChange((result: HealthCheckResult) => {
      setIsOnline(result.isOnline);
      setIsHealthy(result.isHealthy);
      setConnectionQuality(result.connectionQuality);
      setLatency(result.latency);
    });

    return () => unsubscribeHealth();
  }, []);

  useEffect(() => {
    const unsubscribeSync = enhancedSyncManager.onSyncingStateChange((isSyncing: boolean) => {
      setIsSyncing(isSyncing);
    });

    const unsubscribeError = enhancedSyncManager.onSyncError((error: string) => {
      setSyncError(error);
    });

    return () => {
      unsubscribeSync();
      unsubscribeError();
    };
  }, []);

  useEffect(() => {
    const updatePendingCount = async () => {
      const count = await enhancedSyncManager.getPendingCount();
      setPendingOperationsCount(count);
    };

    updatePendingCount();
    const interval = setInterval(updatePendingCount, 5000);

    return () => clearInterval(interval);
  }, []);

  const canWrite = isOnline || executorReady;

  const performSync = useCallback(async (): Promise<SyncResult> => {
    setSyncError(null);
    try {
      const result = await enhancedSyncManager.syncAll({
        maxRetries: 3,
        retryDelayMs: 1000,
      });

      setLastSyncTime(Date.now());
      setPendingOperationsCount(result.totalQueued - result.totalSynced);

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Sync failed';
      setSyncError(errorMsg);
      throw error;
    }
  }, []);

  const clearSyncError = useCallback(() => setSyncError(null), []);

  const syncNow = useCallback(async () => {
    await performSync();
  }, [performSync]);

  const addPendingOperation = useCallback(async (table: string, operation: 'insert' | 'update' | 'delete', data: any): Promise<string> => {
    return await indexedDBManager.addOperation({ table, operation, data });
  }, []);

  const clearAllPending = useCallback(async (): Promise<number> => {
    return await indexedDBManager.clearQueue();
  }, []);

  const value: OfflineContextType = useMemo(() => ({
    isOnline,
    isHealthy,
    connectionQuality,
    latency,
    isSyncing,
    pendingOperationsCount,
    lastSyncTime,
    lastBackupTime,
    syncError,
    canWrite,
    performSync,
    syncNow,
    clearSyncError,
    addPendingOperation,
    clearAllPending,
    executorReady,
  }), [isOnline, isHealthy, connectionQuality, latency, isSyncing, pendingOperationsCount, lastSyncTime, lastBackupTime, syncError, canWrite, executorReady, performSync, syncNow, clearSyncError, addPendingOperation, clearAllPending]);

  return (
    <OfflineFirstContext.Provider value={value}>
      {children}
    </OfflineFirstContext.Provider>
  );
};

export const useOfflineFirst = (): OfflineContextType => {
  const context = useContext(OfflineFirstContext);
  if (!context) {
    throw new Error('useOfflineFirst must be used within OfflineFirstProvider');
  }
  return context;
};

// Alias for backward compatibility with old OfflineContext
export const useOffline = useOfflineFirst;

export const useOfflineOperations = () => {
  return {
    executeInsert: operationExecutor.executeInsert.bind(operationExecutor),
    executeUpdate: operationExecutor.executeUpdate.bind(operationExecutor),
    executeDelete: operationExecutor.executeDelete.bind(operationExecutor),
    queryWithCache: operationExecutor.queryWithCache.bind(operationExecutor),
  };
};

export const useFinancialState = () => {
  return {
    canCalculateCommission: financialStateManager.canCalculateCommission.bind(financialStateManager),
    canRecordCashMovement: financialStateManager.canRecordCashMovement.bind(financialStateManager),
    registerPendingCommission: financialStateManager.registerPendingCommission.bind(financialStateManager),
    markCommissionCalculated: financialStateManager.markCommissionCalculated.bind(financialStateManager),
    markCommissionSynced: financialStateManager.markCommissionSynced.bind(financialStateManager),
    registerPendingCashMovement: financialStateManager.registerPendingCashMovement.bind(financialStateManager),
    markCashMovementRecorded: financialStateManager.markCashMovementRecorded.bind(financialStateManager),
    markCashMovementSynced: financialStateManager.markCashMovementSynced.bind(financialStateManager),
    getPendingFinancialItems: financialStateManager.getPendingFinancialItems.bind(financialStateManager),
    lockFinancialPeriod: financialStateManager.lockFinancialPeriod.bind(financialStateManager),
    unlockFinancialPeriod: financialStateManager.unlockFinancialPeriod.bind(financialStateManager),
    isFinancialPeriodLocked: financialStateManager.isFinancialPeriodLocked.bind(financialStateManager),
  };
};
