import { supabase } from '../supabase';
import { indexedDBManager, OperationQueueItem } from './indexedDBManager';
import { healthCheckManager } from './healthCheck';

export interface SyncOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  shouldStopOnFirstError?: boolean;
}

export interface SyncResult {
  totalQueued: number;
  totalSynced: number;
  totalFailed: number;
  errors: Array<{ operationId: string; error: string }>;
  startTime: number;
  endTime: number;
  duration: number;
}

class EnhancedSyncManager {
  private isSyncing = false;
  private syncInterval: NodeJS.Timeout | null = null;
  private syncListeners: Set<(isSyncing: boolean) => void> = new Set();
  private errorListeners: Set<(error: string) => void> = new Set();

  async startAutoSync(intervalSeconds: number = 30, options?: SyncOptions): Promise<void> {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    if (navigator.onLine) {
      await this.syncAll(options);
    }

    this.syncInterval = setInterval(async () => {
      if (navigator.onLine && !this.isSyncing) {
        await this.syncAll(options);
      }
    }, intervalSeconds * 1000);

    console.log('[EnhancedSyncManager] Auto-sync started with', intervalSeconds, 'second interval');
  }

  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    console.log('[EnhancedSyncManager] Auto-sync stopped');
  }

  async syncAll(options: SyncOptions = {}): Promise<SyncResult> {
    if (this.isSyncing) {
      console.warn('[EnhancedSyncManager] Sync already in progress');
      return {
        totalQueued: 0,
        totalSynced: 0,
        totalFailed: 0,
        errors: [],
        startTime: Date.now(),
        endTime: Date.now(),
        duration: 0,
      };
    }

    if (!navigator.onLine) {
      this.notifyError('Cannot sync - offline');
      return {
        totalQueued: 0,
        totalSynced: 0,
        totalFailed: 0,
        errors: [],
        startTime: Date.now(),
        endTime: Date.now(),
        duration: 0,
      };
    }

    const startTime = Date.now();
    this.isSyncing = true;
    this.notifySyncingStateChange(true);

    const result: SyncResult = {
      totalQueued: 0,
      totalSynced: 0,
      totalFailed: 0,
      errors: [],
      startTime,
      endTime: 0,
      duration: 0,
    };

    try {
      const pendingOps = await indexedDBManager.getQueuedOperations('pending');
      result.totalQueued = pendingOps.length;

      if (pendingOps.length === 0) {
        console.log('[EnhancedSyncManager] No pending operations to sync');
        await indexedDBManager.updateSyncState({
          lastSuccessfulSync: Date.now(),
          totalSynced: result.totalSynced,
        });
        return result;
      }

      console.log('[EnhancedSyncManager] Starting sync of', pendingOps.length, 'operations');

      for (const operation of pendingOps) {
        try {
          await this.syncOperation(operation, options);
          result.totalSynced++;
        } catch (error) {
          result.totalFailed++;
          result.errors.push({
            operationId: operation.operationId,
            error: error instanceof Error ? error.message : String(error),
          });

          if (options.shouldStopOnFirstError) {
            break;
          }
        }
      }

      await indexedDBManager.updateSyncState({
        lastSuccessfulSync: Date.now(),
        totalSynced: result.totalSynced,
        totalFailed: result.totalFailed,
        isSyncing: false,
      });

      console.log('[EnhancedSyncManager] Sync complete:', result);
    } catch (error) {
      this.notifyError(error instanceof Error ? error.message : 'Unknown sync error');
      console.error('[EnhancedSyncManager] Sync failed:', error);
    } finally {
      result.endTime = Date.now();
      result.duration = result.endTime - startTime;
      this.isSyncing = false;
      this.notifySyncingStateChange(false);
    }

    return result;
  }

  private async syncOperation(operation: OperationQueueItem, options: SyncOptions = {}): Promise<void> {
    const maxRetries = options.maxRetries ?? 3;

    try {
      await indexedDBManager.updateQueueItemStatus(operation.id, 'syncing');

      const { table, operation: op, data } = operation;

      switch (op) {
        case 'insert':
          await this.handleInsert(table, data);
          break;
        case 'update':
          await this.handleUpdate(table, data);
          break;
        case 'delete':
          await this.handleDelete(table, data);
          break;
      }

      await indexedDBManager.updateQueueItemStatus(operation.id, 'succeeded', {
        syncedAt: Date.now(),
        remoteVersion: Date.now(),
      });

      console.log(`[EnhancedSyncManager] Successfully synced ${table}/${data.id}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (operation.retries >= (options.maxRetries ?? 3)) {
        console.error(`[EnhancedSyncManager] Operation ${operation.id} failed after ${operation.retries} retries`);

        await indexedDBManager.updateQueueItemStatus(operation.id, 'failed', {
          error: errorMessage,
          retries: operation.retries + 1,
        });

        throw new Error(`Failed after ${operation.retries} retries: ${errorMessage}`);
      } else {
        await indexedDBManager.updateQueueItemStatus(operation.id, 'pending', {
          error: errorMessage,
          retries: operation.retries + 1,
        });

        if (options.retryDelayMs) {
          await new Promise(resolve => setTimeout(resolve, options.retryDelayMs));
        }

        throw error;
      }
    }
  }

  private async handleInsert(table: string, data: any): Promise<void> {
    const IMMUTABLE_TABLES = [
      'sales', 'sale_items', 'purchases', 'purchase_items',
      'expenses', 'inventory_movements', 'operating_expenses',
      'cash_registers', 'register_transactions', 'partner_contributions',
      'partner_settlements', 'setup_expenses', 'employee_commissions',
    ];

    if (IMMUTABLE_TABLES.includes(table)) {
      const { error } = await supabase.from(table as any).insert(data);

      if (error) {
        if (error.code === '23505') {
          console.warn(`Record already exists in ${table}, attempting update`);
          const { id, ...updateData } = data;
          const { error: updateError } = await supabase
            .from(table as any)
            .update(updateData)
            .eq('id', id);
          if (updateError) throw updateError;
        } else {
          throw error;
        }
      }
    } else {
      const { error } = await supabase.from(table as any).insert(data);
      if (error) throw error;
    }
  }

  private async handleUpdate(table: string, data: any): Promise<void> {
    const { id, ...updateData } = data;

    const { data: existing, error: fetchError } = await supabase
      .from(table as any)
      .select('id, updated_at')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) throw fetchError;

    if (!existing) {
      console.warn(`Record not found for update in ${table}, attempting insert`);
      const { error: insertError } = await supabase.from(table as any).insert(data);
      if (insertError) throw insertError;
    } else {
      const localVersion = data.updated_at ? new Date(data.updated_at).getTime() : 0;
      const remoteVersion = existing.updated_at ? new Date(existing.updated_at).getTime() : 0;

      if (remoteVersion > localVersion) {
        console.log(`[EnhancedSyncManager] Remote version newer for ${table}/${id}. Local version wins (offline-first policy)`);
      }

      const { error: updateError } = await supabase
        .from(table as any)
        .update(updateData)
        .eq('id', id);

      if (updateError) throw updateError;
    }
  }

  private async handleDelete(table: string, data: any): Promise<void> {
    const IMMUTABLE_TABLES = [
      'sales', 'sale_items', 'purchases', 'purchase_items',
      'expenses', 'inventory_movements', 'operating_expenses',
      'cash_registers', 'register_transactions', 'partner_contributions',
      'partner_settlements', 'setup_expenses', 'employee_commissions',
    ];

    if (IMMUTABLE_TABLES.includes(table)) {
      console.warn(`Cannot delete from immutable table ${table}/${data.id}. Use void/reversal instead.`);
      return;
    }

    const { error } = await supabase.from(table as any).delete().eq('id', data.id);
    if (error && error.code !== 'PGRST116') {
      throw error;
    }
  }

  onSyncingStateChange(callback: (isSyncing: boolean) => void): () => void {
    this.syncListeners.add(callback);
    return () => {
      this.syncListeners.delete(callback);
    };
  }

  onSyncError(callback: (error: string) => void): () => void {
    this.errorListeners.add(callback);
    return () => {
      this.errorListeners.delete(callback);
    };
  }

  private notifySyncingStateChange(isSyncing: boolean): void {
    this.syncListeners.forEach(listener => {
      try {
        listener(isSyncing);
      } catch (error) {
        console.error('[EnhancedSyncManager] Error notifying sync state listener:', error);
      }
    });
  }

  private notifyError(error: string): void {
    this.errorListeners.forEach(listener => {
      try {
        listener(error);
      } catch (err) {
        console.error('[EnhancedSyncManager] Error notifying error listener:', err);
      }
    });
  }

  getIsSyncing(): boolean {
    return this.isSyncing;
  }

  async getPendingCount(): Promise<number> {
    return await indexedDBManager.getQueueSize();
  }
}

export const enhancedSyncManager = new EnhancedSyncManager();
