import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { initialSyncManager } from '../lib/offline';

export interface UseOfflineDataOptions {
  table: string;
  fallbackToServer?: boolean;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export function useOfflineData<T extends any = any>(
  options: UseOfflineDataOptions
) {
  const {
    table,
    fallbackToServer = true,
    autoRefresh = true,
    refreshInterval = 30000,
  } = options;

  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFromCache, setIsFromCache] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setError(null);

      const cachedData = await initialSyncManager.getCachedData(table);

      if (cachedData && cachedData.length > 0) {
        setData(cachedData);
        setIsFromCache(true);
        setLoading(false);

        if (navigator.onLine && fallbackToServer) {
          try {
            const { data: serverData, error: serverError } = await supabase
              .from(table as any)
              .select('*')
              .limit(10000);

            if (serverError) throw serverError;

            if (serverData && serverData.length > 0) {
              await initialSyncManager.cacheData(table, serverData);
              setData(serverData);
              setIsFromCache(true);
            }
          } catch (err) {
            console.warn(`[useOfflineData] Failed to refresh ${table} from server:`, err);
          }
        }
      } else if (navigator.onLine && fallbackToServer) {
        const { data: serverData, error: serverError } = await supabase
          .from(table as any)
          .select('*')
          .limit(10000);

        if (serverError) throw serverError;

        if (serverData) {
          await initialSyncManager.cacheData(table, serverData);
          setData(serverData);
          setIsFromCache(true);
        }
      } else if (!cachedData || cachedData.length === 0) {
        setData([]);
        setError('No data available (offline and cache empty)');
      }

      setLoading(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch data';
      setError(errorMessage);
      setLoading(false);
      console.error(`[useOfflineData] Error fetching ${table}:`, err);
    }
  }, [table, fallbackToServer]);

  useEffect(() => {
    fetchData();

    let interval: NodeJS.Timeout | null = null;
    if (autoRefresh) {
      interval = setInterval(fetchData, refreshInterval);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [fetchData, autoRefresh, refreshInterval]);

  const refetch = useCallback(() => {
    setLoading(true);
    return fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    isFromCache,
    refetch,
  };
}

export function useOfflineRecord<T extends any = any>(
  table: string,
  recordId: string | null
) {
  const [record, setRecord] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFromCache, setIsFromCache] = useState(false);

  const fetchRecord = useCallback(async () => {
    if (!recordId) {
      setRecord(null);
      setLoading(false);
      return;
    }

    try {
      setError(null);

      const cachedRecord = await initialSyncManager.getCachedRecord(table, recordId);

      if (cachedRecord) {
        setRecord(cachedRecord);
        setIsFromCache(true);
        setLoading(false);

        if (navigator.onLine) {
          try {
            const { data: serverData, error: serverError } = await supabase
              .from(table as any)
              .select('*')
              .eq('id', recordId)
              .maybeSingle();

            if (serverError) throw serverError;

            if (serverData) {
              await initialSyncManager.cacheData(table, [serverData]);
              setRecord(serverData);
            }
          } catch (err) {
            console.warn(`[useOfflineRecord] Failed to refresh ${table}/${recordId}:`, err);
          }
        }
      } else if (navigator.onLine) {
        const { data: serverData, error: serverError } = await supabase
          .from(table as any)
          .select('*')
          .eq('id', recordId)
          .maybeSingle();

        if (serverError) throw serverError;

        if (serverData) {
          await initialSyncManager.cacheData(table, [serverData]);
          setRecord(serverData);
          setIsFromCache(true);
        }
      }

      setLoading(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch record';
      setError(errorMessage);
      setLoading(false);
      console.error(`[useOfflineRecord] Error fetching ${table}/${recordId}:`, err);
    }
  }, [table, recordId]);

  useEffect(() => {
    fetchRecord();
  }, [fetchRecord]);

  return {
    record,
    loading,
    error,
    isFromCache,
    refetch: fetchRecord,
  };
}
