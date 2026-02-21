import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  indexedDBManager,
  enhancedSyncManager,
  healthCheckManager,
  operationExecutor,
  financialStateManager,
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
  syncError: string | null;
  canWrite: boolean;
  performSync: () => Promise<SyncResult>;
  clearSyncError: () => void;
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
  const [syncError, setSyncError] = useState<string | null>(null);
  const [executorReady, setExecutorReady] = useState(false);

  useEffect(() => {
    const initializeOfflineSystem = async () => {
      try {
        console.log('[OfflineFirstContext] Initializing offline system...');

        await indexedDBManager.init();
        console.log('[OfflineFirstContext] IndexedDB initialized');

        healthCheckManager.startPeriodicChecks(30);
        console.log('[OfflineFirstContext] Health checks started');

        await enhancedSyncManager.startAutoSync(30);
        console.log('[OfflineFirstContext] Auto-sync started');

        setExecutorReady(true);
        console.log('[OfflineFirstContext] Offline system ready');
      } catch (error) {
        console.error('[OfflineFirstContext] Initialization failed:', error);
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

  const performSync = async (): Promise<SyncResult> => {
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
  };

  const value: OfflineContextType = {
    isOnline,
    isHealthy,
    connectionQuality,
    latency,
    isSyncing,
    pendingOperationsCount,
    lastSyncTime,
    syncError,
    canWrite,
    performSync,
    clearSyncError: () => setSyncError(null),
    executorReady,
  };

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
