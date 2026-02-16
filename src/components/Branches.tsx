import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, MapPin, Phone, User, Calendar, Building2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useLanguage } from '../contexts/LanguageContext';

interface Branch {
  id: string;
  name: string;
  code: string;
  location: string | null;
  city: string | null;
  phone: string | null;
  manager_id: string | null;
  is_active: boolean;
  opening_date: string;
  metadata: any;
  created_at: string;
  updated_at: string;
  manager?: {
    full_name: string;
  };
}

interface User {
  id: string;
  full_name: string;
  role: string;
}

export default function Branches() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const { language } = useLanguage();

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    location: '',
    city: '',
    phone: '',
    manager_id: '',
    is_active: true,
    opening_date: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    loadBranches();
    loadUsers();
  }, []);

  const loadBranches = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('branches')
        .select(`
          *,
          manager:users!branches_manager_id_fkey(full_name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBranches(data || []);
    } catch (error: any) {
      console.error('Error loading branches:', error);
      alert(language === 'ar' ? 'خطأ في تحميل الفروع' : 'Error loading branches');
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, role')
        .eq('is_active', true)
        .in('role', ['admin', 'manager'])
        .order('full_name');

      if (error) throw error;
      setUsers(data || []);
    } catch (error: any) {
      console.error('Error loading users:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editingBranch) {
        const { error } = await supabase
          .from('branches')
          .update(formData)
          .eq('id', editingBranch.id);

        if (error) throw error;
        alert(language === 'ar' ? 'تم تحديث الفرع بنجاح' : 'Branch updated successfully');
      } else {
        const { error } = await supabase
          .from('branches')
          .insert([formData]);

        if (error) throw error;
        alert(language === 'ar' ? 'تم إضافة الفرع بنجاح' : 'Branch added successfully');
      }

      setShowForm(false);
      setEditingBranch(null);
      resetForm();
      loadBranches();
    } catch (error: any) {
      console.error('Error saving branch:', error);
      alert(error.message || (language === 'ar' ? 'خطأ في حفظ الفرع' : 'Error saving branch'));
    }
  };

  const handleEdit = (branch: Branch) => {
    setEditingBranch(branch);
    setFormData({
      name: branch.name,
      code: branch.code,
      location: branch.location || '',
      city: branch.city || '',
      phone: branch.phone || '',
      manager_id: branch.manager_id || '',
      is_active: branch.is_active,
      opening_date: branch.opening_date,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(language === 'ar' ? 'هل أنت متأكد من حذف هذا الفرع؟' : 'Are you sure you want to delete this branch?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('branches')
        .delete()
        .eq('id', id);

      if (error) throw error;
      alert(language === 'ar' ? 'تم حذف الفرع بنجاح' : 'Branch deleted successfully');
      loadBranches();
    } catch (error: any) {
      console.error('Error deleting branch:', error);
      alert(error.message || (language === 'ar' ? 'خطأ في حذف الفرع' : 'Error deleting branch'));
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      code: '',
      location: '',
      city: '',
      phone: '',
      manager_id: '',
      is_active: true,
      opening_date: new Date().toISOString().split('T')[0],
    });
    setEditingBranch(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">{language === 'ar' ? 'جاري التحميل...' : 'Loading...'}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">
          {language === 'ar' ? 'إدارة الفروع' : 'Branch Management'}
        </h2>
        <button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-5 h-5" />
          {language === 'ar' ? 'إضافة فرع' : 'Add Branch'}
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">
              {editingBranch
                ? language === 'ar' ? 'تعديل فرع' : 'Edit Branch'
                : language === 'ar' ? 'إضافة فرع جديد' : 'Add New Branch'}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {language === 'ar' ? 'اسم الفرع' : 'Branch Name'} *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {language === 'ar' ? 'رمز الفرع' : 'Branch Code'} *
                  </label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {language === 'ar' ? 'المدينة' : 'City'}
                  </label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {language === 'ar' ? 'رقم الهاتف' : 'Phone Number'}
                  </label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {language === 'ar' ? 'مدير الفرع' : 'Branch Manager'}
                  </label>
                  <select
                    value={formData.manager_id}
                    onChange={(e) => setFormData({ ...formData, manager_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="">{language === 'ar' ? 'اختر مدير' : 'Select Manager'}</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.full_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {language === 'ar' ? 'تاريخ الافتتاح' : 'Opening Date'}
                  </label>
                  <input
                    type="date"
                    value={formData.opening_date}
                    onChange={(e) => setFormData({ ...formData, opening_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {language === 'ar' ? 'العنوان' : 'Address'}
                </label>
                <textarea
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  rows={3}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="rounded border-gray-300"
                />
                <label htmlFor="is_active" className="text-sm font-medium text-gray-700">
                  {language === 'ar' ? 'فرع نشط' : 'Active Branch'}
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingBranch(null);
                    resetForm();
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  {language === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {editingBranch
                    ? language === 'ar' ? 'تحديث' : 'Update'
                    : language === 'ar' ? 'حفظ' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {branches.map((branch) => (
          <div
            key={branch.id}
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-2">
                <Building2 className="w-6 h-6 text-blue-600" />
                <h3 className="text-lg font-bold text-gray-900">{branch.name}</h3>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleEdit(branch)}
                  className="text-blue-600 hover:text-blue-700"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                {branch.code !== 'MAIN' && (
                  <button
                    onClick={() => handleDelete(branch.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{language === 'ar' ? 'الرمز:' : 'Code:'}</span>
                <span className="bg-gray-100 px-2 py-1 rounded font-mono text-xs">{branch.code}</span>
              </div>

              {branch.city && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  <span>{branch.city}</span>
                </div>
              )}

              {branch.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  <span dir="ltr">{branch.phone}</span>
                </div>
              )}

              {branch.manager && (
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  <span>{branch.manager.full_name}</span>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <span>
                  {language === 'ar' ? 'افتتح في:' : 'Opened:'}{' '}
                  {new Date(branch.opening_date).toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-US')}
                </span>
              </div>

              {branch.location && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-500">{branch.location}</p>
                </div>
              )}

              <div className="mt-3 pt-3 border-t border-gray-100">
                <span
                  className={`inline-block px-2 py-1 text-xs rounded-full ${
                    branch.is_active
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {branch.is_active
                    ? language === 'ar' ? 'نشط' : 'Active'
                    : language === 'ar' ? 'غير نشط' : 'Inactive'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {branches.length === 0 && (
        <div className="text-center py-12">
          <Building2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">
            {language === 'ar' ? 'لا توجد فروع مضافة' : 'No branches added yet'}
          </p>
        </div>
      )}
    </div>
  );
}
