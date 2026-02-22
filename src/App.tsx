import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { BranchProvider } from './contexts/BranchContext';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import { OfflineProvider } from './contexts/OfflineContext';
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
import { AIAnalysis } from './components/AIAnalysis';
import Branches from './components/Branches';
import Backup from './components/Backup';
import FixedAssets from './components/FixedAssets';
import { SyncQueue } from './components/SyncQueue';
import { supabase } from './lib/supabase';

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
  aianalysis: ['admin', 'accountant', 'viewer'],
  backup: ['admin'],
  users: ['admin'],
  settings: ['admin'],
  syncqueue: ['admin', 'accountant', 'salesperson', 'viewer'],
};

function AppContent() {
  const { user, loading, hasPermission, isAdmin, profile } = useAuth();
  const { t } = useLanguage();
  const [activeSection, setActiveSection] = useState('dashboard');
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const type = hashParams.get('type');
    if (type === 'recovery') {
      setIsPasswordRecovery(true);
    }

    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
      }
    });
  }, []);

  useEffect(() => {
    if (profile && !isAdmin) {
      setActiveSection('sales');
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
      // إذا لم يكن لديه صلاحية للقسم الحالي، اعرض أول قسم متاح
      const firstAvailableSection = Object.keys(SECTION_PERMISSIONS).find(s => canAccessSection(s));
      if (firstAvailableSection && firstAvailableSection !== activeSection) {
        setActiveSection(firstAvailableSection);
      }
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
      case 'aianalysis': return <AIAnalysis />;
      case 'backup': return <Backup />;
      case 'users': return <UserManagement />;
      case 'settings': return <Settings />;
      case 'syncqueue': return <SyncQueue />;
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
    <AuthProvider>
      <BranchProvider>
        <LanguageProvider>
          <TestModeProvider>
            <OfflineProvider>
              <OfflineFirstProvider>
                <AppContent />
              </OfflineFirstProvider>
            </OfflineProvider>
          </TestModeProvider>
        </LanguageProvider>
      </BranchProvider>
    </AuthProvider>
  );
}

export default App;
