import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard,
  ShoppingCart,
  ShoppingBag,
  Package,
  Warehouse,
  Users,
  Truck,
  UsersRound,
  FileText,
  Settings,
  UserCog,
  Wallet,
  Receipt,
  Store,
  Brain,
  Building2,
  DollarSign,
} from 'lucide-react';

interface SidebarProps {
  activeSection: string;
  setActiveSection: (section: string) => void;
}

const MENU_ACCESS: Record<string, string[]> = {
  dashboard: ['admin', 'viewer'],
  sales: ['admin', 'accountant', 'salesperson', 'viewer'],
  purchases: ['admin', 'accountant', 'viewer'],
  expenses: ['admin', 'accountant', 'viewer'],
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
  users: ['admin'],
  settings: ['admin'],
};

export function Sidebar({ activeSection, setActiveSection }: SidebarProps) {
  const { t, isRTL } = useLanguage();
  const { profile } = useAuth();

  const menuItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: t('nav.dashboard') },
    { id: 'sales', icon: ShoppingCart, label: t('nav.sales') },
    { id: 'purchases', icon: ShoppingBag, label: t('nav.purchases') },
    { id: 'expenses', icon: Receipt, label: isRTL ? 'المصاريف التشغيلية' : 'Operating Expenses' },
    { id: 'products', icon: Package, label: t('nav.products') },
    { id: 'inventory', icon: Warehouse, label: t('nav.inventory') },
    { id: 'customers', icon: Users, label: t('nav.customers') },
    { id: 'suppliers', icon: Truck, label: t('nav.suppliers') },
    { id: 'partners', icon: UsersRound, label: t('nav.partners') },
    { id: 'employees', icon: DollarSign, label: isRTL ? 'الموظفين والرواتب' : 'Employees & Salaries' },
    { id: 'branches', icon: Building2, label: isRTL ? 'الفروع' : 'Branches' },
    { id: 'salla', icon: Store, label: isRTL ? 'سلة' : 'Salla' },
    { id: 'cashregister', icon: Wallet, label: isRTL ? 'الصندوق' : 'Cash Register' },
    { id: 'reports', icon: FileText, label: t('nav.reports') },
    { id: 'aianalysis', icon: Brain, label: isRTL ? 'التحليل الذكي' : 'AI Analysis' },
    { id: 'users', icon: UserCog, label: t('nav.users') },
    { id: 'settings', icon: Settings, label: t('nav.settings') },
  ];

  const visibleItems = menuItems.filter(item => {
    const allowedRoles = MENU_ACCESS[item.id];
    if (!allowedRoles || !profile) return false;
    return allowedRoles.includes(profile.role);
  });

  return (
    <aside className="w-64 bg-gradient-to-b from-gray-900 to-gray-800 text-white h-[calc(100vh-73px)] overflow-y-auto flex-shrink-0">
      <nav className="p-4 space-y-1">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                isActive
                  ? 'bg-teal-600 text-white shadow-lg'
                  : 'hover:bg-white/10 text-gray-300 hover:text-white'
              } ${isRTL ? 'flex-row-reverse' : ''}`}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              <span className="font-medium text-sm">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
