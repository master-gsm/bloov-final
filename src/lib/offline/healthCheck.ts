import { supabase } from '../supabase';

export type ConnectionQuality = 'excellent' | 'good' | 'poor' | 'offline';

export interface HealthCheckResult {
  isHealthy: boolean;
  isOnline: boolean;
  connectionQuality: ConnectionQuality;
  latency: number;
  lastCheck: number;
}

class HealthCheckManager {
  private lastResult: HealthCheckResult | null = null;
  private checkInterval: NodeJS.Timeout | null = null;
  private listeners: Set<(result: HealthCheckResult) => void> = new Set();

  async performHealthCheck(): Promise<HealthCheckResult> {
    const isOnline = navigator.onLine;

    if (!isOnline) {
      const result: HealthCheckResult = {
        isHealthy: false,
        isOnline: false,
        connectionQuality: 'offline',
        latency: -1,
        lastCheck: Date.now(),
      };
      this.lastResult = result;
      this.notifyListeners(result);
      return result;
    }

    const startTime = performance.now();

    try {
      const { data, error } = await Promise.race([
        supabase.from('users').select('id').limit(1),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000)),
      ]) as any;

      const latency = Math.round(performance.now() - startTime);
      let connectionQuality: ConnectionQuality;

      if (latency < 100) {
        connectionQuality = 'excellent';
      } else if (latency < 300) {
        connectionQuality = 'good';
      } else if (latency < 1000) {
        connectionQuality = 'poor';
      } else {
        connectionQuality = 'offline';
      }

      const result: HealthCheckResult = {
        isHealthy: !error,
        isOnline: true,
        connectionQuality,
        latency,
        lastCheck: Date.now(),
      };

      this.lastResult = result;
      this.notifyListeners(result);
      return result;
    } catch (error) {
      console.error('[HealthCheck] Health check failed:', error);

      const result: HealthCheckResult = {
        isHealthy: false,
        isOnline: true,
        connectionQuality: 'poor',
        latency: -1,
        lastCheck: Date.now(),
      };

      this.lastResult = result;
      this.notifyListeners(result);
      return result;
    }
  }

  startPeriodicChecks(intervalSeconds: number = 30): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    this.performHealthCheck();

    this.checkInterval = setInterval(() => {
      this.performHealthCheck();
    }, intervalSeconds * 1000);
  }

  stopPeriodicChecks(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  onHealthCheckChange(callback: (result: HealthCheckResult) => void): () => void {
    this.listeners.add(callback);

    if (this.lastResult) {
      callback(this.lastResult);
    }

    return () => {
      this.listeners.delete(callback);
    };
  }

  private notifyListeners(result: HealthCheckResult): void {
    this.listeners.forEach(listener => {
      try {
        listener(result);
      } catch (error) {
        console.error('[HealthCheck] Error notifying listener:', error);
      }
    });
  }

  getLastResult(): HealthCheckResult | null {
    return this.lastResult;
  }

  isHealthy(): boolean {
    return this.lastResult?.isHealthy ?? false;
  }

  isOnline(): boolean {
    return this.lastResult?.isOnline ?? navigator.onLine;
  }

  getConnectionQuality(): ConnectionQuality {
    return this.lastResult?.connectionQuality ?? 'offline';
  }

  getLatency(): number {
    return this.lastResult?.latency ?? -1;
  }
}

export const healthCheckManager = new HealthCheckManager();

window.addEventListener('online', () => {
  console.log('[HealthCheck] Online event detected');
  healthCheckManager.performHealthCheck();
});

window.addEventListener('offline', () => {
  console.log('[HealthCheck] Offline event detected');
  healthCheckManager.performHealthCheck();
});
