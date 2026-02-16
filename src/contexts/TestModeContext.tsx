import React, { createContext, useContext, useState, useEffect } from 'react';

interface TestModeContextType {
  isTestMode: boolean;
  setTestMode: (enabled: boolean) => void;
}

const TestModeContext = createContext<TestModeContextType | undefined>(undefined);

export function TestModeProvider({ children }: { children: React.ReactNode }) {
  const [isTestMode, setIsTestMode] = useState(() => {
    const saved = localStorage.getItem('testMode');
    return saved === 'true';
  });

  useEffect(() => {
    localStorage.setItem('testMode', isTestMode.toString());
  }, [isTestMode]);

  const setTestMode = (enabled: boolean) => {
    setIsTestMode(enabled);
    if (enabled) {
      console.warn('⚠️ TEST MODE ENABLED - No data will be saved to database');
    } else {
      console.log('✅ Test Mode disabled - Normal operation');
    }
  };

  return (
    <TestModeContext.Provider value={{ isTestMode, setTestMode }}>
      {children}
    </TestModeContext.Provider>
  );
}

export function useTestMode() {
  const context = useContext(TestModeContext);
  if (context === undefined) {
    throw new Error('useTestMode must be used within a TestModeProvider');
  }
  return context;
}
