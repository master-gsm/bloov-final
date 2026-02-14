import { useEffect, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { FileText, TrendingUp, TrendingDown, DollarSign, Calendar, BarChart3, Receipt, ShieldAlert } from 'lucide-react';

interface SalesData {
  total: number;
  storeTotal: number;
  sallaTotal: number;
  totalCost: number;
  grossProfit: number;
  count: number;
}

interface PurchasesData {
  total: number;
  count: number;
}

interface ExpensesData {
  total: number;
  count: number;
}

interface TopProduct {
  product_name: string;
  product_name_ar: string;
  total_qty: number;
  total_amount: number;
}

export function Reports() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const isRTL = language === 'ar';
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'year'>('month');
  const [salesData, setSalesData] = useState<SalesData>({ total: 0, storeTotal: 0, sallaTotal: 0, totalCost: 0, grossProfit: 0, count: 0 });
  const [purchasesData, setPurchasesData] = useState<PurchasesData>({ total: 0, count: 0 });
  const [expensesData, setExpensesData] = useState<ExpensesData>({ total: 0, count: 0 });
  const [inventoryValue, setInventoryValue] = useState(0);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [recentSales, setRecentSales] = useState<any[]>([]);

  useEffect(() => {
    checkAdminAndLoad();
  }, [user]);

  useEffect(() => {
    if (isAdmin) {
      loadReportData();
    }
  }, [period, isAdmin]);

  const checkAdminAndLoad = async () => {
    if (!user) return;
    try {
      const { data: role } = await supabase.rpc('get_my_role');
      const admin = role === 'admin';
      setIsAdmin(admin);
      setLoading(false);
    } catch (err) {
      console.error('Error checking role:', err);
      setLoading(false);
    }
  };

  const getDateRange = () => {
    const now = new Date();
    const start = new Date();
    switch (period) {
      case 'today': start.setHours(0, 0, 0, 0); break;
      case 'week': start.setDate(now.getDate() - 7); break;
      case 'month': start.setMonth(now.getMonth() - 1); break;
      case 'year': start.setFullYear(now.getFullYear() - 1); break;
    }
    return { start: start.toISOString(), end: now.toISOString() };
  };

  const loadReportData = async () => {
    setLoading(true);
    try {
      const { start, end } = getDateRange();

      const [salesRes, purchasesRes, expensesRes, recentRes, inventoryRes] = await Promise.all([
        supabase
          .from('sales')
          .select('total, total_cost, gross_profit, source')
          .eq('status', 'confirmed')
          .gte('sale_date', start)
          .lte('sale_date', end),
        supabase
          .from('purchases')
          .select('total')
          .in('status', ['confirmed', 'received'])
          .gte('purchase_date', start)
          .lte('purchase_date', end),
        supabase
          .from('operating_expenses')
          .select('amount')
          .gte('expense_date', start)
          .lte('expense_date', end),
        supabase
          .from('sales')
          .select('*, customers(name, name_ar)')
          .eq('status', 'confirmed')
          .order('sale_date', { ascending: false })
          .limit(10),
        supabase
          .from('inventory')
          .select('quantity, products!inner(purchase_price)')
      ]);

      const storeTotalAmount = salesRes.data?.filter(s => s.source === 'store').reduce((sum, s) => sum + (s.total || 0), 0) || 0;
      const sallaTotalAmount = salesRes.data?.filter(s => s.source === 'salla').reduce((sum, s) => sum + (s.total || 0), 0) || 0;
      const salesTotalAmount = storeTotalAmount + sallaTotalAmount;
      const salesTotalCost = salesRes.data?.reduce((sum, s) => sum + (s.total_cost || 0), 0) || 0;
      const salesGrossProfit = salesRes.data?.reduce((sum, s) => sum + (s.gross_profit || 0), 0) || 0;
      const purchasesTotalAmount = purchasesRes.data?.reduce((sum, p) => sum + (p.total || 0), 0) || 0;
      const expensesTotalAmount = expensesRes.data?.reduce((sum, e) => sum + (e.amount || 0), 0) || 0;
      const inventoryValue = inventoryRes.data?.reduce((sum, inv: any) => sum + (inv.quantity * (inv.products?.purchase_price || 0)), 0) || 0;

      setSalesData({
        total: salesTotalAmount,
        storeTotal: storeTotalAmount,
        sallaTotal: sallaTotalAmount,
        totalCost: salesTotalCost,
        grossProfit: salesGrossProfit,
        count: salesRes.data?.length || 0
      });
      setPurchasesData({ total: purchasesTotalAmount, count: purchasesRes.data?.length || 0 });
      setExpensesData({ total: expensesTotalAmount, count: expensesRes.data?.length || 0 });
      setRecentSales(recentRes.data || []);
      setInventoryValue(inventoryValue);

      const { data: saleItemsData } = await supabase
        .from('sale_items')
        .select('quantity, total, products(name, name_ar)')
        .limit(100);

      if (saleItemsData) {
        const productMap = new Map<string, TopProduct>();
        saleItemsData.forEach((item: any) => {
          if (!item.products) return;
          const key = item.products.name;
          const existing = productMap.get(key);
          if (existing) {
            existing.total_qty += Number(item.quantity);
            existing.total_amount += Number(item.total);
          } else {
            productMap.set(key, {
              product_name: item.products.name,
              product_name_ar: item.products.name_ar,
              total_qty: Number(item.quantity),
              total_amount: Number(item.total),
            });
          }
        });
        setTopProducts(
          Array.from(productMap.values())
            .sort((a, b) => b.total_amount - a.total_amount)
            .slice(0, 5)
        );
      }
    } catch (err) {
      console.error('Error loading report data:', err);
    } finally {
      setLoading(false);
    }
  };

  const netProfit = salesData.grossProfit - expensesData.total;
  const profitMargin = salesData.total > 0 ? ((netProfit / salesData.total) * 100).toFixed(1) : '0.0';

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat(isRTL ? 'ar-SA' : 'en-US', { style: 'decimal', minimumFractionDigits: 2 }).format(amount);

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString(isRTL ? 'ar-SA' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' });

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

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md">
          <ShieldAlert className="w-16 h-16 mx-auto mb-4 text-red-500" />
          <h3 className="text-xl font-bold text-gray-900 mb-2">
            {isRTL ? 'وصول محظور' : 'Access Denied'}
          </h3>
          <p className="text-gray-600">
            {isRTL
              ? 'التقارير المالية متاحة للمديرين فقط. يرجى التواصل مع المدير للحصول على الصلاحيات المطلوبة.'
              : 'Financial reports are available to administrators only. Please contact your administrator for access.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('nav.reports')}</h2>
          <p className="text-gray-500 mt-1">{isRTL ? 'التقارير المالية والإحصائيات' : 'Financial reports and statistics'}</p>
        </div>
        <div className="flex items-center gap-2 bg-white rounded-lg border p-1">
          {([
            { key: 'today', label: isRTL ? 'اليوم' : 'Today' },
            { key: 'week', label: isRTL ? 'أسبوع' : 'Week' },
            { key: 'month', label: isRTL ? 'شهر' : 'Month' },
            { key: 'year', label: isRTL ? 'سنة' : 'Year' },
          ] as const).map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                period === p.key ? 'bg-teal-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-200 rounded-xl p-5 mb-6">
        <div className="flex items-start gap-4">
          <div className="p-2.5 bg-white rounded-lg shadow-sm">
            <FileText className="w-6 h-6 text-teal-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              {isRTL ? 'كيف يتم حساب صافي الربح؟' : 'How is Net Profit Calculated?'}
            </h3>
            <div className={`grid ${isRTL ? 'grid-cols-1 md:grid-cols-5' : 'grid-cols-1 md:grid-cols-5'} gap-2 text-sm`}>
              <div className="bg-white rounded-lg p-3 shadow-sm">
                <p className="text-gray-600 mb-1">{isRTL ? '١. الإيرادات' : '1. Revenue'}</p>
                <p className="font-bold text-green-600">{formatCurrency(salesData.total)}</p>
              </div>
              <div className="flex items-center justify-center text-2xl text-gray-400">-</div>
              <div className="bg-white rounded-lg p-3 shadow-sm">
                <p className="text-gray-600 mb-1">{isRTL ? '٢. تكلفة البضاعة المباعة' : '2. COGS'}</p>
                <p className="font-bold text-amber-600">{formatCurrency(salesData.totalCost)}</p>
              </div>
              <div className="flex items-center justify-center text-2xl text-gray-400">-</div>
              <div className="bg-white rounded-lg p-3 shadow-sm">
                <p className="text-gray-600 mb-1">{isRTL ? '٣. المصاريف التشغيلية' : '3. Operating Expenses'}</p>
                <p className="font-bold text-orange-600">{formatCurrency(expensesData.total)}</p>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-teal-200">
              <div className="flex items-center justify-between">
                <p className="text-gray-700 font-semibold">
                  {isRTL ? '= صافي الربح' : '= Net Profit'}
                </p>
                <p className={`text-2xl font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(netProfit)}
                </p>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {isRTL
                  ? 'ملاحظة: المشتريات تضاف إلى المخزون وليست مصروفات مباشرة. فقط تكلفة المنتجات المباعة يتم خصمها من الربح.'
                  : 'Note: Purchases add to inventory and are not direct expenses. Only the cost of sold items is deducted from profit.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 bg-teal-100 rounded-lg">
              <TrendingUp className="w-5 h-5 text-teal-600" />
            </div>
            <p className="text-sm text-gray-500">{isRTL ? 'مبيعات المحل' : 'Store Sales'}</p>
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(salesData.storeTotal)}</p>
          <p className="text-xs text-gray-400 mt-1">{isRTL ? 'مبيعات محلية' : 'Local sales'}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 bg-blue-100 rounded-lg">
              <TrendingUp className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-sm text-gray-500">{isRTL ? 'مبيعات المتجر الإلكتروني' : 'Online Sales'}</p>
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(salesData.sallaTotal)}</p>
          <p className="text-xs text-gray-400 mt-1">{isRTL ? 'مبيعات سلة' : 'Salla sales'}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 bg-green-100 rounded-lg">
              <DollarSign className="w-5 h-5 text-green-600" />
            </div>
            <p className="text-sm text-gray-500">{isRTL ? 'إجمالي الإيرادات' : 'Total Revenue'}</p>
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(salesData.total)}</p>
          <p className="text-xs text-gray-400 mt-1">{salesData.count} {isRTL ? 'عملية' : 'transactions'}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 bg-amber-100 rounded-lg">
              <TrendingDown className="w-5 h-5 text-amber-600" />
            </div>
            <p className="text-sm text-gray-500">{isRTL ? 'تكلفة البضاعة المباعة' : 'Cost of Goods Sold'}</p>
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(salesData.totalCost)}</p>
          <p className="text-xs text-gray-400 mt-1">{isRTL ? 'تكلفة المنتجات المباعة فقط' : 'Cost of sold items only'}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 bg-emerald-100 rounded-lg">
              <DollarSign className="w-5 h-5 text-emerald-600" />
            </div>
            <p className="text-sm text-gray-500">{isRTL ? 'إجمالي الربح' : 'Gross Profit'}</p>
          </div>
          <p className={`text-2xl font-bold ${salesData.grossProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {formatCurrency(salesData.grossProfit)}
          </p>
          <p className="text-xs text-gray-400 mt-1">{isRTL ? 'الإيرادات - تكلفة البضاعة' : 'Revenue - COGS'}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 bg-orange-100 rounded-lg">
              <Receipt className="w-5 h-5 text-orange-600" />
            </div>
            <p className="text-sm text-gray-500">{isRTL ? 'المصاريف التشغيلية' : 'Operating Expenses'}</p>
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(expensesData.total)}</p>
          <p className="text-xs text-gray-400 mt-1">{expensesData.count} {isRTL ? 'عملية' : 'transactions'}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className={`p-2.5 ${netProfit >= 0 ? 'bg-green-100' : 'bg-red-100'} rounded-lg`}>
              <DollarSign className={`w-5 h-5 ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`} />
            </div>
            <p className="text-sm text-gray-500">{isRTL ? 'صافي الربح' : 'Net Profit'}</p>
          </div>
          <p className={`text-2xl font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(netProfit)}
          </p>
          <p className="text-xs text-gray-400 mt-1">{isRTL ? 'إجمالي الربح - المصاريف' : 'Gross Profit - OpEx'}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 bg-purple-100 rounded-lg">
              <BarChart3 className="w-5 h-5 text-purple-600" />
            </div>
            <p className="text-sm text-gray-500">{isRTL ? 'قيمة المخزون' : 'Inventory Value'}</p>
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(inventoryValue)}</p>
          <p className="text-xs text-gray-400 mt-1">{isRTL ? 'رأس المال المستثمر' : 'Capital invested'}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 bg-indigo-100 rounded-lg">
              <TrendingDown className="w-5 h-5 text-indigo-600" />
            </div>
            <p className="text-sm text-gray-500">{isRTL ? 'مشتريات المخزون' : 'Inventory Purchases'}</p>
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(purchasesData.total)}</p>
          <p className="text-xs text-gray-400 mt-1">{isRTL ? 'استثمار في المخزون' : 'Investment in stock'}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 bg-teal-100 rounded-lg">
              <BarChart3 className="w-5 h-5 text-teal-600" />
            </div>
            <p className="text-sm text-gray-500">{isRTL ? 'متوسط البيع' : 'Avg Sale'}</p>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {formatCurrency(salesData.count > 0 ? salesData.total / salesData.count : 0)}
          </p>
          <p className="text-xs text-gray-400 mt-1">{isRTL ? 'لكل عملية' : 'per transaction'}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 bg-cyan-100 rounded-lg">
              <BarChart3 className="w-5 h-5 text-cyan-600" />
            </div>
            <p className="text-sm text-gray-500">{isRTL ? 'هامش الربح' : 'Profit Margin'}</p>
          </div>
          <p className={`text-2xl font-bold ${parseFloat(profitMargin) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {profitMargin}%
          </p>
          <p className="text-xs text-gray-400 mt-1">{isRTL ? 'نسبة الربح للإيراد' : 'Net profit to revenue'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-teal-600" />
            {isRTL ? 'أكثر المنتجات مبيعاً' : 'Top Selling Products'}
          </h3>
          {topProducts.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <FileText className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p>{isRTL ? 'لا توجد بيانات' : 'No data available'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {topProducts.map((product, index) => {
                const maxAmount = topProducts[0]?.total_amount || 1;
                const width = (product.total_amount / maxAmount) * 100;
                return (
                  <div key={index} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-900">
                        {isRTL ? product.product_name_ar : product.product_name}
                      </span>
                      <span className="text-gray-500">
                        {formatCurrency(product.total_amount)} ({product.total_qty} {isRTL ? 'قطعة' : 'pcs'})
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-teal-500 h-2 rounded-full transition-all"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-teal-600" />
            {isRTL ? 'آخر المبيعات' : 'Recent Sales'}
          </h3>
          {recentSales.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <FileText className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p>{isRTL ? 'لا توجد مبيعات' : 'No recent sales'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentSales.map((sale: any) => (
                <div key={sale.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{sale.sale_number}</p>
                    <p className="text-xs text-gray-400">
                      {sale.customers
                        ? (isRTL ? sale.customers.name_ar || sale.customers.name : sale.customers.name)
                        : (isRTL ? 'عميل نقدي' : 'Walk-in')}
                      {' - '}
                      {formatDate(sale.sale_date)}
                    </p>
                  </div>
                  <p className="font-bold text-teal-600">{formatCurrency(sale.total)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
