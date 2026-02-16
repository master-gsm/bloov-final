import { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  UserPlus, Shield, Eye, Calculator, Ban, CheckCircle, X,
  Pencil, Trash2, Key, Save, AlertTriangle
} from 'lucide-react';

interface User {
  id: string;
  full_name: string;
  role: 'admin' | 'accountant' | 'viewer' | 'observer';
  is_active: boolean;
  created_at: string;
  email: string | null;
  permissions: Record<string, boolean> | null;
}

const PERMISSION_KEYS = [
  'view_sales', 'create_sales', 'view_purchases', 'create_purchases',
  'view_inventory', 'manage_inventory', 'view_reports',
  'view_cash_register', 'manage_cash_register',
  'view_customers', 'manage_customers',
  'view_suppliers', 'manage_suppliers',
  'manage_users', 'manage_settings',
];

const DEFAULT_PERMISSIONS = PERMISSION_KEYS.reduce((acc, key) => ({ ...acc, [key]: false }), {} as Record<string, boolean>);

const ROLE_TEMPLATES: Record<string, Record<string, boolean>> = {
  admin: PERMISSION_KEYS.reduce((acc, key) => ({ ...acc, [key]: true }), {} as Record<string, boolean>),
  accountant: {
    view_sales: true, create_sales: true, view_purchases: true, create_purchases: true,
    view_inventory: true, manage_inventory: false, view_reports: true,
    view_cash_register: true, manage_cash_register: true,
    view_customers: true, manage_customers: false, view_suppliers: true, manage_suppliers: false,
    manage_users: false, manage_settings: false,
  },
  observer: {
    view_sales: true, create_sales: false, view_purchases: true, create_purchases: false,
    view_inventory: true, manage_inventory: false, view_reports: true,
    view_cash_register: true, manage_cash_register: false,
    view_customers: true, manage_customers: false, view_suppliers: true, manage_suppliers: false,
    manage_users: false, manage_settings: false,
  },
  viewer: {
    view_sales: true, create_sales: false, view_purchases: false, create_purchases: false,
    view_inventory: true, manage_inventory: false, view_reports: true,
    view_cash_register: false, manage_cash_register: false,
    view_customers: false, manage_customers: false, view_suppliers: false, manage_suppliers: false,
    manage_users: false, manage_settings: false,
  },
};

