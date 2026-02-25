import { useState, useEffect } from 'react';
import { X, List, RotateCcw, User, ChevronDown } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { useOfflineData } from '../../hooks/useOfflineData';
import { supabase } from '../../lib/supabase';
import { InvoicePrint } from '../InvoicePrint';
import { POSProductGrid } from './POSProductGrid';
import { POSCart } from './POSCart';
import { POSEmployeeSelect } from './POSEmployeeSelect';
import type { POSProduct, POSEmployee, POSCustomer, POSCartItem, CustomerLoyalty } from './types';

interface POSViewProps {
  onClose: () => void;
}

export function POSView({ onClose }: POSViewProps) {
  const { language } = useLanguage();
  const { user } = useAuth();
  const isRTL = language === 'ar';

  const { data: rawProducts, loading: productsLoading } = useOfflineData<POSProduct>({ table: 'products', fallbackToServer: true });
  const { data: rawEmployees, loading: empLoading } = useOfflineData<POSEmployee>({ table: 'employees', fallbackToServer: true });
  const { data: rawCustomers } = useOfflineData<POSCustomer>({ table: 'customers', fallbackToServer: true });

  const [products, setProducts] = useState<POSProduct[]>([]);
  const [employees, setEmployees] = useState<POSEmployee[]>([]);
  const [customers, setCustomers] = useState<POSCustomer[]>([]);

  const [cartItems, setCartItems] = useState<POSCartItem[]>([]);
  const [sessionEmployee, setSessionEmployee] = useState<POSEmployee | null>(() => {
    try {
      const stored = localStorage.getItem('pos_session_employee');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [showEmployeeSelect, setShowEmployeeSelect] = useState(false);
  const [walkinPhone, setWalkinPhone] = useState('');
  const [walkinName, setWalkinName] = useState('');
  const [lookedUpCustomer, setLookedUpCustomer] = useState<POSCustomer | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [saleDiscount, setSaleDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [taxRate, setTaxRate] = useState(0.15);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [userBranchId, setUserBranchId] = useState<string | null>(null);
  const [openRegisterId, setOpenRegisterId] = useState<string | null>(null);
  const [printingSale, setPrintingSale] = useState<any | null>(null);
  const [printItems, setPrintItems] = useState<any[]>([]);
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);

  useEffect(() => {
    if (!productsLoading) setProducts(rawProducts.filter((p: any) => p.is_active !== false));
  }, [rawProducts, productsLoading]);

  useEffect(() => {
    if (!empLoading) setEmployees(rawEmployees.filter((e: any) => e.is_active !== false));
  }, [rawEmployees, empLoading]);

  useEffect(() => {
    setCustomers(rawCustomers.filter((c: any) => c.is_active !== false));
  }, [rawCustomers]);

  useEffect(() => {
    loadInitialData();
  }, [user]);

  useEffect(() => {
    if (!empLoading && !sessionEmployee) {
      setShowEmployeeSelect(true);
    }
  }, [empLoading]);

  const handleEmployeeSelect = (emp: POSEmployee) => {
    localStorage.setItem('pos_session_employee', JSON.stringify(emp));
    setSessionEmployee(emp);
    setShowEmployeeSelect(false);
  };

  const handleChangeEmployee = () => {
    setShowEmployeeSelect(true);
  };

  const loadInitialData = async () => {
    if (!user || !navigator.onLine) return;
    try {
      const [branchRes, registerRes, settingsRes] = await Promise.all([
        supabase.from('users').select('branch_id').eq('id', user.id).maybeSingle(),
        supabase.from('cash_registers').select('id').eq('status', 'open').order('opened_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('settings').select('tax_rate').eq('id', 1).maybeSingle(),
      ]);
      if (branchRes.data) setUserBranchId(branchRes.data.branch_id as string);
      setOpenRegisterId(registerRes.data?.id || null);
      if (settingsRes.data?.tax_rate) setTaxRate(parseFloat(settingsRes.data.tax_rate.toString()));
    } catch (err) {
      console.error('POS init error:', err);
    }
  };

  const handleAddProduct = (product: POSProduct) => {
    setCartItems(prev => {
      const existing = prev.findIndex(i => i.product_id === product.id);
      if (existing >= 0) {
        const updated = [...prev];
        const item = { ...updated[existing] };
        item.quantity += 1;
        item.total = item.quantity * item.unit_price - item.discount;
        updated[existing] = item;
        return updated;
      }
      return [...prev, {
        product_id: product.id,
        product_name: product.name,
        product_name_ar: product.name_ar,
        quantity: 1,
        unit_price: product.sale_price,
        purchase_price: product.purchase_price || 0,
        discount: 0,
        total: product.sale_price,
      }];
    });
  };

  const handleUpdateQty = (index: number, qty: number) => {
    if (qty < 1) return;
    setCartItems(prev => {
      const updated = [...prev];
      const item = { ...updated[index] };
      item.quantity = qty;
      item.total = item.quantity * item.unit_price - item.discount;
      updated[index] = item;
      return updated;
    });
  };

  const handleRemoveItem = (index: number) => {
    setCartItems(prev => prev.filter((_, i) => i !== index));
  };

  const handlePhoneChange = async (phone: string) => {
    setWalkinPhone(phone);
    if (!phone || phone.length < 10) {
      setLookedUpCustomer(null);
      setSelectedCustomer('');
      setWalkinName('');
      setLoyaltyPoints(0);
      return;
    }
    setIsLookingUp(true);
    try {
      const customer = customers.find(c => c.phone === phone);
      if (customer) {
        setLookedUpCustomer(customer);
        setSelectedCustomer(customer.id);
        setWalkinName(customer.name);
        if (navigator.onLine) {
          const { data: loyalty } = await supabase
            .from('customer_loyalty').select('points').eq('customer_id', customer.id).maybeSingle();
          setLoyaltyPoints(loyalty?.points || 0);
        }
      } else {
        setLookedUpCustomer(null);
        setSelectedCustomer('');
        setWalkinName('');
        setLoyaltyPoints(0);
      }
    } finally {
      setIsLookingUp(false);
    }
  };

  const resetCart = () => {
    setCartItems([]);
    setWalkinPhone('');
    setWalkinName('');
    setLookedUpCustomer(null);
    setSelectedCustomer('');
    setSaleDiscount(0);
    setPaymentMethod('cash');
    setError('');
    setLoyaltyPoints(0);
  };

  const handleCharge = async () => {
    if (cartItems.length === 0) {
      setError(isRTL ? 'أضف منتجاً واحداً على الأقل' : 'Add at least one product');
      return;
    }
    if (!sessionEmployee) {
      setShowEmployeeSelect(true);
      return;
    }
    if (paymentMethod === 'cash' && !openRegisterId && navigator.onLine) {
      setError(isRTL ? 'الصندوق مغلق - يرجى فتح الصندوق أولاً' : 'Cash register is closed');
      return;
    }
    setError('');
    setSubmitting(true);

    try {
      const subtotal = cartItems.reduce((s, i) => s + i.total, 0);
      const taxableAmount = subtotal - saleDiscount;
      const vatAmount = Math.round(taxableAmount * taxRate * 100) / 100;
      const total = taxableAmount + vatAmount;
      const saleId = crypto.randomUUID();
      const idempotencyKey = `SALE-${user?.id}-${Date.now()}`;

      const atomicPayload = {
        id: saleId,
        idempotency_key: idempotencyKey,
        branch_id: userBranchId,
        customer_id: selectedCustomer || '',
        customer_name: !selectedCustomer ? walkinName : '',
        customer_phone: !selectedCustomer ? walkinPhone : '',
        sale_date: new Date().toISOString(),
        subtotal,
        tax: vatAmount,
        discount: saleDiscount,
        total,
        payment_status: paymentMethod === 'credit' ? 'unpaid' : 'paid',
        payment_method: paymentMethod,
        delivery_charge: 0,
        delivery_address: '',
        card_message: '',
        notes: '',
        source: 'store',
        salla_shipping_cost: 0,
        salla_payment_gateway_fee: 0,
        buyer_type: 'individual',
        company_name: '',
        company_vat_number: '',
        company_address: '',
        salesperson_id: sessionEmployee.id,
        created_by: user?.id,
        items: cartItems.map(item => ({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          purchase_price: item.purchase_price || 0,
          discount: item.discount,
          total: item.total,
        })),
      };

      const { data: result, error: rpcError } = await supabase.rpc('create_sale_atomic', { p_payload: atomicPayload });
      if (rpcError) throw new Error(rpcError.message);
      if (!result?.success) throw new Error(result?.error || 'Sale failed');

      const { data: fetchedSale } = await supabase
        .from('sales')
        .select('*, customers(name, name_ar, phone), employees!salesperson_id(full_name, full_name_ar)')
        .eq('id', result.sale_id)
        .maybeSingle();

      const printableItems = cartItems.map((item, i) => ({
        id: `temp-${i}`,
        sale_id: result.sale_id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        purchase_price: item.purchase_price || 0,
        discount: item.discount,
        total: item.total,
        products: { name: item.product_name, name_ar: item.product_name_ar, sku: '' },
      }));

      setPrintingSale(fetchedSale || { id: result.sale_id, sale_number: result.sale_number, status: 'confirmed', subtotal, tax: vatAmount, discount: saleDiscount, total });
      setPrintItems(printableItems);
      resetCart();
    } catch (err: any) {
      setError(err.message || (isRTL ? 'حدث خطأ' : 'An error occurred'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-100" style={{ fontFamily: "'Inter', 'Cairo', sans-serif" }}>
      {/* POS Top Bar */}
      <div className="bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between flex-shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <img src="/لقطة_شاشة_2026-02-11_184526.png" alt="BLOOV" className="h-8 w-auto" />
          <div>
            <h1 className="text-base font-bold text-gray-900">BLOOV POS</h1>
            <p className="text-xs text-gray-400">{isRTL ? 'نقطة البيع' : 'Point of Sale'}</p>
          </div>
          {sessionEmployee && (
            <button
              onClick={handleChangeEmployee}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition-colors"
            >
              <User className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-xs font-medium text-gray-700 max-w-[120px] truncate">
                {isRTL ? (sessionEmployee.full_name_ar || sessionEmployee.full_name) : sessionEmployee.full_name}
              </span>
              <ChevronDown className="w-3 h-3 text-gray-400" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={resetCart}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            <span className="hidden sm:inline">{isRTL ? 'تصفير' : 'Clear'}</span>
          </button>

          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors"
          >
            <List className="w-4 h-4" />
            <span className="hidden sm:inline">{isRTL ? 'قائمة المبيعات' : 'Sales List'}</span>
          </button>

          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-red-50 hover:bg-red-100 text-red-500 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* POS Main Content */}
      <div className={`flex flex-1 overflow-hidden ${isRTL ? 'flex-row-reverse' : ''}`}>
        {/* Product Grid - 65% */}
        <div className="flex-1 min-w-0 overflow-hidden" style={{ flex: '0 0 65%' }}>
          <POSProductGrid
            products={products}
            isRTL={isRTL}
            onAddProduct={handleAddProduct}
          />
        </div>

        {/* Cart - 35% */}
        <div className="border-l border-gray-200 overflow-hidden flex flex-col" style={{ flex: '0 0 35%', minWidth: '340px', maxWidth: '420px' }}>
          <POSCart
            items={cartItems}
            customers={customers}
            walkinName={walkinName}
            walkinPhone={walkinPhone}
            lookedUpCustomer={lookedUpCustomer}
            isLookingUp={isLookingUp}
            saleDiscount={saleDiscount}
            taxRate={taxRate}
            paymentMethod={paymentMethod}
            isRTL={isRTL}
            onUpdateQty={handleUpdateQty}
            onRemoveItem={handleRemoveItem}
            onPhoneChange={handlePhoneChange}
            onDiscountChange={setSaleDiscount}
            onPaymentMethodChange={setPaymentMethod}
            onCharge={handleCharge}
            submitting={submitting}
            error={error}
          />
        </div>
      </div>

      {/* Employee Select Screen */}
      {showEmployeeSelect && (
        <POSEmployeeSelect
          employees={employees}
          isRTL={isRTL}
          loading={empLoading}
          onSelect={handleEmployeeSelect}
          onClose={() => {
            if (sessionEmployee) setShowEmployeeSelect(false);
            else onClose();
          }}
        />
      )}

      {/* Print Modal */}
      {printingSale && (
        <div className="fixed inset-0 z-60 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-bold text-gray-900">
                {isRTL ? 'فاتورة المبيعات' : 'Sale Invoice'} #{printingSale.sale_number}
              </h3>
              <button
                onClick={() => setPrintingSale(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <InvoicePrint sale={printingSale} items={printItems} onClose={() => setPrintingSale(null)} />
          </div>
        </div>
      )}
    </div>
  );
}
