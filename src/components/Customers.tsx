import { useEffect, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useCanEdit } from '../hooks/useCanEdit';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Users, Plus, Search, Edit, Trash2, X, Phone, Mail, MapPin, Download, MessageSquare, Send, CheckCircle, AlertCircle, Loader2, Crown, Star, UserX, Filter, TrendingUp, Calendar, Award, StickyNote, ArrowUpDown, ArrowUp, ArrowDown, Trophy, Zap } from 'lucide-react';

interface Customer {
  id: string;
  code: string;
  name: string;
  name_ar: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  address_ar: string | null;
  city: string | null;
  city_ar: string | null;
  notes: string | null;
  notes_ar: string | null;
  credit_limit: number;
  current_balance: number;
  is_active: boolean;
  created_at: string;
  total_spend: number;
  total_orders: number;
  loyalty_points: number;
  valid_loyalty_points: number;
  last_purchase_date: string | null;
  preference_note: string | null;
  tier: 'vip' | 'frequent' | 'regular' | 'inactive';
  is_top_spender: boolean;
  is_most_frequent: boolean;
}

const emptyForm = {
  code: '',
  name: '',
  name_ar: '',
  email: '',
  phone: '',
  address: '',
  address_ar: '',
  city: '',
  city_ar: '',
  notes: '',
  notes_ar: '',
  credit_limit: 0,
  preference_note: '',
};

