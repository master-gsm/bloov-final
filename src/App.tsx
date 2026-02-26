import { useState, useEffect, useRef, Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { BranchProvider } from './contexts/BranchContext';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import { OfflineFirstProvider } from './contexts/OfflineFirstContext';
import { TestModeProvider } from './contexts/TestModeContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { LoginForm } from './components/LoginForm';
import { ResetPassword } from './components/ResetPassword';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { TestModeAlert } from './components/TestModeAlert';
import { Dashboard } from './components/Dashboard';
import { Products } from './components/Products';
import { Partners } from './components/Partners';
import { Employees } from './components/Employees';
import { UserManagement } from './components/UserManagement';
import { Sales } from './components/Sales';
import { Purchases } from './components/Purchases';
import Expenses from './components/Expenses';
import { Customers } from './components/Customers';
import { Suppliers } from './components/Suppliers';
import { Inventory } from './components/Inventory';
import { Reports } from './components/Reports';
import { Settings } from './components/Settings';
import { CashRegister } from './components/CashRegister';
import { SallaOrders } from './components/SallaOrders';
import Branches from './components/Branches';
import Backup from './components/Backup';
import FixedAssets from './components/FixedAssets';
import JournalEntries from './components/JournalEntries';
import SystemHealth from './components/SystemHealth';
import { supabase } from './lib/supabase';
import type { Section } from './lib/permissions';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[AppErrorBoundary] Caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center app-background p-4">
          <div className="bg-white rounded-2xl shadow-soft-xl p-8 max-w-md w-full text-center space-y-4 border border-lux-border">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3a9 9 0 110 18A9 9 0 0112 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-primary">حدث خطأ غير متوقع</h2>
            <p className="text-secondary text-sm">{this.state.error?.message || 'Unknown error'}</p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-6 py-2.5 bg-accent text-white rounded-xl hover:bg-accent-hover transition-all font-medium shadow-soft-sm"
            >
              المحاولة مجددا
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppContent() {
  const { user, loading, permissionsReady, can } = useAuth();
  const { t } = useLanguage();
  const [activeSection, setActiveSection] = useState('dashboard');
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  const profileSetRef = useRef(false);

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const type = hashParams.get('type');
    if (type === 'recovery') {
      setIsPasswordRecovery(true);
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user && !profileSetRef.current) {
      profileSetRef.current = true;
      if (can('dashboard' as Section, 'view')) {
        setActiveSection('dashboard');
      } else if (can('sales' as Section, 'view')) {
        setActiveSection('sales');
      }
    }
    if (!user) {
      profileSetRef.current = false;
    }
  }, [user, can]);

  if (isPasswordRecovery) {
    return <ResetPassword />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center login-background">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-secondary font-medium">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginForm />;
  }

  const handleSetActiveSection = (section: string) => {
    if (can(section as Section, 'view')) {
      setActiveSection(section);
    }
  };

  const renderSection = () => {
    if (!permissionsReady) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto"></div>
          </div>
        </div>
      );
    }

    if (!can(activeSection as Section, 'view')) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center p-8">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-primary mb-1">لا توجد صلاحية</h3>
            <p className="text-secondary text-sm">ليس لديك صلاحية للوصول لهذا القسم</p>
          </div>
        </div>
      );
    }

    switch (activeSection) {
      case 'dashboard': return <Dashboard />;
      case 'products': return <Products />;
      case 'partners': return <Partners />;
      case 'employees': return <Employees />;
      case 'sales': return <Sales />;
      case 'purchases': return <Purchases />;
      case 'expenses': return <Expenses />;
      case 'fixedassets': return <FixedAssets />;
      case 'inventory': return <Inventory />;
      case 'customers': return <Customers />;
      case 'suppliers': return <Suppliers />;
      case 'branches': return <Branches />;
      case 'salla': return <SallaOrders />;
      case 'cashregister': return <CashRegister />;
      case 'reports': return <Reports />;
      case 'journal': return <JournalEntries />;
      case 'backup': return <Backup />;
      case 'systemhealth': return <SystemHealth />;
      case 'users': return <UserManagement />;
      case 'settings': return <Settings />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="min-h-screen app-background">
      <Navbar />
      <TestModeAlert />
      <div className="flex">
        <Sidebar activeSection={activeSection} setActiveSection={handleSetActiveSection} />
        <main className="flex-1 overflow-auto h-[calc(100vh-65px)]">
          {renderSection()}
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <BranchProvider>
          <LanguageProvider>
            <TestModeProvider>
              <ThemeProvider>
                <OfflineFirstProvider>
                  <AppErrorBoundary>
                    <AppContent />
                  </AppErrorBoundary>
                </OfflineFirstProvider>
              </ThemeProvider>
            </TestModeProvider>
          </LanguageProvider>
        </BranchProvider>
      </AuthProvider>
    </AppErrorBoundary>
  );
}

export default App;
