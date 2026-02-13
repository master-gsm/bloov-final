import { supabase } from './supabase';

declare global {
  interface Window {
    electron?: {
      saveBackup: (backupData: string, filename: string) => Promise<{ success: boolean; path?: string; error?: string }>;
      selectDirectory: () => Promise<{ success: boolean; path?: string }>;
      getBackupPath: () => Promise<string | null>;
      setBackupPath: (path: string) => Promise<void>;
    };
  }
}

export interface BackupData {
  timestamp: string;
  version: string;
  data: {
    partners?: any[];
    partner_contributions?: any[];
    partner_settlements?: any[];
    products?: any[];
    inventory?: any[];
    customers?: any[];
    suppliers?: any[];
    sales?: any[];
    sale_items?: any[];
    purchases?: any[];
    purchase_items?: any[];
    operating_expenses?: any[];
    cash_register_transactions?: any[];
    users?: any[];
  };
}

class DiskBackupManager {
  async createBackup(): Promise<BackupData> {
    const tables = [
      'partners',
      'partner_contributions',
      'partner_settlements',
      'products',
      'inventory',
      'customers',
      'suppliers',
      'sales',
      'sale_items',
      'purchases',
      'purchase_items',
      'operating_expenses',
      'cash_register_transactions',
      'users',
    ];

    const backupData: BackupData = {
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      data: {},
    };

    for (const table of tables) {
      try {
        const { data, error } = await supabase.from(table).select('*');
        if (!error && data) {
          backupData.data[table as keyof BackupData['data']] = data;
        }
      } catch (err) {
        console.error(`Error backing up table ${table}:`, err);
      }
    }

    return backupData;
  }

  async saveBackupToDisk(backupData: BackupData): Promise<{ success: boolean; path?: string; error?: string }> {
    if (!window.electron?.saveBackup) {
      return { success: false, error: 'Electron API not available. Please use desktop app.' };
    }

    const filename = `bloov_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const backupJson = JSON.stringify(backupData, null, 2);

    return await window.electron.saveBackup(backupJson, filename);
  }

  async selectBackupDirectory(): Promise<{ success: boolean; path?: string; error?: string }> {
    if (!window.electron?.selectDirectory) {
      return {
        success: false,
        error: 'هذه الميزة تعمل فقط في تطبيق Electron. استخدم npm run electron:dev لتشغيل التطبيق.'
      };
    }

    return await window.electron.selectDirectory();
  }

  async getBackupPath(): Promise<string | null> {
    if (!window.electron?.getBackupPath) {
      return null;
    }

    return await window.electron.getBackupPath();
  }

  async setBackupPath(path: string): Promise<void> {
    if (window.electron?.setBackupPath) {
      await window.electron.setBackupPath(path);
    }
  }

  async performBackup(): Promise<{ success: boolean; path?: string; error?: string }> {
    try {
      const backupData = await this.createBackup();
      return await this.saveBackupToDisk(backupData);
    } catch (error) {
      console.error('Backup failed:', error);
      return { success: false, error: String(error) };
    }
  }
}

export const diskBackupManager = new DiskBackupManager();

export function startAutoBackup(intervalMinutes: number): NodeJS.Timeout {
  return setInterval(async () => {
    const result = await diskBackupManager.performBackup();
    if (result.success) {
      console.log(`Backup saved to: ${result.path}`);
    } else {
      console.error(`Backup failed: ${result.error}`);
    }
  }, intervalMinutes * 60 * 1000);
}
