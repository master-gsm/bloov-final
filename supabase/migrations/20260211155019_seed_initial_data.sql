/*
  # Seed Initial Data for BLOOV System
  
  ## Description
  This migration populates the database with essential initial data:
  
  1. **Partners**: Sami (60%) and Anas (40%)
  2. **Roles**: Admin, Manager, Salesperson, Accountant, Viewer
  3. **Permissions**: Comprehensive permissions for all modules
  4. **Categories**: Natural flowers, Artificial flowers, Accessories
  5. **Accounts**: Basic chart of accounts for financial management
  
  ## Important Notes
  - Partners are created with their exact share percentages
  - Roles are pre-configured with appropriate permissions
  - Categories are created for both natural and artificial flowers
  - Chart of accounts follows standard accounting structure
*/

-- =============================================
-- INSERT PARTNERS
-- =============================================

INSERT INTO partners (name, name_ar, share_percentage, is_active) VALUES
('Sami', 'سامي', 60.00, true),
('Anas', 'أنس', 40.00, true)
ON CONFLICT DO NOTHING;

-- =============================================
-- INSERT ROLES
-- =============================================

INSERT INTO roles (id, name, name_ar, description, description_ar, is_system_role) VALUES
('00000000-0000-0000-0000-000000000001', 'Admin', 'مدير النظام', 'Full system access', 'صلاحية كاملة للنظام', true),
('00000000-0000-0000-0000-000000000002', 'Manager', 'مدير', 'Management access', 'صلاحيات إدارية', true),
('00000000-0000-0000-0000-000000000003', 'Salesperson', 'موظف مبيعات', 'Sales operations', 'عمليات المبيعات', true),
('00000000-0000-0000-0000-000000000004', 'Accountant', 'محاسب', 'Financial operations', 'العمليات المالية', true),
('00000000-0000-0000-0000-000000000005', 'Viewer', 'مستعرض', 'Read-only access', 'صلاحية قراءة فقط', true)
ON CONFLICT (id) DO NOTHING;

-- =============================================
-- INSERT PERMISSIONS
-- =============================================

INSERT INTO permissions (name, name_ar, module, action, description, description_ar) VALUES
-- Products
('products.view', 'عرض المنتجات', 'products', 'view', 'View products', 'عرض المنتجات'),
('products.create', 'إنشاء المنتجات', 'products', 'create', 'Create products', 'إنشاء منتجات جديدة'),
('products.edit', 'تعديل المنتجات', 'products', 'edit', 'Edit products', 'تعديل المنتجات'),
('products.delete', 'حذف المنتجات', 'products', 'delete', 'Delete products', 'حذف المنتجات'),

-- Sales
('sales.view', 'عرض المبيعات', 'sales', 'view', 'View sales', 'عرض المبيعات'),
('sales.create', 'إنشاء مبيعات', 'sales', 'create', 'Create sales', 'إنشاء مبيعات جديدة'),
('sales.edit', 'تعديل المبيعات', 'sales', 'edit', 'Edit sales', 'تعديل المبيعات'),
('sales.delete', 'حذف المبيعات', 'sales', 'delete', 'Delete sales', 'حذف المبيعات'),

-- Purchases
('purchases.view', 'عرض المشتريات', 'purchases', 'view', 'View purchases', 'عرض المشتريات'),
('purchases.create', 'إنشاء مشتريات', 'purchases', 'create', 'Create purchases', 'إنشاء مشتريات جديدة'),
('purchases.edit', 'تعديل المشتريات', 'purchases', 'edit', 'Edit purchases', 'تعديل المشتريات'),
('purchases.delete', 'حذف المشتريات', 'purchases', 'delete', 'Delete purchases', 'حذف المشتريات'),

-- Customers
('customers.view', 'عرض العملاء', 'customers', 'view', 'View customers', 'عرض العملاء'),
('customers.create', 'إنشاء عملاء', 'customers', 'create', 'Create customers', 'إنشاء عملاء جدد'),
('customers.edit', 'تعديل العملاء', 'customers', 'edit', 'Edit customers', 'تعديل العملاء'),
('customers.delete', 'حذف العملاء', 'customers', 'delete', 'Delete customers', 'حذف العملاء'),

