import { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Store,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Package,
  DollarSign,
  User,
  Phone,
  MapPin,
  Link2,
  Key,
  AlertCircle,
  Eye,
  X,
} from 'lucide-react';

interface SallaOrder {
  id: string;
  salla_order_id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  status: string;
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  payment_method: string | null;
  payment_status: string;
  shipping_address: string | null;
  shipping_city: string | null;
  notes: string | null;
  order_date: string;
  synced: boolean;
  synced_at: string | null;
  created_at: string;
}

interface SallaOrderItem {
  id: string;
  product_name: string;
  product_name_ar: string | null;
  quantity: number;
  unit_price: number;
  total: number;
}

export function SallaOrders() {
  const { isRTL } = useLanguage();
  const { profile } = useAuth();
  const [orders, setOrders] = useState<SallaOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'orders' | 'settings'>('orders');
  const [selectedOrder, setSelectedOrder] = useState<SallaOrder | null>(null);
  const [orderItems, setOrderItems] = useState<SallaOrderItem[]>([]);
  const [showOrderDetails, setShowOrderDetails] = useState(false);
  const [sallaApiKey, setSallaApiKey] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterSync, setFilterSync] = useState<string>('all');

  useEffect(() => {
    loadOrders();
    loadSettings();
    generateWebhookUrl();
  }, []);

  const generateWebhookUrl = () => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (supabaseUrl) {
      setWebhookUrl(`${supabaseUrl}/functions/v1/salla-webhook`);
    }
  };

  const loadOrders = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('salla_orders')
        .select('*')
        .order('order_date', { ascending: false });

      if (error) throw error;
      setOrders((data || []) as any[]);
    } catch (error) {
      console.error('Error loading orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('salla_api_key')
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading settings:', error);
      } else if (data) {
        setSallaApiKey(data.salla_api_key || '');
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      const { error } = await supabase
        .from('settings')
        .upsert({ id: 1, salla_api_key: sallaApiKey });

      if (error) throw error;
      alert(isRTL ? 'تم حفظ الإعدادات بنجاح' : 'Settings saved successfully');
    } catch (error) {
      console.error('Error saving settings:', error);
      alert(isRTL ? 'فشل حفظ الإعدادات' : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const viewOrderDetails = async (order: SallaOrder) => {
    try {
      const { data, error } = await supabase
        .from('salla_order_items')
        .select('*')
        .eq('salla_order_id', order.id);

      if (error) throw error;
      setOrderItems((data || []) as any[]);
      setSelectedOrder(order);
      setShowOrderDetails(true);
    } catch (error) {
      console.error('Error loading order items:', error);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ar-SA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'processing':
        return 'bg-blue-100 text-blue-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      case 'refunded':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    const statusMap: Record<string, { ar: string; en: string }> = {
      pending: { ar: 'قيد الانتظار', en: 'Pending' },
      processing: { ar: 'قيد المعالجة', en: 'Processing' },
      completed: { ar: 'مكتمل', en: 'Completed' },
      cancelled: { ar: 'ملغي', en: 'Cancelled' },
      refunded: { ar: 'مسترجع', en: 'Refunded' },
    };
    return isRTL ? statusMap[status]?.ar || status : statusMap[status]?.en || status;
  };

  const getPaymentStatusText = (status: string) => {
    const statusMap: Record<string, { ar: string; en: string }> = {
      paid: { ar: 'مدفوع', en: 'Paid' },
      unpaid: { ar: 'غير مدفوع', en: 'Unpaid' },
      refunded: { ar: 'مسترجع', en: 'Refunded' },
    };
    return isRTL ? statusMap[status]?.ar || status : statusMap[status]?.en || status;
  };

  const filteredOrders = orders.filter((order) => {
    if (filterStatus !== 'all' && order.status !== filterStatus) return false;
    if (filterSync === 'synced' && !order.synced) return false;
    if (filterSync === 'unsynced' && order.synced) return false;
    return true;
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert(isRTL ? 'تم النسخ إلى الحافظة' : 'Copied to clipboard');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 text-teal-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">{isRTL ? 'جاري التحميل...' : 'Loading...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-6 ${isRTL ? 'rtl' : 'ltr'}`}>
      <div className="bg-white rounded-lg shadow-lg">
        <div className="border-b border-gray-200 bg-gradient-to-r from-teal-600 to-teal-700 text-white rounded-t-lg">
          <div className="flex items-center justify-between p-6">
            <div className="flex items-center gap-3">
              <Store className="w-8 h-8" />
              <div>
                <h1 className="text-2xl font-bold">
                  {isRTL ? 'طلبات سلة' : 'Salla Orders'}
                </h1>
                <p className="text-teal-100 text-sm mt-1">
                  {isRTL
                    ? 'إدارة ومتابعة طلبات المتجر الإلكتروني'
                    : 'Manage and track online store orders'}
                </p>
              </div>
            </div>
            <button
              onClick={loadOrders}
              className="flex items-center gap-2 px-4 py-2 bg-white text-teal-700 rounded-lg hover:bg-teal-50 transition"
            >
              <RefreshCw className="w-4 h-4" />
              {isRTL ? 'تحديث' : 'Refresh'}
            </button>
          </div>

          <div className="flex border-t border-teal-500">
            <button
              onClick={() => setActiveTab('orders')}
              className={`flex-1 px-6 py-3 font-medium transition ${
                activeTab === 'orders'
                  ? 'bg-white text-teal-700'
                  : 'text-white hover:bg-teal-500'
              }`}
            >
              {isRTL ? 'الطلبات' : 'Orders'}
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`flex-1 px-6 py-3 font-medium transition ${
                activeTab === 'settings'
                  ? 'bg-white text-teal-700'
                  : 'text-white hover:bg-teal-500'
              }`}
            >
              {isRTL ? 'الربط التقني' : 'Integration'}
            </button>
          </div>
        </div>

        {activeTab === 'orders' ? (
          <div className="p-6">
            <div className="flex flex-wrap gap-4 mb-6">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {isRTL ? 'حالة الطلب' : 'Order Status'}
                </label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500"
                >
                  <option value="all">{isRTL ? 'الكل' : 'All'}</option>
                  <option value="pending">{isRTL ? 'قيد الانتظار' : 'Pending'}</option>
                  <option value="processing">{isRTL ? 'قيد المعالجة' : 'Processing'}</option>
                  <option value="completed">{isRTL ? 'مكتمل' : 'Completed'}</option>
                  <option value="cancelled">{isRTL ? 'ملغي' : 'Cancelled'}</option>
                  <option value="refunded">{isRTL ? 'مسترجع' : 'Refunded'}</option>
                </select>
              </div>

              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {isRTL ? 'حالة المزامنة' : 'Sync Status'}
                </label>
                <select
                  value={filterSync}
                  onChange={(e) => setFilterSync(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500"
                >
                  <option value="all">{isRTL ? 'الكل' : 'All'}</option>
                  <option value="synced">{isRTL ? 'متزامن' : 'Synced'}</option>
                  <option value="unsynced">{isRTL ? 'غير متزامن' : 'Not Synced'}</option>
                </select>
              </div>
            </div>

            {filteredOrders.length === 0 ? (
              <div className="text-center py-12">
                <Store className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 text-lg">
                  {isRTL ? 'لا توجد طلبات' : 'No orders found'}
                </p>
                <p className="text-gray-400 text-sm mt-2">
                  {isRTL
                    ? 'سيتم عرض الطلبات هنا عند استلامها من متجر سلة'
                    : 'Orders will appear here when received from Salla store'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                        {isRTL ? 'رقم الطلب' : 'Order #'}
                      </th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                        {isRTL ? 'العميل' : 'Customer'}
                      </th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                        {isRTL ? 'التاريخ' : 'Date'}
                      </th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                        {isRTL ? 'المبلغ' : 'Amount'}
                      </th>
                      <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">
                        {isRTL ? 'الحالة' : 'Status'}
                      </th>
                      <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">
                        {isRTL ? 'المزامنة' : 'Sync'}
                      </th>
                      <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">
                        {isRTL ? 'إجراءات' : 'Actions'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{order.order_number}</div>
                          <div className="text-xs text-gray-500">{order.salla_order_id}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{order.customer_name}</div>
                          {order.customer_phone && (
                            <div className="text-xs text-gray-500">{order.customer_phone}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {new Date(order.order_date).toLocaleDateString(isRTL ? 'ar-SA' : 'en-US')}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-gray-900">
                            {formatCurrency(order.total)} {isRTL ? 'ر.س' : 'SAR'}
                          </div>
                          <div className="text-xs text-gray-500">
                            {getPaymentStatusText(order.payment_status)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(
                              order.status
                            )}`}
                          >
                            {getStatusText(order.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {order.synced ? (
                            <CheckCircle className="w-5 h-5 text-green-600 mx-auto" />
                          ) : (
                            <Clock className="w-5 h-5 text-yellow-600 mx-auto" />
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => viewOrderDetails(order)}
                            className="inline-flex items-center gap-1 px-3 py-1 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition text-sm"
                          >
                            <Eye className="w-4 h-4" />
                            {isRTL ? 'عرض' : 'View'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div className="p-6">
            <div className="max-w-3xl">
              <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-blue-900 mb-2">
                      {isRTL ? 'خطوات الربط مع متجر سلة' : 'Salla Integration Steps'}
                    </h3>
                    <ol className={`text-sm text-blue-800 space-y-2 ${isRTL ? 'list-arabic-indic' : 'list-decimal'} ${isRTL ? 'pr-5' : 'pl-5'}`}>
                      <li>
                        {isRTL
                          ? 'انسخ رابط الـ Webhook أدناه'
                          : 'Copy the Webhook URL below'}
                      </li>
                      <li>
                        {isRTL
                          ? 'سجل دخولك إلى لوحة تحكم متجر سلة'
                          : 'Log in to your Salla store dashboard'}
                      </li>
                      <li>
                        {isRTL
                          ? 'انتقل إلى الإعدادات > التطبيقات والإضافات > Webhooks'
                          : 'Go to Settings > Apps & Plugins > Webhooks'}
                      </li>
                      <li>
                        {isRTL
                          ? 'أضف Webhook جديد والصق الرابط واختر حدث "Order Created"'
                          : 'Add new Webhook, paste the URL and select "Order Created" event'}
                      </li>
                      <li>
                        {isRTL
                          ? 'احصل على API Token من لوحة تحكم سلة وأدخله أدناه'
                          : 'Get your API Token from Salla dashboard and enter it below'}
                      </li>
                    </ol>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                    <Link2 className="w-5 h-5 text-teal-600" />
                    {isRTL ? 'رابط الـ Webhook' : 'Webhook URL'}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={webhookUrl}
                      readOnly
                      className="flex-1 px-4 py-3 border rounded-lg bg-gray-50 text-gray-700 font-mono text-sm"
                    />
                    <button
                      onClick={() => copyToClipboard(webhookUrl)}
                      className="px-4 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition"
                    >
                      {isRTL ? 'نسخ' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {isRTL
                      ? 'استخدم هذا الرابط في إعدادات Webhooks بمتجر سلة'
                      : 'Use this URL in your Salla store Webhooks settings'}
                  </p>
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                    <Key className="w-5 h-5 text-teal-600" />
                    {isRTL ? 'مفتاح API من سلة' : 'Salla API Key'}
                  </label>
                  <input
                    type="password"
                    value={sallaApiKey}
                    onChange={(e) => setSallaApiKey(e.target.value)}
                    placeholder={isRTL ? 'أدخل مفتاح API...' : 'Enter API Key...'}
                    className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-teal-500"
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    {isRTL
                      ? 'يمكنك الحصول على المفتاح من لوحة تحكم سلة > المطورين > API Tokens'
                      : 'You can get the key from Salla Dashboard > Developers > API Tokens'}
                  </p>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={saveSettings}
                    disabled={saving || !sallaApiKey.trim()}
                    className="flex items-center gap-2 px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {saving ? (
                      <>
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        {isRTL ? 'جاري الحفظ...' : 'Saving...'}
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-5 h-5" />
                        {isRTL ? 'حفظ الإعدادات' : 'Save Settings'}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {showOrderDetails && selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-teal-600 text-white px-6 py-4 flex items-center justify-between rounded-t-lg">
              <div>
                <h2 className="text-xl font-bold">
                  {isRTL ? 'تفاصيل الطلب' : 'Order Details'}
                </h2>
                <p className="text-teal-100 text-sm">{selectedOrder.order_number}</p>
              </div>
              <button
                onClick={() => setShowOrderDetails(false)}
                className="p-2 hover:bg-teal-700 rounded-lg transition"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <User className="w-5 h-5 text-teal-600" />
                    {isRTL ? 'معلومات العميل' : 'Customer Information'}
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-gray-600">{isRTL ? 'الاسم:' : 'Name:'}</span>
                      <span className="font-medium text-gray-900 mr-2">{selectedOrder.customer_name}</span>
                    </div>
                    {selectedOrder.customer_phone && (
                      <div>
                        <span className="text-gray-600">{isRTL ? 'الجوال:' : 'Phone:'}</span>
                        <span className="font-medium text-gray-900 mr-2">{selectedOrder.customer_phone}</span>
                      </div>
                    )}
                    {selectedOrder.customer_email && (
                      <div>
                        <span className="text-gray-600">{isRTL ? 'البريد:' : 'Email:'}</span>
                        <span className="font-medium text-gray-900 mr-2">{selectedOrder.customer_email}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-teal-600" />
                    {isRTL ? 'معلومات الشحن' : 'Shipping Information'}
                  </h3>
                  <div className="space-y-2 text-sm">
                    {selectedOrder.shipping_city && (
                      <div>
                        <span className="text-gray-600">{isRTL ? 'المدينة:' : 'City:'}</span>
                        <span className="font-medium text-gray-900 mr-2">{selectedOrder.shipping_city}</span>
                      </div>
                    )}
                    {selectedOrder.shipping_address && (
                      <div>
                        <span className="text-gray-600">{isRTL ? 'العنوان:' : 'Address:'}</span>
                        <p className="font-medium text-gray-900 mt-1">{selectedOrder.shipping_address}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <Package className="w-5 h-5 text-teal-600" />
                  {isRTL ? 'منتجات الطلب' : 'Order Items'}
                </h3>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-right text-sm font-semibold text-gray-700">
                          {isRTL ? 'المنتج' : 'Product'}
                        </th>
                        <th className="px-4 py-2 text-center text-sm font-semibold text-gray-700">
                          {isRTL ? 'الكمية' : 'Quantity'}
                        </th>
                        <th className="px-4 py-2 text-right text-sm font-semibold text-gray-700">
                          {isRTL ? 'السعر' : 'Price'}
                        </th>
                        <th className="px-4 py-2 text-right text-sm font-semibold text-gray-700">
                          {isRTL ? 'المجموع' : 'Total'}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {orderItems.map((item) => (
                        <tr key={item.id}>
                          <td className="px-4 py-3">
                            {isRTL && item.product_name_ar ? item.product_name_ar : item.product_name}
                          </td>
                          <td className="px-4 py-3 text-center">{item.quantity}</td>
                          <td className="px-4 py-3 text-right">
                            {formatCurrency(item.unit_price)} {isRTL ? 'ر.س' : 'SAR'}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold">
                            {formatCurrency(item.total)} {isRTL ? 'ر.س' : 'SAR'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-teal-600" />
                  {isRTL ? 'ملخص المبالغ' : 'Payment Summary'}
                </h3>
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">{isRTL ? 'المجموع الفرعي:' : 'Subtotal:'}</span>
                    <span className="font-medium">{formatCurrency(selectedOrder.subtotal)} {isRTL ? 'ر.س' : 'SAR'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">{isRTL ? 'الضريبة:' : 'Tax:'}</span>
                    <span className="font-medium">{formatCurrency(selectedOrder.tax)} {isRTL ? 'ر.س' : 'SAR'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">{isRTL ? 'الشحن:' : 'Shipping:'}</span>
                    <span className="font-medium">{formatCurrency(selectedOrder.shipping)} {isRTL ? 'ر.س' : 'SAR'}</span>
                  </div>
                  <div className="border-t pt-2 flex justify-between">
                    <span className="font-semibold text-gray-900">{isRTL ? 'الإجمالي:' : 'Total:'}</span>
                    <span className="font-bold text-teal-600 text-lg">
                      {formatCurrency(selectedOrder.total)} {isRTL ? 'ر.س' : 'SAR'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">{isRTL ? 'طريقة الدفع:' : 'Payment Method:'}</span>
                    <span className="font-medium">{selectedOrder.payment_method || '-'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">{isRTL ? 'حالة الدفع:' : 'Payment Status:'}</span>
                    <span className="font-medium">{getPaymentStatusText(selectedOrder.payment_status)}</span>
                  </div>
                </div>
              </div>

              {selectedOrder.notes && (
                <div>
                  <h3 className="font-semibold text-gray-700 mb-2">{isRTL ? 'ملاحظات' : 'Notes'}</h3>
                  <p className="text-sm text-gray-600 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    {selectedOrder.notes}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
