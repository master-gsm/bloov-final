import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import { OfflineProvider } from './contexts/OfflineContext';
import { LoginForm } from './components/LoginForm';
import { AdminSetup } from './components/AdminSetup';
import { ResetPassword } from './components/ResetPassword';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { ConnectionStatusBar } from './components/ConnectionStatusBar';
import { Dashboard } from './components/Dashboard';
import { Products } from './components/Products';
import { Partners } from './components/Partners';
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
import { supabase } from './lib/supabase';

const SECTION_PERMISSIONS: Record<string, string[]> = {
  dashboard: ['admin', 'viewer', 'super_admin'],
  sales: ['admin', 'accountant', 'salesperson', 'viewer', 'super_admin'],
  purchases: ['admin', 'accountant', 'viewer', 'super_admin'],
  expenses: ['admin', 'accountant', 'viewer', 'super_admin'],
  setupexpenses: ['admin', 'super_admin'],
  products: ['admin', 'accountant', 'salesperson', 'viewer', 'super_admin'],
  inventory: ['admin', 'accountant', 'salesperson', 'viewer', 'super_admin'],
  customers: ['admin', 'accountant', 'viewer', 'super_admin'],
  suppliers: ['admin', 'accountant', 'viewer', 'super_admin'],
  partners: ['admin', 'viewer', 'super_admin'],
  branches: ['admin', 'super_admin'],
  salla: ['admin', 'accountant', 'super_admin'],
  cashregister: ['admin', 'accountant', 'viewer', 'super_admin'],
  reports: ['admin', 'accountant', 'viewer', 'super_admin'],
  aianalysis: ['admin', 'accountant', 'viewer', 'super_admin'],
  users: ['admin', 'super_admin'],
  settings: ['admin', 'super_admin'],
};

function AppContent() {
  const { user, loading, hasPermission, isAdmin, profile } = useAuth();
  const { t } = useLanguage();
  const [activeSection, setActiveSection] = useState('dashboard');
  const [hasUsers, setHasUsers] = useState<boolean | null>(null);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  useEffect(() => {
    checkForUsers();

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

  const checkForUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id')
        .limit(1);

      if (error) {
        console.error('Error checking users:', error);
        setHasUsers(true);
        return;
      }

      setHasUsers(data && data.length > 0);
    } catch (err) {
      console.error('Error:', err);
      setHasUsers(true);
    }
  };

  if (isPasswordRecovery) {
    return <ResetPassword />;
  }

  if (loading || hasUsers === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-gray-600">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (!hasUsers) {
    return <AdminSetup onAdminCreated={() => setHasUsers(true)} />;
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
      case 'sales': return <Sales />;
      case 'purchases': return <Purchases />;
      case 'expenses': return <Expenses />;
      case 'inventory': return <Inventory />;
      case 'customers': return <Customers />;
      case 'suppliers': return <Suppliers />;
      case 'branches': return <Branches />;
      case 'salla': return <SallaOrders />;
      case 'cashregister': return <CashRegister />;
      case 'reports': return <Reports />;
      case 'aianalysis': return <AIAnalysis />;
      case 'users': return <UserManagement />;
      case 'settings': return <Settings />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <ConnectionStatusBar />
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
      <LanguageProvider>
        <OfflineProvider>
          <AppContent />
        </OfflineProvider>
      </LanguageProvider>
    </AuthProvider>
  );
}

export default App;
