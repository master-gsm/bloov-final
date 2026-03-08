export const SECTIONS = [
  'dashboard', 'sales', 'purchases', 'expenses', 'fixedassets',
  'products', 'inventory', 'customers', 'suppliers', 'partners',
  'employees', 'custody', 'branches', 'salla', 'cashregister', 'reports',
  'journal', 'backup', 'systemhealth', 'users', 'settings',
] as const;

export type Section = typeof SECTIONS[number];
export type Action = 'view' | 'create' | 'edit' | 'delete';

export interface SectionPermissions {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
}

export type PermissionsMap = Record<Section, SectionPermissions>;

const NO_ACCESS: SectionPermissions = { view: false, create: false, edit: false, delete: false };
const FULL_ACCESS: SectionPermissions = { view: true, create: true, edit: true, delete: true };
const VIEW_ONLY: SectionPermissions = { view: true, create: false, edit: false, delete: false };

export function emptyPermissions(): PermissionsMap {
  return SECTIONS.reduce((acc, s) => ({ ...acc, [s]: { ...NO_ACCESS } }), {} as PermissionsMap);
}

export function fullPermissions(): PermissionsMap {
  return SECTIONS.reduce((acc, s) => ({ ...acc, [s]: { ...FULL_ACCESS } }), {} as PermissionsMap);
}

export function viewOnlyPermissions(): PermissionsMap {
  return SECTIONS.reduce((acc, s) => ({ ...acc, [s]: { ...VIEW_ONLY } }), {} as PermissionsMap);
}

export const ROLE_TEMPLATES: Record<string, PermissionsMap> = {
  admin: fullPermissions(),
  accountant: {
    ...emptyPermissions(),
    dashboard: { view: true, create: false, edit: false, delete: false },
    sales: { view: true, create: true, edit: true, delete: false },
    purchases: { view: true, create: true, edit: true, delete: false },
    expenses: { view: true, create: true, edit: true, delete: false },
    fixedassets: { view: true, create: true, edit: true, delete: false },
    products: { view: true, create: true, edit: true, delete: false },
    inventory: { view: true, create: false, edit: false, delete: false },
    customers: { view: true, create: true, edit: true, delete: false },
    suppliers: { view: true, create: true, edit: true, delete: false },
    cashregister: { view: true, create: true, edit: true, delete: false },
    reports: { view: true, create: false, edit: false, delete: false },
    journal: { view: true, create: true, edit: true, delete: false },
    custody: { view: true, create: true, edit: true, delete: false },
  },
  observer: viewOnlyPermissions(),
  viewer: {
    ...emptyPermissions(),
    dashboard: { ...VIEW_ONLY },
    sales: { ...VIEW_ONLY },
    products: { ...VIEW_ONLY },
    inventory: { ...VIEW_ONLY },
    reports: { ...VIEW_ONLY },
  },
};

export const SECTION_LABELS: Record<Section, { ar: string; en: string }> = {
  dashboard: { ar: 'لوحة التحكم', en: 'Dashboard' },
  sales: { ar: 'المبيعات', en: 'Sales' },
  purchases: { ar: 'المشتريات', en: 'Purchases' },
  expenses: { ar: 'المصاريف التشغيلية', en: 'Operating Expenses' },
  fixedassets: { ar: 'الأصول الثابتة', en: 'Fixed Assets' },
  products: { ar: 'المنتجات', en: 'Products' },
  inventory: { ar: 'المخزون', en: 'Inventory' },
  customers: { ar: 'العملاء', en: 'Customers' },
  suppliers: { ar: 'الموردين', en: 'Suppliers' },
  partners: { ar: 'الشركاء', en: 'Partners' },
  employees: { ar: 'الموظفين والرواتب', en: 'Employees & Salaries' },
  custody: { ar: 'عهدة الموظفين', en: 'Employee Custody' },
  branches: { ar: 'الفروع', en: 'Branches' },
  salla: { ar: 'سلة', en: 'Salla' },
  cashregister: { ar: 'الصندوق', en: 'Cash Register' },
  reports: { ar: 'التقارير', en: 'Reports' },
  journal: { ar: 'القيود اليومية', en: 'Journal Entries' },
  backup: { ar: 'النسخ الاحتياطي', en: 'Backup' },
  systemhealth: { ar: 'صحة النظام', en: 'System Health' },
  users: { ar: 'المستخدمين', en: 'Users' },
  settings: { ar: 'الإعدادات', en: 'Settings' },
};
