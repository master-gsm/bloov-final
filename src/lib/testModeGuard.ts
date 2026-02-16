export function isTestModeActive(): boolean {
  return localStorage.getItem('testMode') === 'true';
}

export function preventIfTestMode<T>(
  operation: () => Promise<T>,
  fallbackResult?: T
): Promise<T> {
  if (isTestModeActive()) {
    console.warn('🧪 Test Mode: Operation blocked - no data saved');

    return Promise.resolve(fallbackResult || {
      data: null,
      error: null,
    } as unknown as T);
  }

  return operation();
}
