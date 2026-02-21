import { supabase } from './supabase';
import { offlineStorage, PendingOperation } from './offlineStorage';

export interface SyncStatus {
  isSyncing: boolean;
  lastSyncTime: number | null;
  lastBackupTime: number | null;
  pendingCount: number;
  error: string | null;
}

class SyncManager {
  private isSyncing = false;
  private syncInterval: NodeJS.Timeout | null = null;
  private lastSyncTime: number | null = null;
  private lastBackupTime: number | null = null;
  private syncCallbacks: Array<(status: SyncStatus) => void> = [];

  constructor() {
    const savedBackupTime = localStorage.getItem('bloov_last_cloud_backup');
    if (savedBackupTime) {
      this.lastBackupTime = parseInt(savedBackupTime);
    }
  }

  onSyncStatusChange(callback: (status: SyncStatus) => void): () => void {
    this.syncCallbacks.push(callback);
    return () => {
      this.syncCallbacks = this.syncCallbacks.filter(cb => cb !== callback);
    };
  }

  private notifySyncStatus(error: string | null = null): void {
    const status: SyncStatus = {
      isSyncing: this.isSyncing,
      lastSyncTime: this.lastSyncTime,
      lastBackupTime: this.lastBackupTime,
      pendingCount: 0,
      error,
    };

    offlineStorage.getPendingOperationsCount().then(count => {
      status.pendingCount = count;
      this.syncCallbacks.forEach(callback => callback(status));
    });
  }

  private updateBackupTime(): void {
    this.lastBackupTime = Date.now();
    localStorage.setItem('bloov_last_cloud_backup', this.lastBackupTime.toString());
    localStorage.setItem('bloov_latest_backup_time', new Date(this.lastBackupTime).toISOString());
  }

  async startAutoSync(intervalMinutes: number = 5): Promise<void> {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.syncInterval = setInterval(() => {
      if (navigator.onLine) {
        this.syncPendingOperations();
      }
    }, intervalMinutes * 60 * 1000);

    if (navigator.onLine) {
      await this.syncPendingOperations();
    }
  }

  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  async syncPendingOperations(): Promise<{ success: number; failed: number }> {
    if (this.isSyncing) {
      return { success: 0, failed: 0 };
    }

    if (!navigator.onLine) {
      this.notifySyncStatus('Offline - cannot sync');
      return { success: 0, failed: 0 };
    }

    this.isSyncing = true;
    this.notifySyncStatus();

    let successCount = 0;
    let failedCount = 0;

    try {
      const operations = await offlineStorage.getPendingOperations();

      if (operations.length === 0) {
        this.lastSyncTime = Date.now();
        this.updateBackupTime();
        return { success: 0, failed: 0 };
      }

      operations.sort((a, b) => a.timestamp - b.timestamp);

      for (const operation of operations) {
        try {
          await this.executeOperationWithConflictResolution(operation);
          await offlineStorage.removePendingOperation(operation.id);
          successCount++;
        } catch (error) {
          console.error(`Failed to sync operation ${operation.id}:`, error);

          if (operation.retries >= 3) {
            console.error(`Operation ${operation.id} failed after 3 retries, removing...`);
            await offlineStorage.removePendingOperation(operation.id);
          } else {
            await offlineStorage.incrementRetries(operation.id);
          }
          failedCount++;
        }
      }

      this.lastSyncTime = Date.now();

      if (successCount > 0) {
        this.updateBackupTime();
      }

      this.notifySyncStatus();
    } catch (error) {
      console.error('Error syncing pending operations:', error);
      this.notifySyncStatus((error as Error).message);
    } finally {
      this.isSyncing = false;
      this.notifySyncStatus();
    }

    return { success: successCount, failed: failedCount };
  }

  private async executeOperationWithConflictResolution(operation: PendingOperation): Promise<void> {
    const { table, operation: op, data } = operation;

    switch (op) {
      case 'insert':
        const { error: insertError } = await supabase.from(table as any).insert(data);
        if (insertError) {
          if (insertError.code === '23505') {
            console.warn(`Record already exists, attempting update instead for table ${table}`);
            const { id, ...updateData } = data;
            const { error: updateError } = await supabase.from(table as any).update(updateData).eq('id', id);
            if (updateError) throw updateError;
          } else {
            throw insertError;
          }
        }
        break;

      case 'update':
        const { id, ...updateData } = data;

        const { data: existingRecord, error: fetchError } = await supabase
          .from(table as any)
          .select('updated_at')
          .eq('id', id)
          .maybeSingle();

        if (fetchError) throw fetchError;

        if (!existingRecord) {
          console.warn(`Record not found for update in table ${table}, attempting insert instead`);
          const { error: insertError } = await supabase.from(table as any).insert(data);
          if (insertError) throw insertError;
        } else {
          const localVersion = data.updated_at ? new Date(data.updated_at).getTime() : 0;
          const remoteVersion = (existingRecord as any).updated_at ? new Date((existingRecord as any).updated_at).getTime() : 0;

          if (remoteVersion > localVersion) {
            console.warn(`Conflict detected: Remote version is newer for ${table}/${id}. Applying local changes anyway.`);
          }

          const { error: updateError } = await supabase.from(table as any).update(updateData).eq('id', id);
          if (updateError) throw updateError;
        }
        break;

      case 'delete':
        const IMMUTABLE_TABLES = [
          'sales', 'sale_items', 'purchases', 'purchase_items',
          'expenses', 'inventory_movements', 'operating_expenses',
          'cash_transactions', 'cash_shifts', 'partner_contributions',
          'partner_settlements', 'setup_expenses',
        ];
        if (IMMUTABLE_TABLES.includes(table)) {
          console.warn(`Skipping delete on immutable table ${table}/${data.id} - use void/reversal instead`);
        } else {
          const { error: deleteError } = await supabase.from(table as any).delete().eq('id', data.id);
          if (deleteError && deleteError.code !== 'PGRST116') {
            throw deleteError;
          }
        }
        break;

      default:
        throw new Error(`Unknown operation: ${op}`);
    }
  }

  async cacheTableData(table: string): Promise<void> {
    if (!navigator.onLine) {
      return;
    }

    try {
      const { data, error } = await supabase.from(table as any).select('*');
      if (error) throw error;

      if (data) {
        await offlineStorage.cacheData(table, data);
      }
    } catch (error) {
      console.error(`Error caching data for table ${table}:`, error);
    }
  }

  async getCachedOrFetch(table: string, fetchQuery?: () => Promise<any>): Promise<any[]> {
    if (navigator.onLine && fetchQuery) {
      try {
        const result = await fetchQuery();
        if (result && !result.error) {
          await offlineStorage.cacheData(table, result.data || []);
          return result.data || [];
        }
      } catch (error) {
        console.error(`Error fetching ${table}, falling back to cache:`, error);
      }
    }

    return await offlineStorage.getCachedData(table);
  }

  async getPendingCount(): Promise<number> {
    return await offlineStorage.getPendingOperationsCount();
  }

  getIsSyncing(): boolean {
    return this.isSyncing;
  }

  getLastSyncTime(): number | null {
    return this.lastSyncTime;
  }

  getLastBackupTime(): number | null {
    return this.lastBackupTime;
  }
}

export const syncManager = new SyncManager();
