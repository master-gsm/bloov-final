import { useEffect, useState, useRef } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useCanEdit } from '../hooks/useCanEdit';
import { supabase } from '../lib/supabase';
import { ShoppingCart, Plus, Search, Eye, Check, XCircle, X, Trash2, CreditCard, Printer, MessageCircle, Truck, Download, Edit, RotateCcw } from 'lucide-react';
import { InvoicePrint } from './InvoicePrint';
import { shareInvoiceViaWhatsApp, downloadInvoicePDF } from '../lib/pdfGenerator';

interface Product {
  id: string;
  name: string;
  name_ar: string;
  sale_price: number;
  purchase_price: number;
  sku: string;
  type: 'natural_flowers' | 'artificial_flowers' | 'vases' | 'wrapping' | 'ribbons' | 'additions_gifts' | 'services' | 'natural' | 'artificial' | 'preserved' | 'greenery' | 'indoor_plants' | 'dried';
  classification: 'bouquet' | 'single' | 'branch' | 'glass' | 'ceramic' | 'marble' | 'metal' | 'wood' | 'paper' | 'plastic' | 'fabric' | 'satin' | 'burlap' | 'ready_bouquets' | 'vases' | 'gifts' | 'wrapping' | 'cards' | 'services' | 'vases_glass' | 'wrapping_paper' | 'ribbons' | 'floral_tools' | 'gift_boxes' | null;
}

interface Customer {
  id: string;
  name: string;
  name_ar: string | null;
  code: string;
  phone: string | null;
  total_spent?: number;
  order_count?: number;
  tier?: 'vip' | 'frequent' | 'regular' | 'inactive';
  last_order_date?: string;
}

interface CustomerLoyalty {
  id: string;
  customer_id: string;
  points: number;
  total_earned: number;
  total_redeemed: number;
}

interface SaleItem {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  discount: number;
  total: number;
}

interface Sale {
  id: string;
  sale_number: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  sale_date: string;
  status: string;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  paid_amount: number;
  payment_status: string;
  payment_method: string | null;
  notes: string | null;
  customers?: { name: string; name_ar: string | null; phone: string | null } | null;
}

