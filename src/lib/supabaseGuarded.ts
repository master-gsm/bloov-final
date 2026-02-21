import { supabase } from './supabase';
import { isTestModeActive } from './testModeGuard';

type SupabaseTable = Parameters<typeof supabase.from>[0];

export function guardedInsert<T = any>(table: SupabaseTable, data: any) {
  if (isTestModeActive()) {
    console.warn(`🧪 Test Mode: Blocked INSERT into ${table}`);
    return Promise.resolve({
      data: null,
      error: null,
      status: 200,
      statusText: 'Test Mode - Operation Blocked',
    });
  }
  return supabase.from(table).insert(data);
}

export function guardedUpdate<T = any>(table: SupabaseTable, data: any) {
  if (isTestModeActive()) {
    console.warn(`🧪 Test Mode: Blocked UPDATE on ${table}`);
    return {
      eq: () => ({
        select: () => Promise.resolve({
          data: null,
          error: null,
          status: 200,
          statusText: 'Test Mode - Operation Blocked',
        }),
      }),
      select: () => Promise.resolve({
        data: null,
        error: null,
        status: 200,
        statusText: 'Test Mode - Operation Blocked',
      }),
    } as any;
  }
  return supabase.from(table).update(data);
}

export function guardedDelete<T = any>(table: SupabaseTable) {
  if (isTestModeActive()) {
    console.warn(`🧪 Test Mode: Blocked DELETE from ${table}`);
    return {
      eq: () => Promise.resolve({
        data: null,
        error: null,
        status: 200,
        statusText: 'Test Mode - Operation Blocked',
      }),
    } as any;
  }
  return supabase.from(table).delete();
}

export function guardedUpsert<T = any>(table: SupabaseTable, data: any, options?: any) {
  if (isTestModeActive()) {
    console.warn(`🧪 Test Mode: Blocked UPSERT into ${table}`);
    return Promise.resolve({
      data: null,
      error: null,
      status: 200,
      statusText: 'Test Mode - Operation Blocked',
    });
  }
  return supabase.from(table).upsert(data, options);
}
