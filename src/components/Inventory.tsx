import { useEffect, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabase';
import { Warehouse, Search, AlertTriangle, Package, ArrowUpCircle, ArrowDownCircle, Trash2, ClipboardList, X, Save } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useBranch } from '../contexts/BranchContext';

interface InventoryItem {
  id: string;
  product_id: string;
  quantity: number;
  last_updated: string;
  products: {
    name: string;
    name_ar: string;
    sku: string;
    type: string;
    sale_price: number;
    purchase_price: number;
    min_stock_level: number;
  };
}

interface Movement {
  id: string;
  product_id: string;
  movement_type: string;
  quantity: number;
  reference_type: string | null;
  notes: string | null;
  created_at: string;
  products: { name: string; name_ar: string; sku: string };
}

export function Inventory() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { currentBranchId, isAdmin } = useBranch();
  const isRTL = language === 'ar';
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'stock' | 'movements'>('stock');
  const [stockFilter, setStockFilter] = useState('all');

  const [showDamageModal, setShowDamageModal] = useState(false);
  const [showCountModal, setShowCountModal] = useState(false);
  const [damageProductId, setDamageProductId] = useState('');
  const [damageQty, setDamageQty] = useState('');
  const [damageNotes, setDamageNotes] = useState('');
  const [countProductId, setCountProductId] = useState('');
  const [countQty, setCountQty] = useState('');
  const [countNotes, setCountNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [userBranchId, setUserBranchId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    loadUserBranch();
  }, [currentBranchId, isAdmin]);

  const loadUserBranch = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('users')
        .select('branch_id')
        .eq('id', user.id)
        .maybeSingle();

      if (error) throw error;
      if (data) setUserBranchId(data.branch_id);
    } catch (err) {
      console.error('Error loading user branch:', err);
    }
  };

  const loadData = async () => {
    try {
      let invQuery = supabase
        .from('inventory')
        .select('*, products(name, name_ar, sku, type, sale_price, purchase_price, min_stock_level)')
        .order('quantity', { ascending: true });

      if (!isAdmin && currentBranchId) {
        invQuery = (invQuery as any).eq('branch_id', currentBranchId);
      }

      let movQuery = supabase
        .from('inventory_movements')
        .select('*, products(name, name_ar, sku)')
        .order('created_at', { ascending: false })
        .limit(50);

      const [inventoryRes, movementsRes] = await Promise.all([invQuery, movQuery]);

      if (inventoryRes.data) setInventory(inventoryRes.data as any[]);
      if (movementsRes.data) setMovements(movementsRes.data as any[]);
    } catch (err) {
      console.error('Error loading inventory:', err);
    } finally {
      setLoading(false);
    }
  };

  const recordDamage = async () => {
    if (!damageProductId || !damageQty) return;
    setSubmitting(true);
    const qty = parseInt(damageQty);
    const inv = inventory.find(i => i.product_id === damageProductId);
    if (inv && userBranchId) {
      await supabase
        .from('inventory')
        .update({
          quantity: Math.max(0, inv.quantity - qty),
          last_updated: new Date().toISOString()
        })
        .eq('id', inv.id)
        .eq('product_id', damageProductId)
        .eq('branch_id', userBranchId);
    }
    await supabase.from('inventory_movements').insert({
      product_id: damageProductId,
      movement_type: 'out',
      quantity: qty,
      reference_type: 'damage',
      notes: damageNotes || (isRTL ? 'تلف ورد' : 'Flower damage'),
      created_by: user?.id,
    });
    setShowDamageModal(false);
    setDamageProductId('');
    setDamageQty('');
    setDamageNotes('');
    setSubmitting(false);
    loadData();
  };

  const manualCount = async () => {
    if (!countProductId || countQty === '') return;
    setSubmitting(true);
    const newQty = parseInt(countQty);
    const inv = inventory.find(i => i.product_id === countProductId);
    if (inv && userBranchId) {
      const diff = newQty - inv.quantity;
      await supabase
        .from('inventory')
        .update({
          quantity: newQty,
          last_updated: new Date().toISOString()
        })
        .eq('id', inv.id)
        .eq('product_id', countProductId)
        .eq('branch_id', userBranchId);
      await supabase.from('inventory_movements').insert({
        product_id: countProductId,
        movement_type: 'adjustment',
        quantity: Math.abs(diff),
        reference_type: 'manual_count',
        notes: countNotes || (isRTL ? `جرد يدوي: ${inv.quantity} → ${newQty}` : `Manual count: ${inv.quantity} → ${newQty}`),
        created_by: user?.id,
      });
    }
    setShowCountModal(false);
    setCountProductId('');
    setCountQty('');
    setCountNotes('');
    setSubmitting(false);
    loadData();
  };

  const filteredInventory = inventory.filter((item) => {
    if (!item.products) return false;
    const s = searchTerm.toLowerCase();
    const matchesSearch =
      item.products.name.toLowerCase().includes(s) ||
      item.products.name_ar.includes(searchTerm) ||
      item.products.sku.toLowerCase().includes(s);

    if (stockFilter === 'low') return matchesSearch && item.quantity <= item.products.min_stock_level;
    if (stockFilter === 'out') return matchesSearch && item.quantity <= 0;
    return matchesSearch;
  });

  const totalValue = inventory.reduce(
    (sum, item) => sum + (item.quantity * (item.products?.purchase_price || 0)),
    0
  );
  const totalItems = inventory.reduce((sum, item) => sum + item.quantity, 0);
  const lowStockCount = inventory.filter(
    (item) => item.products && item.quantity <= item.products.min_stock_level && item.quantity > 0
  ).length;
  const outOfStockCount = inventory.filter((item) => item.quantity <= 0).length;

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat(isRTL ? 'ar-SA' : 'en-US', { style: 'decimal', minimumFractionDigits: 2 }).format(amount);

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString(isRTL ? 'ar-SA' : 'en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });

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
          <h2 className="text-2xl font-bold text-gray-900">{t('nav.inventory')}</h2>
          <p className="text-gray-500 mt-1">{isRTL ? 'إدارة ومتابعة المخزون' : 'Track and manage stock levels'}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowDamageModal(true)} className="flex items-center gap-2 bg-red-50 text-red-600 border border-red-200 px-3 py-2 rounded-lg hover:bg-red-100 transition text-sm font-medium">
            <Trash2 className="w-4 h-4" /> {isRTL ? 'تسجيل تلف' : 'Record Damage'}
          </button>
          <button onClick={() => setShowCountModal(true)} className="flex items-center gap-2 bg-blue-50 text-blue-600 border border-blue-200 px-3 py-2 rounded-lg hover:bg-blue-100 transition text-sm font-medium">
            <ClipboardList className="w-4 h-4" /> {isRTL ? 'جرد يدوي' : 'Manual Count'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-100 rounded-lg">
              <Package className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">{isRTL ? 'إجمالي الأصناف' : 'Total Items'}</p>
              <p className="text-2xl font-bold text-gray-900">{inventory.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-green-100 rounded-lg">
              <Warehouse className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">{isRTL ? 'إجمالي الكميات' : 'Total Quantity'}</p>
              <p className="text-2xl font-bold text-gray-900">{totalItems}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-yellow-100 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">{isRTL ? 'مخزون منخفض' : 'Low Stock'}</p>
              <p className="text-2xl font-bold text-yellow-600">{lowStockCount}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-teal-100 rounded-lg">
              <Package className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">{isRTL ? 'قيمة المخزون' : 'Stock Value'}</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(totalValue)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border">
        <div className="border-b px-6 pt-4">
          <div className="flex gap-4">
            <button
              onClick={() => setActiveTab('stock')}
              className={`pb-3 px-1 text-sm font-medium border-b-2 transition ${
                activeTab === 'stock' ? 'border-teal-600 text-teal-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {isRTL ? 'مستويات المخزون' : 'Stock Levels'}
            </button>
            <button
              onClick={() => setActiveTab('movements')}
              className={`pb-3 px-1 text-sm font-medium border-b-2 transition ${
                activeTab === 'movements' ? 'border-teal-600 text-teal-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {isRTL ? 'حركات المخزون' : 'Stock Movements'}
            </button>
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'stock' && (
            <>
              <div className="flex items-center gap-4 mb-6">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input type="text" placeholder={t('common.search')} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
                </div>
                <select value={stockFilter} onChange={(e) => setStockFilter(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-teal-500 focus:border-transparent">
                  <option value="all">{isRTL ? 'الكل' : 'All'}</option>
                  <option value="low">{isRTL ? 'مخزون منخفض' : 'Low Stock'}</option>
                  <option value="out">{isRTL ? 'نفد المخزون' : 'Out of Stock'}</option>
                </select>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">SKU</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">{isRTL ? 'المنتج' : 'Product'}</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">{isRTL ? 'النوع' : 'Type'}</th>
                      <th className="text-center py-3 px-4 font-semibold text-gray-700 text-sm">{isRTL ? 'الكمية' : 'Quantity'}</th>
                      <th className="text-center py-3 px-4 font-semibold text-gray-700 text-sm">{isRTL ? 'الحد الأدنى' : 'Min Level'}</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700 text-sm">{isRTL ? 'القيمة' : 'Value'}</th>
                      <th className="text-center py-3 px-4 font-semibold text-gray-700 text-sm">{isRTL ? 'الحالة' : 'Status'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInventory.map((item) => {
                      const isLow = item.quantity <= item.products.min_stock_level && item.quantity > 0;
                      const isOut = item.quantity <= 0;
                      return (
                        <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="py-3 px-4 font-mono text-sm text-gray-600">{item.products.sku}</td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-gray-900">{isRTL ? item.products.name_ar : item.products.name}</div>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              item.products.type === 'natural' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                            }`}>
                              {item.products.type === 'natural' ? (isRTL ? 'طبيعي' : 'Natural') : (isRTL ? 'صناعي' : 'Artificial')}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center font-bold text-gray-900">{item.quantity}</td>
                          <td className="py-3 px-4 text-center text-gray-500">{item.products.min_stock_level}</td>
                          <td className="py-3 px-4 text-right font-medium">
                            {formatCurrency(item.quantity * item.products.purchase_price)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {isOut ? (
                              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                                {isRTL ? 'نفد' : 'Out'}
                              </span>
                            ) : isLow ? (
                              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                                {isRTL ? 'منخفض' : 'Low'}
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                {isRTL ? 'متوفر' : 'OK'}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {activeTab === 'movements' && (
            <div className="overflow-x-auto">
              {movements.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Warehouse className="w-16 h-16 mx-auto mb-3 opacity-30" />
                  <p className="text-lg font-medium">{isRTL ? 'لا توجد حركات' : 'No movements found'}</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">{isRTL ? 'التاريخ' : 'Date'}</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">{isRTL ? 'المنتج' : 'Product'}</th>
                      <th className="text-center py-3 px-4 font-semibold text-gray-700 text-sm">{isRTL ? 'النوع' : 'Type'}</th>
                      <th className="text-center py-3 px-4 font-semibold text-gray-700 text-sm">{isRTL ? 'الكمية' : 'Quantity'}</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">{isRTL ? 'ملاحظات' : 'Notes'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((mov) => (
                      <tr key={mov.id} className="border-b border-gray-50">
                        <td className="py-3 px-4 text-sm text-gray-600">{formatDate(mov.created_at)}</td>
                        <td className="py-3 px-4 text-sm font-medium">
                          {mov.products ? (isRTL ? mov.products.name_ar : mov.products.name) : '-'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {mov.movement_type === 'in' ? (
                            <span className="inline-flex items-center gap-1 text-green-600 text-sm">
                              <ArrowUpCircle className="w-4 h-4" /> {isRTL ? 'إدخال' : 'In'}
                            </span>
                          ) : mov.movement_type === 'out' ? (
                            <span className="inline-flex items-center gap-1 text-red-600 text-sm">
                              <ArrowDownCircle className="w-4 h-4" /> {isRTL ? 'إخراج' : 'Out'}
                            </span>
                          ) : (
                            <span className="text-yellow-600 text-sm">{isRTL ? 'تعديل' : 'Adjustment'}</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center font-bold">{mov.quantity}</td>
                        <td className="py-3 px-4 text-sm text-gray-500">{mov.notes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>

      {showDamageModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-bold text-red-600">{isRTL ? 'تسجيل تلف' : 'Record Damage'}</h3>
              <button onClick={() => setShowDamageModal(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'المنتج' : 'Product'}</label>
                <select value={damageProductId} onChange={(e) => setDamageProductId(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent">
                  <option value="">{isRTL ? 'اختر منتج' : 'Select product'}</option>
                  {inventory.filter(i => i.quantity > 0).map(item => (
                    <option key={item.product_id} value={item.product_id}>
                      {isRTL ? item.products.name_ar : item.products.name} ({item.quantity})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'الكمية التالفة' : 'Damaged Quantity'}</label>
                <input type="number" min="1" value={damageQty} onChange={(e) => setDamageQty(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'ملاحظات' : 'Notes'}</label>
                <input type="text" value={damageNotes} onChange={(e) => setDamageNotes(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent" dir="rtl" placeholder={isRTL ? 'تلف بسبب...' : 'Damaged due to...'} />
              </div>
              <button onClick={recordDamage} disabled={submitting || !damageProductId || !damageQty} className="w-full bg-red-600 text-white py-2.5 rounded-lg hover:bg-red-700 transition font-medium disabled:opacity-50 flex items-center justify-center gap-2">
                <Save className="w-4 h-4" /> {submitting ? (isRTL ? 'جاري التسجيل...' : 'Recording...') : (isRTL ? 'تسجيل التلف' : 'Record Damage')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCountModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-bold text-blue-600">{isRTL ? 'جرد يدوي' : 'Manual Count'}</h3>
              <button onClick={() => setShowCountModal(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'المنتج' : 'Product'}</label>
                <select value={countProductId} onChange={(e) => { setCountProductId(e.target.value); const inv = inventory.find(i => i.product_id === e.target.value); if (inv) setCountQty(String(inv.quantity)); }} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent">
                  <option value="">{isRTL ? 'اختر منتج' : 'Select product'}</option>
                  {inventory.map(item => (
                    <option key={item.product_id} value={item.product_id}>
                      {isRTL ? item.products.name_ar : item.products.name} ({isRTL ? 'الحالي:' : 'Current:'} {item.quantity})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'الكمية الفعلية' : 'Actual Quantity'}</label>
                <input type="number" min="0" value={countQty} onChange={(e) => setCountQty(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'ملاحظات' : 'Notes'}</label>
                <input type="text" value={countNotes} onChange={(e) => setCountNotes(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent" dir="rtl" />
              </div>
              <button onClick={manualCount} disabled={submitting || !countProductId || countQty === ''} className="w-full bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50 flex items-center justify-center gap-2">
                <Save className="w-4 h-4" /> {submitting ? (isRTL ? 'جاري التحديث...' : 'Updating...') : (isRTL ? 'تحديث المخزون' : 'Update Stock')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