-- Suppliers
('suppliers.view', 'عرض الموردين', 'suppliers', 'view', 'View suppliers', 'عرض الموردين'),
('suppliers.create', 'إنشاء موردين', 'suppliers', 'create', 'Create suppliers', 'إنشاء موردين جدد'),
('suppliers.edit', 'تعديل الموردين', 'suppliers', 'edit', 'Edit suppliers', 'تعديل الموردين'),
('suppliers.delete', 'حذف الموردين', 'suppliers', 'delete', 'Delete suppliers', 'حذف الموردين'),

-- Inventory
('inventory.view', 'عرض المخزون', 'inventory', 'view', 'View inventory', 'عرض المخزون'),
('inventory.manage', 'إدارة المخزون', 'inventory', 'manage', 'Manage inventory', 'إدارة المخزون'),

-- Financial
('finance.view', 'عرض المالية', 'finance', 'view', 'View financial data', 'عرض البيانات المالية'),
('finance.manage', 'إدارة المالية', 'finance', 'manage', 'Manage finances', 'إدارة المالية'),
('reports.view', 'عرض التقارير', 'reports', 'view', 'View reports', 'عرض التقارير'),

-- Partners
('partners.view', 'عرض الشركاء', 'partners', 'view', 'View partners', 'عرض الشركاء'),
('partners.manage', 'إدارة الشركاء', 'partners', 'manage', 'Manage partners', 'إدارة الشركاء'),

-- Users
('users.view', 'عرض المستخدمين', 'users', 'view', 'View users', 'عرض المستخدمين'),
('users.manage', 'إدارة المستخدمين', 'users', 'manage', 'Manage users', 'إدارة المستخدمين'),

-- Settings
('settings.view', 'عرض الإعدادات', 'settings', 'view', 'View settings', 'عرض الإعدادات'),
('settings.manage', 'إدارة الإعدادات', 'settings', 'manage', 'Manage settings', 'إدارة الإعدادات')
ON CONFLICT (name) DO NOTHING;

-- =============================================
-- ASSIGN PERMISSIONS TO ROLES
-- =============================================

-- Admin gets all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000001', id FROM permissions
ON CONFLICT DO NOTHING;

-- Manager gets most permissions except user management
INSERT INTO role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000002', id FROM permissions
WHERE name NOT IN ('users.manage', 'settings.manage')
ON CONFLICT DO NOTHING;

-- Salesperson gets sales, customers, and inventory view
INSERT INTO role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000003', id FROM permissions
WHERE name IN (
  'products.view', 'sales.view', 'sales.create', 'sales.edit',
  'customers.view', 'customers.create', 'customers.edit',
  'inventory.view', 'reports.view'
)
ON CONFLICT DO NOTHING;

-- Accountant gets financial, purchases, and reports
INSERT INTO role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000004', id FROM permissions
WHERE name IN (
  'products.view', 'purchases.view', 'purchases.create', 'purchases.edit',
  'suppliers.view', 'suppliers.create', 'suppliers.edit',
  'finance.view', 'finance.manage', 'reports.view',
  'inventory.view', 'partners.view'
)
ON CONFLICT DO NOTHING;

-- Viewer gets only view permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000005', id FROM permissions
WHERE action = 'view'
ON CONFLICT DO NOTHING;

-- =============================================
-- INSERT CATEGORIES
-- =============================================

INSERT INTO categories (name, name_ar, type, description, description_ar, parent_id) VALUES
-- Main categories
('Natural Flowers', 'ورد طبيعي', 'natural', 'Fresh natural flowers', 'ورد طبيعي طازج', NULL),
('Artificial Flowers', 'ورد صناعي', 'artificial', 'High-quality artificial flowers', 'ورد صناعي عالي الجودة', NULL),
('Accessories', 'إكسسوارات', 'accessories', 'Flower arrangements accessories', 'إكسسوارات تنسيق الورد', NULL),
('Supplies', 'مستلزمات', 'other', 'Shop supplies', 'مستلزمات المحل', NULL)
ON CONFLICT DO NOTHING;

