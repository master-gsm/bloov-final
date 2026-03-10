import { supabase } from './supabase';

interface ErrorContext {
  component?: string;
  action?: string;
  additionalData?: Record<string, unknown>;
}

type ErrorSeverity = 'debug' | 'info' | 'warning' | 'error' | 'critical';

class ErrorMonitor {
  private isInitialized = false;
  private errorQueue: Array<{
    error: Error;
    context: ErrorContext;
    severity: ErrorSeverity;
  }> = [];
  private flushTimeout: ReturnType<typeof setTimeout> | null = null;

  initialize() {
    if (this.isInitialized) return;

    window.addEventListener('error', (event) => {
      this.captureError(event.error || new Error(event.message), {
        component: 'window',
        action: 'unhandled_error'
      }, 'error');
    });

    window.addEventListener('unhandledrejection', (event) => {
      const error = event.reason instanceof Error
        ? event.reason
        : new Error(String(event.reason));
      this.captureError(error, {
        component: 'window',
        action: 'unhandled_rejection'
      }, 'error');
    });

    this.isInitialized = true;
  }

  async captureError(
    error: Error,
    context: ErrorContext = {},
    severity: ErrorSeverity = 'error'
  ): Promise<void> {
    const errorData = {
      error,
      context,
      severity
    };

    this.errorQueue.push(errorData);

    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
    }

    this.flushTimeout = setTimeout(() => {
      this.flushQueue();
    }, 1000);
  }

  private async flushQueue(): Promise<void> {
    if (this.errorQueue.length === 0) return;

    const errors = [...this.errorQueue];
    this.errorQueue = [];

    for (const { error, context, severity } of errors) {
      try {
        await supabase.rpc('fn_log_error', {
          p_error_message: error.message,
          p_error_code: error.name,
          p_error_stack: error.stack,
          p_error_type: 'runtime',
          p_severity: severity,
          p_component: context.component,
          p_url: window.location.href,
          p_user_agent: navigator.userAgent,
          p_context: context.additionalData ? JSON.stringify(context) : null
        });
      } catch (e) {
        console.error('[ErrorMonitor] Failed to log error:', e);
      }
    }
  }

  captureWarning(message: string, context: ErrorContext = {}): void {
    this.captureError(new Error(message), context, 'warning');
  }

  captureInfo(message: string, context: ErrorContext = {}): void {
    this.captureError(new Error(message), context, 'info');
  }

  captureCritical(error: Error, context: ErrorContext = {}): void {
    this.captureError(error, context, 'critical');
  }
}

export const errorMonitor = new ErrorMonitor();

export function initializeErrorMonitoring(): void {
  errorMonitor.initialize();
}

export function captureError(
  error: Error,
  context?: ErrorContext,
  severity?: ErrorSeverity
): void {
  errorMonitor.captureError(error, context, severity);
}

export function captureWarning(message: string, context?: ErrorContext): void {
  errorMonitor.captureWarning(message, context);
}

export function captureCritical(error: Error, context?: ErrorContext): void {
  errorMonitor.captureCritical(error, context);
}
