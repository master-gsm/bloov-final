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
} from 'lucide-react';

interface SidebarProps {
  activeSection: string;
  setActiveSection: (section: string) => void;
}

export function Sidebar({ activeSection, setActiveSection }: SidebarProps) {
  const { t, isRTL } = useLanguage();
  const { hasPermission, isAdmin } = useAuth();

  const menuItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: t('nav.dashboard'), permission: 'admin_only' },
    { id: 'sales', icon: ShoppingCart, label: t('nav.sales'), permission: 'view_sales' },
    { id: 'purchases', icon: ShoppingBag, label: t('nav.purchases'), permission: 'view_purchases' },
    { id: 'expenses', icon: Receipt, label: isRTL ? 'المصاريف التشغيلية' : 'Operating Expenses', permission: 'view_purchases' },
    { id: 'products', icon: Package, label: t('nav.products'), permission: 'view_inventory' },
    { id: 'inventory', icon: Warehouse, label: t('nav.inventory'), permission: 'view_inventory' },
    { id: 'customers', icon: Users, label: t('nav.customers'), permission: 'view_customers' },
    { id: 'suppliers', icon: Truck, label: t('nav.suppliers'), permission: 'view_suppliers' },
    { id: 'partners', icon: UsersRound, label: t('nav.partners'), permission: 'admin_only' },
    { id: 'cashregister', icon: Wallet, label: isRTL ? 'الصندوق' : 'Cash Register', permission: 'view_cash_register' },
    { id: 'reports', icon: FileText, label: t('nav.reports'), permission: 'view_reports' },
    { id: 'users', icon: UserCog, label: t('nav.users'), permission: 'manage_users' },
    { id: 'settings', icon: Settings, label: t('nav.settings'), permission: 'manage_settings' },
  ];

  const visibleItems = menuItems.filter(item => {
    if (item.permission === 'admin_only') {
      return isAdmin;
    }
    return item.permission === null || hasPermission(item.permission);
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