export function UserManagement() {
  const { language } = useLanguage();
  const { user: currentUser } = useAuth();
  const isRTL = language === 'ar';

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const [formData, setFormData] = useState({ username: '', password: '', role: 'viewer' as string });
  const [editData, setEditData] = useState({ fullName: '', role: 'viewer' as string });
  const [editPermissions, setEditPermissions] = useState<Record<string, boolean>>({ ...DEFAULT_PERMISSIONS });
  const [newPassword, setNewPassword] = useState('');
  const [permissions, setPermissions] = useState<Record<string, boolean>>({ ...DEFAULT_PERMISSIONS });

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setUsers(data || []);
    } catch (err) {
      console.error('Error loading users:', err);
    } finally {
      setLoading(false);
    }
  };

  const callManageUser = async (body: Record<string, unknown>) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-user`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'X-Client-Info': 'supabase-js-web',
          'Apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify(body),
      }
    );
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Operation failed');
    return result;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        throw new Error(isRTL ? 'خطأ في جلب معلومات الجلسة' : 'Error fetching session');
      }

      if (!session?.access_token) {
        throw new Error(isRTL ? 'الرجاء تسجيل الدخول مرة أخرى' : 'Please log in again');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'X-Client-Info': 'supabase-js-web',
            'Apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ ...formData, fullName: formData.username, permissions }),
        }
      );

      const result = await response.json();
      console.log('Response status:', response.status);
      console.log('Response result:', result);

      if (!response.ok) {
        const errorMsg = result.details
          ? `${result.error}: ${result.details}`
          : result.error
          ? result.error
          : `${isRTL ? 'خطأ في الخادم' : 'Server error'} (${response.status})`;
        throw new Error(errorMsg);
      }

      setSuccess(isRTL ? 'تم إنشاء المستخدم بنجاح' : 'User created successfully');
      setFormData({ username: '', password: '', role: 'viewer' });
      setPermissions({ ...DEFAULT_PERMISSIONS });
      setShowAddModal(false);
      loadUsers();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : (isRTL ? 'حدث خطأ غير متوقع' : 'An error occurred');
      setError(errorMessage);
      console.error('Create user error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!selectedUser || !newPassword) return;
    setError('');
    setSubmitting(true);
    try {
      await callManageUser({ action: 'update_password', userId: selectedUser.id, newPassword });
      setSuccess(isRTL ? 'تم تغيير كلمة المرور بنجاح' : 'Password changed successfully');
      setNewPassword('');
      setShowPasswordModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateUser = async () => {
    if (!selectedUser) return;
    setError('');
    setSubmitting(true);
    try {
      await callManageUser({
        action: 'update_user',
        userId: selectedUser.id,
        newName: editData.fullName,
        newRole: editData.role,
        permissions: editPermissions,
      });
      setSuccess(isRTL ? 'تم تحديث بيانات المستخدم بنجاح' : 'User updated successfully');
      setShowEditModal(false);
      loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    setError('');
    setSubmitting(true);
    try {
      await callManageUser({ action: 'delete_user', userId: selectedUser.id });
      setSuccess(isRTL ? 'تم حذف المستخدم بنجاح' : 'User deleted successfully');
      setShowDeleteConfirm(false);
      setSelectedUser(null);
      loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleUserStatus = async (userId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase.from('users').update({ is_active: !currentStatus }).eq('id', userId);
      if (error) throw error;
      loadUsers();
    } catch (err) {
      console.error('Error updating user status:', err);
    }
  };

  const openEditModal = (user: User) => {
    setSelectedUser(user);
    setEditData({ fullName: user.full_name, role: user.role });
    setEditPermissions(user.permissions ? { ...DEFAULT_PERMISSIONS, ...user.permissions } : { ...ROLE_TEMPLATES[user.role] || DEFAULT_PERMISSIONS });
    setError('');
    setShowEditModal(true);
  };

  const openPasswordModal = (user: User) => {
    setSelectedUser(user);
    setNewPassword('');
    setError('');
    setShowPasswordModal(true);
  };

  const openDeleteConfirm = (user: User) => {
    setSelectedUser(user);
    setError('');
    setShowDeleteConfirm(true);
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin': return <Shield className="w-4 h-4" />;
      case 'accountant': return <Calculator className="w-4 h-4" />;
      case 'observer': return <Eye className="w-4 h-4" />;
      case 'viewer': return <Eye className="w-4 h-4" />;
      default: return null;
    }
  };

  const getRoleLabel = (role: string) => {
    if (isRTL) {
      switch (role) {
        case 'admin': return 'مدير';
        case 'accountant': return 'محاسب';
        case 'observer': return 'مطلع';
        case 'viewer': return 'مستخدم عادي';
        default: return role;
      }
    }
    switch (role) {
      case 'admin': return 'Admin';
      case 'accountant': return 'Accountant';
      case 'observer': return 'Observer';
      case 'viewer': return 'Viewer';
      default: return role.charAt(0).toUpperCase() + role.slice(1);
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-100 text-red-700';
      case 'accountant': return 'bg-blue-100 text-blue-700';
      case 'observer': return 'bg-teal-100 text-teal-700';
      case 'viewer': return 'bg-gray-100 text-gray-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getPermissionLabel = (key: string) => {
    const labels: Record<string, { ar: string; en: string }> = {
      view_sales: { ar: 'عرض المبيعات', en: 'View Sales' },
      create_sales: { ar: 'إنشاء المبيعات', en: 'Create Sales' },
      view_purchases: { ar: 'عرض المشتريات', en: 'View Purchases' },
      create_purchases: { ar: 'إنشاء المشتريات', en: 'Create Purchases' },
      view_inventory: { ar: 'عرض المخزون', en: 'View Inventory' },
      manage_inventory: { ar: 'إدارة المخزون', en: 'Manage Inventory' },
      view_reports: { ar: 'عرض التقارير', en: 'View Reports' },
      view_cash_register: { ar: 'عرض الصندوق', en: 'View Cash Register' },
      manage_cash_register: { ar: 'إدارة الصندوق', en: 'Manage Cash Register' },
      view_customers: { ar: 'عرض العملاء', en: 'View Customers' },
      manage_customers: { ar: 'إدارة العملاء', en: 'Manage Customers' },
      view_suppliers: { ar: 'عرض الموردين', en: 'View Suppliers' },
      manage_suppliers: { ar: 'إدارة الموردين', en: 'Manage Suppliers' },
      manage_users: { ar: 'إدارة المستخدمين', en: 'Manage Users' },
      manage_settings: { ar: 'إدارة الإعدادات', en: 'Manage Settings' },
    };
    return isRTL ? labels[key]?.ar : labels[key]?.en;
  };

  const renderPermissionsGrid = (perms: Record<string, boolean>, onChange: (key: string) => void) => (
    <div className="space-y-2 max-h-64 overflow-y-auto">
      {PERMISSION_KEYS.map((key) => (
        <div key={key} className={`flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition ${isRTL ? 'flex-row-reverse' : 'flex-row'}`}>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); onChange(key); }}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition flex-shrink-0 overflow-hidden ${perms[key] ? 'bg-teal-600' : 'bg-gray-300'}`}
            dir="ltr"
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition ${perms[key] ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
          <span className="text-sm text-gray-700 flex-1">{getPermissionLabel(key)}</span>
        </div>
      ))}
    </div>
  );

  const renderRoleButtons = (currentRole: string, onSelect: (role: string) => void, permsHandler: (role: string) => void) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {isRTL ? 'قالب سريع' : 'Quick Template'}
      </label>
      <div className="flex gap-2">
        {(['viewer', 'observer', 'accountant', 'admin'] as const).map(r => (
          <button
            key={r}
            type="button"
            onClick={() => { onSelect(r); permsHandler(r); }}
            className={`flex-1 px-3 py-2 text-sm border rounded-lg transition ${currentRole === r ? 'border-teal-600 bg-teal-50 text-teal-700 font-medium' : 'border-gray-300 hover:bg-gray-50'}`}
          >
            {getRoleLabel(r)}
          </button>
        ))}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-16 h-16 border-4 border-teal-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {isRTL ? 'إدارة المستخدمين' : 'User Management'}
          </h2>
          <p className="text-gray-500 mt-1">{isRTL ? 'إضافة وإدارة حسابات المستخدمين' : 'Add and manage user accounts'}</p>
        </div>
        <button
          onClick={() => { setShowAddModal(true); setError(''); setSuccess(''); }}
          className="flex items-center gap-2 bg-teal-600 text-white px-4 py-2.5 rounded-lg hover:bg-teal-700 transition font-medium"
        >
          <UserPlus className="w-5 h-5" />
          {isRTL ? 'إضافة مستخدم' : 'Add User'}
        </button>
      </div>

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-lg text-sm">
          {success}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">{isRTL ? 'الاسم' : 'Name'}</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">{isRTL ? 'البريد' : 'Email'}</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">{isRTL ? 'الصلاحية' : 'Role'}</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">{isRTL ? 'الحالة' : 'Status'}</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">{isRTL ? 'تاريخ الإنشاء' : 'Created'}</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">{isRTL ? 'الإجراءات' : 'Actions'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50/50 transition">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center text-white text-sm font-bold">
                      {user.full_name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-gray-900">{user.full_name}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 font-mono text-xs">{user.email || '-'}</td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${getRoleColor(user.role)}`}>
                    {getRoleIcon(user.role)}
                    {getRoleLabel(user.role)}
                  </span>
                </td>
                <td className="px-6 py-4">
                  {user.is_active ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                      <CheckCircle className="w-3 h-3" />
                      {isRTL ? 'نشط' : 'Active'}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                      <Ban className="w-3 h-3" />
                      {isRTL ? 'معطل' : 'Inactive'}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {new Date(user.created_at).toLocaleDateString(isRTL ? 'ar-SA' : 'en-US')}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditModal(user)}
                      className="p-2 text-gray-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition"
                      title={isRTL ? 'تعديل' : 'Edit'}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => openPasswordModal(user)}
                      className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                      title={isRTL ? 'تغيير كلمة المرور' : 'Change Password'}
                    >
                      <Key className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => toggleUserStatus(user.id, user.is_active)}
                      className={`p-2 rounded-lg transition ${user.is_active ? 'text-gray-500 hover:text-orange-600 hover:bg-orange-50' : 'text-gray-500 hover:text-green-600 hover:bg-green-50'}`}
                      title={user.is_active ? (isRTL ? 'تعطيل' : 'Deactivate') : (isRTL ? 'تفعيل' : 'Activate')}
                    >
                      {user.is_active ? <Ban className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                    </button>
                    {user.id !== currentUser?.id && (
                      <button
                        onClick={() => openDeleteConfirm(user)}
                        className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                        title={isRTL ? 'حذف' : 'Delete'}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
              <h3 className="text-xl font-bold text-gray-900">{isRTL ? 'إضافة مستخدم جديد' : 'Add New User'}</h3>
              <button onClick={() => { setShowAddModal(false); setError(''); }} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              {error && <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'اسم المستخدم' : 'Username'}</label>
                <input type="text" required value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '') })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent" placeholder={isRTL ? 'اسم المستخدم' : 'Username'} dir="ltr" />
                <p className="mt-1 text-xs text-gray-400">{isRTL ? 'أحرف إنجليزية وأرقام فقط' : 'Letters, numbers, dots, hyphens only'}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'كلمة المرور' : 'Password'}</label>
                <input type="password" required value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent" placeholder="********" minLength={6} />
              </div>
              {renderRoleButtons(formData.role, (r) => setFormData({ ...formData, role: r }), (r) => setPermissions({ ...ROLE_TEMPLATES[r] || DEFAULT_PERMISSIONS }))}
              <div className="border-t pt-4">
                <label className="block text-sm font-medium text-gray-700 mb-3">{isRTL ? 'الصلاحيات' : 'Permissions'}</label>
                {renderPermissionsGrid(permissions, (key) => setPermissions({ ...permissions, [key]: !permissions[key] }))}
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={submitting} className="flex-1 bg-teal-600 text-white py-2.5 rounded-lg hover:bg-teal-700 transition disabled:opacity-50 font-medium">
                  {submitting ? (isRTL ? 'جاري الإنشاء...' : 'Creating...') : (isRTL ? 'إنشاء' : 'Create')}
                </button>
                <button type="button" onClick={() => { setShowAddModal(false); setError(''); }}
                  className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-lg hover:bg-gray-200 transition font-medium">
                  {isRTL ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
              <h3 className="text-xl font-bold text-gray-900">{isRTL ? 'تعديل المستخدم' : 'Edit User'}</h3>
              <button onClick={() => setShowEditModal(false)} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              {error && <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'الاسم' : 'Name'}</label>
                <input type="text" value={editData.fullName}
                  onChange={(e) => setEditData({ ...editData, fullName: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
              </div>
              {renderRoleButtons(editData.role, (r) => setEditData({ ...editData, role: r }), (r) => setEditPermissions({ ...ROLE_TEMPLATES[r] || DEFAULT_PERMISSIONS }))}
              <div className="border-t pt-4">
                <label className="block text-sm font-medium text-gray-700 mb-3">{isRTL ? 'الصلاحيات' : 'Permissions'}</label>
                {renderPermissionsGrid(editPermissions, (key) => setEditPermissions({ ...editPermissions, [key]: !editPermissions[key] }))}
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={handleUpdateUser} disabled={submitting}
                  className="flex-1 bg-teal-600 text-white py-2.5 rounded-lg hover:bg-teal-700 transition disabled:opacity-50 font-medium flex items-center justify-center gap-2">
                  <Save className="w-4 h-4" />
                  {submitting ? (isRTL ? 'جاري الحفظ...' : 'Saving...') : (isRTL ? 'حفظ التعديلات' : 'Save Changes')}
                </button>
                <button onClick={() => setShowEditModal(false)}
                  className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-lg hover:bg-gray-200 transition font-medium">
                  {isRTL ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {showPasswordModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-bold text-gray-900">{isRTL ? 'تغيير كلمة المرور' : 'Change Password'}</h3>
              <button onClick={() => setShowPasswordModal(false)} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              {error && <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>}
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-sm text-gray-600">
                  {isRTL ? 'المستخدم:' : 'User:'} <span className="font-medium text-gray-900">{selectedUser.full_name}</span>
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'كلمة المرور الجديدة' : 'New Password'}</label>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="********" minLength={6} />
              </div>
              <div className="flex gap-3">
                <button onClick={handleUpdatePassword} disabled={submitting || newPassword.length < 6}
                  className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 font-medium flex items-center justify-center gap-2">
                  <Key className="w-4 h-4" />
                  {submitting ? (isRTL ? 'جاري التغيير...' : 'Changing...') : (isRTL ? 'تغيير' : 'Change')}
                </button>
                <button onClick={() => setShowPasswordModal(false)}
                  className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-lg hover:bg-gray-200 transition font-medium">
                  {isRTL ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full">
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3 text-red-600">
                <div className="p-3 bg-red-100 rounded-full">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold">{isRTL ? 'تأكيد الحذف' : 'Confirm Delete'}</h3>
              </div>
              {error && <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>}
              <p className="text-gray-600">
                {isRTL
                  ? `هل أنت متأكد من حذف المستخدم "${selectedUser.full_name}"؟ هذا الإجراء لا يمكن التراجع عنه.`
                  : `Are you sure you want to delete "${selectedUser.full_name}"? This action cannot be undone.`}
              </p>
              <div className="flex gap-3">
                <button onClick={handleDeleteUser} disabled={submitting}
                  className="flex-1 bg-red-600 text-white py-2.5 rounded-lg hover:bg-red-700 transition disabled:opacity-50 font-medium flex items-center justify-center gap-2">
                  <Trash2 className="w-4 h-4" />
                  {submitting ? (isRTL ? 'جاري الحذف...' : 'Deleting...') : (isRTL ? 'حذف' : 'Delete')}
                </button>
                <button onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-lg hover:bg-gray-200 transition font-medium">
                  {isRTL ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
