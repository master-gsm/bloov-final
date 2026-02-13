import { supabase } from './supabase';
import { offlineStorage, PendingOperation } from './offlineStorage';

class SyncManager {
  private isSyncing = false;
  private syncInterval: NodeJS.Timeout | null = null;

  async startAutoSync(intervalMinutes: number = 5): Promise<void> {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.syncInterval = setInterval(() => {
      this.syncPendingOperations();
    }, intervalMinutes * 60 * 1000);

    await this.syncPendingOperations();
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
      return { success: 0, failed: 0 };
    }

    this.isSyncing = true;
    let successCount = 0;
    let failedCount = 0;

    try {
      const operations = await offlineStorage.getPendingOperations();

      operations.sort((a, b) => a.timestamp - b.timestamp);

      for (const operation of operations) {
        try {
          await this.executeOperation(operation);
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
    } catch (error) {
      console.error('Error syncing pending operations:', error);
    } finally {
      this.isSyncing = false;
    }

    return { success: successCount, failed: failedCount };
  }

  private async executeOperation(operation: PendingOperation): Promise<void> {
    const { table, operation: op, data } = operation;

    switch (op) {
      case 'insert':
        const { error: insertError } = await supabase.from(table).insert(data);
        if (insertError) throw insertError;
        break;

      case 'update':
        const { id, ...updateData } = data;
        const { error: updateError } = await supabase.from(table).update(updateData).eq('id', id);
        if (updateError) throw updateError;
        break;

      case 'delete':
        const { error: deleteError } = await supabase.from(table).delete().eq('id', data.id);
        if (deleteError) throw deleteError;
        break;

      default:
        throw new Error(`Unknown operation: ${op}`);
    }
  }

  async getPendingCount(): Promise<number> {
    return await offlineStorage.getPendingOperationsCount();
  }

  getIsSyncing(): boolean {
    return this.isSyncing;
  }
}

export const syncManager = new SyncManager();
