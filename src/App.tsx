import { useState, useEffect, useRef, Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { BranchProvider } from './contexts/BranchContext';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import { OfflineFirstProvider } from './contexts/OfflineFirstContext';
import { TestModeProvider } from './contexts/TestModeContext';
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
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center space-y-4">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3a9 9 0 110 18A9 9 0 0112 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900">حدث خطأ غير متوقع</h2>
            <p className="text-gray-600 text-sm">{this.state.error?.message || 'Unknown error'}</p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-6 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition font-medium"
            >
              المحاولة مجدداً
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const SECTION_PERMISSIONS: Record<string, string[]> = {
  dashboard: ['admin', 'viewer'],
  sales: ['admin', 'accountant', 'salesperson', 'viewer'],
  purchases: ['admin', 'accountant', 'viewer'],
  expenses: ['admin', 'accountant', 'viewer'],
  fixedassets: ['admin', 'accountant', 'viewer'],
  setupexpenses: ['admin'],
  products: ['admin', 'accountant', 'salesperson', 'viewer'],
  inventory: ['admin', 'accountant', 'salesperson', 'viewer'],
  customers: ['admin', 'accountant', 'viewer'],
  suppliers: ['admin', 'accountant', 'viewer'],
  partners: ['admin', 'viewer'],
  employees: ['admin'],
  branches: ['admin'],
  salla: ['admin', 'accountant'],
  cashregister: ['admin', 'accountant', 'viewer'],
  reports: ['admin', 'accountant', 'viewer'],
  journal: ['admin', 'accountant', 'viewer'],
  backup: ['admin'],
  systemhealth: ['admin'],
  users: ['admin'],
  settings: ['admin'],
};

function AppContent() {
  const { user, loading, hasPermission, isAdmin, profile } = useAuth();
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
    if (profile && !isAdmin && !profileSetRef.current) {
      profileSetRef.current = true;
      setActiveSection('sales');
    }
    if (!profile) {
      profileSetRef.current = false;
    }
  }, [profile, isAdmin]);

  if (isPasswordRecovery) {
    return <ResetPassword />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-gray-600">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginForm />;
  }

  const canAccessSection = (section: string): boolean => {
    const allowedRoles = SECTION_PERMISSIONS[section];
    if (!allowedRoles) return false;
    if (!profile) return false;
    return allowedRoles.includes(profile.role);
  };

  const handleSetActiveSection = (section: string) => {
    if (canAccessSection(section)) {
      setActiveSection(section);
    }
  };

  const renderSection = () => {
    if (!canAccessSection(activeSection)) {
      return <Sales />;
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
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <TestModeAlert />
      <div className="flex">
        <Sidebar activeSection={activeSection} setActiveSection={handleSetActiveSection} />
        <main className="flex-1 overflow-auto h-[calc(100vh-73px)]">
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
              <OfflineFirstProvider>
                <AppErrorBoundary>
                  <AppContent />
                </AppErrorBoundary>
              </OfflineFirstProvider>
            </TestModeProvider>
          </LanguageProvider>
        </BranchProvider>
      </AuthProvider>
    </AppErrorBoundary>
  );
}

export default App;
