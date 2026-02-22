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

      console.warn('╔════════════════════════════════════════════════════════════╗');
      console.warn('[EnhancedSyncManager] SYNC ENGINE STARTED');
      console.warn(`[EnhancedSyncManager] Processing ${pendingOps.length} pending operations`);

      if (pendingOps.length > 0) {
        console.log('[EnhancedSyncManager] Queue contents:');
        pendingOps.forEach((op: any, idx: number) => {
          console.log(`  [${idx + 1}/${pendingOps.length}] ${op.table}/${op.operation} - ID: ${op.operationId}`);
        });
      }

      if (pendingOps.length === 0) {
        console.log('[EnhancedSyncManager] No pending operations to sync');
        await indexedDBManager.updateSyncState({
          lastSuccessfulSync: Date.now(),
          totalSynced: result.totalSynced,
        });
        console.warn('╚════════════════════════════════════════════════════════════╝');
        return result;
      }

      for (const operation of pendingOps) {
        try {
          console.log(`[EnhancedSyncManager] ⏳ Syncing: ${operation.table}/${operation.operation} (${operation.operationId})`);
          await this.syncOperation(operation, options);
          console.log(`[EnhancedSyncManager] ✅ Success: ${operation.table}/${operation.operation}`);
          result.totalSynced++;
        } catch (error) {
          result.totalFailed++;
          const errMsg = error instanceof Error ? error.message : String(error);
          console.error(`[EnhancedSyncManager] ❌ Failed: ${operation.table}/${operation.operation} - ${errMsg}`);
          result.errors.push({
            operationId: operation.operationId,
            error: errMsg,
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

      console.warn(`[EnhancedSyncManager] SYNC RESULTS: ${result.totalSynced}✅ / ${result.totalFailed}❌ / Duration: ${result.duration}ms`);
      console.log('[EnhancedSyncManager] Full result:', result);
    } catch (error) {
      this.notifyError(error instanceof Error ? error.message : 'Unknown sync error');
      console.error('[EnhancedSyncManager] ❌ SYNC ENGINE FAILED:', error);
    } finally {
      result.endTime = Date.now();
      result.duration = result.endTime - startTime;
      this.isSyncing = false;
      this.notifySyncingStateChange(false);
      console.warn('╚════════════════════════════════════════════════════════════╝');
    }

    return result;
  }

  private async syncOperation(operation: OperationQueueItem, options: SyncOptions = {}): Promise<void> {
    const maxRetries = options.maxRetries ?? 3;

    try {
      console.log(`    [Operation] Setting status to 'syncing'...`);
      await indexedDBManager.updateQueueItemStatus(operation.id, 'syncing');

      const { table, operation: op, data } = operation;
      let serverResponse: any = null;

      console.log(`    [Operation] Executing ${op} on ${table}...`);
      switch (op) {
        case 'insert':
          console.log(`      [Insert] Inserting into ${table} with ID: ${data.id}`);
          serverResponse = await this.handleInsert(table, data);
          console.log(`      [Insert] Server returned:`, { id: serverResponse?.id });
          break;
        case 'update':
          console.log(`      [Update] Updating ${table} ID: ${data.id}`);
          serverResponse = await this.handleUpdate(table, data);
          console.log(`      [Update] Server returned:`, { id: serverResponse?.id });
          break;
        case 'delete':
          console.log(`      [Delete] Deleting from ${table} ID: ${data.id}`);
          serverResponse = await this.handleDelete(table, data);
          console.log(`      [Delete] Completed`);
          break;
      }

      console.log(`    [Operation] Marking operation as succeeded...`);
      await indexedDBManager.updateQueueItemStatus(operation.id, 'succeeded', {
        syncedAt: Date.now(),
        remoteVersion: Date.now(),
        serverResponse,
      });

      if (serverResponse) {
        console.log(`    [Operation] Updating local cache...`);
        await this.updateLocalRecordWithServerData(table, data.id, serverResponse);

        if (table === 'sales' && op === 'insert') {
          const saleStatus = serverResponse?.status || 'unknown';
          console.log(`    [Sale] Synced: id=${data.id}, status=${saleStatus}`);

          if (saleStatus === 'draft') {
            console.log(`    [Sale] Sale is still draft. Confirming...`);
            await this.confirmSaleAfterSync(data.id, serverResponse);
          } else {
            console.log(`    [Sale] Sale already confirmed with status: ${saleStatus}`);
          }
        }
      }

      console.log(`    [Operation] ✅ Sync completed for ${table}/${data.id}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`    [Operation] ❌ Error during sync:`, errorMessage);

      // Check if this is a permanent failure that shouldn't be retried
      const isPermanentFailure = this.isPermanentSyncError(errorMessage);

      if (isPermanentFailure) {
        console.error(`    [Operation] ❌ PERMANENT FAILURE - Not retrying: ${errorMessage}`);
        await indexedDBManager.updateQueueItemStatus(operation.id, 'failed', {
          error: errorMessage,
          retries: operation.retries + 1,
          permanentFailure: true,
        });
        throw new Error(`Permanent failure (not retrying): ${errorMessage}`);
      }

      if (operation.retries >= (options.maxRetries ?? 3)) {
        console.error(`    [Operation] ❌ Max retries (${operation.retries}) reached. Marking as failed.`);

        await indexedDBManager.updateQueueItemStatus(operation.id, 'failed', {
          error: errorMessage,
          retries: operation.retries + 1,
        });

        throw new Error(`Failed after ${operation.retries} retries: ${errorMessage}`);
      } else {
        console.warn(`    [Operation] ⚠️ Retry ${operation.retries + 1}/${maxRetries}. Keeping pending.`);
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

  private async handleInsert(table: string, data: any): Promise<any> {
    const IMMUTABLE_TABLES = [
      'sales', 'sale_items', 'purchases', 'purchase_items',
      'expenses', 'inventory_movements', 'operating_expenses',
      'cash_registers', 'register_transactions', 'partner_contributions',
      'partner_settlements', 'setup_expenses', 'employee_commissions',
    ];

    if (IMMUTABLE_TABLES.includes(table)) {
      const { data: insertedData, error } = await supabase
        .from(table as any)
        .insert([data])
        .select('*')
        .maybeSingle();

      if (error) {
        if (error.code === '23505') {
          console.warn(`Record already exists in ${table}, attempting update`);
          const { id, ...updateData } = data;
          const { data: updatedData, error: updateError } = await supabase
            .from(table as any)
            .update(updateData)
            .eq('id', id)
            .select('*')
            .maybeSingle();

          if (updateError) throw updateError;
          return updatedData;
        } else {
          throw error;
        }
      }

      if (table === 'sales' && insertedData) {
        console.log(`      [Sales] Fetching fresh record...`);
        const { data: freshSale, error: fetchError } = await supabase
          .from('sales')
          .select('*')
          .eq('id', insertedData.id)
          .maybeSingle();

        if (fetchError) {
          console.warn(`      [Sales] Failed to fetch fresh record:`, fetchError);
          return insertedData;
        }

        if (freshSale) {
          console.log(`      [Sales] Fresh record loaded: sale_number=${freshSale.sale_number}`);
          return freshSale;
        }
      }

      return insertedData;
    } else {
      const { data: insertedData, error } = await supabase
        .from(table as any)
        .insert([data])
        .select('*')
        .maybeSingle();

      if (error) throw error;
      return insertedData;
    }
  }

  private async handleUpdate(table: string, data: any): Promise<any> {
    const { id, ...updateData } = data;

    const { data: existing, error: fetchError } = await supabase
      .from(table as any)
      .select('id, updated_at')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) throw fetchError;

    if (!existing) {
      console.warn(`Record not found for update in ${table}, attempting insert`);
      const { data: insertedData, error: insertError } = await supabase
        .from(table as any)
        .insert([data])
        .select('*')
        .maybeSingle();

      if (insertError) throw insertError;
      return insertedData;
    } else {
      const localVersion = data.updated_at ? new Date(data.updated_at).getTime() : 0;
      const remoteVersion = existing.updated_at ? new Date(existing.updated_at).getTime() : 0;

      if (remoteVersion > localVersion) {
        console.log(`[EnhancedSyncManager] Remote version newer for ${table}/${id}. Local version wins (offline-first policy)`);
      }

      const { data: updatedData, error: updateError } = await supabase
        .from(table as any)
        .update(updateData)
        .eq('id', id)
        .select('*')
        .maybeSingle();

      if (updateError) throw updateError;
      return updatedData;
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

  private async updateLocalRecordWithServerData(table: string, localId: string, serverData: any): Promise<void> {
    try {
      if (!serverData) return;

      const mergedData = {
        ...serverData,
        _synced: true,
        _syncedAt: new Date().toISOString(),
      };

      await indexedDBManager.cacheRecord(table, mergedData, true);

      if (table === 'sales' && serverData.id !== localId) {
        console.log(`[EnhancedSyncManager] Updated sale ID from ${localId} to ${serverData.id}`);
      }

      console.log(`[EnhancedSyncManager] Updated local record for ${table}/${localId} with server data`);
    } catch (error) {
      console.warn(`[EnhancedSyncManager] Failed to update local record for ${table}/${localId}:`, error);
    }
  }

  private async confirmSaleAfterSync(saleId: string, serverSale: any): Promise<void> {
    try {
      const serverId = serverSale.id || saleId;

      console.log(`    [Confirm] Starting confirmation for sale ${serverId}...`);

      const { data: confirmedSale, error } = await supabase
        .from('sales')
        .update({
          status: 'confirmed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', serverId)
        .select('*')
        .maybeSingle();

      if (error) {
        console.error(`    [Confirm] Failed to confirm sale ${serverId}:`, error);
        return;
      }

      if (confirmedSale) {
        console.log(`    [Confirm] Sale ${serverId} confirmed: status=${confirmedSale.status}`);
        await indexedDBManager.cacheRecord('sales', confirmedSale, true);
      }
    } catch (error) {
      console.error(`    [Confirm] Error confirming sale:`, error);
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

  private isPermanentSyncError(errorMessage: string): boolean {
    const permanentErrorPatterns = [
      /Insufficient stock/i,
      /insufficient inventory/i,
      /stock.*not.*available/i,
      /inventory.*depleted/i,
      /out of stock/i,
      /product.*not found/i,
      /customer.*not found/i,
      /invalid.*reference/i,
      /foreign key violation/i,
    ];

    for (const pattern of permanentErrorPatterns) {
      if (pattern.test(errorMessage)) {
        console.warn(`[EnhancedSyncManager] Detected permanent error pattern: ${pattern.source}`);
        return true;
      }
    }

    return false;
  }

  getIsSyncing(): boolean {
    return this.isSyncing;
  }

  async getPendingCount(): Promise<number> {
    return await indexedDBManager.getQueueSize();
  }
}

export const enhancedSyncManager = new EnhancedSyncManager();
