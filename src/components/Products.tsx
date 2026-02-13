import { useEffect, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabase';
import { Package, Plus, Edit, Trash2, Search, X, Filter } from 'lucide-react';

interface Product {
  id: string;
  sku: string;
  name: string;
  name_ar: string;
  description: string | null;
  description_ar: string | null;
  category_id: string | null;
  type: 'natural' | 'artificial';
  unit: string;
  unit_ar: string;
  sale_price: number;
  purchase_price: number;
  min_stock_level: number;
  is_active: boolean;
}

interface Category {
  id: string;
  name: string;
  name_ar: string;
  type: string;
}

const emptyForm = {
  sku: '',
  name: '',
  name_ar: '',
  description: '',
  description_ar: '',
  category_id: '',
  type: 'natural' as 'natural' | 'artificial',
  unit: 'piece',
  unit_ar: 'قطعة',
  sale_price: 0,
  purchase_price: 0,
  min_stock_level: 0,
};

export function Products() {
  const { t, language } = useLanguage();
  const isRTL = language === 'ar';
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [productsRes, categoriesRes] = await Promise.all([
        supabase.from('products').select('*').order('created_at', { ascending: false }),
        supabase.from('categories').select('*').eq('is_active', true),
      ]);
      if (productsRes.data) setProducts(productsRes.data);
      if (categoriesRes.data) setCategories(categoriesRes.data);
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const generateSKU = () => {
    const num = products.length + 1;
    return `FLR-${String(num).padStart(4, '0')}`;
  };

  const openAddModal = () => {
    setEditingProduct(null);
    setFormData({ ...emptyForm, sku: generateSKU() });
    setError('');
    setShowModal(true);
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      sku: product.sku,
      name: product.name,
      name_ar: product.name_ar,
      description: product.description || '',
      description_ar: product.description_ar || '',
      category_id: product.category_id || '',
      type: product.type,
      unit: product.unit,
      unit_ar: product.unit_ar,
      sale_price: product.sale_price,
      purchase_price: product.purchase_price,
      min_stock_level: product.min_stock_level,
    });
    setError('');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const payload = {
        sku: formData.sku,
        name: formData.name,
        name_ar: formData.name_ar,
        description: formData.description || null,
        description_ar: formData.description_ar || null,
        category_id: formData.category_id || null,
        type: formData.type,
        unit: formData.unit,
        unit_ar: formData.unit_ar,
        sale_price: formData.sale_price,
        purchase_price: formData.purchase_price,
        min_stock_level: formData.min_stock_level,
      };

      if (editingProduct) {
        const { error } = await supabase.from('products').update(payload).eq('id', editingProduct.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('products').insert(payload);
        if (error) throw error;
      }

      setShowModal(false);
      loadData();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('products').update({ is_active: false }).eq('id', id);
      if (error) throw error;
      setDeleteConfirm(null);
      loadData();
    } catch (err) {
      console.error('Error deleting product:', err);
    }
  };

  const filteredProducts = products.filter((p) => {
    if (!p.is_active) return false;
    if (typeFilter !== 'all' && p.type !== typeFilter) return false;
    const s = searchTerm.toLowerCase();
    return (
      p.name.toLowerCase().includes(s) ||
      p.name_ar.includes(searchTerm) ||
      p.sku.toLowerCase().includes(s)
    );
  });

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat(isRTL ? 'ar-SA' : 'en-US', { style: 'decimal', minimumFractionDigits: 2 }).format(amount);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-gray-600">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('nav.products')}</h2>
          <p className="text-gray-500 mt-1">{isRTL ? 'إدارة المنتجات والأسعار' : 'Manage products and pricing'}</p>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 bg-teal-600 text-white px-4 py-2.5 rounded-lg hover:bg-teal-700 transition font-medium"
        >
          <Plus className="w-5 h-5" />
          {t('common.add')}
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder={t('common.search')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            >
              <option value="all">{isRTL ? 'الكل' : 'All Types'}</option>
              <option value="natural">{t('products.natural')}</option>
              <option value="artificial">{t('products.artificial')}</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">SKU</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">{isRTL ? 'الاسم' : 'Name'}</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">{isRTL ? 'النوع' : 'Type'}</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">{isRTL ? 'سعر الشراء' : 'Purchase'}</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">{isRTL ? 'سعر البيع' : 'Sale'}</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">{isRTL ? 'الربح' : 'Margin'}</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-500">
                    <Package className="w-16 h-16 mx-auto mb-3 opacity-30" />
                    <p className="text-lg font-medium">{isRTL ? 'لا توجد منتجات' : 'No products found'}</p>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => {
                  const margin = product.sale_price - product.purchase_price;
                  const marginPct = product.purchase_price > 0 ? ((margin / product.purchase_price) * 100).toFixed(0) : '0';
                  return (
                    <tr key={product.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition">
                      <td className="py-3.5 px-4 font-mono text-sm text-gray-600">{product.sku}</td>
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-gray-900">
                          {isRTL ? product.name_ar : product.name}
                        </div>
                        <div className="text-xs text-gray-400">
                          {isRTL ? product.name : product.name_ar}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                          product.type === 'natural' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {product.type === 'natural' ? t('products.natural') : t('products.artificial')}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-gray-700">{formatCurrency(product.purchase_price)}</td>
                      <td className="py-3.5 px-4 font-medium text-gray-900">{formatCurrency(product.sale_price)}</td>
                      <td className="py-3.5 px-4">
                        <span className={`font-medium ${margin > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(margin)} ({marginPct}%)
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEditModal(product)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition">
                            <Edit className="w-4 h-4" />
                          </button>
                          <button onClick={() => setDeleteConfirm(product.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 text-center">
            <Trash2 className="w-12 h-12 text-red-500 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-gray-900 mb-2">{isRTL ? 'تأكيد الحذف' : 'Confirm Delete'}</h3>
            <p className="text-gray-500 mb-6 text-sm">
              {isRTL ? 'هل أنت متأكد من حذف هذا المنتج؟' : 'Are you sure you want to delete this product?'}
            </p>
            <div className="flex gap-3">
              <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 bg-red-600 text-white py-2.5 rounded-lg hover:bg-red-700 transition font-medium">
                {isRTL ? 'حذف' : 'Delete'}
              </button>
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-lg hover:bg-gray-200 transition font-medium">
                {isRTL ? 'إلغاء' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-xl">
              <h3 className="text-xl font-bold text-gray-900">
                {editingProduct ? (isRTL ? 'تعديل المنتج' : 'Edit Product') : (isRTL ? 'إضافة منتج جديد' : 'Add New Product')}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
                  <input type="text" required value={formData.sku} onChange={(e) => setFormData({ ...formData, sku: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent font-mono" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'النوع' : 'Type'}</label>
                  <select value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value as any })} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent">
                    <option value="natural">{t('products.natural')}</option>
                    <option value="artificial">{t('products.artificial')}</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'الاسم (إنجليزي)' : 'Name (English)'}</label>
                  <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'الاسم (عربي)' : 'Name (Arabic)'}</label>
                  <input type="text" required value={formData.name_ar} onChange={(e) => setFormData({ ...formData, name_ar: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent" dir="rtl" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'التصنيف' : 'Category'}</label>
                <select value={formData.category_id} onChange={(e) => setFormData({ ...formData, category_id: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent">
                  <option value="">{isRTL ? 'بدون تصنيف' : 'No Category'}</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{isRTL ? cat.name_ar : cat.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'سعر الشراء' : 'Purchase Price'}</label>
                  <input type="number" step="0.01" min="0" required value={formData.purchase_price} onChange={(e) => setFormData({ ...formData, purchase_price: parseFloat(e.target.value) || 0 })} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'سعر البيع' : 'Sale Price'}</label>
                  <input type="number" step="0.01" min="0" required value={formData.sale_price} onChange={(e) => setFormData({ ...formData, sale_price: parseFloat(e.target.value) || 0 })} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'حد أدنى مخزون' : 'Min Stock'}</label>
                  <input type="number" step="1" min="0" value={formData.min_stock_level} onChange={(e) => setFormData({ ...formData, min_stock_level: parseFloat(e.target.value) || 0 })} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'الوحدة (إنجليزي)' : 'Unit (English)'}</label>
                  <input type="text" value={formData.unit} onChange={(e) => setFormData({ ...formData, unit: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'الوحدة (عربي)' : 'Unit (Arabic)'}</label>
                  <input type="text" value={formData.unit_ar} onChange={(e) => setFormData({ ...formData, unit_ar: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent" dir="rtl" />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={submitting} className="flex-1 bg-teal-600 text-white py-2.5 rounded-lg hover:bg-teal-700 transition disabled:opacity-50 font-medium">
                  {submitting ? (isRTL ? 'جاري الحفظ...' : 'Saving...') : (isRTL ? 'حفظ' : 'Save')}
                </button>
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-lg hover:bg-gray-200 transition font-medium">
                  {isRTL ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
