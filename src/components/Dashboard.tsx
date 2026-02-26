import { useEffect, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabase';
import { TrendingUp, DollarSign, Package, ShoppingCart, ShieldAlert, Clock, Users, ArrowRight } from 'lucide-react';
import { AlertsPanel } from './NotificationCenter';

interface RecentSale {
  id: string;
  sale_number: string;
  total: number;
  sale_date: string;
  customers: { name: string; name_ar: string | null } | null;
}

export function Dashboard() {
  const { t, isRTL, language } = useLanguage();
  const [recentSales, setRecentSales] = useState<RecentSale[]>([]);
  const [residenceStats, setResidenceStats] = useState<any[]>([]);
  const [stats, setStats] = useState({
    totalSales: 0,
    storeSales: 0,
    sallaSales: 0,
    totalPurchases: 0,
    grossProfit: 0,
    operatingNet: 0,
    accountingNet: 0,
    inventoryValue: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const [salesRes, purchasesRes, inventoryRes, recentSalesRes, financialRes, residenceRes] = await Promise.all([
        supabase.from('sales').select('total, source').eq('status', 'confirmed'),
        supabase.from('purchases').select('total').in('status', ['confirmed', 'received']),
        supabase.from('inventory').select('quantity, products(purchase_price)'),
        supabase.from('sales').select('id, sale_number, total, sale_date, customers(name, name_ar)').eq('status', 'confirmed').order('sale_date', { ascending: false }).limit(5),
        supabase.rpc('get_financial_summary', { p_date_from: null, p_date_to: null, p_branch_id: null }),
        supabase.from('v_employee_residence_status').select('*').in('residence_status', ['expired', 'expiring_soon']).order('days_to_expiry', { ascending: true }).limit(5),
      ]);

      if (recentSalesRes.data) setRecentSales(recentSalesRes.data as any);
      if (residenceRes.data) setResidenceStats(residenceRes.data);

      const storeSales = salesRes.data?.filter(s => s.source === 'store').reduce((sum, s) => sum + (s.total || 0), 0) || 0;
      const sallaSales = salesRes.data?.filter(s => s.source === 'salla').reduce((sum, s) => sum + (s.total || 0), 0) || 0;
      const totalSales = storeSales + sallaSales;
      const totalPurchases = purchasesRes.data?.reduce((sum, p) => sum + (p.total || 0), 0) || 0;
      const inventoryValue = inventoryRes.data?.reduce((sum, item: any) => {
        return sum + (item.quantity * (item.products?.purchase_price || 0));
      }, 0) || 0;

      const financial = financialRes.data?.[0] || {};

      setStats({
        totalSales,
        storeSales,
        sallaSales,
        totalPurchases,
        grossProfit: financial.gross_profit || 0,
        operatingNet: financial.operating_net || 0,
        accountingNet: financial.net_profit || 0,
        inventoryValue,
      });
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: isRTL ? 'مبيعات المحل' : 'Store Sales',
      value: stats.storeSales,
      icon: ShoppingCart,
    },
    {
      title: isRTL ? 'مبيعات المتجر الإلكتروني' : 'Online Sales (Salla)',
      value: stats.sallaSales,
      icon: ShoppingCart,
    },
    {
      title: isRTL ? 'إجمالي الربح' : 'Gross Profit',
      value: stats.grossProfit,
      icon: DollarSign,
    },
    {
      title: isRTL ? 'صافي النشاط' : 'Operating Net',
      value: stats.operatingNet,
      icon: TrendingUp,
      isNegative: stats.operatingNet < 0,
    },
    {
      title: isRTL ? 'صافي الربح المحاسبي' : 'Accounting Net',
      value: stats.accountingNet,
      icon: TrendingUp,
      isNegative: stats.accountingNet < 0,
    },
    {
      title: t('dashboard.inventory'),
      value: stats.inventoryValue,
      icon: Package,
    },
  ];

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat(language === 'ar' ? 'ar-SA' : 'en-US', { style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-US', { month: 'short', day: 'numeric' });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-secondary">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8">
      <div className="bg-white rounded-2xl shadow-soft-md p-8 border border-lux-border relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-accent/[0.03] to-transparent pointer-events-none"></div>
        <div className="relative z-10">
          <h2 className="text-3xl font-bold mb-2 text-primary">
            {isRTL ? 'مرحباً بك في BLOOV' : 'Welcome to BLOOV'}
          </h2>
          <p className="text-secondary text-lg">
            {isRTL ? 'نظام محاسبي متكامل صُمم خصيصاً لـ BLOOV' : 'A comprehensive accounting system designed specifically for BLOOV'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.title} className="bg-white rounded-xl shadow-soft-sm border border-lux-border overflow-hidden hover:shadow-soft-md transition-all duration-200 group">
              <div className="p-6">
                <div className="flex items-center justify-between mb-5">
                  <div className="p-3 rounded-xl bg-accent-subtle">
                    <Icon className="w-5 h-5 text-accent" />
                  </div>
                </div>
                <h3 className="text-sm font-medium text-secondary mb-1.5">{card.title}</h3>
                <p className={`text-2xl font-bold ${card.isNegative ? 'text-red-600' : 'text-primary'}`}>
                  {formatCurrency(card.value)} <span className="text-sm font-normal text-muted">{isRTL ? 'ر.س' : 'SAR'}</span>
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AlertsPanel />

        <div className="bg-white rounded-xl shadow-soft-sm border border-lux-border p-6">
          <h3 className="text-lg font-bold text-primary mb-5 flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-accent" />
            {t('dashboard.recentSales')}
          </h3>
          {recentSales.length === 0 ? (
            <div className="text-center py-8 text-muted">
              <ShoppingCart className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p>{isRTL ? 'لا توجد مبيعات بعد' : 'No recent sales'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentSales.map((sale) => (
                <div key={sale.id} className="flex items-center justify-between p-3.5 bg-lux-bg rounded-xl border border-lux-border/50">
                  <div>
                    <p className="font-medium text-primary text-sm">{sale.sale_number}</p>
                    <p className="text-xs text-muted mt-0.5">
                      {sale.customers
                        ? (isRTL ? sale.customers.name_ar || sale.customers.name : sale.customers.name)
                        : (isRTL ? 'عميل نقدي' : 'Walk-in')}
                      {' - '}
                      {formatDate(sale.sale_date)}
                    </p>
                  </div>
                  <p className="font-bold text-accent">{formatCurrency(sale.total)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-soft-sm border border-lux-border p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-primary flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-500" />
            {isRTL ? 'حالة إقامات الموظفين' : 'Employee Residence Status'}
          </h3>
          <a
            href="#/employees"
            className="text-sm text-accent hover:text-accent-hover font-medium flex items-center gap-1 transition-colors"
          >
            {isRTL ? 'عرض الكل' : 'View All'}
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-red-100 rounded-xl">
                <ShieldAlert className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-red-600 font-medium">
                  {isRTL ? 'إقامات منتهية' : 'Expired'}
                </p>
                <p className="text-2xl font-bold text-red-700">
                  {residenceStats.filter(r => r.residence_status === 'expired').length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-100 rounded-xl">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-amber-600 font-medium">
                  {isRTL ? 'تنتهي خلال 30 يوم' : 'Expiring Soon'}
                </p>
                <p className="text-2xl font-bold text-amber-700">
                  {residenceStats.filter(r => r.residence_status === 'expiring_soon').length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {residenceStats.length === 0 ? (
          <div className="text-center py-8 text-muted">
            <Users className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p>{isRTL ? 'جميع الإقامات سارية' : 'All residences are valid'}</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-medium text-secondary mb-3">
              {isRTL ? 'الموظفون الأقرب للانتهاء:' : 'Employees with nearest expiry:'}
            </p>
            {residenceStats.map((emp) => (
              <div key={emp.employee_id} className="flex items-center justify-between p-3.5 bg-lux-bg rounded-xl border border-lux-border/50">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${
                    emp.residence_status === 'expired'
                      ? 'bg-red-100'
                      : 'bg-amber-100'
                  }`}>
                    {emp.residence_status === 'expired' ? (
                      <ShieldAlert className="w-4 h-4 text-red-600" />
                    ) : (
                      <Clock className="w-4 h-4 text-amber-600" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-primary text-sm">
                      {isRTL ? emp.employee_name_ar || emp.employee_name : emp.employee_name}
                    </p>
                    <p className="text-xs text-muted" dir="ltr">
                      {emp.iqama_number || '-'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-semibold ${
                    emp.residence_status === 'expired'
                      ? 'text-red-600'
                      : 'text-amber-600'
                  }`}>
                    {emp.residence_status === 'expired'
                      ? (isRTL ? `منتهية منذ ${Math.abs(emp.days_to_expiry)} يوم` : `${Math.abs(emp.days_to_expiry)}d ago`)
                      : (isRTL ? `${emp.days_to_expiry} يوم` : `${emp.days_to_expiry}d left`)
                    }
                  </p>
                  <p className="text-xs text-muted">
                    {new Date(emp.iqama_expiry_date).toLocaleDateString(isRTL ? 'ar-SA' : 'en-US')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
