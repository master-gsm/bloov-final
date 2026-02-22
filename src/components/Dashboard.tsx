import { useEffect, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabase';
import { TrendingUp, TrendingDown, DollarSign, Package, Users, ShoppingCart } from 'lucide-react';

interface Partner {
  id: string;
  name: string;
  name_ar: string;
  share_percentage: number;
}

interface RecentSale {
  id: string;
  sale_number: string;
  total: number;
  sale_date: string;
  customers: { name: string; name_ar: string | null } | null;
}

export function Dashboard() {
  const { t, isRTL, language } = useLanguage();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [recentSales, setRecentSales] = useState<RecentSale[]>([]);
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
      const [partnersRes, salesRes, purchasesRes, inventoryRes, recentSalesRes, financialRes] = await Promise.all([
        supabase.from('partners').select('*').eq('is_active', true).order('share_percentage', { ascending: false }),
        supabase.from('sales').select('total, source').eq('status', 'confirmed'),
        supabase.from('purchases').select('total').in('status', ['confirmed', 'received']),
        supabase.from('inventory').select('quantity, products(purchase_price)'),
        supabase.from('sales').select('id, sale_number, total, sale_date, customers(name, name_ar)').eq('status', 'confirmed').order('sale_date', { ascending: false }).limit(5),
        supabase.rpc('get_financial_summary', { p_date_from: null, p_date_to: null, p_branch_id: null }),
      ]);

      if (partnersRes.data) setPartners(partnersRes.data);
      if (recentSalesRes.data) setRecentSales(recentSalesRes.data as any);

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
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: isRTL ? 'مبيعات المحل' : 'Store Sales',
      value: stats.storeSales,
      icon: ShoppingCart,
      color: 'from-teal-500 to-teal-600'
    },
    {
      title: isRTL ? 'مبيعات المتجر الإلكتروني' : 'Online Sales (Salla)',
      value: stats.sallaSales,
      icon: ShoppingCart,
      color: 'from-blue-500 to-blue-600'
    },
    {
      title: isRTL ? 'إجمالي الربح' : 'Gross Profit',
      value: stats.grossProfit,
      icon: DollarSign,
      color: 'from-green-500 to-green-600'
    },
    {
      title: isRTL ? 'صافي النشاط' : 'Operating Net',
      value: stats.operatingNet,
      icon: TrendingUp,
      color: stats.operatingNet >= 0 ? 'from-blue-500 to-blue-600' : 'from-red-500 to-red-600'
    },
    {
      title: isRTL ? 'صافي الربح المحاسبي' : 'Accounting Net',
      value: stats.accountingNet,
      icon: TrendingUp,
      color: stats.accountingNet >= 0 ? 'from-emerald-500 to-emerald-600' : 'from-red-500 to-red-600'
    },
    {
      title: t('dashboard.inventory'),
      value: stats.inventoryValue,
      icon: Package,
      color: 'from-orange-500 to-orange-600'
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
          <div className="w-16 h-16 border-4 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-gray-600">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="bg-gradient-to-r from-teal-600 to-teal-700 rounded-xl shadow-lg p-8 text-white">
        <h2 className="text-3xl font-bold mb-2">
          {isRTL ? 'مرحباً بك في BLOOV' : 'Welcome to BLOOV'}
        </h2>
        <p className="text-teal-100 text-lg">
          {isRTL ? 'نظام محاسبي متكامل صُمم خصيصاً لبلوف' : 'A comprehensive accounting system designed specifically for BLOOV'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.title} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-3 rounded-lg bg-gradient-to-br ${card.color}`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                </div>
                <h3 className="text-sm font-medium text-gray-500 mb-1">{card.title}</h3>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(card.value)} <span className="text-sm font-normal text-gray-400">{isRTL ? 'ر.س' : 'SAR'}</span>
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-teal-600" />
            {t('dashboard.partners')}
          </h3>
          {partners.length === 0 ? (
            <p className="text-center py-4 text-gray-400">{isRTL ? 'لا يوجد شركاء' : 'No partners'}</p>
          ) : (
            <div className="space-y-4">
              {partners.map((partner) => (
                <div key={partner.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <h4 className="font-semibold text-gray-900">
                      {language === 'ar' ? partner.name_ar : partner.name}
                    </h4>
                    <p className="text-sm text-gray-500">{partner.share_percentage}% {isRTL ? 'حصة' : 'Share'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-teal-600">
                      {formatCurrency((stats.operatingNet * partner.share_percentage) / 100)}
                    </p>
                    <p className="text-xs text-gray-500">{isRTL ? 'الفترة الحالية' : 'Current Period'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-teal-600" />
            {t('dashboard.recentSales')}
          </h3>
          {recentSales.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <ShoppingCart className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p>{isRTL ? 'لا توجد مبيعات بعد' : 'No recent sales'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentSales.map((sale) => (
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