export function Sales() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const canEdit = useCanEdit();
  const isRTL = language === 'ar';
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [canManageSales, setCanManageSales] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [classificationFilter, setClassificationFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [viewingSale, setViewingSale] = useState<Sale | null>(null);
  const [viewItems, setViewItems] = useState<any[]>([]);
  const [printingSale, setPrintingSale] = useState<Sale | null>(null);
  const [printItems, setPrintItems] = useState<any[]>([]);

  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [walkinName, setWalkinName] = useState('');
  const [walkinPhone, setWalkinPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [saleNotes, setSaleNotes] = useState('');
  const [saleDiscount, setSaleDiscount] = useState(0);
  const [deliveryCharge, setDeliveryCharge] = useState(0);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [cardMessage, setCardMessage] = useState('');
  const [showDelivery, setShowDelivery] = useState(false);
  const [taxRate, setTaxRate] = useState(0.15);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [saleSource, setSaleSource] = useState<'store' | 'salla'>('store');
  const [sallaShippingCost, setSallaShippingCost] = useState(0);
  const [sallaPaymentFee, setSallaPaymentFee] = useState(0);

  const [lookedUpCustomer, setLookedUpCustomer] = useState<Customer | null>(null);
  const [customerLoyalty, setCustomerLoyalty] = useState<CustomerLoyalty | null>(null);
  const [pointsToRedeem, setPointsToRedeem] = useState(0);
  const [showQuickRegister, setShowQuickRegister] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [userBranchId, setUserBranchId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    checkAdmin();
    loadUserBranch();
  }, []);

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

  const checkAdmin = async () => {
    if (!user) return;
    try {
      const { data: role } = await supabase.rpc('get_my_role');
      setIsAdmin(role === 'admin' || role === 'super_admin');
      setCanManageSales(role === 'admin' || role === 'super_admin' || role === 'accountant');
    } catch (err) {
      console.error('Error checking role:', err);
    }
  };

  const loadData = async () => {
    try {
      const [salesRes, productsRes, customersRes, settingsRes] = await Promise.all([
        supabase.from('sales').select('*, customers(name, name_ar, phone)').order('created_at', { ascending: false }),
        supabase.from('products').select('id, name, name_ar, sale_price, purchase_price, sku, type, classification').eq('is_active', true),
        supabase.from('customers').select('id, name, name_ar, code, phone').eq('is_active', true),
        supabase.from('settings').select('tax_rate').eq('id', 1).maybeSingle(),
      ]);
      if (salesRes.data) setSales(salesRes.data);
      if (productsRes.data) setProducts(productsRes.data);
      if (customersRes.data) setCustomers(customersRes.data);
      if (settingsRes.data?.tax_rate) setTaxRate(parseFloat(settingsRes.data.tax_rate.toString()));
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const addItem = () => {
    setSaleItems([...saleItems, { product_id: '', product_name: '', quantity: 1, unit_price: 0, purchase_price: 0, discount: 0, total: 0 }]);
  };

  const updateItem = (index: number, field: string, value: any) => {
    const updated = [...saleItems];
    const item = { ...updated[index], [field]: value };
    if (field === 'product_id') {
      const product = products.find((p) => p.id === value);
      if (product) {
        item.unit_price = product.sale_price;
        item.purchase_price = product.purchase_price || 0;
        item.product_name = isRTL ? product.name_ar : product.name;
      }
    }
    item.total = (item.quantity * item.unit_price) - item.discount;
    updated[index] = item;
    setSaleItems(updated);
  };

  const removeItem = (index: number) => setSaleItems(saleItems.filter((_, i) => i !== index));

  const lookupCustomerByPhone = async (phone: string) => {
    if (!phone || phone.length < 10) {
      setLookedUpCustomer(null);
      setCustomerLoyalty(null);
      return;
    }

    setIsLookingUp(true);
    try {
      const { data: customer } = await supabase
        .from('customers')
        .select('*')
        .eq('phone', phone)
        .maybeSingle();

      if (customer) {
        setLookedUpCustomer(customer);
        setWalkinName(customer.name);
        setSelectedCustomer(customer.id);

        const { data: loyalty } = await supabase
          .from('customer_loyalty')
          .select('*')
          .eq('customer_id', customer.id)
          .maybeSingle();

        setCustomerLoyalty(loyalty);
      } else {
        setLookedUpCustomer(null);
        setCustomerLoyalty(null);
        setWalkinName('');
      }
    } catch (err) {
      console.error('Error looking up customer:', err);
    } finally {
      setIsLookingUp(false);
    }
  };

  const quickRegisterCustomer = async () => {
    if (!walkinName || !walkinPhone) {
      setError(isRTL ? 'الرجاء إدخال الاسم ورقم الهاتف' : 'Please enter name and phone');
      return;
    }

    try {
      const customerCode = `C${Date.now().toString(36).toUpperCase()}`;
      const { data: newCustomer, error: custError } = await supabase
        .from('customers')
        .insert({
          code: customerCode,
          name: walkinName,
          name_ar: walkinName,
          phone: walkinPhone,
          is_active: true,
          created_by: user?.id,
        })
        .select()
        .single();

      if (custError) throw custError;

      await supabase.from('customer_loyalty').insert({
        customer_id: newCustomer.id,
        points: 0,
        total_earned: 0,
        total_redeemed: 0,
      });

      setSelectedCustomer(newCustomer.id);
      setLookedUpCustomer(newCustomer);
      setCustomerLoyalty({ id: '', customer_id: newCustomer.id, points: 0, total_earned: 0, total_redeemed: 0 });
      setShowQuickRegister(false);
      await loadData();
    } catch (err) {
      console.error('Error registering customer:', err);
      setError(isRTL ? 'حدث خطأ في التسجيل' : 'Registration error');
    }
  };

  const calculatePointsDiscount = (points: number): number => {
    const pointsRate = 0.05;
    return Math.floor(points * pointsRate * 100) / 100;
  };

  const applyPointsRedemption = () => {
    if (!customerLoyalty || customerLoyalty.points <= 0) return;
    const maxPoints = customerLoyalty.points;
    const discount = calculatePointsDiscount(maxPoints);
    setPointsToRedeem(maxPoints);
    setSaleDiscount(saleDiscount + discount);
  };

  const subtotal = saleItems.reduce((sum, item) => sum + item.total, 0);
  const pointsDiscount = calculatePointsDiscount(pointsToRedeem);
  const taxableAmount = subtotal - saleDiscount + deliveryCharge;
  const vatAmount = Math.round(taxableAmount * taxRate * 100) / 100;
  const total = taxableAmount + vatAmount;

  const openNewSale = () => {
    setSaleItems([]);
    setSelectedCustomer('');
    setWalkinName('');
    setWalkinPhone('');
    setPaymentMethod('cash');
    setSaleNotes('');
    setSaleDiscount(0);
    setDeliveryCharge(0);
    setDeliveryAddress('');
    setCardMessage('');
    setShowDelivery(false);
    setSaleSource('store');
    setSallaShippingCost(0);
    setSallaPaymentFee(0);
    setLookedUpCustomer(null);
    setCustomerLoyalty(null);
    setPointsToRedeem(0);
    setError('');
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (saleItems.length === 0) {
      setError(isRTL ? 'أضف منتج واحد على الأقل' : 'Add at least one product');
      return;
    }
    setError('');
    setSubmitting(true);

    try {
      const saleNumber = `BLV-${Date.now().toString(36).toUpperCase()}`;
      const isCredit = paymentMethod === 'credit';

      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .insert({
          sale_number: saleNumber,
          customer_id: selectedCustomer || null,
          customer_name: !selectedCustomer ? walkinName || null : null,
          customer_phone: !selectedCustomer ? walkinPhone || null : null,
          sale_date: new Date().toISOString(),
          status: 'confirmed',
          subtotal,
          tax: vatAmount,
          discount: saleDiscount,
          delivery_charge: deliveryCharge,
          delivery_address: deliveryAddress || null,
          card_message: cardMessage || null,
          total,
          paid_amount: isCredit ? 0 : total,
          payment_status: isCredit ? 'unpaid' : 'paid',
          payment_method: paymentMethod,
          notes: saleNotes || null,
          source: saleSource,
          salla_shipping_cost: saleSource === 'salla' ? sallaShippingCost : 0,
          salla_payment_gateway_fee: saleSource === 'salla' ? sallaPaymentFee : 0,
          branch_id: userBranchId,
          created_by: user?.id,
        })
        .select('*, customers(name, name_ar, phone)')
        .single();

      if (saleError) throw saleError;

      const items = saleItems.map((item) => ({
        sale_id: sale.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        purchase_price: item.purchase_price || 0,
        discount: item.discount,
        total: item.total,
      }));

      const { error: itemsError } = await supabase.from('sale_items').insert(items);
      if (itemsError) throw itemsError;

      for (const item of saleItems) {
        if (!item.product_id) continue;

        if (userBranchId) {
          const { data: branchStock } = await supabase
            .from('branch_stock')
            .select('id, quantity')
            .eq('product_id', item.product_id)
            .eq('branch_id', userBranchId)
            .maybeSingle();

          if (branchStock) {
            await supabase
              .from('branch_stock')
              .update({
                quantity: branchStock.quantity - item.quantity,
                updated_at: new Date().toISOString()
              })
              .eq('id', branchStock.id)
              .eq('branch_id', userBranchId);
          }
        }

        const { data: inv } = await supabase
          .from('inventory')
          .select('id, quantity')
          .eq('product_id', item.product_id)
          .eq('branch_id', userBranchId)
          .maybeSingle();

        if (inv) {
          await supabase
            .from('inventory')
            .update({
              quantity: inv.quantity - item.quantity,
              last_updated: new Date().toISOString()
            })
            .eq('id', inv.id)
            .eq('product_id', item.product_id)
            .eq('branch_id', userBranchId);
        }

        await supabase.from('inventory_movements').insert({
          product_id: item.product_id,
          movement_type: 'out',
          quantity: item.quantity,
          reference_type: 'sale',
          reference_id: sale.id,
          notes: `Sale ${saleNumber}`,
          created_by: user?.id,
        });
      }

      if (selectedCustomer) {
        const loyaltyPoints = Math.floor(total);
        const { data: existingLoyalty } = await supabase
          .from('customer_loyalty')
          .select('id, points, total_earned, total_redeemed')
          .eq('customer_id', selectedCustomer)
          .maybeSingle();

        if (existingLoyalty) {
          await supabase
            .from('customer_loyalty')
            .update({
              points: existingLoyalty.points + loyaltyPoints - pointsToRedeem,
              total_earned: existingLoyalty.total_earned + loyaltyPoints,
              total_redeemed: (existingLoyalty.total_redeemed || 0) + pointsToRedeem,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingLoyalty.id);
        } else {
          await supabase.from('customer_loyalty').insert({
            customer_id: selectedCustomer,
            points: loyaltyPoints - pointsToRedeem,
            total_earned: loyaltyPoints,
            total_redeemed: pointsToRedeem,
          });
        }

        await supabase.from('loyalty_transactions').insert({
          customer_id: selectedCustomer,
          sale_id: sale.id,
          points: loyaltyPoints,
          type: 'earned',
          description: `Sale ${saleNumber}`,
        });

        if (pointsToRedeem > 0) {
          await supabase.from('loyalty_transactions').insert({
            customer_id: selectedCustomer,
            sale_id: sale.id,
            points: pointsToRedeem,
            type: 'redeemed',
            description: `${isRTL ? 'استخدام' : 'Redeemed'} ${pointsToRedeem} ${isRTL ? 'نقطة' : 'points'} (${formatCurrency(pointsDiscount)} ${isRTL ? 'خصم' : 'discount'})`,
          });
        }

        if (isCredit) {
          await supabase.from('customers').update({
            current_balance: (customers.find(c => c.id === selectedCustomer) as any)?.current_balance
              ? (customers.find(c => c.id === selectedCustomer) as any).current_balance + total
              : total,
          }).eq('id', selectedCustomer);
        }
      }

      await supabase.from('activity_log').insert({
        user_id: user?.id,
        action: 'create',
        entity_type: 'sale',
        entity_id: sale.id,
        details: `Sale ${saleNumber} - ${formatCurrency(total)} SAR`,
      });

      const { data: saleItemsData } = await supabase
        .from('sale_items')
        .select('*, products(name, name_ar, sku)')
        .eq('sale_id', sale.id);

      setPrintingSale(sale);
      setPrintItems(saleItemsData || []);
      setShowForm(false);
      loadData();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const viewSaleDetails = async (sale: Sale) => {
    setViewingSale(sale);
    const { data } = await supabase
      .from('sale_items')
      .select('*, products(name, name_ar, sku)')
      .eq('sale_id', sale.id);
    setViewItems(data || []);
  };

  const openPrintView = async (sale: Sale) => {
    const { data } = await supabase
      .from('sale_items')
      .select('*, products(name, name_ar, sku)')
      .eq('sale_id', sale.id);
    setPrintingSale(sale);
    setPrintItems(data || []);
  };

  const sendWhatsApp = async (sale: Sale) => {
    const phone = sale.customer_phone || sale.customers?.phone;
    if (!phone) {
      alert(isRTL ? 'لا يوجد رقم جوال للعميل' : 'No phone number available for this customer');
      return;
    }

    const { data: items, error } = await supabase
      .from('sale_items')
      .select('product_id, quantity, unit_price, discount, total, products(name, name_ar)')
      .eq('sale_id', sale.id);

    if (error) {
      console.error('Error fetching items:', error);
      alert(isRTL ? 'حدث خطأ أثناء جلب عناصر الفاتورة' : 'Error fetching invoice items');
      return;
    }

    if (!items || items.length === 0) {
      alert(isRTL ? 'لا توجد عناصر في الفاتورة' : 'No items found in this invoice');
      return;
    }

    const formattedItems = items.map(item => ({
      product_id: item.product_id,
      product_name: (item.products as any)?.name || (item.products as any)?.name_ar || 'Unknown Product',
      quantity: item.quantity,
      unit_price: item.unit_price,
      discount: item.discount,
      total: item.total
    }));

    try {
      console.log('[Sales] Starting WhatsApp ONE-CLICK share for sale:', sale.id);

      await shareInvoiceViaWhatsApp(sale, formattedItems, phone);
      console.log('[Sales] WhatsApp share completed successfully');

    } catch (error: any) {
      console.error('[Sales] Error sharing invoice:', error);
      console.error('[Sales] Error message:', error?.message);
      console.error('[Sales] Error stack:', error?.stack);

      if (error?.name === 'AbortError') {
        console.log('[Sales] User cancelled share dialog');
        return;
      }

      alert(isRTL
        ? `حدث خطأ أثناء إنشاء الفاتورة: ${error?.message || 'خطأ غير معروف'}\n\nيرجى فتح Console (F12) لمزيد من التفاصيل.`
        : `Error generating invoice: ${error?.message || 'Unknown error'}\n\nPlease open Console (F12) for more details.`);
    }
  };

  const downloadPDF = async (sale: Sale) => {
    const { data: items, error } = await supabase
      .from('sale_items')
      .select('product_id, quantity, unit_price, discount, total, products(name, name_ar)')
      .eq('sale_id', sale.id);

    if (error) {
      console.error('Error fetching items:', error);
      alert(isRTL ? 'حدث خطأ أثناء جلب عناصر الفاتورة' : 'Error fetching invoice items');
      return;
    }

    if (!items || items.length === 0) {
      alert(isRTL ? 'لا توجد عناصر في الفاتورة' : 'No items found in this invoice');
      return;
    }

    const formattedItems = items.map(item => ({
      product_id: item.product_id,
      product_name: (item.products as any)?.name || (item.products as any)?.name_ar || 'Unknown Product',
      quantity: item.quantity,
      unit_price: item.unit_price,
      discount: item.discount,
      total: item.total
    }));

    try {
      await downloadInvoicePDF(sale, formattedItems);
    } catch (error) {
      console.error('Error downloading invoice:', error);
      alert(isRTL ? 'حدث خطأ أثناء تنزيل الفاتورة' : 'Error downloading invoice');
    }
  };

  const updateSaleStatus = async (saleId: string, status: string) => {
    try {
      const { error } = await supabase.from('sales').update({ status }).eq('id', saleId);
      if (error) throw error;
      await loadData();
      setViewingSale(null);
    } catch (error) {
      console.error('Error updating sale status:', error);
      alert(isRTL ? 'حدث خطأ أثناء تحديث حالة الفاتورة' : 'Error updating sale status');
    }
  };

  const reactivateSale = async (saleId: string, newStatus: 'confirmed') => {
    if (!isAdmin) {
      alert(isRTL ? 'يتطلب صلاحيات المدير' : 'Admin privileges required');
      return;
    }
    try {
      const { error } = await supabase.from('sales').update({ status: newStatus }).eq('id', saleId);
      if (error) throw error;
      await loadData();
      setViewingSale(null);
    } catch (error) {
      console.error('Error reactivating sale:', error);
      alert(isRTL ? 'حدث خطأ أثناء استعادة الفاتورة' : 'Error reactivating sale');
    }
  };

  const deleteSale = async (saleId: string) => {
    if (!canManageSales) {
      alert(isRTL ? 'يتطلب صلاحيات الأدمن أو المحاسب' : 'Admin or Accountant privileges required');
      return;
    }
    const confirmMsg = isRTL
      ? 'هل أنت متأكد من حذف هذه الفاتورة؟ لا يمكن التراجع عن هذا الإجراء'
      : 'Are you sure you want to delete this sale? This action cannot be undone';
    if (!window.confirm(confirmMsg)) return;

    try {
      const { error: itemsError } = await supabase.from('sale_items').delete().eq('sale_id', saleId);
      if (itemsError) throw itemsError;

      const { error: saleError } = await supabase.from('sales').delete().eq('id', saleId);
      if (saleError) throw saleError;

      await loadData();
      setViewingSale(null);
      alert(isRTL ? 'تم حذف الفاتورة بنجاح' : 'Sale deleted successfully');
    } catch (error) {
      console.error('Error deleting sale:', error);
      alert(isRTL ? 'حدث خطأ أثناء حذف الفاتورة' : 'Error deleting sale');
    }
  };

  const returnSale = async (saleId: string) => {
    if (!canManageSales) {
      alert(isRTL ? 'يتطلب صلاحيات الأدمن أو المحاسب' : 'Admin or Accountant privileges required');
      return;
    }
    const confirmMsg = isRTL
      ? 'هل تريد تحويل هذه الفاتورة إلى مرتجع؟'
      : 'Do you want to mark this sale as returned?';
    if (!window.confirm(confirmMsg)) return;

    try {
      const { error } = await supabase.from('sales').update({ status: 'returned' }).eq('id', saleId);
      if (error) throw error;
      await loadData();
      setViewingSale(null);
      alert(isRTL ? 'تم تحويل الفاتورة إلى مرتجع' : 'Sale marked as returned');
    } catch (error) {
      console.error('Error returning sale:', error);
      alert(isRTL ? 'حدث خطأ أثناء تحويل الفاتورة إلى مرتجع' : 'Error marking sale as returned');
    }
  };

  const filtered = sales.filter((s) => {
    if (statusFilter !== 'all' && s.status !== statusFilter) return false;
    const term = searchTerm.toLowerCase();
    return (
      s.sale_number.toLowerCase().includes(term) ||
      (s.customers?.name && s.customers.name.toLowerCase().includes(term)) ||
      (s.customer_name && s.customer_name.toLowerCase().includes(term))
    );
  });

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat(isRTL ? 'ar-SA' : 'en-US', { style: 'decimal', minimumFractionDigits: 2 }).format(amount);

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString(isRTL ? 'ar-SA' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  const statusColors: Record<string, string> = {
    draft: 'bg-yellow-100 text-yellow-700',
    confirmed: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
    returned: 'bg-orange-100 text-orange-700',
  };

  const paymentColors: Record<string, string> = {
    unpaid: 'bg-red-100 text-red-700',
    partial: 'bg-yellow-100 text-yellow-700',
    paid: 'bg-green-100 text-green-700',
  };

  const getCustomerDisplay = (sale: Sale) => {
    if (sale.customers) return isRTL ? sale.customers.name_ar || sale.customers.name : sale.customers.name;
    if (sale.customer_name) return sale.customer_name;
    return isRTL ? 'عميل نقدي' : 'Walk-in';
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

  if (printingSale) {
    return (
      <InvoicePrint
        sale={printingSale}
        items={printItems}
        onClose={() => setPrintingSale(null)}
        onWhatsApp={() => sendWhatsApp(printingSale)}
      />
    );
  }

  if (showForm) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{isRTL ? 'نقطة البيع' : 'Point of Sale'}</h2>
            <p className="text-gray-500 mt-1">{isRTL ? 'فاتورة بيع جديدة - ضريبة 15%' : 'New sale - 15% VAT included'}</p>
          </div>
          <button onClick={() => setShowForm(false)} className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
            <X className="w-5 h-5" /> {isRTL ? 'إلغاء' : 'Cancel'}
          </button>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-900">{isRTL ? 'المنتجات' : 'Items'}</h3>
                {canEdit && (
                  <button onClick={addItem} className="flex items-center gap-1 text-teal-600 hover:text-teal-700 text-sm font-medium">
                    <Plus className="w-4 h-4" /> {isRTL ? 'إضافة منتج' : 'Add Item'}
                  </button>
                )}
              </div>

              <div className="mb-4 space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder={isRTL ? 'بحث عن منتج...' : 'Search products...'}
                    value={productSearchTerm}
                    onChange={(e) => setProductSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setClassificationFilter('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      classificationFilter === 'all'
                        ? 'bg-teal-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {isRTL ? 'الكل' : 'All'}
                  </button>
                  <button
                    onClick={() => setClassificationFilter('natural_flowers')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      classificationFilter === 'natural_flowers'
                        ? 'bg-teal-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {isRTL ? 'ورد طبيعي' : 'Natural Flowers'}
                  </button>
                  <button
                    onClick={() => setClassificationFilter('artificial_flowers')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      classificationFilter === 'artificial_flowers'
                        ? 'bg-teal-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {isRTL ? 'ورد صناعي' : 'Artificial'}
                  </button>
                  <button
                    onClick={() => setClassificationFilter('vases')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      classificationFilter === 'vases'
                        ? 'bg-teal-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {isRTL ? 'فازات' : 'Vases'}
                  </button>
                  <button
                    onClick={() => setClassificationFilter('wrapping')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      classificationFilter === 'wrapping'
                        ? 'bg-teal-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {isRTL ? 'تغليف' : 'Wrapping'}
                  </button>
                  <button
                    onClick={() => setClassificationFilter('ribbons')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      classificationFilter === 'ribbons'
                        ? 'bg-teal-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {isRTL ? 'شرائط' : 'Ribbons'}
                  </button>
                  <button
                    onClick={() => setClassificationFilter('additions_gifts')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      classificationFilter === 'additions_gifts'
                        ? 'bg-teal-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {isRTL ? 'إضافات' : 'Additions'}
                  </button>
                </div>
              </div>

              {saleItems.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <ShoppingCart className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p>{isRTL ? 'أضف منتجات للفاتورة' : 'Add items to the sale'}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {saleItems.map((item, index) => (
                    <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <select value={item.product_id} onChange={(e) => updateItem(index, 'product_id', e.target.value)} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent">
                        <option value="">{isRTL ? 'اختر منتج' : 'Select Product'}</option>
                        {products
                          .filter((p) => {
                            const matchesSearch = productSearchTerm === '' ||
                              p.name.toLowerCase().includes(productSearchTerm.toLowerCase()) ||
                              p.name_ar.includes(productSearchTerm) ||
                              p.sku.toLowerCase().includes(productSearchTerm.toLowerCase());
                            const matchesType = classificationFilter === 'all' || p.type === classificationFilter;
                            return matchesSearch && matchesType;
                          })
                          .map((p) => (
                            <option key={p.id} value={p.id}>{isRTL ? p.name_ar : p.name} ({formatCurrency(p.sale_price)})</option>
                          ))}
                      </select>
                      <input type="number" min="1" value={item.quantity} onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1)} className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-sm text-center focus:ring-2 focus:ring-teal-500 focus:border-transparent" disabled={!canEdit} />
                      <input type="number" step="0.01" value={item.unit_price} onChange={(e) => updateItem(index, 'unit_price', parseFloat(e.target.value) || 0)} className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm text-center focus:ring-2 focus:ring-teal-500 focus:border-transparent" disabled={!canEdit} />
                      <div className="w-28 text-sm font-bold text-gray-900 text-center">{formatCurrency(item.total)}</div>
                      {canEdit && <button onClick={() => removeItem(index)} className="p-1.5 text-red-500 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4" /></button>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
              <h3 className="font-bold text-gray-900">{isRTL ? 'بيانات العميل' : 'Customer Info'}</h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'اختيار عميل مسجل' : 'Registered Customer'}</label>
                <select value={selectedCustomer} onChange={(e) => setSelectedCustomer(e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm">
                  <option value="">{isRTL ? 'عميل جديد / نقدي' : 'New / Walk-in'}</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{isRTL ? c.name_ar || c.name : c.name} {c.phone ? `(${c.phone})` : ''}</option>
                  ))}
                </select>
              </div>

              {lookedUpCustomer && (
                <div className="p-3 bg-gradient-to-r from-teal-50 to-emerald-50 rounded-lg border border-teal-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">{lookedUpCustomer.name}</span>
                      {lookedUpCustomer.tier && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                          lookedUpCustomer.tier === 'vip' ? 'bg-gradient-to-r from-amber-400 to-yellow-500 text-white' :
                          lookedUpCustomer.tier === 'frequent' ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white' :
                          lookedUpCustomer.tier === 'inactive' ? 'bg-gray-400 text-white' :
                          'bg-gray-200 text-gray-700'
                        }`}>
                          {lookedUpCustomer.tier === 'vip' ? (isRTL ? '⭐ VIP' : '⭐ VIP') :
                           lookedUpCustomer.tier === 'frequent' ? (isRTL ? '🔥 دائم' : '🔥 Frequent') :
                           lookedUpCustomer.tier === 'inactive' ? (isRTL ? '💤 غير نشط' : '💤 Inactive') :
                           (isRTL ? 'عادي' : 'Regular')}
                        </span>
                      )}
                    </div>
                  </div>
                  {customerLoyalty && (
                    <div className="flex items-center gap-3 text-xs">
                      <span className="font-medium text-teal-700">
                        {isRTL ? '🎁 النقاط:' : '🎁 Points:'} <span className="font-bold text-teal-900">{customerLoyalty.points}</span>
                      </span>
                      <span className="text-gray-600">
                        {isRTL ? `إجمالي الطلبات: ${lookedUpCustomer.order_count || 0}` : `Orders: ${lookedUpCustomer.order_count || 0}`}
                      </span>
                      <span className="text-gray-600">
                        {isRTL ? `الإنفاق: ${formatCurrency(lookedUpCustomer.total_spent || 0)}` : `Spent: ${formatCurrency(lookedUpCustomer.total_spent || 0)}`}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {!selectedCustomer && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'رقم الجوال (للبحث التلقائي)' : 'Phone Number (Auto-lookup)'}</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={walkinPhone}
                        onChange={(e) => {
                          setWalkinPhone(e.target.value);
                          if (e.target.value.length >= 10) {
                            lookupCustomerByPhone(e.target.value);
                          }
                        }}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                        placeholder="+966XXXXXXXXX"
                        dir="ltr"
                      />
                      {isLookingUp && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <div className="w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                    </div>
                    {walkinPhone && !lookedUpCustomer && !isLookingUp && walkinPhone.length >= 10 && (
                      <button
                        onClick={() => setShowQuickRegister(true)}
                        className="mt-2 text-xs text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        {isRTL ? 'تسجيل عميل جديد بهذا الرقم' : 'Register new customer with this number'}
                      </button>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'اسم العميل' : 'Customer Name'}</label>
                    <input
                      type="text"
                      value={walkinName}
                      onChange={(e) => setWalkinName(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                      placeholder={isRTL ? 'اسم العميل' : 'Customer name'}
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'مصدر البيع' : 'Sale Source'}</label>
                <select value={saleSource} onChange={(e) => setSaleSource(e.target.value as 'store' | 'salla')} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm bg-white" disabled={!canEdit}>
                  <option value="store">{isRTL ? 'مبيعات المحل' : 'Store Sales'}</option>
                  <option value="salla">{isRTL ? 'مبيعات المتجر الإلكتروني (سلة)' : 'Online Sales (Salla)'}</option>
                </select>
              </div>

              {saleSource === 'salla' && (
                <div className="space-y-3 p-3 bg-blue-50/50 rounded-lg border border-blue-100">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{isRTL ? 'تكلفة الشحن' : 'Shipping Cost'}</label>
                    <input type="number" step="0.01" min="0" value={sallaShippingCost} onChange={(e) => setSallaShippingCost(parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm" disabled={!canEdit} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{isRTL ? 'رسوم بوابة الدفع' : 'Payment Gateway Fee'}</label>
                    <input type="number" step="0.01" min="0" value={sallaPaymentFee} onChange={(e) => setSallaPaymentFee(parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm" disabled={!canEdit} />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'طريقة الدفع' : 'Payment'}</label>
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm" disabled={!canEdit}>
                  <option value="cash">{isRTL ? 'نقدي' : 'Cash'}</option>
                  <option value="card">{isRTL ? 'شبكة' : 'Card'}</option>
                  <option value="transfer">{isRTL ? 'تحويل' : 'Transfer'}</option>
                  <option value="credit">{isRTL ? 'آجل' : 'Credit'}</option>
                  {saleSource === 'salla' && <option value="online">{isRTL ? 'دفع إلكتروني' : 'Online Payment'}</option>}
                </select>
                {paymentMethod === 'credit' && !selectedCustomer && (
                  <p className="text-xs text-amber-600 mt-1">{isRTL ? 'يجب اختيار عميل مسجل للبيع الآجل' : 'Select a registered customer for credit sales'}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'الخصم' : 'Discount'}</label>
                <input type="number" step="0.01" min="0" value={saleDiscount} onChange={(e) => setSaleDiscount(parseFloat(e.target.value) || 0)} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm" />
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setShowDelivery(!showDelivery)}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition ${showDelivery ? 'bg-teal-50 border-teal-300 text-teal-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                >
                  <Truck className="w-4 h-4" />
                  {isRTL ? 'خدمة توصيل' : 'Delivery Service'}
                </button>
              </div>

              {showDelivery && (
                <div className="space-y-3 p-3 bg-teal-50/50 rounded-lg border border-teal-100">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{isRTL ? 'رسوم التوصيل' : 'Delivery Fee'}</label>
                    <input type="number" step="0.01" min="0" value={deliveryCharge} onChange={(e) => setDeliveryCharge(parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{isRTL ? 'عنوان التوصيل' : 'Delivery Address'}</label>
                    <input type="text" value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm" dir="rtl" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{isRTL ? 'رسالة الكرت' : 'Card Message'}</label>
                    <textarea value={cardMessage} onChange={(e) => setCardMessage(e.target.value)} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm resize-none" dir="rtl" />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'ملاحظات' : 'Notes'}</label>
                <textarea value={saleNotes} onChange={(e) => setSaleNotes(e.target.value)} rows={2} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm resize-none" />
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-6 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{isRTL ? 'المجموع الفرعي' : 'Subtotal'}</span>
                <span className="font-medium">{formatCurrency(subtotal)}</span>
              </div>
              {saleDiscount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{isRTL ? 'الخصم' : 'Discount'}</span>
                  <span className="font-medium text-red-600">-{formatCurrency(saleDiscount)}</span>
                </div>
              )}
              {deliveryCharge > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{isRTL ? 'رسوم التوصيل' : 'Delivery'}</span>
                  <span className="font-medium">{formatCurrency(deliveryCharge)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{isRTL ? `ضريبة القيمة المضافة (${Math.round(taxRate * 100)}%)` : `VAT (${Math.round(taxRate * 100)}%)`}</span>
                <span className="font-medium">{formatCurrency(vatAmount)}</span>
              </div>
              <div className="border-t pt-3 flex justify-between">
                <span className="font-bold text-gray-900">{isRTL ? 'الإجمالي شامل الضريبة' : 'Total (incl. VAT)'}</span>
                <span className="font-bold text-xl text-teal-600">{formatCurrency(total)}</span>
              </div>
              {paymentMethod === 'credit' && (
                <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded-lg text-center font-medium">
                  {isRTL ? 'بيع آجل - سيتم تسجيل المبلغ على حساب العميل' : 'Credit sale - amount will be recorded on customer account'}
                </div>
              )}

              {customerLoyalty && customerLoyalty.points > 0 && (
                <div className="border-t pt-3">
                  <div className="bg-gradient-to-r from-amber-50 to-yellow-50 p-4 rounded-lg border border-amber-200">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">🎁</span>
                        <div>
                          <p className="text-sm font-bold text-gray-900">{isRTL ? 'نقاط الولاء المتاحة' : 'Available Loyalty Points'}</p>
                          <p className="text-xs text-gray-600">{isRTL ? '100 نقطة = 5 ريال خصم' : '100 points = 5 SAR discount'}</p>
                        </div>
                      </div>
                      <span className="text-2xl font-bold text-amber-600">{customerLoyalty.points}</span>
                    </div>
                    {pointsToRedeem === 0 ? (
                      <button
                        onClick={applyPointsRedemption}
                        disabled={customerLoyalty.points < 20}
                        className="w-full bg-gradient-to-r from-amber-500 to-yellow-500 text-white py-2 rounded-lg hover:from-amber-600 hover:to-yellow-600 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm flex items-center justify-center gap-2"
                      >
                        <span>✨</span>
                        {isRTL ? `استخدام النقاط (خصم ${formatCurrency(calculatePointsDiscount(customerLoyalty.points))})` : `Redeem Points (${formatCurrency(calculatePointsDiscount(customerLoyalty.points))} off)`}
                      </button>
                    ) : (
                      <div className="flex items-center justify-between bg-white p-2 rounded border border-amber-300">
                        <span className="text-xs font-medium text-gray-700">
                          {isRTL ? `تم استخدام ${pointsToRedeem} نقطة` : `${pointsToRedeem} points redeemed`}
                        </span>
                        <button
                          onClick={() => {
                            setSaleDiscount(saleDiscount - calculatePointsDiscount(pointsToRedeem));
                            setPointsToRedeem(0);
                          }}
                          className="text-xs text-red-600 hover:text-red-700 font-medium"
                        >
                          {isRTL ? 'إلغاء' : 'Cancel'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {canEdit && (
                <button onClick={handleSubmit} disabled={submitting || saleItems.length === 0} className="w-full bg-teal-600 text-white py-3 rounded-lg hover:bg-teal-700 transition disabled:opacity-50 font-medium flex items-center justify-center gap-2">
                  <CreditCard className="w-5 h-5" />
                  {submitting ? (isRTL ? 'جاري الحفظ...' : 'Saving...') : (isRTL ? 'تأكيد وطباعة الفاتورة' : 'Confirm & Print Invoice')}
                </button>
              )}
            </div>
          </div>
        </div>

        {showQuickRegister && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900">{isRTL ? 'تسجيل عميل جديد' : 'Register New Customer'}</h3>
                <button onClick={() => setShowQuickRegister(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'رقم الجوال' : 'Phone Number'}</label>
                  <input
                    type="text"
                    value={walkinPhone}
                    onChange={(e) => setWalkinPhone(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                    placeholder="+966XXXXXXXXX"
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'اسم العميل' : 'Customer Name'}</label>
                  <input
                    type="text"
                    value={walkinName}
                    onChange={(e) => setWalkinName(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                    placeholder={isRTL ? 'الاسم الكامل' : 'Full name'}
                  />
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={quickRegisterCustomer}
                    className="flex-1 bg-teal-600 text-white py-2.5 rounded-lg hover:bg-teal-700 transition font-medium"
                  >
                    {isRTL ? 'تسجيل وإكمال البيع' : 'Register & Continue'}
                  </button>
                  <button
                    onClick={() => setShowQuickRegister(false)}
                    className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-lg hover:bg-gray-200 transition font-medium"
                  >
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-teal-600" />
            <h2 className="text-2xl font-bold text-gray-900">{t('nav.sales')}</h2>
          </div>
          <p className="text-gray-500 mt-1">{isRTL ? 'إدارة المبيعات والفواتير' : 'Manage sales and invoices'}</p>
        </div>
        {canEdit && (
          <button onClick={openNewSale} className="flex items-center gap-2 bg-teal-600 text-white px-4 py-2.5 rounded-lg hover:bg-teal-700 transition font-medium">
            <Plus className="w-5 h-5" />
            {isRTL ? 'بيع جديد' : 'New Sale'}
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input type="text" placeholder={t('common.search')} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-teal-500 focus:border-transparent">
            <option value="all">{isRTL ? 'الكل' : 'All Status'}</option>
            <option value="confirmed">{isRTL ? 'مؤكد' : 'Confirmed'}</option>
            <option value="returned">{isRTL ? 'مرتجع' : 'Returned'}</option>
            <option value="cancelled">{isRTL ? 'ملغي' : 'Cancelled'}</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <ShoppingCart className="w-16 h-16 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">{isRTL ? 'لا توجد مبيعات' : 'No sales found'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">{isRTL ? 'الرقم' : 'Number'}</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">{isRTL ? 'التاريخ' : 'Date'}</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">{isRTL ? 'العميل' : 'Customer'}</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">{isRTL ? 'الإجمالي' : 'Total'}</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">{isRTL ? 'الحالة' : 'Status'}</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((sale) => (
                  <tr key={sale.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition">
                    <td className="py-3.5 px-4 font-mono text-sm">{sale.sale_number}</td>
                    <td className="py-3.5 px-4 text-sm text-gray-600">{formatDate(sale.sale_date)}</td>
                    <td className="py-3.5 px-4 text-sm">{getCustomerDisplay(sale)}</td>
                    <td className="py-3.5 px-4 font-bold text-gray-900">{formatCurrency(sale.total)} {isRTL ? 'ر.س' : 'SAR'}</td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[sale.status] || ''}`}>
                        {sale.status === 'confirmed' && (isRTL ? 'مؤكد' : 'Confirmed')}
                        {sale.status === 'returned' && (isRTL ? 'مرتجع' : 'Returned')}
                        {sale.status === 'cancelled' && (isRTL ? 'ملغي' : 'Cancelled')}
                        {sale.status === 'draft' && (isRTL ? 'مسودة' : 'Draft')}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1">
                        <button onClick={() => viewSaleDetails(sale)} className="p-2 text-teal-600 hover:bg-teal-50 rounded-lg transition" title={isRTL ? 'عرض' : 'View'}>
                          <Eye className="w-4 h-4" />
                        </button>
                        <button onClick={() => openPrintView(sale)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition" title={isRTL ? 'طباعة' : 'Print'}>
                          <Printer className="w-4 h-4" />
                        </button>
                        <button onClick={() => downloadPDF(sale)} className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition" title={isRTL ? 'تحميل PDF' : 'Download PDF'}>
                          <Download className="w-4 h-4" />
                        </button>
                        {(sale.customer_phone || sale.customers?.phone) && (
                          <button onClick={() => sendWhatsApp(sale)} className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition" title="WhatsApp">
                            <MessageCircle className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {viewingSale && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-xl">
              <h3 className="text-xl font-bold text-gray-900">{viewingSale.sale_number}</h3>
              <button onClick={() => setViewingSale(null)} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">{isRTL ? 'التاريخ' : 'Date'}</p>
                  <p className="font-medium">{formatDate(viewingSale.sale_date)}</p>
                </div>
                <div>
                  <p className="text-gray-500">{isRTL ? 'العميل' : 'Customer'}</p>
                  <p className="font-medium">{getCustomerDisplay(viewingSale)}</p>
                </div>
              </div>

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

              <div className="border-t pt-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">{isRTL ? 'المجموع قبل الضريبة' : 'Subtotal'}</span><span>{formatCurrency(viewingSale.subtotal)}</span></div>
                {viewingSale.discount > 0 && <div className="flex justify-between"><span className="text-gray-500">{isRTL ? 'الخصم' : 'Discount'}</span><span>-{formatCurrency(viewingSale.discount)}</span></div>}
                <div className="flex justify-between"><span className="text-gray-500">{isRTL ? 'ضريبة القيمة المضافة (15%)' : 'VAT (15%)'}</span><span>{formatCurrency(viewingSale.tax)}</span></div>
                <div className="flex justify-between font-bold text-lg border-t pt-2">
                  <span>{isRTL ? 'الإجمالي' : 'Total'}</span>
                  <span className="text-teal-600">{formatCurrency(viewingSale.total)} {isRTL ? 'ر.س' : 'SAR'}</span>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <div className="flex gap-2">
                  <button onClick={() => { setViewingSale(null); openPrintView(viewingSale); }} className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 transition font-medium text-sm">
                    <Printer className="w-4 h-4" /> {isRTL ? 'طباعة' : 'Print'}
                  </button>
                  <button onClick={() => downloadPDF(viewingSale)} className="flex-1 flex items-center justify-center gap-2 bg-purple-600 text-white py-2.5 rounded-lg hover:bg-purple-700 transition font-medium text-sm">
                    <Download className="w-4 h-4" /> PDF
                  </button>
                  {(viewingSale.customer_phone || viewingSale.customers?.phone) && (
                    <button onClick={() => sendWhatsApp(viewingSale)} className="flex-1 flex items-center justify-center gap-2 bg-green-600 text-white py-2.5 rounded-lg hover:bg-green-700 transition font-medium text-sm">
                      <MessageCircle className="w-4 h-4" /> WhatsApp
                    </button>
                  )}
                </div>

                {canManageSales && (
                  <div className="flex gap-2">
                    {viewingSale.status === 'confirmed' && (
                      <>
                        <button onClick={() => returnSale(viewingSale.id)} className="flex-1 flex items-center justify-center gap-2 bg-orange-600 text-white py-2.5 rounded-lg hover:bg-orange-700 transition font-medium text-sm">
                          <RotateCcw className="w-4 h-4" /> {isRTL ? 'مرتجع' : 'Return'}
                        </button>
                        <button onClick={() => updateSaleStatus(viewingSale.id, 'cancelled')} className="flex-1 flex items-center justify-center gap-2 bg-red-600 text-white py-2.5 rounded-lg hover:bg-red-700 transition font-medium text-sm">
                          <XCircle className="w-4 h-4" /> {isRTL ? 'إلغاء' : 'Cancel'}
                        </button>
                      </>
                    )}
                    {viewingSale.status === 'cancelled' && isAdmin && (
                      <button onClick={() => reactivateSale(viewingSale.id, 'confirmed')} className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 transition font-medium text-sm">
                        <Check className="w-4 h-4" /> {isRTL ? 'استعادة' : 'Restore'}
                      </button>
                    )}
                    {viewingSale.status === 'returned' && isAdmin && (
                      <button onClick={() => reactivateSale(viewingSale.id, 'confirmed')} className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 transition font-medium text-sm">
                        <Check className="w-4 h-4" /> {isRTL ? 'استعادة' : 'Restore'}
                      </button>
                    )}
                    <button onClick={() => deleteSale(viewingSale.id)} className="flex-1 flex items-center justify-center gap-2 bg-gray-800 text-white py-2.5 rounded-lg hover:bg-gray-900 transition font-medium text-sm">
                      <Trash2 className="w-4 h-4" /> {isRTL ? 'حذف' : 'Delete'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
