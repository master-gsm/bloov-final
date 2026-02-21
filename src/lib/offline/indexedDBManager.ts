const DB_NAME = 'BloovAccountingDB';
const DB_VERSION = 3;

const STORES = {
  OPERATION_QUEUE: 'operationQueue',
  DATA_CACHE: 'dataCache',
  TRANSACTION_LOG: 'transactionLog',
  SYNC_STATE: 'syncState',
  CONFLICT_LOG: 'conflictLog',
  FINANCIAL_STATE: 'financialState',
} as const;

export interface OperationQueueItem {
  id: string;
  operationId: string;
  table: string;
  operation: 'insert' | 'update' | 'delete';
  data: any;
  localVersion: number;
  remoteVersion: number | null;
  status: 'pending' | 'syncing' | 'failed' | 'succeeded';
  retries: number;
  maxRetries: number;
  error: string | null;
  createdAt: number;
  updatedAt: number;
  syncedAt: number | null;
  serverResponse: any | null;
}

export interface CachedRecord {
  id: string;
  table: string;
  recordId: string;
  data: any;
  localVersion: number;
  remoteVersion: number;
  isDirty: boolean;
  cachedAt: number;
  syncedAt: number | null;
}

export interface TransactionLogEntry {
  id: string;
  operationQueueId: string;
  table: string;
  operation: 'insert' | 'update' | 'delete';
  recordId: string;
  before: any | null;
  after: any | null;
  timestamp: number;
  status: 'pending' | 'applied' | 'reverted';
}

export interface ConflictRecord {
  id: string;
  operationQueueId: string;
  table: string;
  recordId: string;
  localVersion: number;
  remoteVersion: number;
  localData: any;
  remoteData: any;
  resolution: 'local' | 'remote' | 'manual' | null;
  detectedAt: number;
  resolvedAt: number | null;
}

export interface SyncState {
  key: string;
  isOnline: boolean;
  lastSuccessfulSync: number | null;
  lastSyncAttempt: number | null;
  totalSynced: number;
  totalFailed: number;
  isSyncing: boolean;
  connectionQuality: 'excellent' | 'good' | 'poor' | 'offline';
}

class IndexedDBManager {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('[IndexedDBManager] Failed to open database:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[IndexedDBManager] Database opened successfully');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        console.log('[IndexedDBManager] Running upgrade from version', event.oldVersion, 'to', event.newVersion);

