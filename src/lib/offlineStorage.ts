const DB_NAME = 'BloovAccountingDB';
const DB_VERSION = 2;
const PENDING_OPERATIONS_STORE = 'pendingOperations';
const DATA_CACHE_STORE = 'dataCache';

export interface PendingOperation {
  id: string;
  table: string;
  operation: 'insert' | 'update' | 'delete';
  data: any;
  timestamp: number;
  retries: number;
}

export interface CachedData {
  table: string;
  recordId: string;
  data: any;
  lastUpdated: number;
  version: number;
}

class OfflineStorage {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(PENDING_OPERATIONS_STORE)) {
          const store = db.createObjectStore(PENDING_OPERATIONS_STORE, { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('table', 'table', { unique: false });
        }

        if (!db.objectStoreNames.contains(DATA_CACHE_STORE)) {
          const cacheStore = db.createObjectStore(DATA_CACHE_STORE, { keyPath: ['table', 'recordId'] });
          cacheStore.createIndex('table', 'table', { unique: false });
          cacheStore.createIndex('lastUpdated', 'lastUpdated', { unique: false });
        }
      };
    });
  }

  async addPendingOperation(operation: Omit<PendingOperation, 'id' | 'timestamp' | 'retries'>): Promise<string> {
    if (!this.db) await this.init();

    const id = crypto.randomUUID();
    const pendingOp: PendingOperation = {
      ...operation,
      id,
      timestamp: Date.now(),
      retries: 0,
    };

    console.log('[OfflineStorage] Adding pending operation:', {
      id,
      table: operation.table,
      operation: operation.operation,
      keyPath_id: pendingOp.id,
      hasValidId: !!pendingOp.id && typeof pendingOp.id === 'string',
      dataPreview: operation.data ? Object.keys(operation.data).join(', ') : 'null'
    });

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([PENDING_OPERATIONS_STORE], 'readwrite');
      const store = transaction.objectStore(PENDING_OPERATIONS_STORE);
      const request = store.add(pendingOp);

      request.onsuccess = () => {
        console.log(`[OfflineStorage] Successfully added operation ${id} to IndexedDB`);
        resolve(id);
      };
      request.onerror = () => {
        console.error(`[OfflineStorage] Failed to add operation to IndexedDB:`, {
          error: request.error,
          operation: pendingOp
        });
        reject(request.error);
      };
    });
  }

  async getPendingOperations(): Promise<PendingOperation[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([PENDING_OPERATIONS_STORE], 'readonly');
      const store = transaction.objectStore(PENDING_OPERATIONS_STORE);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async removePendingOperation(id: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([PENDING_OPERATIONS_STORE], 'readwrite');
      const store = transaction.objectStore(PENDING_OPERATIONS_STORE);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async incrementRetries(id: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([PENDING_OPERATIONS_STORE], 'readwrite');
      const store = transaction.objectStore(PENDING_OPERATIONS_STORE);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const operation = getRequest.result;
        if (operation) {
          operation.retries += 1;
          const updateRequest = store.put(operation);
          updateRequest.onsuccess = () => resolve();
          updateRequest.onerror = () => reject(updateRequest.error);
        } else {
          resolve();
        }
      };

      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async clearAllPendingOperations(): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([PENDING_OPERATIONS_STORE], 'readwrite');
      const store = transaction.objectStore(PENDING_OPERATIONS_STORE);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getPendingOperationsCount(): Promise<number> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([PENDING_OPERATIONS_STORE], 'readonly');
      const store = transaction.objectStore(PENDING_OPERATIONS_STORE);
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async cacheData(table: string, records: any[]): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([DATA_CACHE_STORE], 'readwrite');
      const store = transaction.objectStore(DATA_CACHE_STORE);

      const timestamp = Date.now();
      const promises = records.map((record) => {
        const cachedData: CachedData = {
          table,
          recordId: record.id,
          data: record,
          lastUpdated: timestamp,
          version: record.updated_at ? new Date(record.updated_at).getTime() : timestamp,
        };
        return store.put(cachedData);
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async getCachedData(table: string): Promise<any[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([DATA_CACHE_STORE], 'readonly');
      const store = transaction.objectStore(DATA_CACHE_STORE);
      const index = store.index('table');
      const request = index.getAll(table);

      request.onsuccess = () => {
        const cachedItems = request.result as CachedData[];
        resolve(cachedItems.map(item => item.data));
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getCachedRecord(table: string, recordId: string): Promise<any | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([DATA_CACHE_STORE], 'readonly');
      const store = transaction.objectStore(DATA_CACHE_STORE);
      const request = store.get([table, recordId]);

      request.onsuccess = () => {
        const result = request.result as CachedData | undefined;
        resolve(result ? result.data : null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async clearCachedData(table: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([DATA_CACHE_STORE], 'readwrite');
      const store = transaction.objectStore(DATA_CACHE_STORE);
      const index = store.index('table');
      const request = index.openCursor(table);

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };

      request.onerror = () => reject(request.error);
    });
  }
}

export const offlineStorage = new OfflineStorage();