-- Sub-categories for natural flowers
INSERT INTO categories (name, name_ar, type, description, description_ar, parent_id)
SELECT 'Roses', 'ورد جوري', 'natural', 'Natural roses', 'ورد جوري طبيعي', id FROM categories WHERE name = 'Natural Flowers' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, name_ar, type, description, description_ar, parent_id)
SELECT 'Tulips', 'توليب', 'natural', 'Natural tulips', 'توليب طبيعي', id FROM categories WHERE name = 'Natural Flowers' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, name_ar, type, description, description_ar, parent_id)
SELECT 'Lilies', 'زنبق', 'natural', 'Natural lilies', 'زنبق طبيعي', id FROM categories WHERE name = 'Natural Flowers' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, name_ar, type, description, description_ar, parent_id)
SELECT 'Orchids', 'أوركيد', 'natural', 'Natural orchids', 'أوركيد طبيعي', id FROM categories WHERE name = 'Natural Flowers' LIMIT 1
ON CONFLICT DO NOTHING;

-- Sub-categories for artificial flowers
INSERT INTO categories (name, name_ar, type, description, description_ar, parent_id)
SELECT 'Silk Flowers', 'ورد حرير', 'artificial', 'Silk artificial flowers', 'ورد صناعي حرير', id FROM categories WHERE name = 'Artificial Flowers' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, name_ar, type, description, description_ar, parent_id)
SELECT 'Plastic Flowers', 'ورد بلاستيك', 'artificial', 'Plastic artificial flowers', 'ورد صناعي بلاستيك', id FROM categories WHERE name = 'Artificial Flowers' LIMIT 1
ON CONFLICT DO NOTHING;

-- =============================================
-- INSERT CHART OF ACCOUNTS
-- =============================================

INSERT INTO accounts (code, name, name_ar, type, parent_id, balance) VALUES
-- Assets
('1000', 'Assets', 'الأصول', 'asset', NULL, 0),
('1100', 'Current Assets', 'أصول متداولة', 'asset', NULL, 0),
('1110', 'Cash', 'النقدية', 'asset', NULL, 0),
('1120', 'Bank Account', 'الحساب البنكي', 'asset', NULL, 0),
('1130', 'Accounts Receivable', 'العملاء', 'asset', NULL, 0),
('1140', 'Inventory', 'المخزون', 'asset', NULL, 0),

-- Liabilities
('2000', 'Liabilities', 'الخصوم', 'liability', NULL, 0),
('2100', 'Current Liabilities', 'خصوم متداولة', 'liability', NULL, 0),
('2110', 'Accounts Payable', 'الموردين', 'liability', NULL, 0),

-- Equity
('3000', 'Equity', 'حقوق الملكية', 'equity', NULL, 0),
('3100', 'Partners Capital', 'رأس مال الشركاء', 'equity', NULL, 0),
('3110', 'Sami Capital (60%)', 'رأس مال سامي (60%)', 'equity', NULL, 0),
('3120', 'Anas Capital (40%)', 'رأس مال أنس (40%)', 'equity', NULL, 0),
('3200', 'Retained Earnings', 'الأرباح المحتجزة', 'equity', NULL, 0),

-- Revenue
('4000', 'Revenue', 'الإيرادات', 'revenue', NULL, 0),
('4100', 'Sales Revenue', 'إيرادات المبيعات', 'revenue', NULL, 0),
('4110', 'Natural Flowers Sales', 'مبيعات ورد طبيعي', 'revenue', NULL, 0),
('4120', 'Artificial Flowers Sales', 'مبيعات ورد صناعي', 'revenue', NULL, 0),

-- Expenses
('5000', 'Expenses', 'المصروفات', 'expense', NULL, 0),
('5100', 'Cost of Goods Sold', 'تكلفة البضاعة المباعة', 'expense', NULL, 0),
('5200', 'Operating Expenses', 'مصروفات تشغيلية', 'expense', NULL, 0),
('5210', 'Salaries', 'الرواتب', 'expense', NULL, 0),
('5220', 'Rent', 'الإيجار', 'expense', NULL, 0),
('5230', 'Utilities', 'المرافق', 'expense', NULL, 0),
('5240', 'Marketing', 'التسويق', 'expense', NULL, 0),
('5250', 'Supplies', 'المستلزمات', 'expense', NULL, 0)
ON CONFLICT (code) DO NOTHING;