        this.createStores(db);
      };
    });

    return this.initPromise;
  }

  private createStores(db: IDBDatabase): void {
    if (!db.objectStoreNames.contains(STORES.OPERATION_QUEUE)) {
      const store = db.createObjectStore(STORES.OPERATION_QUEUE, { keyPath: 'id' });
      store.createIndex('operationId', 'operationId', { unique: true });
      store.createIndex('table', 'table', { unique: false });
      store.createIndex('status', 'status', { unique: false });
      store.createIndex('createdAt', 'createdAt', { unique: false });
      console.log('[IndexedDBManager] Created operationQueue store');
    }

    if (!db.objectStoreNames.contains(STORES.DATA_CACHE)) {
      const store = db.createObjectStore(STORES.DATA_CACHE, { keyPath: 'id' });
      store.createIndex('table', 'table', { unique: false });
      store.createIndex('recordId', 'recordId', { unique: false });
      store.createIndex('isDirty', 'isDirty', { unique: false });
      store.createIndex('tableRecordId', ['table', 'recordId'], { unique: true });
      console.log('[IndexedDBManager] Created dataCache store');
    }

    if (!db.objectStoreNames.contains(STORES.TRANSACTION_LOG)) {
      const store = db.createObjectStore(STORES.TRANSACTION_LOG, { keyPath: 'id' });
      store.createIndex('operationQueueId', 'operationQueueId', { unique: false });
      store.createIndex('table', 'table', { unique: false });
      store.createIndex('timestamp', 'timestamp', { unique: false });
      console.log('[IndexedDBManager] Created transactionLog store');
    }

    if (!db.objectStoreNames.contains(STORES.CONFLICT_LOG)) {
      const store = db.createObjectStore(STORES.CONFLICT_LOG, { keyPath: 'id' });
      store.createIndex('operationQueueId', 'operationQueueId', { unique: false });
      store.createIndex('resolution', 'resolution', { unique: false });
      store.createIndex('detectedAt', 'detectedAt', { unique: false });
      console.log('[IndexedDBManager] Created conflictLog store');
    }

    if (!db.objectStoreNames.contains(STORES.SYNC_STATE)) {
      const store = db.createObjectStore(STORES.SYNC_STATE, { keyPath: 'key' });
      console.log('[IndexedDBManager] Created syncState store');
    }

    if (!db.objectStoreNames.contains(STORES.FINANCIAL_STATE)) {
      const store = db.createObjectStore(STORES.FINANCIAL_STATE, { keyPath: 'key' });
      console.log('[IndexedDBManager] Created financialState store');
    }
  }

  async addOperationToQueue(item: Omit<OperationQueueItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    await this.init();
    const id = crypto.randomUUID();
    const now = Date.now();

    const queueItem: OperationQueueItem = {
      ...item,
      id,
      createdAt: now,
      updatedAt: now,
    };

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.OPERATION_QUEUE], 'readwrite');
      const store = tx.objectStore(STORES.OPERATION_QUEUE);
      const request = store.add(queueItem);

      request.onsuccess = () => {
        console.log('[IndexedDBManager] Added operation to queue:', id);
        resolve(id);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getQueuedOperations(status?: OperationQueueItem['status']): Promise<OperationQueueItem[]> {
    await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.OPERATION_QUEUE], 'readonly');
      const store = tx.objectStore(STORES.OPERATION_QUEUE);

      let request: IDBRequest;
      if (status) {
        const index = store.index('status');
        request = index.getAll(status);
      } else {
        request = store.getAll();
      }

      request.onsuccess = () => {
        const items = request.result as OperationQueueItem[];
        resolve(items.sort((a, b) => a.createdAt - b.createdAt));
      };
      request.onerror = () => reject(request.error);
    });
  }

  async updateQueueItemStatus(
    id: string,
    status: OperationQueueItem['status'],
    update?: Partial<OperationQueueItem>
  ): Promise<void> {
    await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.OPERATION_QUEUE], 'readwrite');
      const store = tx.objectStore(STORES.OPERATION_QUEUE);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const item = getRequest.result as OperationQueueItem;
        if (item) {
          item.status = status;
          item.updatedAt = Date.now();
          if (update) {
            Object.assign(item, update);
          }
          const putRequest = store.put(item);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          reject(new Error(`Operation ${id} not found`));
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async removeQueueItem(id: string): Promise<void> {
    await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.OPERATION_QUEUE], 'readwrite');
      const store = tx.objectStore(STORES.OPERATION_QUEUE);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async cacheRecord(table: string, record: any, isDirty: boolean = false): Promise<void> {
    await this.init();

    const cachedRecord: CachedRecord = {
      id: crypto.randomUUID(),
      table,
      recordId: record.id,
      data: record,
      localVersion: Date.now(),
      remoteVersion: record.updated_at ? new Date(record.updated_at).getTime() : 0,
      isDirty,
      cachedAt: Date.now(),
      syncedAt: null,
    };

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.DATA_CACHE], 'readwrite');
      const store = tx.objectStore(STORES.DATA_CACHE);
      const request = store.put(cachedRecord);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getCachedRecords(table: string): Promise<any[]> {
    await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.DATA_CACHE], 'readonly');
      const store = tx.objectStore(STORES.DATA_CACHE);
      const index = store.index('table');
      const request = index.getAll(table);

      request.onsuccess = () => {
        const cached = request.result as CachedRecord[];
        resolve(cached.map(c => c.data));
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getCachedRecord(table: string, recordId: string): Promise<any | null> {
    await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.DATA_CACHE], 'readonly');
      const store = tx.objectStore(STORES.DATA_CACHE);
      const index = store.index('tableRecordId');
      const request = index.get([table, recordId]);

      request.onsuccess = () => {
        const cached = request.result as CachedRecord | undefined;
        resolve(cached ? cached.data : null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async cacheData(table: string, records: any[]): Promise<void> {
    await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.DATA_CACHE], 'readwrite');
      const store = tx.objectStore(STORES.DATA_CACHE);

      records.forEach(record => {
        const cachedRecord: CachedRecord = {
          id: crypto.randomUUID(),
          table,
          recordId: record.id,
          data: record,
          localVersion: Date.now(),
          remoteVersion: record.updated_at ? new Date(record.updated_at).getTime() : 0,
          isDirty: false,
          cachedAt: Date.now(),
          syncedAt: null,
        };
        store.put(cachedRecord);
      });

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async clearCachedTable(table: string): Promise<void> {
    await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.DATA_CACHE], 'readwrite');
      const store = tx.objectStore(STORES.DATA_CACHE);
      const index = store.index('table');
      const request = index.openCursor(table);

      const deleteRequests: IDBRequest[] = [];
      request.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest).result;
        if (cursor) {
          deleteRequests.push(cursor.delete());
          cursor.continue();
        } else {
          Promise.all(deleteRequests).then(() => resolve()).catch(reject);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async addTransactionLogEntry(entry: Omit<TransactionLogEntry, 'id'>): Promise<string> {
    await this.init();
    const id = crypto.randomUUID();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.TRANSACTION_LOG], 'readwrite');
      const store = tx.objectStore(STORES.TRANSACTION_LOG);
      const request = store.add({ ...entry, id });

      request.onsuccess = () => resolve(id);
      request.onerror = () => reject(request.error);
    });
  }

  async addConflictRecord(record: Omit<ConflictRecord, 'id'>): Promise<string> {
    await this.init();
    const id = crypto.randomUUID();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.CONFLICT_LOG], 'readwrite');
      const store = tx.objectStore(STORES.CONFLICT_LOG);
      const request = store.add({ ...record, id });

      request.onsuccess = () => resolve(id);
      request.onerror = () => reject(request.error);
    });
  }

  async getSyncState(): Promise<SyncState> {
    await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.SYNC_STATE], 'readonly');
      const store = tx.objectStore(STORES.SYNC_STATE);
      const request = store.get('sync');

      request.onsuccess = () => {
        const state = request.result as SyncState | undefined;
        resolve(state || {
          key: 'sync',
          isOnline: navigator.onLine,
          lastSuccessfulSync: null,
          lastSyncAttempt: null,
          totalSynced: 0,
          totalFailed: 0,
          isSyncing: false,
          connectionQuality: 'excellent',
        });
      };
      request.onerror = () => reject(request.error);
    });
  }

  async updateSyncState(state: Partial<SyncState>): Promise<void> {
    await this.init();

    const currentState = await this.getSyncState();
    const updated = { ...currentState, ...state, key: 'sync' };

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.SYNC_STATE], 'readwrite');
      const store = tx.objectStore(STORES.SYNC_STATE);
      const request = store.put(updated);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getQueueSize(): Promise<number> {
    await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.OPERATION_QUEUE], 'readonly');
      const store = tx.objectStore(STORES.OPERATION_QUEUE);
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async clearAll(): Promise<void> {
    await this.init();

    const stores = Object.values(STORES);
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(stores as any[], 'readwrite');

      stores.forEach(storeName => {
        tx.objectStore(storeName).clear();
      });

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

export const indexedDBManager = new IndexedDBManager();
