import { indexedDBManager } from './indexedDBManager';
import { supabase } from '../supabase';

export interface OperationContext {
  table: string;
  recordId?: string;
  userId: string;
  branchId?: string;
}

export interface ExecutionResult {
  success: boolean;
  queueId: string;
  localId?: string;
  error?: string;
  syncStatus: 'queued' | 'synced' | 'pending';
}

class OperationExecutor {
  async executeInsert(
    table: string,
    data: any,
    context: OperationContext
  ): Promise<ExecutionResult> {
    const operationId = crypto.randomUUID();

    try {
      const localId = data.id || crypto.randomUUID();
      const dataWithId = { ...data, id: localId };

      await indexedDBManager.cacheRecord(table, dataWithId, true);

      const queueId = await indexedDBManager.addOperationToQueue({
        operationId,
        table,
        operation: 'insert',
        data: dataWithId,
        localVersion: Date.now(),
        remoteVersion: null,
        status: 'pending',
        retries: 0,
        maxRetries: 3,
        error: null,
        syncedAt: null,
        serverResponse: null,
      });

      console.log(`[OperationExecutor] Insert queued for ${table}:`, localId);

      return {
        success: true,
        queueId,
        localId,
        syncStatus: 'queued',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[OperationExecutor] Failed to queue insert for ${table}:`, error);

      return {
        success: false,
        queueId: '',
        error: errorMessage,
        syncStatus: 'pending',
      };
    }
  }

  async executeUpdate(
    table: string,
    recordId: string,
    updates: any,
    context: OperationContext
  ): Promise<ExecutionResult> {
    const operationId = crypto.randomUUID();

    try {
      const existingRecord = await indexedDBManager.getCachedRecord(table, recordId);

      if (!existingRecord) {
        throw new Error(`Record ${recordId} not found in local cache`);
      }

      const updatedData = {
        ...existingRecord,
        ...updates,
        id: recordId,
        updated_at: new Date().toISOString(),
      };

      await indexedDBManager.cacheRecord(table, updatedData, true);

      const queueId = await indexedDBManager.addOperationToQueue({
        operationId,
        table,
        operation: 'update',
        data: updatedData,
        localVersion: Date.now(),
        remoteVersion: existingRecord.updated_at ? new Date(existingRecord.updated_at).getTime() : 0,
        status: 'pending',
        retries: 0,
        maxRetries: 3,
        error: null,
        syncedAt: null,
        serverResponse: null,
      });

      console.log(`[OperationExecutor] Update queued for ${table}:${recordId}`);

      return {
        success: true,
        queueId,
        localId: recordId,
        syncStatus: 'queued',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[OperationExecutor] Failed to queue update for ${table}:${recordId}:`, error);

      return {
        success: false,
        queueId: '',
        error: errorMessage,
        syncStatus: 'pending',
      };
    }
  }

  async executeDelete(
    table: string,
    recordId: string,
    context: OperationContext
  ): Promise<ExecutionResult> {
    const operationId = crypto.randomUUID();

    const IMMUTABLE_TABLES = [
      'sales', 'sale_items', 'purchases', 'purchase_items',
      'expenses', 'inventory_movements', 'operating_expenses',
      'cash_registers', 'register_transactions', 'partner_contributions',
      'partner_settlements', 'setup_expenses', 'employee_commissions',
    ];

    if (IMMUTABLE_TABLES.includes(table)) {
      console.warn(`[OperationExecutor] Cannot delete from immutable table ${table}. Use void/reversal instead.`);
      return {
        success: false,
        queueId: '',
        error: `Cannot delete from ${table}. Use void or reversal instead.`,
        syncStatus: 'pending',
      };
    }

    try {
      const queueId = await indexedDBManager.addOperationToQueue({
        operationId,
        table,
        operation: 'delete',
        data: { id: recordId },
        localVersion: Date.now(),
        remoteVersion: null,
        status: 'pending',
        retries: 0,
        maxRetries: 3,
        error: null,
        syncedAt: null,
        serverResponse: null,
      });

      console.log(`[OperationExecutor] Delete queued for ${table}:${recordId}`);

      return {
        success: true,
        queueId,
        localId: recordId,
        syncStatus: 'queued',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[OperationExecutor] Failed to queue delete for ${table}:${recordId}:`, error);

      return {
        success: false,
        queueId: '',
        error: errorMessage,
        syncStatus: 'pending',
      };
    }
  }

  async queryWithCache(
    table: string,
    fetchFn: () => Promise<any[]>
  ): Promise<any[]> {
    if (navigator.onLine) {
      try {
        const data = await fetchFn();
        await indexedDBManager.cacheRecord(table, data, false);
        return data;
      } catch (error) {
        console.warn(`[OperationExecutor] Failed to fetch ${table}, using cache:`, error);
        return await indexedDBManager.getCachedRecords(table);
      }
    } else {
      console.log(`[OperationExecutor] Offline - using cached data for ${table}`);
      return await indexedDBManager.getCachedRecords(table);
    }
  }
}

export const operationExecutor = new OperationExecutor();
