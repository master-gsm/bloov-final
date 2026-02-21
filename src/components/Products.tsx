import { useEffect, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useCanEdit } from '../hooks/useCanEdit';
import { useOfflineData } from '../hooks/useOfflineData';
import { supabase } from '../lib/supabase';
import { Package, Plus, Edit, Trash2, Search, X, Filter, ClipboardList } from 'lucide-react';

interface Product {
  id: string;
  sku: string;
  name: string;
  name_ar: string;
  description: string | null;
  description_ar: string | null;
  category_id: string | null;
  type: 'natural_flowers' | 'artificial_flowers' | 'vases' | 'wrapping' | 'ribbons' | 'additions_gifts' | 'services';
  classification: 'bouquet' | 'single' | 'branch' | 'glass' | 'ceramic' | 'marble' | 'metal' | 'wood' | 'paper' | 'plastic' | 'fabric' | 'satin' | 'burlap' | null;
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

interface ProductRecipe {
  id: string;
  product_id: string;
  material_id: string;
  quantity: number;
  notes: string | null;
  material?: Product;
}

const emptyForm = {
  sku: '',
  name: '',
  name_ar: '',
  description: '',
  description_ar: '',
  category_id: '',
  type: 'natural_flowers' as 'natural_flowers' | 'artificial_flowers' | 'vases' | 'wrapping' | 'ribbons' | 'additions_gifts' | 'services',
  classification: null as 'bouquet' | 'single' | 'branch' | 'glass' | 'ceramic' | 'marble' | 'metal' | 'wood' | 'paper' | 'plastic' | 'fabric' | 'satin' | 'burlap' | null,
  unit: 'piece',
  unit_ar: 'قطعة',
  sale_price: 0,
  purchase_price: 0,
  min_stock_level: 0,
};

export function Products() {
  const { t, language } = useLanguage();
  const canEdit = useCanEdit();
  const isRTL = language === 'ar';

  const { data: offlineProducts, loading: productsLoading, error: productsError } = useOfflineData<Product>({
    table: 'products',
    fallbackToServer: true,
    autoRefresh: true,
  });

  const { data: offlineCategories, loading: categoriesLoading } = useOfflineData<Category>({
    table: 'categories',
    fallbackToServer: true,
    autoRefresh: true,
  });

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [classificationFilter, setClassificationFilter] = useState<string>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showRecipeModal, setShowRecipeModal] = useState(false);
  const [recipeProduct, setRecipeProduct] = useState<Product | null>(null);
  const [recipes, setRecipes] = useState<ProductRecipe[]>([]);
  const [selectedMaterial, setSelectedMaterial] = useState('');
  const [materialQuantity, setMaterialQuantity] = useState(1);

  useEffect(() => {
    if (!productsLoading && !categoriesLoading) {
      setProducts(offlineProducts);
      const activeCategories = offlineCategories.filter((c: any) => c.is_active !== false);
      setCategories(activeCategories);
      setLoading(false);
    }
  }, [offlineProducts, offlineCategories, productsLoading, categoriesLoading]);

