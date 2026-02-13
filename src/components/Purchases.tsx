import { useEffect, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { uploadFile, getSignedUrl } from '../lib/storageProvider';
import { ShoppingBag, Plus, Search, Eye, Check, XCircle, X, Trash2, CreditCard, Paperclip, Download } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  name_ar: string;
  purchase_price: number;
  sku: string;
}

interface Supplier {
  id: string;
  name: string;
  name_ar: string | null;
  code: string;
}

interface PurchaseItem {
  product_id: string;
  quantity: number;
  unit_price: number;
  discount: number;
  total: number;
}

interface Purchase {
  id: string;
  purchase_number: string;
  supplier_id: string | null;
  purchase_date: string;
  status: string;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  paid_amount: number;
  payment_status: string;
  payment_method: string | null;
  notes: string | null;
  attachment_url: string | null;
  suppliers?: { name: string; name_ar: string | null } | null;
}

export function Purchases() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const isRTL = language === 'ar';
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [viewingPurchase, setViewingPurchase] = useState<Purchase | null>(null);
  const [viewItems, setViewItems] = useState<any[]>([]);

  const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [purchaseNotes, setPurchaseNotes] = useState('');
  const [purchaseTax, setPurchaseTax] = useState(0);
  const [purchaseDiscount, setPurchaseDiscount] = useState(0);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [purchasesRes, productsRes, suppliersRes] = await Promise.all([
        supabase.from('purchases').select('*, suppliers(name, name_ar)').order('created_at', { ascending: false }),
        supabase.from('products').select('id, name, name_ar, purchase_price, sku').eq('is_active', true),
        supabase.from('suppliers').select('id, name, name_ar, code').eq('is_active', true),
      ]);
      if (purchasesRes.data) setPurchases(purchasesRes.data);
      if (productsRes.data) setProducts(productsRes.data);
      if (suppliersRes.data) setSuppliers(suppliersRes.data);
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const addItem = () => {
    setPurchaseItems([...purchaseItems, { product_id: '', quantity: 1, unit_price: 0, discount: 0, total: 0 }]);
  };

  const updateItem = (index: number, field: string, value: any) => {
    const updated = [...purchaseItems];
    const item = { ...updated[index], [field]: value };

    if (field === 'product_id') {
      const product = products.find((p) => p.id === value);
      if (product) item.unit_price = product.purchase_price;
    }

    item.total = (item.quantity * item.unit_price) - item.discount;
    updated[index] = item;
    setPurchaseItems(updated);
  };

  const removeItem = (index: number) => {
    setPurchaseItems(purchaseItems.filter((_, i) => i !== index));
  };

  const subtotal = purchaseItems.reduce((sum, item) => sum + item.total, 0);
  const total = subtotal + purchaseTax - purchaseDiscount;

  const openNewPurchase = () => {
    setPurchaseItems([]);
    setSelectedSupplier('');
    setPaymentMethod('cash');
    setPurchaseNotes('');
    setPurchaseTax(0);
    setPurchaseDiscount(0);
    setAttachmentFile(null);
    setError('');
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (purchaseItems.length === 0) {
      setError(isRTL ? 'أضف منتج واحد على الأقل' : 'Add at least one product');
      return;
    }

    setError('');
    setSubmitting(true);

    try {
      let attachmentUrl = null;
      if (attachmentFile) {
        attachmentUrl = await uploadFile(attachmentFile, 'purchases');
        if (!attachmentUrl) {
          console.warn('File upload failed, continuing without attachment');
        }
      }

      const purchaseNumber = `PO-${Date.now().toString(36).toUpperCase()}`;

      const { data: purchase, error: purchaseError } = await supabase
        .from('purchases')
        .insert({
          purchase_number: purchaseNumber,
          supplier_id: selectedSupplier || null,
          purchase_date: new Date().toISOString(),
          status: 'confirmed',
          subtotal,
          tax: purchaseTax,
          discount: purchaseDiscount,
          total,
          paid_amount: total,
          payment_status: 'paid',
          payment_method: paymentMethod,
          notes: purchaseNotes || null,
          attachment_url: attachmentUrl,
          created_by: user?.id,
        })
        .select()
        .single();

      if (purchaseError) throw purchaseError;

      const items = purchaseItems.map((item) => ({
        purchase_id: purchase.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount: item.discount,
        total: item.total,
      }));

      const { error: itemsError } = await supabase.from('purchase_items').insert(items);
      if (itemsError) throw itemsError;

      setShowForm(false);
      loadData();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const viewPurchaseDetails = async (purchase: Purchase) => {
    setViewingPurchase(purchase);
    const { data } = await supabase
      .from('purchase_items')
      .select('*, products(name, name_ar, sku)')
      .eq('purchase_id', purchase.id);
    setViewItems(data || []);
  };

  const updatePurchaseStatus = async (purchaseId: string, status: string) => {
    await supabase.from('purchases').update({ status }).eq('id', purchaseId);
    loadData();
    setViewingPurchase(null);
  };

  const filtered = purchases.filter((p) => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    const term = searchTerm.toLowerCase();
    return (
      p.purchase_number.toLowerCase().includes(term) ||
      (p.suppliers?.name && p.suppliers.name.toLowerCase().includes(term))
    );
  });

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat(isRTL ? 'ar-SA' : 'en-US', { style: 'decimal', minimumFractionDigits: 2 }).format(amount);

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString(isRTL ? 'ar-SA' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  const statusColors: Record<string, string> = {
    draft: 'bg-yellow-100 text-yellow-700',
    confirmed: 'bg-blue-100 text-blue-700',
    received: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
  };

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

  if (showForm) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{isRTL ? 'أمر شراء جديد' : 'New Purchase'}</h2>
            <p className="text-gray-500 mt-1">{isRTL ? 'إنشاء أمر شراء جديد' : 'Create a new purchase order'}</p>
          </div>
          <button onClick={() => setShowForm(false)} className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
            <X className="w-5 h-5" /> {isRTL ? 'إلغاء' : 'Cancel'}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-900">{isRTL ? 'المنتجات' : 'Items'}</h3>
                <button onClick={addItem} className="flex items-center gap-1 text-teal-600 hover:text-teal-700 text-sm font-medium">
                  <Plus className="w-4 h-4" /> {isRTL ? 'إضافة منتج' : 'Add Item'}
                </button>
              </div>

              {purchaseItems.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <ShoppingBag className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p>{isRTL ? 'أضف منتجات لأمر الشراء' : 'Add items to the purchase'}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {purchaseItems.map((item, index) => (
                    <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <select
                        value={item.product_id}
                        onChange={(e) => updateItem(index, 'product_id', e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      >
                        <option value="">{isRTL ? 'اختر منتج' : 'Select Product'}</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {isRTL ? p.name_ar : p.name} ({formatCurrency(p.purchase_price)})
                          </option>
                        ))}
                      </select>
                      <input type="number" min="1" value={item.quantity} onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1)} className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-sm text-center focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
                      <input type="number" step="0.01" value={item.unit_price} onChange={(e) => updateItem(index, 'unit_price', parseFloat(e.target.value) || 0)} className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm text-center focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
                      <div className="w-28 text-sm font-bold text-gray-900 text-center">{formatCurrency(item.total)}</div>
                      <button onClick={() => removeItem(index)} className="p-1.5 text-red-500 hover:bg-red-50 rounded">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
              <h3 className="font-bold text-gray-900">{isRTL ? 'تفاصيل الشراء' : 'Purchase Details'}</h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'المورد' : 'Supplier'}</label>
                <select value={selectedSupplier} onChange={(e) => setSelectedSupplier(e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm">
                  <option value="">{isRTL ? 'اختر مورد' : 'Select Supplier'}</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{isRTL ? s.name_ar || s.name : s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'طريقة الدفع' : 'Payment'}</label>
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm">
                  <option value="cash">{isRTL ? 'نقدي' : 'Cash'}</option>
                  <option value="transfer">{isRTL ? 'تحويل' : 'Transfer'}</option>
                  <option value="check">{isRTL ? 'شيك' : 'Check'}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'الضريبة' : 'Tax'}</label>
                <input type="number" step="0.01" min="0" value={purchaseTax} onChange={(e) => setPurchaseTax(parseFloat(e.target.value) || 0)} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'الخصم' : 'Discount'}</label>
                <input type="number" step="0.01" min="0" value={purchaseDiscount} onChange={(e) => setPurchaseDiscount(parseFloat(e.target.value) || 0)} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'ملاحظات' : 'Notes'}</label>
                <textarea value={purchaseNotes} onChange={(e) => setPurchaseNotes(e.target.value)} rows={2} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm resize-none" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Paperclip className="w-4 h-4 inline mr-1" />
                  {isRTL ? 'إرفاق فاتورة/إيصال' : 'Attach Invoice/Receipt'}
                </label>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                />
                {attachmentFile && (
                  <p className="text-xs text-gray-500 mt-1">
                    {isRTL ? 'الملف المحدد: ' : 'Selected: '}{attachmentFile.name}
                  </p>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-6 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{isRTL ? 'المجموع الفرعي' : 'Subtotal'}</span>
                <span className="font-medium">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{isRTL ? 'الضريبة' : 'Tax'}</span>
                <span className="font-medium">{formatCurrency(purchaseTax)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{isRTL ? 'الخصم' : 'Discount'}</span>
                <span className="font-medium text-red-600">-{formatCurrency(purchaseDiscount)}</span>
              </div>
              <div className="border-t pt-3 flex justify-between">
                <span className="font-bold text-gray-900">{isRTL ? 'الإجمالي' : 'Total'}</span>
                <span className="font-bold text-xl text-teal-600">{formatCurrency(total)}</span>
              </div>

              <button
                onClick={handleSubmit}
                disabled={submitting || purchaseItems.length === 0}
                className="w-full bg-teal-600 text-white py-3 rounded-lg hover:bg-teal-700 transition disabled:opacity-50 font-medium flex items-center justify-center gap-2"
              >
                <CreditCard className="w-5 h-5" />
                {submitting ? (isRTL ? 'جاري الحفظ...' : 'Saving...') : (isRTL ? 'تأكيد الشراء' : 'Confirm Purchase')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('nav.purchases')}</h2>
          <p className="text-gray-500 mt-1">{isRTL ? 'إدارة المشتريات وأوامر الشراء' : 'Manage purchases and orders'}</p>
        </div>
        <button
          onClick={openNewPurchase}
          className="flex items-center gap-2 bg-teal-600 text-white px-4 py-2.5 rounded-lg hover:bg-teal-700 transition font-medium"
        >
          <Plus className="w-5 h-5" />
          {isRTL ? 'شراء جديد' : 'New Purchase'}
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input type="text" placeholder={t('common.search')} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-teal-500 focus:border-transparent">
            <option value="all">{isRTL ? 'الكل' : 'All Status'}</option>
            <option value="draft">{isRTL ? 'مسودة' : 'Draft'}</option>
            <option value="confirmed">{isRTL ? 'مؤكد' : 'Confirmed'}</option>
            <option value="received">{isRTL ? 'مستلم' : 'Received'}</option>
            <option value="cancelled">{isRTL ? 'ملغي' : 'Cancelled'}</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <ShoppingBag className="w-16 h-16 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">{isRTL ? 'لا توجد مشتريات' : 'No purchases found'}</p>
            <p className="text-sm mt-1">{isRTL ? 'أنشئ أمر شراء جديد للبدء' : 'Create a new purchase to get started'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">{isRTL ? 'الرقم' : 'Number'}</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">{isRTL ? 'التاريخ' : 'Date'}</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">{isRTL ? 'المورد' : 'Supplier'}</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">{isRTL ? 'الإجمالي' : 'Total'}</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">{isRTL ? 'الحالة' : 'Status'}</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((purchase) => (
                  <tr key={purchase.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition">
                    <td className="py-3.5 px-4 font-mono text-sm">{purchase.purchase_number}</td>
                    <td className="py-3.5 px-4 text-sm text-gray-600">{formatDate(purchase.purchase_date)}</td>
                    <td className="py-3.5 px-4 text-sm">
                      {purchase.suppliers ? (isRTL ? purchase.suppliers.name_ar || purchase.suppliers.name : purchase.suppliers.name) : '-'}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-gray-900">{formatCurrency(purchase.total)} {isRTL ? 'ر.س' : 'SAR'}</td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[purchase.status] || ''}`}>
                        {purchase.status === 'draft' ? (isRTL ? 'مسودة' : 'Draft') :
                         purchase.status === 'confirmed' ? (isRTL ? 'مؤكد' : 'Confirmed') :
                         purchase.status === 'received' ? (isRTL ? 'مستلم' : 'Received') :
                         (isRTL ? 'ملغي' : 'Cancelled')}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <button onClick={() => viewPurchaseDetails(purchase)} className="p-2 text-teal-600 hover:bg-teal-50 rounded-lg transition">
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {viewingPurchase && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-xl">
              <h3 className="text-xl font-bold text-gray-900">
                {isRTL ? 'تفاصيل الشراء' : 'Purchase Details'} - {viewingPurchase.purchase_number}
              </h3>
              <button onClick={() => setViewingPurchase(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-3 font-semibold text-gray-700">{isRTL ? 'المنتج' : 'Product'}</th>
                      <th className="text-center py-2 px-3 font-semibold text-gray-700">{isRTL ? 'الكمية' : 'Qty'}</th>
                      <th className="text-center py-2 px-3 font-semibold text-gray-700">{isRTL ? 'السعر' : 'Price'}</th>
                      <th className="text-right py-2 px-3 font-semibold text-gray-700">{isRTL ? 'الإجمالي' : 'Total'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewItems.map((item: any) => (
                      <tr key={item.id} className="border-b border-gray-50">
                        <td className="py-2 px-3">{item.products ? (isRTL ? item.products.name_ar : item.products.name) : '-'}</td>
                        <td className="py-2 px-3 text-center">{item.quantity}</td>
                        <td className="py-2 px-3 text-center">{formatCurrency(item.unit_price)}</td>
                        <td className="py-2 px-3 text-right font-medium">{formatCurrency(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="border-t pt-4 flex justify-between font-bold text-lg">
                <span>{isRTL ? 'الإجمالي' : 'Total'}</span>
                <span className="text-teal-600">{formatCurrency(viewingPurchase.total)} {isRTL ? 'ر.س' : 'SAR'}</span>
              </div>

              {viewingPurchase.attachment_url && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <button
                    onClick={async () => {
                      const url = await getSignedUrl(viewingPurchase.attachment_url!);
                      if (url) window.open(url, '_blank');
                    }}
                    className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium"
                  >
                    <Download className="w-4 h-4" />
                    {isRTL ? 'تحميل الفاتورة/الإيصال' : 'Download Invoice/Receipt'}
                  </button>
                </div>
              )}

              {viewingPurchase.status === 'confirmed' && (
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => updatePurchaseStatus(viewingPurchase.id, 'received')}
                    className="flex-1 flex items-center justify-center gap-2 bg-green-600 text-white py-2.5 rounded-lg hover:bg-green-700 transition font-medium"
                  >
                    <Check className="w-4 h-4" /> {isRTL ? 'تم الاستلام' : 'Mark Received'}
                  </button>
                  <button
                    onClick={() => updatePurchaseStatus(viewingPurchase.id, 'cancelled')}
                    className="flex-1 flex items-center justify-center gap-2 bg-red-600 text-white py-2.5 rounded-lg hover:bg-red-700 transition font-medium"
                  >
                    <XCircle className="w-4 h-4" /> {isRTL ? 'إلغاء' : 'Cancel'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
