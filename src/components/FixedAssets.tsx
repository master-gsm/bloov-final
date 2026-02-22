import { useState, useEffect } from 'react';
import {
  Plus, Edit2, Trash2, DollarSign, Calendar, Building2,
  TrendingDown, ChevronDown, ChevronUp, Landmark
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useLanguage } from '../contexts/LanguageContext';

interface FixedAsset {
  id: string;
  asset_name: string;
  asset_name_ar: string | null;
  category: string;
  purchase_cost: number;
  salvage_value: number;
  useful_life_months: number;
  purchase_date: string;
  depreciation_start_date: string;
  depreciation_method: string;
  branch_id: string | null;
  supplier_id: string | null;
  notes: string | null;
  is_active: boolean;
  is_deleted: boolean;
  created_at: string;
  branch?: { name: string } | null;
  supplier?: { name: string } | null;
}

interface DepreciationEntry {
  id: string;
  asset_id: string;
  entry_date: string;
  amount: number;
  accumulated_depreciation: number;
  book_value: number;
}

interface Branch {
  id: string;
  name: string;
}

interface Supplier {
  id: string;
  name: string;
}

const ASSET_CATEGORIES = [
  { value: 'Equipment', label_en: 'Equipment', label_ar: 'المعدات' },
  { value: 'Furniture', label_en: 'Furniture', label_ar: 'الأثاث' },
  { value: 'Vehicles', label_en: 'Vehicles', label_ar: 'المركبات' },
  { value: 'Technology', label_en: 'Technology & Software', label_ar: 'التكنولوجيا والبرمجيات' },
  { value: 'Renovation', label_en: 'Renovation', label_ar: 'التجديدات' },
  { value: 'Security', label_en: 'Security Systems', label_ar: 'أنظمة الأمان' },
  { value: 'Signage', label_en: 'Signage & Branding', label_ar: 'اللافتات والعلامة التجارية' },
  { value: 'Other', label_en: 'Other', label_ar: 'أخرى' },
];

