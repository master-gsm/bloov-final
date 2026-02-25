import { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { SECTIONS, emptyPermissions, ROLE_TEMPLATES } from '../lib/permissions';
import type { PermissionsMap, Section } from '../lib/permissions';
import { AddUserModal, EditUserModal, PasswordModal, DeleteConfirmModal } from './users/UserModals';
import {
  UserPlus, Shield, Eye, Calculator, Ban, CheckCircle,
  Pencil, Trash2, Key, Building2
} from 'lucide-react';

interface User {
  id: string;
  full_name: string;
  role: string;
  is_active: boolean;
  created_at: string;
  branch_id: string | null;
}

interface Branch {
  id: string;
  name: string;
}

export function UserManagement() {
  const { language } = useLanguage();
  const { user: currentUser } = useAuth();
  const isRTL = language === 'ar';

  const [users, setUsers] = useState<User[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState('');

  const [modalState, setModalState] = useState<{
    type: 'add' | 'edit' | 'password' | 'delete' | null;
    user?: User;
    permissions?: PermissionsMap;
  }>({ type: null });

  useEffect(() => {
    loadUsers();
    loadBranches();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, role, is_active, created_at, branch_id')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setUsers(data || []);
    } catch (err) {
      console.error('Error loading users:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadBranches = async () => {
    const { data } = await supabase
      .from('branches')
      .select('id, name')
      .eq('is_active', true)
      .order('name');
    setBranches(data || []);
  };

  const loadUserPermissions = async (userId: string, role: string): Promise<PermissionsMap> => {
    if (role === 'admin') return ROLE_TEMPLATES['admin'];

    const { data } = await supabase
      .from('user_permissions')
      .select('section, can_view, can_create, can_edit, can_delete')
      .eq('user_id', userId);

    if (!data || data.length === 0) {
      return ROLE_TEMPLATES[role] || emptyPermissions();
    }

    const perms = emptyPermissions();
    for (const row of data) {
      const s = row.section as Section;
      if (perms[s]) {
        perms[s] = {
          view: row.can_view ?? false,
          create: row.can_create ?? false,
          edit: row.can_edit ?? false,
          delete: row.can_delete ?? false,
        };
      }
    }
    return perms;
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

  const savePermissions = async (userId: string, permissions: PermissionsMap) => {
    const permissionsPayload: Record<string, { view: boolean; create: boolean; edit: boolean; delete: boolean }> = {};
    for (const section of SECTIONS) {
      permissionsPayload[section] = permissions[section];
    }

    const { error } = await supabase.rpc('upsert_user_permissions', {
      p_user_id: userId,
      p_permissions: permissionsPayload,
    });
    if (error) throw new Error(error.message);
  };

  const handleCreate = async (data: { username: string; password: string; role: string; branch_id: string; permissions: PermissionsMap }) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

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
        body: JSON.stringify({
          username: data.username,
          password: data.password,
          fullName: data.username,
          role: data.role,
          branch_id: data.branch_id || undefined,
          permissions: {},
        }),
      }
    );

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Failed to create user');

    if (result.userId) {
      await savePermissions(result.userId, data.permissions);
    }

    setSuccess(isRTL ? 'تم إنشاء المستخدم بنجاح' : 'User created successfully');
    setModalState({ type: null });
    loadUsers();
  };

  const handleUpdate = async (data: { fullName: string; role: string; branch_id: string; permissions: PermissionsMap }) => {
    if (!modalState.user) return;
    const userId = modalState.user.id;

    await callManageUser({
      action: 'update_user',
      userId,
      newName: data.fullName,
      newRole: data.role,
      branch_id: data.branch_id || null,
    });

    await savePermissions(userId, data.permissions);

    setSuccess(isRTL ? 'تم تحديث بيانات المستخدم بنجاح' : 'User updated successfully');
    setModalState({ type: null });
    loadUsers();
  };

  const handlePasswordChange = async (password: string) => {
    if (!modalState.user) return;
    await callManageUser({ action: 'update_password', userId: modalState.user.id, newPassword: password });
    setSuccess(isRTL ? 'تم تغيير كلمة المرور بنجاح' : 'Password changed successfully');
    setModalState({ type: null });
  };

  const handleDelete = async () => {
    if (!modalState.user) return;
    await callManageUser({ action: 'delete_user', userId: modalState.user.id });
    setSuccess(isRTL ? 'تم حذف المستخدم بنجاح' : 'User deleted successfully');
    setModalState({ type: null });
    loadUsers();
  };

  const toggleUserStatus = async (userId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('users')
        .update({ is_active: !currentStatus })
        .eq('id', userId);
      if (error) throw error;
      loadUsers();
    } catch (err) {
      console.error('Error updating user status:', err);
    }
  };

  const openEditModal = async (user: User) => {
    const perms = await loadUserPermissions(user.id, user.role);
    setModalState({ type: 'edit', user, permissions: perms });
  };

  const getBranchName = (branchId: string | null) => {
    if (!branchId) return isRTL ? 'غير محدد' : 'Unassigned';
    return branches.find(b => b.id === branchId)?.name || (isRTL ? 'غير معروف' : 'Unknown');
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

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin': return <Shield className="w-4 h-4" />;
      case 'accountant': return <Calculator className="w-4 h-4" />;
      default: return <Eye className="w-4 h-4" />;
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-100 text-red-700';
      case 'accountant': return 'bg-blue-100 text-blue-700';
      case 'observer': return 'bg-teal-100 text-teal-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

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
          <p className="text-gray-500 mt-1">
            {isRTL
              ? 'إضافة وإدارة حسابات المستخدمين مع صلاحيات تفصيلية لكل قسم'
              : 'Add and manage user accounts with granular per-section permissions'}
          </p>
        </div>
        <button
          onClick={() => setModalState({ type: 'add' })}
          className="flex items-center gap-2 bg-teal-600 text-white px-5 py-2.5 rounded-xl hover:bg-teal-700 transition font-medium shadow-sm"
        >
          <UserPlus className="w-5 h-5" />
          {isRTL ? 'إضافة مستخدم' : 'Add User'}
        </button>
      </div>

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-lg text-sm animate-in fade-in">
          {success}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className={`px-6 py-3 text-xs font-semibold text-gray-500 uppercase ${isRTL ? 'text-right' : 'text-left'}`}>{isRTL ? 'الاسم' : 'Name'}</th>
              <th className={`px-6 py-3 text-xs font-semibold text-gray-500 uppercase ${isRTL ? 'text-right' : 'text-left'}`}>{isRTL ? 'الفرع' : 'Branch'}</th>
              <th className={`px-6 py-3 text-xs font-semibold text-gray-500 uppercase ${isRTL ? 'text-right' : 'text-left'}`}>{isRTL ? 'الصلاحية' : 'Role'}</th>
              <th className={`px-6 py-3 text-xs font-semibold text-gray-500 uppercase ${isRTL ? 'text-right' : 'text-left'}`}>{isRTL ? 'الحالة' : 'Status'}</th>
              <th className={`px-6 py-3 text-xs font-semibold text-gray-500 uppercase ${isRTL ? 'text-right' : 'text-left'}`}>{isRTL ? 'تاريخ الإنشاء' : 'Created'}</th>
              <th className={`px-6 py-3 text-xs font-semibold text-gray-500 uppercase ${isRTL ? 'text-right' : 'text-left'}`}>{isRTL ? 'الإجراءات' : 'Actions'}</th>
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
                <td className="px-6 py-4">
                  <span className="inline-flex items-center gap-1.5 text-sm text-gray-600">
                    <Building2 className="w-3.5 h-3.5 text-gray-400" />
                    {getBranchName(user.branch_id)}
                  </span>
                </td>
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
                    <button onClick={() => openEditModal(user)}
                      className="p-2 text-gray-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition"
                      title={isRTL ? 'تعديل' : 'Edit'}>
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => setModalState({ type: 'password', user })}
                      className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                      title={isRTL ? 'تغيير كلمة المرور' : 'Change Password'}>
                      <Key className="w-4 h-4" />
                    </button>
                    <button onClick={() => toggleUserStatus(user.id, user.is_active)}
                      className={`p-2 rounded-lg transition ${user.is_active ? 'text-gray-500 hover:text-orange-600 hover:bg-orange-50' : 'text-gray-500 hover:text-green-600 hover:bg-green-50'}`}
                      title={user.is_active ? (isRTL ? 'تعطيل' : 'Deactivate') : (isRTL ? 'تفعيل' : 'Activate')}>
                      {user.is_active ? <Ban className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                    </button>
                    {user.id !== currentUser?.id && (
                      <button onClick={() => setModalState({ type: 'delete', user })}
                        className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                        title={isRTL ? 'حذف' : 'Delete'}>
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

      {modalState.type === 'add' && (
        <AddUserModal branches={branches} onClose={() => setModalState({ type: null })} onSubmit={handleCreate} />
      )}
      {modalState.type === 'edit' && modalState.user && modalState.permissions && (
        <EditUserModal user={modalState.user} branches={branches} initialPermissions={modalState.permissions}
          onClose={() => setModalState({ type: null })} onSubmit={handleUpdate} />
      )}
      {modalState.type === 'password' && modalState.user && (
        <PasswordModal user={modalState.user} onClose={() => setModalState({ type: null })} onSubmit={handlePasswordChange} />
      )}
      {modalState.type === 'delete' && modalState.user && (
        <DeleteConfirmModal user={modalState.user} onClose={() => setModalState({ type: null })} onConfirm={handleDelete} />
      )}
    </div>
  );
}
