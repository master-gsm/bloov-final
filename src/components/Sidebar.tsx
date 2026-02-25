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
  Building2,
  DollarSign,
  Database,
  Landmark,
  BookOpen,
  ShieldCheck,
} from 'lucide-react';
import type { Section } from '../lib/permissions';

interface SidebarProps {
  activeSection: string;
  setActiveSection: (section: string) => void;
}

export function Sidebar({ activeSection, setActiveSection }: SidebarProps) {
  const { t, isRTL } = useLanguage();
  const { can } = useAuth();

  const menuItems: { id: Section; icon: typeof LayoutDashboard; label: string }[] = [
    { id: 'dashboard', icon: LayoutDashboard, label: t('nav.dashboard') },
    { id: 'sales', icon: ShoppingCart, label: t('nav.sales') },
    { id: 'purchases', icon: ShoppingBag, label: t('nav.purchases') },
    { id: 'expenses', icon: Receipt, label: isRTL ? 'المصاريف التشغيلية' : 'Operating Expenses' },
    { id: 'fixedassets', icon: Landmark, label: isRTL ? 'الأصول الثابتة' : 'Fixed Assets' },
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
    { id: 'journal', icon: BookOpen, label: isRTL ? 'القيود اليومية' : 'Journal Entries' },
    { id: 'backup', icon: Database, label: isRTL ? 'النسخ الاحتياطي' : 'Backup' },
    { id: 'systemhealth', icon: ShieldCheck, label: isRTL ? 'صحة النظام' : 'System Health' },
    { id: 'users', icon: UserCog, label: t('nav.users') },
    { id: 'settings', icon: Settings, label: t('nav.settings') },
  ];

  const visibleItems = menuItems.filter(item => can(item.id, 'view'));

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