  const loadData = async () => {
    try {
      if (!navigator.onLine) {
        console.log('[Products] Offline - using cached data');
        return;
      }
      const [productsRes, categoriesRes] = await Promise.all([
        supabase.from('products').select('*').order('created_at', { ascending: false }),
        supabase.from('categories').select('*').eq('is_active', true),
      ]);
      if (productsRes.data) setProducts(productsRes.data as any[]);
      if (categoriesRes.data) setCategories(categoriesRes.data as any[]);
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
      classification: product.classification,
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
        classification: formData.classification || null,
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

  const openRecipeModal = async (product: Product) => {
    setRecipeProduct(product);
    setShowRecipeModal(true);
    await loadRecipes(product.id);
  };

  const loadRecipes = async (productId: string) => {
    try {
      const { data, error } = await supabase
        .from('product_recipes')
        .select('*, material:products!product_recipes_material_id_fkey(*)')
        .eq('product_id', productId);

      if (error) throw error;
      setRecipes((data || []) as any[]);
    } catch (err) {
      console.error('Error loading recipes:', err);
    }
  };

  const addRecipeItem = async () => {
    if (!selectedMaterial || !recipeProduct || materialQuantity <= 0) return;

    try {
      const { error } = await supabase.from('product_recipes').insert({
        product_id: recipeProduct.id,
        material_id: selectedMaterial,
        quantity: materialQuantity,
      });

      if (error) throw error;
      await loadRecipes(recipeProduct.id);
      setSelectedMaterial('');
      setMaterialQuantity(1);
    } catch (err: any) {
      console.error('Error adding recipe item:', err);
      alert(err.message || 'Failed to add material');
    }
  };

  const removeRecipeItem = async (recipeId: string) => {
    if (!recipeProduct) return;

    try {
      const { error } = await supabase.from('product_recipes').delete().eq('id', recipeId);
      if (error) throw error;
      await loadRecipes(recipeProduct.id);
    } catch (err) {
      console.error('Error removing recipe item:', err);
    }
  };

  const filteredProducts = products.filter((p) => {
    if (!p.is_active) return false;
    if (typeFilter !== 'all' && p.type !== typeFilter) return false;
    if (classificationFilter !== 'all' && p.classification !== classificationFilter) return false;
    const s = searchTerm.toLowerCase();
    return (
      p.name.toLowerCase().includes(s) ||
      p.name_ar.includes(searchTerm) ||
      p.sku.toLowerCase().includes(s) ||
      (p.classification && getClassificationLabel(p.classification).toLowerCase().includes(s))
    );
  });

  const getTypeLabel = (type: string) => {
    const labels: Record<string, { en: string, ar: string }> = {
      natural_flowers: { en: 'Natural Flowers', ar: 'ورد طبيعي' },
      artificial_flowers: { en: 'Artificial Flowers', ar: 'ورد صناعي' },
      vases: { en: 'Vases', ar: 'فازات' },
      wrapping: { en: 'Wrapping', ar: 'تغليف' },
      ribbons: { en: 'Ribbons', ar: 'شرائط' },
      additions_gifts: { en: 'Additions & Gifts', ar: 'إضافات وهدايا' },
      services: { en: 'Services', ar: 'خدمات' },
      natural: { en: 'Natural Flowers', ar: 'ورد طبيعي' },
      artificial: { en: 'Artificial Flowers', ar: 'ورد صناعي' },
      preserved: { en: 'Preserved Flowers', ar: 'ورد دائم' },
      greenery: { en: 'Greenery', ar: 'أوراق خضراء' },
      indoor_plants: { en: 'Indoor Plants', ar: 'نباتات داخلية' },
      dried: { en: 'Dried Flowers', ar: 'ورد مجفف' },
    };
    return isRTL ? labels[type]?.ar || type : labels[type]?.en || type;
  };

  const getClassificationLabel = (classification: string) => {
    const labels: Record<string, { en: string, ar: string }> = {
      bouquet: { en: 'Bouquet', ar: 'باقة' },
      single: { en: 'Single', ar: 'حبة' },
      branch: { en: 'Branch', ar: 'غصن' },
      glass: { en: 'Glass', ar: 'زجاج' },
      ceramic: { en: 'Ceramic', ar: 'سيراميك' },
      marble: { en: 'Marble', ar: 'رخام' },
      metal: { en: 'Metal', ar: 'معدن' },
      wood: { en: 'Wood', ar: 'خشب' },
      paper: { en: 'Paper', ar: 'ورق' },
      plastic: { en: 'Plastic', ar: 'بلاستيك' },
      fabric: { en: 'Fabric', ar: 'قماش' },
      satin: { en: 'Satin', ar: 'ستان' },
      burlap: { en: 'Burlap', ar: 'خيش' },
      ready_bouquets: { en: 'Ready Bouquets', ar: 'باقات جاهزة' },
      vases: { en: 'Vases & Arrangements', ar: 'فازات وتنسيقات' },
      gifts: { en: 'Gifts & Additions', ar: 'هدايا وإضافات' },
      wrapping: { en: 'Wrapping Materials', ar: 'مواد تغليف' },
      cards: { en: 'Greeting Cards', ar: 'كروت إهداء' },
      services: { en: 'Services', ar: 'خدمات' },
      vases_glass: { en: 'Vases & Glassware', ar: 'فازات وزجاجيات' },
      wrapping_paper: { en: 'Wrapping Paper', ar: 'ورق تغليف' },
      ribbons: { en: 'Ribbons & Accessories', ar: 'شرائط وإكسسوارات' },
      floral_tools: { en: 'Floral Tools', ar: 'أدوات تنسيق' },
      gift_boxes: { en: 'Gift Boxes', ar: 'صناديق هدايا' },
    };
    return isRTL ? labels[classification]?.ar || classification : labels[classification]?.en || classification;
  };

  const getClassificationOptions = (type: string) => {
    if (type === 'natural_flowers' || type === 'artificial_flowers') {
      return [
        { value: 'bouquet', label: isRTL ? 'باقة' : 'Bouquet' },
        { value: 'single', label: isRTL ? 'حبة' : 'Single' },
        { value: 'branch', label: isRTL ? 'غصن' : 'Branch' },
      ];
    } else if (type === 'vases') {
      return [
        { value: 'glass', label: isRTL ? 'زجاج' : 'Glass' },
        { value: 'ceramic', label: isRTL ? 'سيراميك' : 'Ceramic' },
        { value: 'marble', label: isRTL ? 'رخام' : 'Marble' },
        { value: 'metal', label: isRTL ? 'معدن' : 'Metal' },
        { value: 'wood', label: isRTL ? 'خشب' : 'Wood' },
      ];
    } else if (type === 'wrapping' || type === 'ribbons') {
      return [
        { value: 'paper', label: isRTL ? 'ورق' : 'Paper' },
        { value: 'plastic', label: isRTL ? 'بلاستيك' : 'Plastic' },
        { value: 'fabric', label: isRTL ? 'قماش' : 'Fabric' },
        { value: 'satin', label: isRTL ? 'ستان' : 'Satin' },
        { value: 'burlap', label: isRTL ? 'خيش' : 'Burlap' },
      ];
    }
    return [];
  };

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
        {canEdit && (
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 bg-teal-600 text-white px-4 py-2.5 rounded-lg hover:bg-teal-700 transition font-medium"
          >
            <Plus className="w-5 h-5" />
            {t('common.add')}
          </button>
        )}
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
              <option value="all">{isRTL ? 'كل الأنواع' : 'All Types'}</option>
              <option value="natural_flowers">{isRTL ? 'ورد طبيعي' : 'Natural Flowers'}</option>
              <option value="artificial_flowers">{isRTL ? 'ورد صناعي' : 'Artificial Flowers'}</option>
              <option value="vases">{isRTL ? 'فازات' : 'Vases'}</option>
              <option value="wrapping">{isRTL ? 'تغليف' : 'Wrapping'}</option>
              <option value="ribbons">{isRTL ? 'شرائط' : 'Ribbons'}</option>
              <option value="additions_gifts">{isRTL ? 'إضافات وهدايا' : 'Additions & Gifts'}</option>
              <option value="services">{isRTL ? 'خدمات' : 'Services'}</option>
              <option value="natural">{isRTL ? 'ورد طبيعي (قديم)' : 'Natural (old)'}</option>
              <option value="artificial">{isRTL ? 'ورد صناعي (قديم)' : 'Artificial (old)'}</option>
              <option value="preserved">{isRTL ? 'ورد دائم (قديم)' : 'Preserved (old)'}</option>
              <option value="greenery">{isRTL ? 'أوراق خضراء' : 'Greenery'}</option>
              <option value="indoor_plants">{isRTL ? 'نباتات داخلية' : 'Indoor Plants'}</option>
              <option value="dried">{isRTL ? 'ورد مجفف' : 'Dried Flowers'}</option>
            </select>
            <select
              value={classificationFilter}
              onChange={(e) => setClassificationFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            >
              <option value="all">{isRTL ? 'كل التصنيفات' : 'All Classifications'}</option>
              <option value="ready_bouquets">{isRTL ? 'باقات جاهزة' : 'Ready Bouquets'}</option>
              <option value="vases">{isRTL ? 'فازات وتنسيقات' : 'Vases & Arrangements'}</option>
              <option value="gifts">{isRTL ? 'هدايا وإضافات' : 'Gifts & Additions'}</option>
              <option value="wrapping">{isRTL ? 'مواد تغليف' : 'Wrapping Materials'}</option>
              <option value="cards">{isRTL ? 'كروت إهداء' : 'Greeting Cards'}</option>
              <option value="services">{isRTL ? 'خدمات' : 'Services'}</option>
              <option value="vases_glass">{isRTL ? 'فازات وزجاجيات' : 'Vases & Glassware'}</option>
              <option value="wrapping_paper">{isRTL ? 'ورق تغليف' : 'Wrapping Paper'}</option>
              <option value="ribbons">{isRTL ? 'شرائط وإكسسوارات' : 'Ribbons & Accessories'}</option>
              <option value="floral_tools">{isRTL ? 'أدوات تنسيق' : 'Floral Tools'}</option>
              <option value="gift_boxes">{isRTL ? 'صناديق هدايا' : 'Gift Boxes'}</option>
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
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">{isRTL ? 'التصنيف' : 'Classification'}</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">{isRTL ? 'سعر الشراء' : 'Purchase'}</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">{isRTL ? 'سعر البيع' : 'Sale'}</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">{isRTL ? 'الربح' : 'Margin'}</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-gray-500">
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
                          (product.type as string) === 'natural_flowers' || (product.type as string) === 'natural' ? 'bg-green-100 text-green-700' :
                          (product.type as string) === 'artificial_flowers' || (product.type as string) === 'artificial' ? 'bg-blue-100 text-blue-700' :
                          (product.type as string) === 'vases' ? 'bg-purple-100 text-purple-700' :
                          (product.type as string) === 'wrapping' ? 'bg-pink-100 text-pink-700' :
                          (product.type as string) === 'ribbons' ? 'bg-rose-100 text-rose-700' :
                          (product.type as string) === 'additions_gifts' ? 'bg-amber-100 text-amber-700' :
                          (product.type as string) === 'services' ? 'bg-teal-100 text-teal-700' :
                          (product.type as string) === 'preserved' ? 'bg-purple-100 text-purple-700' :
                          (product.type as string) === 'greenery' ? 'bg-emerald-100 text-emerald-700' :
                          (product.type as string) === 'indoor_plants' ? 'bg-teal-100 text-teal-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {getTypeLabel(product.type)}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        {product.classification && (
                          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                            {getClassificationLabel(product.classification)}
                          </span>
                        )}
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
                          {canEdit && (
                            <>
                              <button
                                onClick={() => openRecipeModal(product)}
                                className="p-2 text-teal-600 hover:bg-teal-50 rounded-lg transition"
                                title={isRTL ? 'إدارة المكونات' : 'Manage Recipe'}
                              >
                                <ClipboardList className="w-4 h-4" />
                              </button>
                              <button onClick={() => openEditModal(product)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition">
                                <Edit className="w-4 h-4" />
                              </button>
                              <button onClick={() => setDeleteConfirm(product.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
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
                  <select
                    required
                    value={formData.type}
                    onChange={(e) => {
                      const newType = e.target.value as any;
                      setFormData({ ...formData, type: newType, classification: null });
                    }}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  >
                    <option value="natural_flowers">{isRTL ? 'ورد طبيعي' : 'Natural Flowers'}</option>
                    <option value="artificial_flowers">{isRTL ? 'ورد صناعي' : 'Artificial Flowers'}</option>
                    <option value="vases">{isRTL ? 'فازات' : 'Vases'}</option>
                    <option value="wrapping">{isRTL ? 'تغليف' : 'Wrapping'}</option>
                    <option value="ribbons">{isRTL ? 'شرائط' : 'Ribbons'}</option>
                    <option value="additions_gifts">{isRTL ? 'إضافات وهدايا' : 'Additions & Gifts'}</option>
                    <option value="services">{isRTL ? 'خدمات' : 'Services'}</option>
                  </select>
                </div>
              </div>

              {getClassificationOptions(formData.type).length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isRTL ? 'التصنيف' : 'Classification'}
                    <span className="text-xs text-gray-500 ml-2">
                      {isRTL ? '(اختياري)' : '(Optional)'}
                    </span>
                  </label>
                  <select
                    value={formData.classification || ''}
                    onChange={(e) => setFormData({ ...formData, classification: e.target.value as any || null })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  >
                    <option value="">{isRTL ? 'بدون تصنيف' : 'No Classification'}</option>
                    {getClassificationOptions(formData.type).map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              )}

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

      {showRecipeModal && recipeProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-xl">
              <div>
                <h3 className="text-xl font-bold text-gray-900">
                  {isRTL ? 'إدارة مكونات المنتج' : 'Product Recipe Management'}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  {isRTL ? recipeProduct.name_ar : recipeProduct.name} ({recipeProduct.sku})
                </p>
              </div>
              <button onClick={() => setShowRecipeModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  {isRTL
                    ? 'أضف المواد/المكونات التي تستخدم في هذا المنتج. عند البيع، سيتم خصم المكونات تلقائياً من المخزون.'
                    : 'Add materials/components used in this product. When sold, these materials will be automatically deducted from inventory.'
                  }
                </p>
              </div>

              <div className="space-y-4">
                <h4 className="font-semibold text-gray-900">{isRTL ? 'إضافة مكون جديد' : 'Add New Material'}</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {isRTL ? 'المادة/المكون' : 'Material/Component'}
                    </label>
                    <select
                      value={selectedMaterial}
                      onChange={(e) => setSelectedMaterial(e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    >
                      <option value="">{isRTL ? 'اختر مادة' : 'Select Material'}</option>
                      {products
                        .filter(p => p.is_active && p.id !== recipeProduct.id)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {isRTL ? p.name_ar : p.name} ({p.sku})
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {isRTL ? 'الكمية' : 'Quantity'}
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={materialQuantity}
                      onChange={(e) => setMaterialQuantity(parseFloat(e.target.value) || 1)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <button
                  onClick={addRecipeItem}
                  disabled={!selectedMaterial || materialQuantity <= 0}
                  className="w-full bg-teal-600 text-white py-2.5 rounded-lg hover:bg-teal-700 transition disabled:opacity-50 font-medium"
                >
                  {isRTL ? 'إضافة المكون' : 'Add Material'}
                </button>
              </div>

              <div className="space-y-4">
                <h4 className="font-semibold text-gray-900">{isRTL ? 'المكونات الحالية' : 'Current Recipe'}</h4>
                {recipes.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <ClipboardList className="w-12 h-12 mx-auto mb-2 opacity-30" />
                    <p>{isRTL ? 'لا توجد مكونات مضافة بعد' : 'No materials added yet'}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {recipes.map((recipe) => (
                      <div
                        key={recipe.id}
                        className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
                      >
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">
                            {recipe.material && (isRTL ? recipe.material.name_ar : recipe.material?.name)}
                          </div>
                          <div className="text-sm text-gray-500">
                            {recipe.material?.sku} | {isRTL ? 'الكمية:' : 'Qty:'} {recipe.quantity} | {isRTL ? 'سعر الشراء:' : 'Cost:'} {formatCurrency(recipe.material?.purchase_price || 0)}
                          </div>
                        </div>
                        <button
                          onClick={() => removeRecipeItem(recipe.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-gray-900">
                          {isRTL ? 'إجمالي تكلفة المكونات:' : 'Total Material Cost:'}
                        </span>
                        <span className="text-lg font-bold text-teal-600">
                          {formatCurrency(
                            recipes.reduce((sum, r) => sum + (r.material?.purchase_price || 0) * r.quantity, 0)
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t px-6 py-4 rounded-b-xl">
              <button
                onClick={() => setShowRecipeModal(false)}
                className="w-full bg-gray-100 text-gray-700 py-2.5 rounded-lg hover:bg-gray-200 transition font-medium"
              >
                {isRTL ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
