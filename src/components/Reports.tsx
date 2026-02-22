import { useEffect, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  FileText, TrendingUp, TrendingDown, DollarSign, Calendar,
  BarChart3, Receipt, ShieldAlert, Package, AlertTriangle,
  Building2, Download, FileSpreadsheet
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface ReportData {
  sales: {
    total: number;
    totalVAT: number;
    totalWithoutVAT: number;
    count: number;
    totalCost: number;
    grossProfit: number;
    bySource: {
      store: number;
      salla: number;
    };
  };
  purchases: {
    total: number;
    totalVAT: number;
    totalWithoutVAT: number;
    count: number;
  };
  expenses: {
    total: number;
    operating: number;
    setup: number;
    count: number;
  };
  inventory: {
    totalValue: number;
    totalQuantity: number;
    lowStock: number;
    outOfStock: number;
  };
  wastage: {
    totalValue: number;
    totalQuantity: number;
    items: Array<{
      product_name: string;
      product_name_ar: string;
      quantity: number;
      value: number;
    }>;
  };
  slowMoving: Array<{
    product_name: string;
    product_name_ar: string;
    current_stock: number;
    last_sale_date: string | null;
    days_since_sale: number;
  }>;
  topProducts: Array<{
    product_name: string;
    product_name_ar: string;
    total_qty: number;
    total_amount: number;
  }>;
  branches: Array<{
    branch_id: string;
    branch_name: string;
    branch_name_ar: string;
    sales: number;
    expenses: number;
    profit: number;
  }>;
}

export function Reports() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const isRTL = language === 'ar';

  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Date filter state
  const [dateFrom, setDateFrom] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    return date.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);

  // Report data state
  const [reportData, setReportData] = useState<ReportData>({
    sales: { total: 0, totalVAT: 0, totalWithoutVAT: 0, count: 0, totalCost: 0, grossProfit: 0, bySource: { store: 0, salla: 0 } },
    purchases: { total: 0, totalVAT: 0, totalWithoutVAT: 0, count: 0 },
    expenses: { total: 0, operating: 0, setup: 0, count: 0 },
    inventory: { totalValue: 0, totalQuantity: 0, lowStock: 0, outOfStock: 0 },
    wastage: { totalValue: 0, totalQuantity: 0, items: [] },
    slowMoving: [],
    topProducts: [],
    branches: []
  });

  useEffect(() => {
    checkAdminAndLoad();
  }, [user]);

  useEffect(() => {
    if (isAdmin) {
      loadReportData();
    }
  }, [dateFrom, dateTo, isAdmin]);

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

  const loadReportData = async () => {
    setLoading(true);
    try {
      const startDateObj = new Date(dateFrom);
      const endDateObj = new Date(dateTo);
      endDateObj.setHours(23, 59, 59, 999);

      // Fetch all data in parallel
      const [
        salesRes,
        purchasesRes,
        operatingExpensesRes,
        inventoryRes,
        wastageRes,
        saleItemsRes,
        branchesRes,
        financialRes
      ] = await Promise.all([
        // Sales data for source breakdown
        supabase
          .from('sales')
          .select('total, tax, source, branch_id, gross_profit')
          .eq('status', 'confirmed')
          .gte('sale_date', startDateObj.toISOString())
          .lte('sale_date', endDateObj.toISOString()),

        // Purchases data
        supabase
          .from('purchases')
          .select('total, tax')
          .in('status', ['confirmed', 'received'])
          .gte('purchase_date', startDateObj.toISOString())
          .lte('purchase_date', endDateObj.toISOString()),

        // Operating expenses (for branch breakdown)
        supabase
          .from('operating_expenses')
          .select('amount, branch_id'),

        // Current inventory
        supabase
          .from('inventory')
          .select(`
            quantity,
            reorder_level,
            products!inner(
              name,
              name_ar,
              purchase_price,
              selling_price
            )
          `),

        // Wastage data
        supabase
          .from('wastage')
          .select(`
            quantity,
            products!inner(
              name,
              name_ar,
              purchase_price
            )
          `)
          .gte('wastage_date', startDate)
          .lte('wastage_date', endDate),

        // Sale items for top products
        supabase
          .from('sale_items')
          .select(`
            quantity,
            total,
            sales!inner(sale_date, status),
            products!inner(name, name_ar)
          `)
          .eq('sales.status', 'confirmed')
          .gte('sales.sale_date', startDateObj.toISOString())
          .lte('sales.sale_date', endDateObj.toISOString()),

        // Branches
        supabase.from('branches').select('*'),

        // Financial summary from database - NO calculations in React
        supabase.rpc('get_financial_summary', {
          p_date_from: startDateObj.toISOString().split('T')[0],
          p_date_to: endDateObj.toISOString().split('T')[0],
          p_branch_id: null
        })
      ]);

      // Get financial metrics from database only
      const financial = financialRes.data?.[0] || {};
      const salesTotal = financial.total_sales || 0;
      const salesVAT = financial.total_tax || 0;
      const salesTotalCost = financial.total_cogs || 0;
      const salesGrossProfit = financial.gross_profit || 0;
      const storeTotal = salesRes.data?.filter(s => s.source === 'store').reduce((sum, s) => sum + Number(s.total || 0), 0) || 0;
      const sallaTotal = salesRes.data?.filter(s => s.source === 'salla').reduce((sum, s) => sum + Number(s.total || 0), 0) || 0;

      // Process purchases data
      const purchasesTotal = purchasesRes.data?.reduce((sum, p) => sum + Number(p.total || 0), 0) || 0;
      const purchasesVAT = purchasesRes.data?.reduce((sum, p) => sum + Number(p.tax || 0), 0) || 0;

      // Process inventory data
      let totalInventoryValue = 0;
      let totalInventoryQty = 0;
      let lowStockCount = 0;
      let outOfStockCount = 0;

      inventoryRes.data?.forEach((inv: any) => {
        const qty = Number(inv.quantity || 0);
        const price = Number(inv.products?.purchase_price || 0);
        totalInventoryValue += qty * price;
        totalInventoryQty += qty;

        if (qty === 0) {
          outOfStockCount++;
        } else if (inv.reorder_level && qty <= inv.reorder_level) {
          lowStockCount++;
        }
      });

      // Process wastage data
      const wastageItems: any[] = [];
      let totalWastageValue = 0;
      let totalWastageQty = 0;

      wastageRes.data?.forEach((w: any) => {
        const qty = Number(w.quantity || 0);
        const price = Number(w.products?.purchase_price || 0);
        const value = qty * price;

        totalWastageValue += value;
        totalWastageQty += qty;

        wastageItems.push({
          product_name: w.products?.name || '',
          product_name_ar: w.products?.name_ar || '',
          quantity: qty,
          value: value
        });
      });

      // Process top products
      const productMap = new Map<string, any>();
      saleItemsRes.data?.forEach((item: any) => {
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
            total_amount: Number(item.total)
          });
        }
      });

      const topProducts = Array.from(productMap.values())
        .sort((a, b) => b.total_amount - a.total_amount)
        .slice(0, 10);

      // Find slow-moving products (no sales in the period)
      const soldProductIds = new Set(saleItemsRes.data?.map((item: any) => item.products?.name));
      const slowMoving = inventoryRes.data
        ?.filter((inv: any) => {
          const hasStock = Number(inv.quantity || 0) > 0;
          const notSold = !soldProductIds.has(inv.products?.name);
          return hasStock && notSold;
        })
        .map((inv: any) => ({
          product_name: inv.products?.name || '',
          product_name_ar: inv.products?.name_ar || '',
          current_stock: Number(inv.quantity || 0),
          last_sale_date: null,
          days_since_sale: -1
        }))
        .slice(0, 10) || [];

      // Process branch data
      const branchData: any[] = [];
      branchesRes.data?.forEach((branch: any) => {
        const branchGrossProfit = salesRes.data?.filter(s => s.branch_id === branch.id).reduce((sum, s) => sum + Number(s.gross_profit || 0), 0) || 0;
        const branchExpenses = operatingExpensesRes.data?.filter(e => e.branch_id === branch.id).reduce((sum, e) => sum + Number(e.amount || 0), 0) || 0;
        const branchProfit = branchGrossProfit - branchExpenses;

        branchData.push({
          branch_id: branch.id,
          branch_name: branch.name,
          branch_name_ar: branch.name_ar,
          sales: branchGrossProfit,
          expenses: branchExpenses,
          profit: branchProfit
        });
      });

      setReportData({
        sales: {
          total: salesTotal,
          totalVAT: salesVAT,
          totalWithoutVAT: salesTotal - salesVAT,
          count: salesRes.data?.length || 0,
          totalCost: salesTotalCost,
          grossProfit: salesGrossProfit,
          bySource: { store: storeTotal, salla: sallaTotal }
        },
        purchases: {
          total: purchasesTotal,
          totalVAT: purchasesVAT,
          totalWithoutVAT: purchasesTotal - purchasesVAT,
          count: purchasesRes.data?.length || 0
        },
        expenses: {
          total: financial.total_operating_expenses + financial.total_setup_expenses + financial.total_employee_salaries || 0,
          operating: financial.total_operating_expenses || 0,
          setup: financial.total_setup_expenses || 0,
          count: 0
        },
        inventory: {
          totalValue: totalInventoryValue,
          totalQuantity: totalInventoryQty,
          lowStock: lowStockCount,
          outOfStock: outOfStockCount
        },
        wastage: {
          totalValue: totalWastageValue,
          totalQuantity: totalWastageQty,
          items: wastageItems.slice(0, 10)
        },
        slowMoving,
        topProducts,
        branches: branchData
      });

    } catch (err) {
      console.error('Error loading report data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDateRange = (range: 'today' | 'week' | 'month' | 'quarter' | 'year') => {
    const today = new Date();
    const to = today.toISOString().split('T')[0];
    let from = new Date();

    switch (range) {
      case 'today':
        from = today;
        break;
      case 'week':
        from.setDate(today.getDate() - 7);
        break;
      case 'month':
        from.setMonth(today.getMonth() - 1);
        break;
      case 'quarter':
        from.setMonth(today.getMonth() - 3);
        break;
      case 'year':
        from.setFullYear(today.getFullYear() - 1);
        break;
    }

    setDateFrom(from.toISOString().split('T')[0]);
    setDateTo(to);
  };

  const exportToExcel = () => {
    const workbook = XLSX.utils.book_new();

    // Summary sheet
    const summaryData = [
      [isRTL ? 'التقرير المالي الشامل' : 'Comprehensive Financial Report'],
      [isRTL ? 'نظام بلوف المحاسبي' : 'BLOOV Accounting System'],
      [isRTL ? `الفترة: من ${dateFrom} إلى ${dateTo}` : `Period: From ${dateFrom} To ${dateTo}`],
      [],
      [isRTL ? 'المبيعات' : 'Sales', formatCurrency(reportData.sales.total)],
      [isRTL ? 'ضريبة المبيعات' : 'Sales VAT', formatCurrency(reportData.sales.totalVAT)],
      [isRTL ? 'تكلفة البضاعة المباعة' : 'Cost of Goods Sold', formatCurrency(reportData.sales.totalCost)],
      [isRTL ? 'الربح الإجمالي' : 'Gross Profit', formatCurrency(reportData.sales.grossProfit)],
      [],
      [isRTL ? 'المشتريات' : 'Purchases', formatCurrency(reportData.purchases.total)],
      [isRTL ? 'ضريبة المشتريات' : 'Purchases VAT', formatCurrency(reportData.purchases.totalVAT)],
      [],
      [isRTL ? 'المصاريف التشغيلية' : 'Operating Expenses', formatCurrency(reportData.expenses.operating)],
      [isRTL ? 'مصاريف التأسيس' : 'Setup Expenses', formatCurrency(reportData.expenses.setup)],
      [isRTL ? 'رواتب الموظفين' : 'Employee Salaries', '(included in total)'],
      [isRTL ? 'إجمالي المصاريف' : 'Total Expenses', formatCurrency(reportData.expenses.total)],
      [],
      [isRTL ? 'صافي الربح' : 'Net Profit', formatCurrency(reportData.sales.grossProfit - reportData.expenses.total)],
      [isRTL ? 'صافي الضريبة المستحقة' : 'Net VAT Payable', formatCurrency(reportData.sales.totalVAT - reportData.purchases.totalVAT)],
    ];

    const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
    ws1['!cols'] = [{ wch: 30 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(workbook, ws1, isRTL ? 'الملخص' : 'Summary');

    // Top products sheet
    const topProductsData = [
      [isRTL ? 'المنتجات الأكثر مبيعاً' : 'Top Selling Products'],
      [],
      [isRTL ? 'المنتج' : 'Product', isRTL ? 'الكمية' : 'Quantity', isRTL ? 'المبلغ' : 'Amount']
    ];
    reportData.topProducts.forEach(p => {
      topProductsData.push([
        isRTL ? p.product_name_ar : p.product_name,
        p.total_qty.toString(),
        formatCurrency(p.total_amount)
      ]);
    });

    const ws2 = XLSX.utils.aoa_to_sheet(topProductsData);
    ws2['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(workbook, ws2, isRTL ? 'المنتجات' : 'Products');

    // Branch comparison sheet
    if (reportData.branches.length > 0) {
      const branchData = [
        [isRTL ? 'مقارنة الفروع' : 'Branch Comparison'],
        [],
        [isRTL ? 'الفرع' : 'Branch', isRTL ? 'المبيعات' : 'Sales', isRTL ? 'المصاريف' : 'Expenses', isRTL ? 'الربح' : 'Profit']
      ];
      reportData.branches.forEach(b => {
        branchData.push([
          isRTL ? b.branch_name_ar : b.branch_name,
          formatCurrency(b.sales),
          formatCurrency(b.expenses),
          formatCurrency(b.profit)
        ]);
      });

      const ws3 = XLSX.utils.aoa_to_sheet(branchData);
      ws3['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];
      XLSX.utils.book_append_sheet(workbook, ws3, isRTL ? 'الفروع' : 'Branches');
    }

    XLSX.writeFile(workbook, `Financial_Report_${dateFrom}_${dateTo}.xlsx`);
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat(isRTL ? 'ar-SA' : 'en-US', {
      style: 'decimal',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);

  const formatPercent = (value: number) => `${value.toFixed(1)}%`;

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
              ? 'التقارير المالية متاحة للمديرين فقط'
              : 'Financial reports are available to administrators only'}
          </p>
        </div>
      </div>
    );
  }

  // All calculations come from database now
  const netProfit = reportData.sales.grossProfit - reportData.expenses.total;
  const netVAT = reportData.sales.totalVAT - reportData.purchases.totalVAT;
  const profitMargin = reportData.sales.total > 0
    ? ((netProfit / reportData.sales.total) * 100)
    : 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header with Date Filter */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('nav.reports')}</h2>
          <p className="text-gray-500 mt-1">
            {isRTL ? 'التقارير المالية والإحصائيات المتكاملة' : 'Comprehensive financial reports and analytics'}
          </p>
        </div>
        <button
          onClick={exportToExcel}
          className="flex items-center gap-2 bg-green-600 text-white px-4 py-2.5 rounded-lg hover:bg-green-700 transition font-medium"
        >
          <FileSpreadsheet className="w-5 h-5" />
          {isRTL ? 'تصدير Excel' : 'Export Excel'}
        </button>
      </div>

      {/* Date Range Filter */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Calendar className="w-5 h-5 text-teal-600" />
            <span className="font-medium">{isRTL ? 'الفترة الزمنية:' : 'Period:'}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">{isRTL ? 'من:' : 'From:'}</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">{isRTL ? 'إلى:' : 'To:'}</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 ml-auto">
            {[
              { key: 'today', label: isRTL ? 'اليوم' : 'Today' },
              { key: 'week', label: isRTL ? 'أسبوع' : 'Week' },
              { key: 'month', label: isRTL ? 'شهر' : 'Month' },
              { key: 'quarter', label: isRTL ? '3 أشهر' : 'Quarter' },
              { key: 'year', label: isRTL ? 'سنة' : 'Year' }
            ].map((period) => (
              <button
                key={period.key}
                onClick={() => handleQuickDateRange(period.key as any)}
                className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-teal-100 hover:text-teal-700 transition font-medium"
              >
                {period.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Sales */}
        <div className="bg-gradient-to-br from-teal-50 to-teal-100 rounded-xl p-6 border border-teal-200">
          <div className="flex items-center justify-between mb-3">
            <div className="bg-teal-600 p-2.5 rounded-lg">
              <DollarSign className="w-5 h-5 text-white" />
            </div>
            <TrendingUp className="w-5 h-5 text-teal-600" />
          </div>
          <p className="text-sm text-teal-700 font-medium mb-1">
            {isRTL ? 'إجمالي المبيعات' : 'Total Sales'}
          </p>
          <p className="text-2xl font-bold text-teal-900">
            {formatCurrency(reportData.sales.total)}
          </p>
          <p className="text-xs text-teal-600 mt-2">
            {reportData.sales.count} {isRTL ? 'عملية بيع' : 'transactions'}
          </p>
        </div>

        {/* Gross Profit */}
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl p-6 border border-emerald-200">
          <div className="flex items-center justify-between mb-3">
            <div className="bg-emerald-600 p-2.5 rounded-lg">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-200 px-2 py-1 rounded">
              {formatPercent(profitMargin)}
            </span>
          </div>
          <p className="text-sm text-emerald-700 font-medium mb-1">
            {isRTL ? 'صافي الربح' : 'Net Profit'}
          </p>
          <p className="text-2xl font-bold text-emerald-900">
            {formatCurrency(netProfit)}
          </p>
          <p className="text-xs text-emerald-600 mt-2">
            {isRTL ? 'بعد خصم المصاريف' : 'After expenses'}
          </p>
        </div>

        {/* Net VAT */}
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200">
          <div className="flex items-center justify-between mb-3">
            <div className="bg-blue-600 p-2.5 rounded-lg">
              <Receipt className="w-5 h-5 text-white" />
            </div>
            {netVAT > 0 ? (
              <TrendingDown className="w-5 h-5 text-red-500" />
            ) : (
              <TrendingUp className="w-5 h-5 text-green-500" />
            )}
          </div>
          <p className="text-sm text-blue-700 font-medium mb-1">
            {isRTL ? 'صافي الضريبة' : 'Net VAT'}
          </p>
          <p className="text-2xl font-bold text-blue-900">
            {formatCurrency(Math.abs(netVAT))}
          </p>
          <p className="text-xs text-blue-600 mt-2">
            {netVAT > 0
              ? (isRTL ? 'مستحقة للدفع' : 'Payable')
              : (isRTL ? 'مستحقة الاسترداد' : 'Refundable')
            }
          </p>
        </div>

        {/* Total Expenses */}
        <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-6 border border-orange-200">
          <div className="flex items-center justify-between mb-3">
            <div className="bg-orange-600 p-2.5 rounded-lg">
              <TrendingDown className="w-5 h-5 text-white" />
            </div>
          </div>
          <p className="text-sm text-orange-700 font-medium mb-1">
            {isRTL ? 'إجمالي المصاريف' : 'Total Expenses'}
          </p>
          <p className="text-2xl font-bold text-orange-900">
            {formatCurrency(reportData.expenses.total)}
          </p>
          <p className="text-xs text-orange-600 mt-2">
            {reportData.expenses.count} {isRTL ? 'مصروف' : 'expenses'}
          </p>
        </div>
      </div>

      {/* VAT Breakdown */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-blue-100 p-2.5 rounded-lg">
            <Receipt className="w-5 h-5 text-blue-600" />
          </div>
          <h3 className="text-lg font-bold text-gray-900">
            {isRTL ? 'تفصيل الضريبة (VAT)' : 'VAT Breakdown'}
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-green-50 rounded-lg p-4">
            <p className="text-sm text-green-700 font-medium mb-2">
              {isRTL ? 'ضريبة المبيعات المحصلة' : 'Sales VAT Collected'}
            </p>
            <p className="text-xl font-bold text-green-900">
              + {formatCurrency(reportData.sales.totalVAT)}
            </p>
          </div>
          <div className="bg-red-50 rounded-lg p-4">
            <p className="text-sm text-red-700 font-medium mb-2">
              {isRTL ? 'ضريبة المشتريات المدفوعة' : 'Purchases VAT Paid'}
            </p>
            <p className="text-xl font-bold text-red-900">
              - {formatCurrency(reportData.purchases.totalVAT)}
            </p>
          </div>
          <div className={`${netVAT >= 0 ? 'bg-orange-50' : 'bg-emerald-50'} rounded-lg p-4`}>
            <p className={`text-sm font-medium mb-2 ${netVAT >= 0 ? 'text-orange-700' : 'text-emerald-700'}`}>
              {isRTL ? 'الصافي المستحق' : 'Net Amount'}
            </p>
            <p className={`text-xl font-bold ${netVAT >= 0 ? 'text-orange-900' : 'text-emerald-900'}`}>
              {netVAT >= 0 ? '=' : '+'} {formatCurrency(Math.abs(netVAT))}
            </p>
          </div>
        </div>
      </div>

      {/* Sales Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-teal-100 p-2.5 rounded-lg">
              <BarChart3 className="w-5 h-5 text-teal-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900">
              {isRTL ? 'المبيعات حسب المصدر' : 'Sales by Source'}
            </h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-teal-50 rounded-lg">
              <span className="text-sm font-medium text-gray-700">
                {isRTL ? 'المتجر' : 'Store'}
              </span>
              <span className="text-lg font-bold text-teal-900">
                {formatCurrency(reportData.sales.bySource.store)}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
              <span className="text-sm font-medium text-gray-700">
                {isRTL ? 'سلة' : 'Salla'}
              </span>
              <span className="text-lg font-bold text-purple-900">
                {formatCurrency(reportData.sales.bySource.salla)}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-orange-100 p-2.5 rounded-lg">
              <DollarSign className="w-5 h-5 text-orange-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900">
              {isRTL ? 'المصاريف حسب النوع' : 'Expenses by Type'}
            </h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
              <span className="text-sm font-medium text-gray-700">
                {isRTL ? 'تشغيلية' : 'Operating'}
              </span>
              <span className="text-lg font-bold text-orange-900">
                {formatCurrency(reportData.expenses.operating)}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
              <span className="text-sm font-medium text-gray-700">
                {isRTL ? 'تأسيس' : 'Setup'}
              </span>
              <span className="text-lg font-bold text-purple-900">
                {formatCurrency(reportData.expenses.setup)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Inventory Status */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-indigo-100 p-2.5 rounded-lg">
            <Package className="w-5 h-5 text-indigo-600" />
          </div>
          <h3 className="text-lg font-bold text-gray-900">
            {isRTL ? 'حالة المخزون' : 'Inventory Status'}
          </h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-indigo-50 rounded-lg">
            <p className="text-2xl font-bold text-indigo-900">
              {formatCurrency(reportData.inventory.totalValue)}
            </p>
            <p className="text-xs text-indigo-700 mt-1">
              {isRTL ? 'قيمة المخزون' : 'Total Value'}
            </p>
          </div>
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <p className="text-2xl font-bold text-blue-900">
              {reportData.inventory.totalQuantity.toFixed(0)}
            </p>
            <p className="text-xs text-blue-700 mt-1">
              {isRTL ? 'إجمالي الكمية' : 'Total Quantity'}
            </p>
          </div>
          <div className="text-center p-4 bg-yellow-50 rounded-lg">
            <p className="text-2xl font-bold text-yellow-900">
              {reportData.inventory.lowStock}
            </p>
            <p className="text-xs text-yellow-700 mt-1">
              {isRTL ? 'مخزون منخفض' : 'Low Stock'}
            </p>
          </div>
          <div className="text-center p-4 bg-red-50 rounded-lg">
            <p className="text-2xl font-bold text-red-900">
              {reportData.inventory.outOfStock}
            </p>
            <p className="text-xs text-red-700 mt-1">
              {isRTL ? 'نفذ المخزون' : 'Out of Stock'}
            </p>
          </div>
        </div>
      </div>

      {/* Wastage & Slow Moving */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Wastage */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-red-100 p-2.5 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900">
              {isRTL ? 'الهالك' : 'Wastage'}
            </h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
              <span className="text-sm font-medium text-gray-700">
                {isRTL ? 'القيمة الإجمالية' : 'Total Value'}
              </span>
              <span className="text-lg font-bold text-red-900">
                {formatCurrency(reportData.wastage.totalValue)}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
              <span className="text-sm font-medium text-gray-700">
                {isRTL ? 'الكمية الإجمالية' : 'Total Quantity'}
              </span>
              <span className="text-lg font-bold text-orange-900">
                {reportData.wastage.totalQuantity.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Slow Moving Products */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-amber-100 p-2.5 rounded-lg">
              <Package className="w-5 h-5 text-amber-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900">
              {isRTL ? 'المنتجات الراكدة' : 'Slow Moving'}
            </h3>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {reportData.slowMoving.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                {isRTL ? 'لا توجد منتجات راكدة' : 'No slow-moving products'}
              </p>
            ) : (
              reportData.slowMoving.map((product, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-amber-50 rounded-lg text-sm">
                  <span className="text-gray-700 font-medium">
                    {isRTL ? product.product_name_ar : product.product_name}
                  </span>
                  <span className="text-amber-900 font-bold">
                    {product.current_stock} {isRTL ? 'وحدة' : 'units'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Top Products */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-emerald-100 p-2.5 rounded-lg">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
          </div>
          <h3 className="text-lg font-bold text-gray-900">
            {isRTL ? 'المنتجات الأكثر مبيعاً' : 'Top Selling Products'}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="py-3 px-4 text-left text-xs font-semibold text-gray-700">
                  {isRTL ? 'المنتج' : 'Product'}
                </th>
                <th className="py-3 px-4 text-center text-xs font-semibold text-gray-700">
                  {isRTL ? 'الكمية' : 'Quantity'}
                </th>
                <th className="py-3 px-4 text-right text-xs font-semibold text-gray-700">
                  {isRTL ? 'المبلغ' : 'Amount'}
                </th>
              </tr>
            </thead>
            <tbody>
              {reportData.topProducts.map((product, index) => (
                <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 text-sm text-gray-900">
                    {isRTL ? product.product_name_ar : product.product_name}
                  </td>
                  <td className="py-3 px-4 text-center text-sm font-medium text-gray-700">
                    {product.total_qty.toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-right text-sm font-bold text-emerald-900">
                    {formatCurrency(product.total_amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Branch Comparison */}
      {reportData.branches.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-cyan-100 p-2.5 rounded-lg">
              <Building2 className="w-5 h-5 text-cyan-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900">
              {isRTL ? 'مقارنة الفروع' : 'Branch Comparison'}
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-700">
                    {isRTL ? 'الفرع' : 'Branch'}
                  </th>
                  <th className="py-3 px-4 text-right text-xs font-semibold text-gray-700">
                    {isRTL ? 'المبيعات' : 'Sales'}
                  </th>
                  <th className="py-3 px-4 text-right text-xs font-semibold text-gray-700">
                    {isRTL ? 'المصاريف' : 'Expenses'}
                  </th>
                  <th className="py-3 px-4 text-right text-xs font-semibold text-gray-700">
                    {isRTL ? 'صافي الربح' : 'Net Profit'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {reportData.branches.map((branch, index) => (
                  <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-sm font-medium text-gray-900">
                      {isRTL ? branch.branch_name_ar : branch.branch_name}
                    </td>
                    <td className="py-3 px-4 text-right text-sm font-bold text-teal-900">
                      {formatCurrency(branch.sales)}
                    </td>
                    <td className="py-3 px-4 text-right text-sm font-bold text-orange-900">
                      {formatCurrency(branch.expenses)}
                    </td>
                    <td className={`py-3 px-4 text-right text-sm font-bold ${
                      branch.profit >= 0 ? 'text-emerald-900' : 'text-red-900'
                    }`}>
                      {formatCurrency(branch.profit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
