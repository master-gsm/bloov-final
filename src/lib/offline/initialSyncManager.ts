import { supabase } from '../supabase';
import { indexedDBManager } from './indexedDBManager';

export interface SyncProgress {
  table: string;
  status: 'pending' | 'syncing' | 'completed' | 'error';
  recordsCount: number;
  error?: string;
}

export interface InitialSyncStatus {
  isInitialized: boolean;
  isSyncing: boolean;
  lastInitialSync: number | null;
  progress: SyncProgress[];
  completedTables: number;
  totalTables: number;
}

const TABLES_TO_SYNC = [
  'products',
  'customers',
  'employees',
  'inventory',
  'branches',
  'suppliers',
  'partners',
];

class InitialSyncManager {
  private isInitialized = false;
  private isSyncing = false;
  private lastInitialSync: number | null = null;
  private statusListeners: Set<(status: InitialSyncStatus) => void> = new Set();

  constructor() {
    const savedTime = localStorage.getItem('bloov_initial_sync_time');
    if (savedTime) {
      this.isInitialized = true;
      this.lastInitialSync = parseInt(savedTime);
    }
  }

  async performInitialSync(): Promise<boolean> {
    if (this.isSyncing) {
      console.warn('[InitialSyncManager] Sync already in progress');
      return false;
    }

    if (!navigator.onLine) {
      console.warn('[InitialSyncManager] Cannot sync - offline');
      return false;
    }

    if (this.isInitialized && this.lastInitialSync) {
      const hoursSinceSync = (Date.now() - this.lastInitialSync) / (1000 * 60 * 60);
      if (hoursSinceSync < 24) {
        console.log('[InitialSyncManager] Already synced recently, skipping');
        return true;
      }
    }

    this.isSyncing = true;
    this.notifyStatus();

    try {
      console.log('[InitialSyncManager] Starting initial sync for', TABLES_TO_SYNC.length, 'tables');

      for (const table of TABLES_TO_SYNC) {
        await this.syncTable(table);
      }

      this.isInitialized = true;
      this.lastInitialSync = Date.now();
      localStorage.setItem('bloov_initial_sync_time', this.lastInitialSync.toString());

      console.log('[InitialSyncManager] Initial sync completed successfully');
      this.notifyStatus();
      return true;
    } catch (error) {
      console.error('[InitialSyncManager] Initial sync failed:', error);
      this.notifyStatus();
      return false;
    } finally {
      this.isSyncing = false;
      this.notifyStatus();
    }
  }

  private async syncTable(table: string): Promise<void> {
    try {
      console.log(`[InitialSyncManager] Syncing ${table}...`);

      const { data, error } = await supabase
        .from(table as any)
        .select('*')
        .limit(10000);

      if (error) throw error;

      const records = data || [];
      await indexedDBManager.cacheData(table, records);

      console.log(`[InitialSyncManager] Synced ${table}: ${records.length} records`);
    } catch (error) {
      console.error(`[InitialSyncManager] Failed to sync ${table}:`, error);
      throw error;
    }
  }

  async cacheData(table: string, records: any[]): Promise<void> {
    await indexedDBManager.cacheData(table, records);
  }

  isInitialSyncDone(): boolean {
    return this.isInitialized;
  }

  getIsSyncing(): boolean {
    return this.isSyncing;
  }

  getStatus(): InitialSyncStatus {
    const progress = TABLES_TO_SYNC.map(table => ({
      table,
      status: 'pending' as const,
      recordsCount: 0,
    }));

    return {
      isInitialized: this.isInitialized,
      isSyncing: this.isSyncing,
      lastInitialSync: this.lastInitialSync,
      progress,
      completedTables: this.isInitialized ? TABLES_TO_SYNC.length : 0,
      totalTables: TABLES_TO_SYNC.length,
    };
  }

  onStatusChange(callback: (status: InitialSyncStatus) => void): () => void {
    this.statusListeners.add(callback);

    callback(this.getStatus());

    return () => {
      this.statusListeners.delete(callback);
    };
  }

  private notifyStatus(): void {
    const status = this.getStatus();
    this.statusListeners.forEach(listener => {
      try {
        listener(status);
      } catch (error) {
        console.error('[InitialSyncManager] Error notifying listener:', error);
      }
    });
  }

  async getCachedData(table: string): Promise<any[]> {
    return await indexedDBManager.getCachedRecords(table);
  }

  async getCachedRecord(table: string, recordId: string): Promise<any | null> {
    return await indexedDBManager.getCachedRecord(table, recordId);
  }
}

export const initialSyncManager = new InitialSyncManager();
