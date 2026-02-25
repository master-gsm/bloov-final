import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../lib/supabase';
import { Users, ArrowRight, Plus, Calendar, FileText, AlertCircle, X } from 'lucide-react';

interface Partner {
  partner_id: string;
  name: string;
  name_ar: string;
  ownership_percentage: number;
  total_shared_expenses: number;
  expected_share: number;
  paid_expenses: number;
  settlements_paid: number;
  settlements_received: number;
  current_balance: number;
  balance_status: string;
  balance_absolute: number;
}

interface Settlement {
  id: string;
  from_partner_id: string;
  from_partner_name: string;
  from_partner_name_ar: string;
  to_partner_id: string;
  to_partner_name: string;
  to_partner_name_ar: string;
  amount: number;
  settlement_date: string;
  description: string;
  description_ar: string;
  notes: string;
  status: string;
  created_at: string;
  created_by_name: string;
}

export default function PartnerSettlements() {
  const { language } = useLanguage();
  const isRTL = language === 'ar';

  const [partners, setPartners] = useState<Partner[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [settlementType, setSettlementType] = useState<'full' | 'partial'>('full');

  const [formData, setFormData] = useState({
    from_partner_id: '',
    to_partner_id: '',
    amount: '',
    settlement_date: new Date().toISOString().split('T')[0],
    description: '',
    description_ar: '',
    notes: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch partner balances
      const { data: partnersData, error: partnersError } = await supabase
        .from('v_partner_analytical_balances')
        .select('*')
        .order('name');

      if (partnersError) throw partnersError;
      setPartners(partnersData || []);

      // Fetch settlements history
      const { data: settlementsData, error: settlementsError } = await supabase
        .from('v_partner_settlements_history')
        .select('*')
        .limit(50);

      if (settlementsError) throw settlementsError;
      setSettlements(settlementsData || []);

    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.from_partner_id || !formData.to_partner_id || !formData.amount) {
      alert(isRTL ? 'يرجى تعبئة جميع الحقول المطلوبة' : 'Please fill all required fields');
      return;
    }

    if (formData.from_partner_id === formData.to_partner_id) {
      alert(isRTL ? 'لا يمكن التسوية من وإلى نفس الشريك' : 'Cannot settle from and to same partner');
      return;
    }

    try {
      const { error } = await supabase
        .from('partner_settlements')
        .insert({
          from_partner_id: formData.from_partner_id,
          to_partner_id: formData.to_partner_id,
          amount: parseFloat(formData.amount),
          settlement_date: formData.settlement_date,
          description: formData.description || (isRTL ? 'تسوية بين شركاء' : 'Partner settlement'),
          description_ar: formData.description_ar || 'تسوية بين شركاء',
          notes: formData.notes,
          status: 'active'
        });

      if (error) throw error;

      alert(isRTL ? 'تم إضافة التسوية بنجاح' : 'Settlement added successfully');
      setShowSettlementModal(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      console.error('Error adding settlement:', error);
      alert(error.message || (isRTL ? 'حدث خطأ أثناء إضافة التسوية' : 'Error adding settlement'));
    }
  };

  const resetForm = () => {
    setFormData({
      from_partner_id: '',
      to_partner_id: '',
      amount: '',
      settlement_date: new Date().toISOString().split('T')[0],
      description: '',
      description_ar: '',
      notes: ''
    });
  };

  const handleVoidSettlement = async (settlementId: string) => {
    if (!confirm(isRTL ? 'هل أنت متأكد من إلغاء هذه التسوية؟' : 'Are you sure you want to void this settlement?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('partner_settlements')
        .update({ status: 'voided' })
        .eq('id', settlementId);

      if (error) throw error;

      alert(isRTL ? 'تم إلغاء التسوية بنجاح' : 'Settlement voided successfully');
      fetchData();
    } catch (error: any) {
      console.error('Error voiding settlement:', error);
      alert(error.message || (isRTL ? 'حدث خطأ أثناء إلغاء التسوية' : 'Error voiding settlement'));
    }
  };

  const handleFullSettlement = (fromPartner: Partner, toPartner: Partner) => {
    const amount = fromPartner.current_balance > 0 ? fromPartner.current_balance : 0;

    setFormData({
      from_partner_id: fromPartner.partner_id,
      to_partner_id: toPartner.partner_id,
      amount: amount.toString(),
      settlement_date: new Date().toISOString().split('T')[0],
      description: `Full settlement from ${fromPartner.name} to ${toPartner.name}`,
      description_ar: `تسوية كاملة من ${fromPartner.name_ar || fromPartner.name} إلى ${toPartner.name_ar || toPartner.name}`,
      notes: 'تسوية كاملة للرصيد المستحق'
    });
    setSettlementType('full');
    setShowSettlementModal(true);
  };

  const handlePartialSettlement = (fromPartner: Partner) => {
    setFormData({
      ...formData,
      from_partner_id: fromPartner.partner_id,
      description: `Partial settlement from ${fromPartner.name}`,
      description_ar: `تسوية جزئية من ${fromPartner.name_ar || fromPartner.name}`
    });
    setSettlementType('partial');
    setShowSettlementModal(true);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ar-SA', {
      style: 'currency',
      currency: 'SAR',
      minimumFractionDigits: 2
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">{isRTL ? 'جاري التحميل...' : 'Loading...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="h-8 w-8 text-blue-600" />
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {isRTL ? 'تسويات الشركاء' : 'Partner Settlements'}
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                {isRTL ? 'إدارة التسويات والحساب الجاري للشركاء' : 'Manage partner settlements and current accounts'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Alert */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-800">
            <p className="font-semibold mb-1">
              {isRTL ? 'كيف يعمل الحساب الجاري؟' : 'How does the current account work?'}
            </p>
            <ul className="list-disc list-inside space-y-1 text-blue-700">
              <li>{isRTL ? 'يتم حساب حصة كل شريك من المصاريف المشتركة حسب نسبة ملكيته' : 'Each partner\'s share of shared expenses is calculated by ownership percentage'}</li>
              <li>{isRTL ? 'إذا كان الرصيد موجب (+): الشريك دفع أكثر من حصته - له رصيد' : 'If balance is positive (+): Partner paid more than their share - credit balance'}</li>
              <li>{isRTL ? 'إذا كان الرصيد سالب (-): الشريك دفع أقل من حصته - عليه رصيد' : 'If balance is negative (-): Partner paid less than their share - debit balance'}</li>
              <li>{isRTL ? 'التسويات لا تؤثر على نسب الشراكة أو المصاريف' : 'Settlements don\'t affect partnership percentages or expenses'}</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Partner Balances Table */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            {isRTL ? 'أرصدة الشركاء' : 'Partner Balances'}
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  {isRTL ? 'الشريك' : 'Partner'}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  {isRTL ? 'نسبة الملكية' : 'Ownership %'}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  {isRTL ? 'الحصة المفترضة' : 'Expected Share'}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  {isRTL ? 'المدفوع فعلياً' : 'Paid'}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  {isRTL ? 'الرصيد' : 'Balance'}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  {isRTL ? 'الحالة' : 'Status'}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  {isRTL ? 'الإجراءات' : 'Actions'}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {partners.map((partner) => (
                <tr key={partner.partner_id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-medium text-gray-900">
                      {isRTL ? partner.name_ar || partner.name : partner.name}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-900">
                    {partner.ownership_percentage}%
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-900">
                    {formatCurrency(partner.expected_share)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-900">
                    {formatCurrency(partner.paid_expenses)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`font-semibold ${
                      partner.current_balance > 0 ? 'text-green-600' :
                      partner.current_balance < 0 ? 'text-red-600' :
                      'text-gray-600'
                    }`}>
                      {formatCurrency(Math.abs(partner.current_balance))}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                      partner.balance_status === 'له' ? 'bg-green-100 text-green-800' :
                      partner.balance_status === 'عليه' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {partner.balance_status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {partner.current_balance !== 0 && (
                      <button
                        onClick={() => handlePartialSettlement(partner)}
                        className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                      >
                        {isRTL ? 'تسوية' : 'Settle'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Settlement Suggestions */}
      {partners.filter(p => p.current_balance > 0).length > 0 &&
       partners.filter(p => p.current_balance < 0).length > 0 && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {isRTL ? 'اقتراحات تسوية سريعة' : 'Quick Settlement Suggestions'}
          </h3>
          <div className="space-y-3">
            {partners
              .filter(p => p.current_balance < 0)
              .map(debtor => {
                const creditor = partners.find(p => p.current_balance > 0);
                if (!creditor) return null;

                return (
                  <div key={debtor.partner_id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-4">
                      <span className="font-medium text-gray-900">
                        {isRTL ? debtor.name_ar || debtor.name : debtor.name}
                      </span>
                      <ArrowRight className="h-4 w-4 text-gray-400" />
                      <span className="font-medium text-gray-900">
                        {isRTL ? creditor.name_ar || creditor.name : creditor.name}
                      </span>
                      <span className="text-red-600 font-semibold">
                        {formatCurrency(Math.abs(debtor.current_balance))}
                      </span>
                    </div>
                    <button
                      onClick={() => handleFullSettlement(debtor, creditor)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                    >
                      {isRTL ? 'تسوية كاملة' : 'Full Settlement'}
                    </button>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Settlements History */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            {isRTL ? 'سجل التسويات' : 'Settlement History'}
          </h3>
          <button
            onClick={() => {
              resetForm();
              setSettlementType('partial');
              setShowSettlementModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            {isRTL ? 'تسوية جديدة' : 'New Settlement'}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  {isRTL ? 'التاريخ' : 'Date'}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  {isRTL ? 'من' : 'From'}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  {isRTL ? 'إلى' : 'To'}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  {isRTL ? 'المبلغ' : 'Amount'}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  {isRTL ? 'الوصف' : 'Description'}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  {isRTL ? 'بواسطة' : 'By'}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  {isRTL ? 'إجراء' : 'Action'}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {settlements.map((settlement) => (
                <tr key={settlement.id} className={`hover:bg-gray-50 ${settlement.status === 'voided' ? 'opacity-50 bg-red-50' : ''}`}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {new Date(settlement.settlement_date).toLocaleDateString('ar-SA')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-900">
                    {isRTL ? settlement.from_partner_name_ar || settlement.from_partner_name : settlement.from_partner_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-900">
                    {isRTL ? settlement.to_partner_name_ar || settlement.to_partner_name : settlement.to_partner_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap font-semibold text-gray-900">
                    {formatCurrency(settlement.amount)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {isRTL ? settlement.description_ar || settlement.description : settlement.description}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {settlement.created_by_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {settlement.status === 'voided' ? (
                      <span className="text-red-600 font-medium">
                        {isRTL ? 'ملغاة' : 'Voided'}
                      </span>
                    ) : (
                      <button
                        onClick={() => handleVoidSettlement(settlement.id)}
                        className="text-red-600 hover:text-red-800 flex items-center gap-1"
                        title={isRTL ? 'إلغاء التسوية' : 'Void Settlement'}
                      >
                        <X className="h-4 w-4" />
                        {isRTL ? 'إلغاء' : 'Void'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Settlement Modal */}
      {showSettlementModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900">
                {settlementType === 'full'
                  ? (isRTL ? 'تسوية كاملة' : 'Full Settlement')
                  : (isRTL ? 'تسوية جزئية' : 'Partial Settlement')}
              </h3>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* From Partner */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isRTL ? 'من الشريك' : 'From Partner'} *
                  </label>
                  <select
                    value={formData.from_partner_id}
                    onChange={(e) => setFormData({ ...formData, from_partner_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">{isRTL ? 'اختر الشريك' : 'Select Partner'}</option>
                    {partners.map(p => (
                      <option key={p.partner_id} value={p.partner_id}>
                        {isRTL ? p.name_ar || p.name : p.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* To Partner */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isRTL ? 'إلى الشريك' : 'To Partner'} *
                  </label>
                  <select
                    value={formData.to_partner_id}
                    onChange={(e) => setFormData({ ...formData, to_partner_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">{isRTL ? 'اختر الشريك' : 'Select Partner'}</option>
                    {partners
                      .filter(p => p.partner_id !== formData.from_partner_id)
                      .map(p => (
                        <option key={p.partner_id} value={p.partner_id}>
                          {isRTL ? p.name_ar || p.name : p.name}
                        </option>
                      ))}
                  </select>
                </div>

                {/* Amount */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isRTL ? 'المبلغ' : 'Amount'} *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                {/* Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isRTL ? 'التاريخ' : 'Date'} *
                  </label>
                  <input
                    type="date"
                    value={formData.settlement_date}
                    onChange={(e) => setFormData({ ...formData, settlement_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isRTL ? 'الوصف' : 'Description'}
                </label>
                <input
                  type="text"
                  value={isRTL ? formData.description_ar : formData.description}
                  onChange={(e) => setFormData({
                    ...formData,
                    [isRTL ? 'description_ar' : 'description']: e.target.value
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isRTL ? 'ملاحظات' : 'Notes'}
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={3}
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                >
                  {isRTL ? 'حفظ التسوية' : 'Save Settlement'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowSettlementModal(false);
                    resetForm();
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  {isRTL ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
