import { useEffect, useRef, useState } from 'react';
import { createBackup, saveBackupToFileSystem, saveBackupToLocalStorage, getLastBackupTime } from '../lib/backup';

interface AutoBackupSettings {
  enabled: boolean;
  intervalMinutes: number;
  savePath?: string;
  saveToFileSystem: boolean;
  saveToLocalStorage: boolean;
}

export function useAutoBackup(settings: AutoBackupSettings) {
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const performBackup = async () => {
    if (isBackingUp) return;

    setIsBackingUp(true);
    try {
      const backup = await createBackup();

      if (settings.saveToLocalStorage) {
        saveBackupToLocalStorage(backup);
      }

      if (settings.saveToFileSystem) {
        await saveBackupToFileSystem(backup, settings.savePath);
      }

      const timestamp = new Date().toISOString();
      setLastBackup(timestamp);
      localStorage.setItem('bloov_last_auto_backup', timestamp);
    } catch (err) {
      console.error('Auto backup failed:', err);
    } finally {
      setIsBackingUp(false);
    }
  };

  useEffect(() => {
    const lastBackupTime = localStorage.getItem('bloov_last_auto_backup');
    if (lastBackupTime) {
      setLastBackup(lastBackupTime);
    }
  }, []);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!settings.enabled) {
      return;
    }

    const intervalMs = settings.intervalMinutes * 60 * 1000;

    performBackup();

    intervalRef.current = setInterval(() => {
      performBackup();
    }, intervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [settings.enabled, settings.intervalMinutes, settings.saveToFileSystem, settings.saveToLocalStorage, settings.savePath]);

  return {
    lastBackup,
    isBackingUp,
    performBackup,
  };
}
