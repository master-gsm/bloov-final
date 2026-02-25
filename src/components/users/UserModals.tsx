import { useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { X, Save, Key, Trash2, AlertTriangle, UserPlus, Building2 } from 'lucide-react';
import { PermissionsGrid } from './PermissionsGrid';
import { ROLE_TEMPLATES, emptyPermissions } from '../../lib/permissions';
import type { PermissionsMap, Section } from '../../lib/permissions';

interface Branch {
  id: string;
  name: string;
}

interface UserRecord {
  id: string;
  full_name: string;
  role: string;
  is_active: boolean;
  branch_id: string | null;
}

interface AddUserModalProps {
  branches: Branch[];
  onClose: () => void;
  onSubmit: (data: { username: string; password: string; role: string; branch_id: string; permissions: PermissionsMap }) => Promise<void>;
}

export function AddUserModal({ branches, onClose, onSubmit }: AddUserModalProps) {
  const { isRTL } = useLanguage();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('viewer');
  const [branchId, setBranchId] = useState('');
  const [permissions, setPermissions] = useState<PermissionsMap>({ ...ROLE_TEMPLATES['viewer'] || emptyPermissions() });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleRoleSelect = (r: string) => {
    setRole(r);
    setPermissions({ ...(ROLE_TEMPLATES[r] || emptyPermissions()) });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await onSubmit({ username, password, role, branch_id: branchId, permissions });
    } catch (err) {
      setError(err instanceof Error ? err.message : (isRTL ? 'حدث خطأ' : 'An error occurred'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white rounded-t-2xl z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center">
              <UserPlus className="w-5 h-5 text-teal-700" />
            </div>
            <h3 className="text-xl font-bold text-gray-900">{isRTL ? 'إضافة مستخدم جديد' : 'Add New User'}</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'اسم المستخدم' : 'Username'}</label>
              <input type="text" required value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                placeholder={isRTL ? 'اسم المستخدم' : 'Username'} dir="ltr" />
              <p className="mt-1 text-xs text-gray-400">{isRTL ? 'أحرف إنجليزية وأرقام فقط' : 'Letters, numbers, dots, hyphens only'}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'كلمة المرور' : 'Password'}</label>
              <input type="password" required value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                placeholder="********" minLength={6} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <span className="flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-gray-400" />
                {isRTL ? 'الفرع' : 'Branch'}
              </span>
            </label>
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white">
              <option value="">{isRTL ? '-- اختر الفرع --' : '-- Select Branch --'}</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{isRTL ? 'قالب الصلاحية' : 'Role Template'}</label>
            <div className="flex gap-2 flex-wrap">
              {(['viewer', 'observer', 'accountant', 'admin'] as const).map(r => {
                const labels: Record<string, { ar: string; en: string }> = {
                  admin: { ar: 'مدير', en: 'Admin' },
                  accountant: { ar: 'محاسب', en: 'Accountant' },
                  observer: { ar: 'مطلع', en: 'Observer' },
                  viewer: { ar: 'مستخدم عادي', en: 'Viewer' },
                };
                return (
                  <button key={r} type="button"
                    onClick={() => handleRoleSelect(r)}
                    className={`px-4 py-2 text-sm border rounded-lg transition font-medium ${
                      role === r ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-gray-300 hover:bg-gray-50 text-gray-600'
                    }`}>
                    {isRTL ? labels[r].ar : labels[r].en}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t pt-5">
            <h4 className="text-sm font-semibold text-gray-800 mb-3">{isRTL ? 'الصلاحيات التفصيلية' : 'Detailed Permissions'}</h4>
            <PermissionsGrid permissions={permissions} onChange={setPermissions} />
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-xs text-blue-700">
            {isRTL
              ? 'سيتم إنشاء سجل موظف تلقائيا مرتبط بهذا المستخدم والفرع المحدد.'
              : 'An employee record will be automatically created linked to this user and selected branch.'}
          </div>
        </form>
        <div className="px-6 py-4 border-t bg-gray-50 rounded-b-2xl flex gap-3">
          <button type="submit" form="" disabled={submitting}
            onClick={(e) => { e.preventDefault(); const form = document.querySelector('form'); form?.requestSubmit(); }}
            className="flex-1 bg-teal-600 text-white py-2.5 rounded-lg hover:bg-teal-700 transition disabled:opacity-50 font-medium">
            {submitting ? (isRTL ? 'جاري الإنشاء...' : 'Creating...') : (isRTL ? 'إنشاء المستخدم' : 'Create User')}
          </button>
          <button type="button" onClick={onClose}
            className="flex-1 bg-white border border-gray-300 text-gray-700 py-2.5 rounded-lg hover:bg-gray-50 transition font-medium">
            {isRTL ? 'إلغاء' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface EditUserModalProps {
  user: UserRecord;
  branches: Branch[];
  initialPermissions: PermissionsMap;
  onClose: () => void;
  onSubmit: (data: { fullName: string; role: string; branch_id: string; permissions: PermissionsMap }) => Promise<void>;
}

export function EditUserModal({ user, branches, initialPermissions, onClose, onSubmit }: EditUserModalProps) {
  const { isRTL } = useLanguage();
  const [fullName, setFullName] = useState(user.full_name);
  const [role, setRole] = useState(user.role);
  const [branchId, setBranchId] = useState(user.branch_id || '');
  const [permissions, setPermissions] = useState<PermissionsMap>(initialPermissions);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleRoleSelect = (r: string) => {
    setRole(r);
    setPermissions({ ...(ROLE_TEMPLATES[r] || emptyPermissions()) });
  };

  const handleSubmit = async () => {
    setError('');
    setSubmitting(true);
    try {
      await onSubmit({ fullName, role, branch_id: branchId, permissions });
    } catch (err) {
      setError(err instanceof Error ? err.message : (isRTL ? 'حدث خطأ' : 'An error occurred'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white rounded-t-2xl z-10">
          <h3 className="text-xl font-bold text-gray-900">{isRTL ? 'تعديل المستخدم' : 'Edit User'}</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'الاسم' : 'Name'}</label>
              <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <span className="flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-gray-400" />
                  {isRTL ? 'الفرع' : 'Branch'}
                </span>
              </label>
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white">
                <option value="">{isRTL ? '-- اختر الفرع --' : '-- Select Branch --'}</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{isRTL ? 'قالب الصلاحية' : 'Role Template'}</label>
            <div className="flex gap-2 flex-wrap">
              {(['viewer', 'observer', 'accountant', 'admin'] as const).map(r => {
                const labels: Record<string, { ar: string; en: string }> = {
                  admin: { ar: 'مدير', en: 'Admin' },
                  accountant: { ar: 'محاسب', en: 'Accountant' },
                  observer: { ar: 'مطلع', en: 'Observer' },
                  viewer: { ar: 'مستخدم عادي', en: 'Viewer' },
                };
                return (
                  <button key={r} type="button"
                    onClick={() => handleRoleSelect(r)}
                    className={`px-4 py-2 text-sm border rounded-lg transition font-medium ${
                      role === r ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-gray-300 hover:bg-gray-50 text-gray-600'
                    }`}>
                    {isRTL ? labels[r].ar : labels[r].en}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t pt-5">
            <h4 className="text-sm font-semibold text-gray-800 mb-3">{isRTL ? 'الصلاحيات التفصيلية' : 'Detailed Permissions'}</h4>
            <PermissionsGrid permissions={permissions} onChange={setPermissions} />
          </div>
        </div>
        <div className="px-6 py-4 border-t bg-gray-50 rounded-b-2xl flex gap-3">
          <button onClick={handleSubmit} disabled={submitting}
            className="flex-1 bg-teal-600 text-white py-2.5 rounded-lg hover:bg-teal-700 transition disabled:opacity-50 font-medium flex items-center justify-center gap-2">
            <Save className="w-4 h-4" />
            {submitting ? (isRTL ? 'جاري الحفظ...' : 'Saving...') : (isRTL ? 'حفظ التعديلات' : 'Save Changes')}
          </button>
          <button onClick={onClose}
            className="flex-1 bg-white border border-gray-300 text-gray-700 py-2.5 rounded-lg hover:bg-gray-50 transition font-medium">
            {isRTL ? 'إلغاء' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface PasswordModalProps {
  user: UserRecord;
  onClose: () => void;
  onSubmit: (password: string) => Promise<void>;
}

export function PasswordModal({ user, onClose, onSubmit }: PasswordModalProps) {
  const { isRTL } = useLanguage();
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError('');
    setSubmitting(true);
    try {
      await onSubmit(newPassword);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="text-lg font-bold text-gray-900">{isRTL ? 'تغيير كلمة المرور' : 'Change Password'}</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>}
          <div className="bg-gray-50 p-3 rounded-lg">
            <p className="text-sm text-gray-600">
              {isRTL ? 'المستخدم:' : 'User:'} <span className="font-medium text-gray-900">{user.full_name}</span>
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'كلمة المرور الجديدة' : 'New Password'}</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              placeholder="********" minLength={6} />
          </div>
          <div className="flex gap-3">
            <button onClick={handleSubmit} disabled={submitting || newPassword.length < 6}
              className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 font-medium flex items-center justify-center gap-2">
              <Key className="w-4 h-4" />
              {submitting ? (isRTL ? 'جاري التغيير...' : 'Changing...') : (isRTL ? 'تغيير' : 'Change')}
            </button>
            <button onClick={onClose}
              className="flex-1 bg-white border border-gray-300 text-gray-700 py-2.5 rounded-lg hover:bg-gray-50 transition font-medium">
              {isRTL ? 'إلغاء' : 'Cancel'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface DeleteConfirmModalProps {
  user: UserRecord;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function DeleteConfirmModal({ user, onClose, onConfirm }: DeleteConfirmModalProps) {
  const { isRTL } = useLanguage();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleDelete = async () => {
    setError('');
    setSubmitting(true);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full">
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
              ? `هل أنت متأكد من حذف المستخدم "${user.full_name}"؟ هذا الإجراء لا يمكن التراجع عنه.`
              : `Are you sure you want to delete "${user.full_name}"? This action cannot be undone.`}
          </p>
          <div className="flex gap-3">
            <button onClick={handleDelete} disabled={submitting}
              className="flex-1 bg-red-600 text-white py-2.5 rounded-lg hover:bg-red-700 transition disabled:opacity-50 font-medium flex items-center justify-center gap-2">
              <Trash2 className="w-4 h-4" />
              {submitting ? (isRTL ? 'جاري الحذف...' : 'Deleting...') : (isRTL ? 'حذف' : 'Delete')}
            </button>
            <button onClick={onClose}
              className="flex-1 bg-white border border-gray-300 text-gray-700 py-2.5 rounded-lg hover:bg-gray-50 transition font-medium">
              {isRTL ? 'إلغاء' : 'Cancel'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
