import { supabase } from './supabase';

export interface BackupData {
  timestamp: string;
  version: string;
  tables: {
    products: any[];
    categories: any[];
    customers: any[];
    suppliers: any[];
    sales: any[];
    sale_items: any[];
    purchases: any[];
    purchase_items: any[];
    inventory: any[];
    inventory_movements: any[];
    partners: any[];
    partner_contributions: any[];
    expenses: any[];
    cash_registers: any[];
    customer_loyalty: any[];
    loyalty_transactions: any[];
    settings: any[];
    users: any[];
  };
}

const TABLES_TO_BACKUP = [
  'products',
  'categories',
  'customers',
  'suppliers',
  'sales',
  'sale_items',
  'purchases',
  'purchase_items',
  'inventory',
  'inventory_movements',
  'partners',
  'partner_contributions',
  'expenses',
  'cash_registers',
  'customer_loyalty',
  'loyalty_transactions',
  'settings',
  'users',
] as const;

export async function createBackup(): Promise<BackupData> {
  const backup: BackupData = {
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    tables: {
      products: [],
      categories: [],
      customers: [],
      suppliers: [],
      sales: [],
      sale_items: [],
      purchases: [],
      purchase_items: [],
      inventory: [],
      inventory_movements: [],
      partners: [],
      partner_contributions: [],
      expenses: [],
      cash_registers: [],
      customer_loyalty: [],
      loyalty_transactions: [],
      settings: [],
      users: [],
    },
  };

  for (const table of TABLES_TO_BACKUP) {
    try {
      const { data, error } = await supabase.from(table).select('*');
      if (error) throw error;
      backup.tables[table] = data || [];
    } catch (err) {
      console.error(`Error backing up table ${table}:`, err);
      backup.tables[table] = [];
    }
  }

  return backup;
}

export function downloadBackupAsJSON(backup: BackupData, filename?: string) {
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `bloov-backup-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadBackupAsExcel(backup: BackupData, filename?: string) {
  let csv = '';

  for (const [tableName, tableData] of Object.entries(backup.tables)) {
    if (tableData.length === 0) continue;

    csv += `\n\n=== ${tableName.toUpperCase()} ===\n`;

    const headers = Object.keys(tableData[0]);
    csv += headers.join(',') + '\n';

    for (const row of tableData) {
      const values = headers.map(header => {
        const value = row[header];
        if (value === null || value === undefined) return '';
        const stringValue = String(value);
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      });
      csv += values.join(',') + '\n';
    }
  }

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `bloov-backup-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function restoreFromBackup(backup: BackupData): Promise<{ success: boolean; errors: string[] }> {
  const errors: string[] = [];

  const orderedTables = [
    'categories',
    'products',
    'customers',
    'suppliers',
    'partners',
    'settings',
    'users',
    'inventory',
    'sales',
    'sale_items',
    'purchases',
    'purchase_items',
    'inventory_movements',
    'partner_contributions',
    'expenses',
    'cash_registers',
    'customer_loyalty',
    'loyalty_transactions',
  ];

  for (const table of orderedTables) {
    const data = backup.tables[table as keyof typeof backup.tables];
    if (!data || data.length === 0) continue;

    try {
      for (const item of data) {
        const { error } = await supabase.from(table).upsert(item, {
          onConflict: 'id',
          ignoreDuplicates: false
        });
        if (error) {
          errors.push(`Error restoring ${table}: ${error.message}`);
        }
      }
    } catch (err: any) {
      errors.push(`Error restoring ${table}: ${err.message}`);
    }
  }

  return {
    success: errors.length === 0,
    errors,
  };
}

export function saveBackupToLocalStorage(backup: BackupData) {
  try {
    const compressed = JSON.stringify(backup);
    localStorage.setItem('bloov_latest_backup', compressed);
    localStorage.setItem('bloov_latest_backup_time', backup.timestamp);
    return true;
  } catch (err) {
    console.error('Error saving backup to localStorage:', err);
    return false;
  }
}

export function loadBackupFromLocalStorage(): BackupData | null {
  try {
    const compressed = localStorage.getItem('bloov_latest_backup');
    if (!compressed) return null;
    return JSON.parse(compressed);
  } catch (err) {
    console.error('Error loading backup from localStorage:', err);
    return null;
  }
}

export function getLastBackupTime(): string | null {
  return localStorage.getItem('bloov_latest_backup_time');
}

export async function saveBackupToFileSystem(backup: BackupData, path?: string): Promise<boolean> {
  if (typeof window === 'undefined' || !(window as any).electron) {
    console.warn('Electron not available, using download instead');
    downloadBackupAsJSON(backup);
    return true;
  }

  try {
    const electron = (window as any).electron;
    const defaultPath = path || `${electron.getPath('documents')}/BloovBackups`;
    const filename = `bloov-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const fullPath = `${defaultPath}/${filename}`;

    await electron.writeFile(fullPath, JSON.stringify(backup, null, 2));
    return true;
  } catch (err) {
    console.error('Error saving backup to file system:', err);
    return false;
  }
}