export function Customers() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const canEdit = useCanEdit();
  const isRTL = language === 'ar';
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [selectedCustomers, setSelectedCustomers] = useState<Set<string>>(new Set());
  const [showSmsModal, setShowSmsModal] = useState(false);
  const [smsMessage, setSmsMessage] = useState('');
  const [sendingSms, setSendingSms] = useState(false);
  const [smsResult, setSmsResult] = useState<{ success: number; failed: number; total: number; errors: string[] } | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filterTier, setFilterTier] = useState<string>('all');
  const [filterMinSpend, setFilterMinSpend] = useState<string>('');
  const [filterMaxSpend, setFilterMaxSpend] = useState<string>('');
  const [filterDaysInactive, setFilterDaysInactive] = useState<string>('');
  const [sortBy, setSortBy] = useState<'spend' | 'orders' | 'none'>('none');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (data) setCustomers(data);
    } catch (err) {
      console.error('Error loading customers:', err);
    } finally {
      setLoading(false);
    }
  };

  const generateCode = () => {
    const num = customers.length + 1;
    return `CUST-${String(num).padStart(4, '0')}`;
  };

  const openAddModal = () => {
    setEditingCustomer(null);
    setFormData({ ...emptyForm, code: generateCode() });
    setError('');
    setShowModal(true);
  };

  const openEditModal = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({
      code: customer.code,
      name: customer.name,
      name_ar: customer.name_ar || '',
      email: customer.email || '',
      phone: customer.phone || '',
      address: customer.address || '',
      address_ar: customer.address_ar || '',
      city: customer.city || '',
      city_ar: customer.city_ar || '',
      notes: customer.notes || '',
      notes_ar: customer.notes_ar || '',
      credit_limit: customer.credit_limit,
      preference_note: customer.preference_note || '',
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
        code: formData.code,
        name: formData.name,
        name_ar: formData.name_ar || null,
        email: formData.email || null,
        phone: formData.phone || null,
        address: formData.address || null,
        address_ar: formData.address_ar || null,
        city: formData.city || null,
        city_ar: formData.city_ar || null,
        notes: formData.notes || null,
        notes_ar: formData.notes_ar || null,
        credit_limit: formData.credit_limit,
        preference_note: formData.preference_note || null,
        created_by: user?.id,
      };

      if (editingCustomer) {
        const { error } = await supabase
          .from('customers')
          .update(payload)
          .eq('id', editingCustomer.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('customers')
          .insert(payload);
        if (error) throw error;
      }

      setShowModal(false);
      loadCustomers();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('customers').update({ is_active: false }).eq('id', id);
      if (error) throw error;
      setDeleteConfirm(null);
      loadCustomers();
    } catch (err) {
      console.error('Error deleting customer:', err);
    }
  };

  const getTierBadge = (tier: string) => {
    switch (tier) {
      case 'vip':
        return {
          icon: Crown,
          color: 'bg-gradient-to-r from-yellow-400 to-amber-500',
          textColor: 'text-white',
          label: isRTL ? 'VIP' : 'VIP',
        };
      case 'frequent':
        return {
          icon: Star,
          color: 'bg-gradient-to-r from-blue-500 to-blue-600',
          textColor: 'text-white',
          label: isRTL ? 'متكرر' : 'Frequent',
        };
      case 'regular':
        return {
          icon: Users,
          color: 'bg-gradient-to-r from-green-400 to-green-500',
          textColor: 'text-white',
          label: isRTL ? 'عادي' : 'Regular',
        };
      default:
        return {
          icon: UserX,
          color: 'bg-gradient-to-r from-gray-400 to-gray-500',
          textColor: 'text-white',
          label: isRTL ? 'غير نشط' : 'Inactive',
        };
    }
  };

  const handleSort = (type: 'spend' | 'orders') => {
    if (sortBy === type) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(type);
      setSortDirection('desc');
    }
  };

  const filtered = customers.filter((c) => {
    if (!c.is_active) return false;

    const s = searchTerm.toLowerCase();
    const matchesSearch =
      c.name.toLowerCase().includes(s) ||
      (c.name_ar && c.name_ar.includes(searchTerm)) ||
      c.code.toLowerCase().includes(s) ||
      (c.phone && c.phone.includes(s)) ||
      (c.email && c.email.toLowerCase().includes(s));

    if (!matchesSearch) return false;

    if (filterTier !== 'all' && c.tier !== filterTier) return false;

    if (filterMinSpend && c.total_spend < parseFloat(filterMinSpend)) return false;
    if (filterMaxSpend && c.total_spend > parseFloat(filterMaxSpend)) return false;

    if (filterDaysInactive && c.last_purchase_date) {
      const daysSinceLastPurchase = Math.floor(
        (new Date().getTime() - new Date(c.last_purchase_date).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSinceLastPurchase < parseInt(filterDaysInactive)) return false;
    } else if (filterDaysInactive && !c.last_purchase_date) {
      return true;
    }

    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'spend') {
      const diff = (a.total_spend || 0) - (b.total_spend || 0);
      return sortDirection === 'asc' ? diff : -diff;
    } else if (sortBy === 'orders') {
      const diff = (a.total_orders || 0) - (b.total_orders || 0);
      return sortDirection === 'asc' ? diff : -diff;
    }
    return 0;
  });

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat(isRTL ? 'ar-SA' : 'en-US', {
      style: 'decimal',
      minimumFractionDigits: 2,
    }).format(amount);

  const exportToExcel = () => {
    const activeCustomers = customers.filter((c) => c.is_active);
    const headers = ['Code', 'Name', 'Name (Arabic)', 'Email', 'Phone', 'City', 'Credit Limit', 'Balance'];
    const rows = activeCustomers.map((c) => [
      c.code,
      c.name,
      c.name_ar || '',
      c.email || '',
      c.phone || '',
      c.city || c.city_ar || '',
      c.credit_limit.toString(),
      c.current_balance.toString(),
    ]);

    const BOM = '\uFEFF';
    const csvContent = BOM + [headers.join(','), ...rows.map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `BLOOV_Customers_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const toggleCustomerSelection = (customerId: string) => {
    const newSelection = new Set(selectedCustomers);
    if (newSelection.has(customerId)) {
      newSelection.delete(customerId);
    } else {
      newSelection.add(customerId);
    }
    setSelectedCustomers(newSelection);
  };

  const toggleSelectAll = () => {
    const customersWithPhone = sorted.filter((c) => c.phone && c.phone.trim().length > 0);
    if (selectedCustomers.size === customersWithPhone.length) {
      setSelectedCustomers(new Set());
    } else {
      setSelectedCustomers(new Set(customersWithPhone.map((c) => c.id)));
    }
  };

  const openSmsModal = () => {
    if (selectedCustomers.size === 0) {
      alert(isRTL ? 'الرجاء تحديد عميل واحد على الأقل' : 'Please select at least one customer');
      return;
    }
    setSmsResult(null);
    setShowSmsModal(true);
  };

  const sendBulkSms = async () => {
    if (!smsMessage.trim()) {
      alert(isRTL ? 'الرجاء كتابة الرسالة' : 'Please enter a message');
      return;
    }

    setSendingSms(true);
    setSmsResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const selectedCustomersList = customers.filter((c) => selectedCustomers.has(c.id) && c.phone);

      const recipients = selectedCustomersList.map((c) => {
        const customerName = isRTL ? c.name_ar || c.name : c.name;
        const personalizedMessage = smsMessage
          .replace(/\{customer_name\}/gi, customerName)
          .replace(/\{name\}/gi, customerName);

        return {
          phone: c.phone!,
          name: customerName,
          customerId: c.id,
          message: personalizedMessage,
        };
      });

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-sms`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          recipients,
          message: smsMessage,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setSmsResult(result.results);
      } else {
        throw new Error(result.error || 'Failed to send SMS');
      }
    } catch (err: any) {
      alert(isRTL ? `خطأ: ${err.message}` : `Error: ${err.message}`);
    } finally {
      setSendingSms(false);
    }
  };

  const closeSmsModal = () => {
    setShowSmsModal(false);
    setSmsMessage('');
    setSmsResult(null);
    setSelectedCustomers(new Set());
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('nav.customers')}</h2>
          <p className="text-gray-500 mt-1">{isRTL ? 'إدارة بيانات العملاء' : 'Manage customer information'}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={exportToExcel}
            className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2.5 rounded-lg hover:bg-gray-200 transition font-medium"
          >
            <Download className="w-5 h-5" />
            {isRTL ? 'تصدير Excel' : 'Export Excel'}
          </button>
          {selectedCustomers.size > 0 && (
            <button
              onClick={openSmsModal}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 transition font-medium"
            >
              <MessageSquare className="w-5 h-5" />
              {isRTL ? `إرسال رسالة (${selectedCustomers.size})` : `Send SMS (${selectedCustomers.size})`}
            </button>
          )}
          {canEdit && (
            <button
              onClick={openAddModal}
              className="flex items-center gap-2 bg-teal-600 text-white px-4 py-2.5 rounded-lg hover:bg-teal-700 transition font-medium"
            >
              <Plus className="w-5 h-5" />
              {isRTL ? 'إضافة عميل' : 'Add Customer'}
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            {isRTL ? `${sorted.length} عميل` : `${sorted.length} Customers`}
          </h3>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-gray-50 rounded-lg p-1">
              <button
                onClick={() => handleSort('spend')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition text-sm font-medium ${
                  sortBy === 'spend'
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'text-gray-600 hover:bg-white hover:text-gray-900'
                }`}
              >
                <TrendingUp className="w-4 h-4" />
                {isRTL ? 'الإنفاق' : 'Spend'}
                {sortBy === 'spend' && (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
              </button>
              <button
                onClick={() => handleSort('orders')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition text-sm font-medium ${
                  sortBy === 'orders'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-600 hover:bg-white hover:text-gray-900'
                }`}
              >
                <Calendar className="w-4 h-4" />
                {isRTL ? 'الطلبات' : 'Orders'}
                {sortBy === 'orders' && (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
              </button>
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition font-medium ${
                showFilters ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Filter className="w-4 h-4" />
              {isRTL ? 'الفلاتر الذكية' : 'Smart Filters'}
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="bg-gradient-to-r from-gray-50 to-blue-50 rounded-lg p-4 mb-6 border border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isRTL ? 'الفئة' : 'Tier'}
                </label>
                <select
                  value={filterTier}
                  onChange={(e) => setFilterTier(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                >
                  <option value="all">{isRTL ? 'الكل' : 'All'}</option>
                  <option value="vip">VIP</option>
                  <option value="frequent">{isRTL ? 'متكرر' : 'Frequent'}</option>
                  <option value="regular">{isRTL ? 'عادي' : 'Regular'}</option>
                  <option value="inactive">{isRTL ? 'غير نشط' : 'Inactive'}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isRTL ? 'الحد الأدنى للإنفاق (ريال)' : 'Min Spend (SAR)'}
                </label>
                <input
                  type="number"
                  value={filterMinSpend}
                  onChange={(e) => setFilterMinSpend(e.target.value)}
                  placeholder={isRTL ? 'مثال: 1000' : 'e.g., 1000'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isRTL ? 'الحد الأقصى للإنفاق (ريال)' : 'Max Spend (SAR)'}
                </label>
                <input
                  type="number"
                  value={filterMaxSpend}
                  onChange={(e) => setFilterMaxSpend(e.target.value)}
                  placeholder={isRTL ? 'مثال: 10000' : 'e.g., 10000'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isRTL ? 'غير نشط منذ (أيام)' : 'Inactive Since (Days)'}
                </label>
                <input
                  type="number"
                  value={filterDaysInactive}
                  onChange={(e) => setFilterDaysInactive(e.target.value)}
                  placeholder={isRTL ? 'مثال: 60' : 'e.g., 60'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-3">
              <button
                onClick={() => {
                  setFilterTier('all');
                  setFilterMinSpend('');
                  setFilterMaxSpend('');
                  setFilterDaysInactive('');
                }}
                className="px-4 py-1.5 text-sm bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
              >
                {isRTL ? 'إعادة تعيين' : 'Reset Filters'}
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-4 mb-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedCustomers.size > 0 && selectedCustomers.size === sorted.filter((c) => c.phone && c.phone.trim().length > 0).length}
              onChange={toggleSelectAll}
              className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-600 font-medium whitespace-nowrap">
              {isRTL ? 'تحديد الكل' : 'Select All'}
            </span>
          </label>
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
        </div>

        {sorted.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Users className="w-16 h-16 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">{isRTL ? 'لا يوجد عملاء' : 'No customers found'}</p>
            <p className="text-sm mt-1">{isRTL ? 'أضف عميل جديد للبدء' : 'Add a new customer to get started'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sorted.map((customer) => {
              const tierBadge = getTierBadge(customer.tier);
              const TierIcon = tierBadge.icon;

              return (
                <div key={customer.id} className={`border rounded-xl p-5 hover:shadow-lg transition group ${selectedCustomers.has(customer.id) ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-start gap-3 flex-1">
                      {customer.phone && customer.phone.trim().length > 0 && (
                        <input
                          type="checkbox"
                          checked={selectedCustomers.has(customer.id)}
                          onChange={() => toggleCustomerSelection(customer.id)}
                          className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500 mt-0.5"
                        />
                      )}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="font-bold text-gray-900">
                            {isRTL ? customer.name_ar || customer.name : customer.name}
                          </h3>
                          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${tierBadge.color} ${tierBadge.textColor} text-xs font-semibold`}>
                            <TierIcon className="w-3 h-3" />
                            <span>{tierBadge.label}</span>
                          </div>
                          {customer.is_top_spender && (
                            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-semibold shadow-sm">
                              <Trophy className="w-3 h-3" />
                              <span>{isRTL ? 'أعلى إنفاق' : 'Top Spender'}</span>
                            </div>
                          )}
                          {customer.is_most_frequent && (
                            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-orange-500 to-red-500 text-white text-xs font-semibold shadow-sm">
                              <Zap className="w-3 h-3" />
                              <span>{isRTL ? 'الأكثر تكراراً' : 'Most Frequent'}</span>
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 font-mono">{customer.code}</p>
                      </div>
                    </div>
                    {canEdit && (
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                        <button
                          onClick={() => openEditModal(customer)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(customer.id)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="bg-gradient-to-r from-teal-50 to-blue-50 rounded-lg p-3 mb-3 border border-teal-100">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <div className="flex items-center justify-center gap-1 mb-0.5">
                          <TrendingUp className="w-3 h-3 text-teal-600" />
                          <p className="text-xs text-gray-600 font-medium">{isRTL ? 'الإنفاق' : 'Spend'}</p>
                        </div>
                        <p className="text-sm font-bold text-teal-700">{formatCurrency(customer.total_spend || 0)}</p>
                      </div>
                      <div>
                        <div className="flex items-center justify-center gap-1 mb-0.5">
                          <Calendar className="w-3 h-3 text-blue-600" />
                          <p className="text-xs text-gray-600 font-medium">{isRTL ? 'الطلبات' : 'Orders'}</p>
                        </div>
                        <p className="text-sm font-bold text-blue-700">{customer.total_orders || 0}</p>
                      </div>
                      <div>
                        <div className="flex items-center justify-center gap-1 mb-0.5">
                          <Award className="w-3 h-3 text-amber-600" />
                          <p className="text-xs text-gray-600 font-medium">{isRTL ? 'النقاط الصالحة' : 'Valid Points'}</p>
                        </div>
                        <p className="text-sm font-bold text-amber-700">{customer.valid_loyalty_points || 0}</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-sm text-gray-600 mb-3">
                    {customer.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-gray-400" />
                        <span dir="ltr">{customer.phone}</span>
                      </div>
                    )}
                    {customer.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-gray-400" />
                        <span className="truncate">{customer.email}</span>
                      </div>
                    )}
                    {(customer.city || customer.city_ar) && (
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-gray-400" />
                        <span>{isRTL ? customer.city_ar || customer.city : customer.city}</span>
                      </div>
                    )}
                    {customer.preference_note && (
                      <div className="flex items-start gap-2 mt-2 p-2 bg-amber-50 rounded-lg border border-amber-200">
                        <StickyNote className="w-3.5 h-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
                        <span className="text-xs text-amber-800 italic">{customer.preference_note}</span>
                      </div>
                    )}
                  </div>

                  {customer.last_purchase_date && (
                    <div className="text-xs text-gray-500 mb-2">
                      {isRTL ? 'آخر شراء: ' : 'Last Purchase: '}
                      {new Date(customer.last_purchase_date).toLocaleDateString(isRTL ? 'ar-SA' : 'en-US')}
                    </div>
                  )}

                  <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-400">{isRTL ? 'الرصيد' : 'Balance'}</p>
                      <p className={`font-bold ${customer.current_balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {formatCurrency(customer.current_balance)} {isRTL ? 'ر.س' : 'SAR'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400">{isRTL ? 'حد الائتمان' : 'Credit Limit'}</p>
                      <p className="font-medium text-gray-700">{formatCurrency(customer.credit_limit)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 text-center">
            <Trash2 className="w-12 h-12 text-red-500 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              {isRTL ? 'تأكيد الحذف' : 'Confirm Delete'}
            </h3>
            <p className="text-gray-500 mb-6 text-sm">
              {isRTL ? 'هل أنت متأكد من حذف هذا العميل؟' : 'Are you sure you want to delete this customer?'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 bg-red-600 text-white py-2.5 rounded-lg hover:bg-red-700 transition font-medium"
              >
                {isRTL ? 'حذف' : 'Delete'}
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-lg hover:bg-gray-200 transition font-medium"
              >
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
                {editingCustomer
                  ? (isRTL ? 'تعديل العميل' : 'Edit Customer')
                  : (isRTL ? 'إضافة عميل جديد' : 'Add New Customer')}
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isRTL ? 'الكود' : 'Code'}
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    disabled={!canEdit}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent font-mono"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isRTL ? 'حد الائتمان' : 'Credit Limit'}
                  </label>
                  <input
                    type="number"
                    value={formData.credit_limit}
                    onChange={(e) => setFormData({ ...formData, credit_limit: parseFloat(e.target.value) || 0 })}
                    disabled={!canEdit}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isRTL ? 'الاسم (إنجليزي)' : 'Name (English)'}
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    disabled={!canEdit}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isRTL ? 'الاسم (عربي)' : 'Name (Arabic)'}
                  </label>
                  <input
                    type="text"
                    value={formData.name_ar}
                    onChange={(e) => setFormData({ ...formData, name_ar: e.target.value })}
                    disabled={!canEdit}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    dir="rtl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isRTL ? 'البريد الإلكتروني' : 'Email'}
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    disabled={!canEdit}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isRTL ? 'الهاتف' : 'Phone'}
                  </label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    disabled={!canEdit}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isRTL ? 'المدينة (إنجليزي)' : 'City (English)'}
                  </label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    disabled={!canEdit}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isRTL ? 'المدينة (عربي)' : 'City (Arabic)'}
                  </label>
                  <input
                    type="text"
                    value={formData.city_ar}
                    onChange={(e) => setFormData({ ...formData, city_ar: e.target.value })}
                    disabled={!canEdit}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    dir="rtl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isRTL ? 'العنوان (إنجليزي)' : 'Address (English)'}
                  </label>
                  <textarea
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    disabled={!canEdit}
                    rows={2}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isRTL ? 'العنوان (عربي)' : 'Address (Arabic)'}
                  </label>
                  <textarea
                    value={formData.address_ar}
                    onChange={(e) => setFormData({ ...formData, address_ar: e.target.value })}
                    disabled={!canEdit}
                    rows={2}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
                    dir="rtl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isRTL ? 'ملاحظات' : 'Notes'}
                </label>
                <textarea
                  value={isRTL ? formData.notes_ar : formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, [isRTL ? 'notes_ar' : 'notes']: e.target.value })
                  }
                  disabled={!canEdit}
                  rows={2}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
                />
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <StickyNote className="w-4 h-4 text-amber-600" />
                  <label className="block text-sm font-semibold text-amber-900">
                    {isRTL ? 'ملاحظة التفضيلات (للخدمة الشخصية)' : 'Preference Note (For Personalized Service)'}
                  </label>
                </div>
                <textarea
                  value={formData.preference_note}
                  onChange={(e) => setFormData({ ...formData, preference_note: e.target.value })}
                  disabled={!canEdit}
                  rows={2}
                  placeholder={isRTL ? 'مثال: يحب الورود الحمراء، حساس من الزنبق' : 'e.g., Loves Red Roses, Allergic to Lily'}
                  className="w-full px-4 py-2.5 border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
                  dir={isRTL ? 'rtl' : 'ltr'}
                />
                <p className="text-xs text-amber-700 mt-1">
                  {isRTL
                    ? 'سجل تفضيلات العميل وملاحظات مهمة لتقديم خدمة شخصية مميزة'
                    : 'Record customer preferences and important notes for providing exceptional personalized service'}
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                {canEdit && (
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 bg-teal-600 text-white py-2.5 rounded-lg hover:bg-teal-700 transition disabled:opacity-50 font-medium"
                  >
                    {submitting
                      ? (isRTL ? 'جاري الحفظ...' : 'Saving...')
                      : (isRTL ? 'حفظ' : 'Save')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-lg hover:bg-gray-200 transition font-medium"
                >
                  {isRTL ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSmsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <MessageSquare className="w-6 h-6" />
                  <h3 className="text-xl font-bold">
                    {isRTL ? 'إرسال رسالة جماعية' : 'Send Bulk SMS'}
                  </h3>
                </div>
                <button
                  onClick={closeSmsModal}
                  className="p-1 hover:bg-white/20 rounded-lg transition"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {smsResult ? (
                <div className="space-y-4">
                  <div className={`p-4 rounded-lg border-2 ${
                    smsResult.failed === 0
                      ? 'bg-green-50 border-green-500'
                      : smsResult.success === 0
                      ? 'bg-red-50 border-red-500'
                      : 'bg-yellow-50 border-yellow-500'
                  }`}>
                    <div className="flex items-start gap-3">
                      {smsResult.failed === 0 ? (
                        <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1">
                        <h4 className="font-bold text-lg mb-2">
                          {isRTL ? 'نتائج الإرسال' : 'Sending Results'}
                        </h4>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div className="text-center p-3 bg-white rounded-lg">
                            <div className="text-2xl font-bold text-gray-900">{smsResult.total}</div>
                            <div className="text-gray-600 text-xs mt-1">
                              {isRTL ? 'إجمالي' : 'Total'}
                            </div>
                          </div>
                          <div className="text-center p-3 bg-white rounded-lg">
                            <div className="text-2xl font-bold text-green-600">{smsResult.success}</div>
                            <div className="text-gray-600 text-xs mt-1">
                              {isRTL ? 'نجح' : 'Success'}
                            </div>
                          </div>
                          <div className="text-center p-3 bg-white rounded-lg">
                            <div className="text-2xl font-bold text-red-600">{smsResult.failed}</div>
                            <div className="text-gray-600 text-xs mt-1">
                              {isRTL ? 'فشل' : 'Failed'}
                            </div>
                          </div>
                        </div>

                        {smsResult.errors.length > 0 && (
                          <div className="mt-4">
                            <h5 className="font-semibold text-sm text-gray-900 mb-2">
                              {isRTL ? 'الأخطاء:' : 'Errors:'}
                            </h5>
                            <div className="bg-white rounded-lg p-3 max-h-48 overflow-y-auto space-y-1">
                              {smsResult.errors.map((err, idx) => (
                                <div key={idx} className="text-xs text-red-700 p-2 bg-red-50 rounded">
                                  {err}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={closeSmsModal}
                      className="flex-1 bg-teal-600 text-white py-3 rounded-lg hover:bg-teal-700 transition font-medium"
                    >
                      {isRTL ? 'إغلاق' : 'Close'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-sm font-semibold text-gray-900">
                        {isRTL ? 'المستلمون' : 'Recipients'}
                      </label>
                      <span className="text-sm text-gray-500">
                        {selectedCustomers.size} {isRTL ? 'عميل' : 'customers'}
                      </span>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4 max-h-32 overflow-y-auto">
                      <div className="flex flex-wrap gap-2">
                        {customers
                          .filter((c) => selectedCustomers.has(c.id))
                          .map((c) => (
                            <span
                              key={c.id}
                              className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium"
                            >
                              {isRTL ? c.name_ar || c.name : c.name}
                            </span>
                          ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                      {isRTL ? 'الرسالة' : 'Message'}
                    </label>
                    <textarea
                      value={smsMessage}
                      onChange={(e) => setSmsMessage(e.target.value)}
                      placeholder={isRTL ? 'مثال: مرحباً {customer_name}، لدينا عرض خاص لك!' : 'e.g., Hello {customer_name}, we have a special offer for you!'}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                      rows={6}
                      dir={isRTL ? 'rtl' : 'ltr'}
                    />
                    <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
                      <span>
                        {smsMessage.length} {isRTL ? 'حرف' : 'characters'}
                      </span>
                      <span>
                        {isRTL
                          ? `تقريباً ${Math.ceil(smsMessage.length / 70)} رسالة`
                          : `~${Math.ceil(smsMessage.length / 70)} SMS parts`}
                      </span>
                    </div>
                    <div className="mt-2 p-2 bg-purple-50 rounded-lg border border-purple-200">
                      <p className="text-xs text-purple-800 font-medium">
                        <strong>{isRTL ? '💡 نصيحة:' : '💡 Tip:'}</strong>{' '}
                        {isRTL
                          ? 'استخدم {customer_name} أو {name} لإضافة اسم العميل تلقائياً في الرسالة'
                          : 'Use {customer_name} or {name} to automatically insert customer names'}
                      </p>
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-blue-900">
                        <strong>{isRTL ? 'ملاحظة:' : 'Note:'}</strong>{' '}
                        {isRTL
                          ? 'تأكد من تكوين إعدادات بوابة الرسائل النصية في صفحة الإعدادات قبل الإرسال.'
                          : 'Make sure SMS Gateway settings are configured in the Settings page before sending.'}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={sendBulkSms}
                      disabled={sendingSms || !smsMessage.trim()}
                      className="flex-1 bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 font-medium flex items-center justify-center gap-2"
                    >
                      {sendingSms ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          {isRTL ? 'جاري الإرسال...' : 'Sending...'}
                        </>
                      ) : (
                        <>
                          <Send className="w-5 h-5" />
                          {isRTL ? 'إرسال' : 'Send Broadcast'}
                        </>
                      )}
                    </button>
                    <button
                      onClick={closeSmsModal}
                      disabled={sendingSms}
                      className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg hover:bg-gray-200 transition disabled:opacity-50 font-medium"
                    >
                      {isRTL ? 'إلغاء' : 'Cancel'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