export default function FixedAssets() {
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingAsset, setEditingAsset] = useState<FixedAsset | null>(null);
  const [expandedAsset, setExpandedAsset] = useState<string | null>(null);
  const [depreciationEntries, setDepreciationEntries] = useState<DepreciationEntry[]>([]);
  const [depLoading, setDepLoading] = useState(false);
  const { language } = useLanguage();
  const isRTL = language === 'ar';

  const [formData, setFormData] = useState({
    asset_name: '',
    asset_name_ar: '',
    category: 'Equipment',
    purchase_cost: '',
    salvage_value: '0',
    useful_life_months: '60',
    purchase_date: new Date().toISOString().split('T')[0],
    depreciation_start_date: new Date().toISOString().split('T')[0],
    branch_id: '',
    supplier_id: '',
    notes: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [assetsRes, branchesRes, suppliersRes] = await Promise.all([
        supabase
          .from('fixed_assets')
          .select('*, branch:branches(name), supplier:suppliers(name)')
          .eq('is_deleted', false)
          .order('created_at', { ascending: false }),
        supabase.from('branches').select('id, name').eq('is_active', true).order('name'),
        supabase.from('suppliers').select('id, name').eq('is_active', true).order('name'),
      ]);

      if (assetsRes.data) setAssets(assetsRes.data as any[]);
      if (branchesRes.data) setBranches(branchesRes.data);
      if (suppliersRes.data) setSuppliers(suppliersRes.data);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadDepreciationEntries = async (assetId: string) => {
    setDepLoading(true);
    try {
      const { data, error } = await supabase
        .from('depreciation_entries')
        .select('*')
        .eq('asset_id', assetId)
        .order('entry_date', { ascending: true });

      if (error) throw error;
      setDepreciationEntries(data || []);
    } catch (error) {
      console.error('Error loading depreciation entries:', error);
    } finally {
      setDepLoading(false);
    }
  };

  const toggleExpand = (assetId: string) => {
    if (expandedAsset === assetId) {
      setExpandedAsset(null);
      setDepreciationEntries([]);
    } else {
      setExpandedAsset(assetId);
      loadDepreciationEntries(assetId);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const assetData = {
        asset_name: formData.asset_name,
        asset_name_ar: formData.asset_name_ar || null,
        category: formData.category,
        purchase_cost: parseFloat(formData.purchase_cost),
        salvage_value: parseFloat(formData.salvage_value) || 0,
        useful_life_months: parseInt(formData.useful_life_months),
        purchase_date: formData.purchase_date,
        depreciation_start_date: formData.depreciation_start_date,
        branch_id: formData.branch_id || null,
        supplier_id: formData.supplier_id || null,
        notes: formData.notes || null,
        created_by: user?.id,
      };

      if (editingAsset) {
        const { error } = await supabase
          .from('fixed_assets')
          .update(assetData)
          .eq('id', editingAsset.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('fixed_assets')
          .insert([assetData]);
        if (error) throw error;
      }

      await supabase.rpc('generate_depreciation_entries', {
        p_up_to_date: new Date().toISOString().split('T')[0],
      });

      setShowForm(false);
      setEditingAsset(null);
      resetForm();
      loadData();
    } catch (error: any) {
      console.error('Error saving asset:', error);
      alert(error.message || (isRTL ? 'خطأ في حفظ الأصل' : 'Error saving asset'));
    }
  };

  const handleEdit = (asset: FixedAsset) => {
    setEditingAsset(asset);
    setFormData({
      asset_name: asset.asset_name,
      asset_name_ar: asset.asset_name_ar || '',
      category: asset.category,
      purchase_cost: asset.purchase_cost.toString(),
      salvage_value: asset.salvage_value.toString(),
      useful_life_months: asset.useful_life_months.toString(),
      purchase_date: asset.purchase_date,
      depreciation_start_date: asset.depreciation_start_date,
      branch_id: asset.branch_id || '',
      supplier_id: asset.supplier_id || '',
      notes: asset.notes || '',
    });
    setShowForm(true);
  };

  const handleVoid = async (id: string) => {
    if (!confirm(isRTL ? 'هل أنت متأكد من إلغاء هذا الأصل؟' : 'Are you sure you want to void this asset?')) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('fixed_assets')
        .update({ is_deleted: true, is_active: false, voided_at: new Date().toISOString(), voided_by: user?.id })
        .eq('id', id);
      if (error) throw error;
      loadData();
    } catch (error: any) {
      console.error('Error voiding asset:', error);
      alert(error.message || (isRTL ? 'خطأ في إلغاء الأصل' : 'Error voiding asset'));
    }
  };

  const resetForm = () => {
    setFormData({
      asset_name: '',
      asset_name_ar: '',
      category: 'Equipment',
      purchase_cost: '',
      salvage_value: '0',
      useful_life_months: '60',
      purchase_date: new Date().toISOString().split('T')[0],
      depreciation_start_date: new Date().toISOString().split('T')[0],
      branch_id: '',
      supplier_id: '',
      notes: '',
    });
    setEditingAsset(null);
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat(isRTL ? 'ar-SA' : 'en-US', {
      style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(amount);

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString(isRTL ? 'ar-SA' : 'en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });

  const getMonthlyDepreciation = (asset: FixedAsset) =>
    asset.useful_life_months > 0
      ? (asset.purchase_cost - asset.salvage_value) / asset.useful_life_months
      : 0;

  const totalAssetValue = assets.reduce((sum, a) => sum + Number(a.purchase_cost), 0);
  const totalMonthlyDep = assets.filter(a => a.is_active).reduce((sum, a) => sum + getMonthlyDepreciation(a), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-12 h-12 border-4 border-teal-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {isRTL ? 'الأصول الثابتة' : 'Fixed Assets'}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {isRTL
              ? 'إدارة الأصول الثابتة والإهلاك الشهري التلقائي'
              : 'Manage fixed assets and automatic monthly depreciation'}
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-2 bg-teal-600 text-white px-4 py-2.5 rounded-lg hover:bg-teal-700 transition font-medium"
        >
          <Plus className="w-5 h-5" />
          {isRTL ? 'إضافة أصل' : 'Add Asset'}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-teal-50 to-teal-100 rounded-xl p-5 border border-teal-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-teal-600 p-2 rounded-lg">
              <Landmark className="w-5 h-5 text-white" />
            </div>
            <span className="text-sm font-medium text-teal-700">
              {isRTL ? 'إجمالي قيمة الأصول' : 'Total Asset Value'}
            </span>
          </div>
          <p className="text-2xl font-bold text-teal-900">
            {formatCurrency(totalAssetValue)} <span className="text-sm font-normal">{isRTL ? 'ر.س' : 'SAR'}</span>
          </p>
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-5 border border-amber-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-amber-600 p-2 rounded-lg">
              <TrendingDown className="w-5 h-5 text-white" />
            </div>
            <span className="text-sm font-medium text-amber-700">
              {isRTL ? 'الإهلاك الشهري' : 'Monthly Depreciation'}
            </span>
          </div>
          <p className="text-2xl font-bold text-amber-900">
            {formatCurrency(totalMonthlyDep)} <span className="text-sm font-normal">{isRTL ? 'ر.س' : 'SAR'}</span>
          </p>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-5 border border-blue-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <span className="text-sm font-medium text-blue-700">
              {isRTL ? 'عدد الأصول' : 'Total Assets'}
            </span>
          </div>
          <p className="text-2xl font-bold text-blue-900">{assets.length}</p>
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <h3 className="text-xl font-bold mb-5 text-gray-900">
              {editingAsset
                ? (isRTL ? 'تعديل أصل ثابت' : 'Edit Fixed Asset')
                : (isRTL ? 'إضافة أصل ثابت' : 'Add Fixed Asset')}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isRTL ? 'اسم الأصل (إنجليزي)' : 'Asset Name'} *
                  </label>
                  <input
                    type="text"
                    value={formData.asset_name}
                    onChange={(e) => setFormData({ ...formData, asset_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isRTL ? 'اسم الأصل (عربي)' : 'Asset Name (Arabic)'}
                  </label>
                  <input
                    type="text"
                    value={formData.asset_name_ar}
                    onChange={(e) => setFormData({ ...formData, asset_name_ar: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    dir="rtl"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isRTL ? 'الفئة' : 'Category'} *
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    required
                  >
                    {ASSET_CATEGORIES.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {isRTL ? cat.label_ar : cat.label_en}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isRTL ? 'تكلفة الشراء' : 'Purchase Cost'} *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.purchase_cost}
                    onChange={(e) => setFormData({ ...formData, purchase_cost: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isRTL ? 'القيمة المتبقية' : 'Salvage Value'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.salvage_value}
                    onChange={(e) => setFormData({ ...formData, salvage_value: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isRTL ? 'العمر الإنتاجي (أشهر)' : 'Useful Life (months)'} *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="600"
                    value={formData.useful_life_months}
                    onChange={(e) => setFormData({ ...formData, useful_life_months: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isRTL ? 'تاريخ الشراء' : 'Purchase Date'} *
                  </label>
                  <input
                    type="date"
                    value={formData.purchase_date}
                    onChange={(e) => setFormData({
                      ...formData,
                      purchase_date: e.target.value,
                      depreciation_start_date: e.target.value,
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isRTL ? 'بداية الإهلاك' : 'Depreciation Start'}
                  </label>
                  <input
                    type="date"
                    value={formData.depreciation_start_date}
                    onChange={(e) => setFormData({ ...formData, depreciation_start_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isRTL ? 'الفرع' : 'Branch'}
                  </label>
                  <select
                    value={formData.branch_id}
                    onChange={(e) => setFormData({ ...formData, branch_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  >
                    <option value="">{isRTL ? 'عام' : 'General'}</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isRTL ? 'المورد' : 'Supplier'}
                  </label>
                  <select
                    value={formData.supplier_id}
                    onChange={(e) => setFormData({ ...formData, supplier_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  >
                    <option value="">{isRTL ? 'بدون مورد' : 'None'}</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {formData.purchase_cost && formData.useful_life_months && (
                <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
                  <p className="text-sm font-medium text-teal-800 mb-1">
                    {isRTL ? 'الإهلاك الشهري المتوقع:' : 'Expected Monthly Depreciation:'}
                  </p>
                  <p className="text-lg font-bold text-teal-900">
                    {formatCurrency(
                      (parseFloat(formData.purchase_cost) - parseFloat(formData.salvage_value || '0')) /
                      parseInt(formData.useful_life_months)
                    )} {isRTL ? 'ر.س / شهر' : 'SAR / month'}
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isRTL ? 'ملاحظات' : 'Notes'}
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  rows={2}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setEditingAsset(null); resetForm(); }}
                  className="px-4 py-2.5 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition font-medium"
                >
                  {isRTL ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition font-medium"
                >
                  {editingAsset
                    ? (isRTL ? 'تحديث' : 'Update')
                    : (isRTL ? 'حفظ' : 'Save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assets List */}
      <div className="space-y-3">
        {assets.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
            <Landmark className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">
              {isRTL ? 'لا توجد أصول ثابتة مسجلة' : 'No fixed assets recorded'}
            </p>
          </div>
        ) : (
          assets.map((asset) => {
            const monthlyDep = getMonthlyDepreciation(asset);
            const isExpanded = expandedAsset === asset.id;
            const catLabel = ASSET_CATEGORIES.find(c => c.value === asset.category);

            return (
              <div key={asset.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-bold text-gray-900">
                          {isRTL ? (asset.asset_name_ar || asset.asset_name) : asset.asset_name}
                        </h3>
                        <span className="px-2.5 py-0.5 bg-teal-100 text-teal-800 rounded-full text-xs font-medium">
                          {isRTL ? catLabel?.label_ar : catLabel?.label_en}
                        </span>
                        {!asset.is_active && (
                          <span className="px-2.5 py-0.5 bg-red-100 text-red-800 rounded-full text-xs font-medium">
                            {isRTL ? 'غير نشط' : 'Inactive'}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
                        <div>
                          <p className="text-xs text-gray-500">{isRTL ? 'تكلفة الشراء' : 'Purchase Cost'}</p>
                          <p className="text-sm font-semibold text-gray-900">{formatCurrency(asset.purchase_cost)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">{isRTL ? 'الإهلاك الشهري' : 'Monthly Depreciation'}</p>
                          <p className="text-sm font-semibold text-amber-700">{formatCurrency(monthlyDep)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">{isRTL ? 'العمر الإنتاجي' : 'Useful Life'}</p>
                          <p className="text-sm font-semibold text-gray-900">
                            {asset.useful_life_months} {isRTL ? 'شهر' : 'months'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">{isRTL ? 'الفرع' : 'Branch'}</p>
                          <p className="text-sm font-semibold text-gray-900">
                            {asset.branch?.name || (isRTL ? 'عام' : 'General')}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => toggleExpand(asset.id)}
                        className="p-2 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition"
                        title={isRTL ? 'جدول الإهلاك' : 'Depreciation Schedule'}
                      >
                        {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                      </button>
                      <button
                        onClick={() => handleEdit(asset)}
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleVoid(asset.id)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Depreciation Schedule */}
                {isExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50 p-5">
                    <h4 className="text-sm font-bold text-gray-700 mb-3">
                      {isRTL ? 'جدول الإهلاك' : 'Depreciation Schedule'}
                    </h4>
                    {depLoading ? (
                      <div className="flex justify-center py-4">
                        <div className="w-6 h-6 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : depreciationEntries.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-4">
                        {isRTL ? 'لا توجد قيود إهلاك بعد' : 'No depreciation entries yet'}
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-gray-600">
                              <th className="text-left py-2 px-3 font-medium">{isRTL ? 'الشهر' : 'Month'}</th>
                              <th className="text-right py-2 px-3 font-medium">{isRTL ? 'مبلغ الإهلاك' : 'Depreciation'}</th>
                              <th className="text-right py-2 px-3 font-medium">{isRTL ? 'الإهلاك المتراكم' : 'Accumulated'}</th>
                              <th className="text-right py-2 px-3 font-medium">{isRTL ? 'القيمة الدفترية' : 'Book Value'}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {depreciationEntries.map((entry) => (
                              <tr key={entry.id} className="border-t border-gray-200 hover:bg-gray-100">
                                <td className="py-2 px-3 text-gray-900">{formatDate(entry.entry_date)}</td>
                                <td className="py-2 px-3 text-right text-red-700 font-medium">{formatCurrency(entry.amount)}</td>
                                <td className="py-2 px-3 text-right text-gray-700">{formatCurrency(entry.accumulated_depreciation)}</td>
                                <td className="py-2 px-3 text-right text-teal-700 font-semibold">{formatCurrency(entry.book_value)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
