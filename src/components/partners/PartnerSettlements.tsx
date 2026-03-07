import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Users, ArrowRight, Plus, AlertCircle, X, CheckCircle, AlertTriangle, Edit2, Calendar, DollarSign } from 'lucide-react';

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

interface ModalState {
  show: boolean;
  type: 'confirm' | 'success' | 'error' | 'warning';
  title: string;
  message: string;
  onConfirm?: () => void;
}

interface EditModalState {
  show: boolean;
  type: 'date' | 'amount';
  settlementIds: string[];
  value: string;
}

export default function PartnerSettlements() {
  const { language } = useLanguage();
  const { can, user } = useAuth();
  const isRTL = language === 'ar';
  const canEdit = can('partners', 'edit');

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

  const [modal, setModal] = useState<ModalState>({
    show: false,
    type: 'confirm',
    title: '',
    message: ''
  });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editModal, setEditModal] = useState<EditModalState>({
    show: false,
    type: 'date',
    settlementIds: [],
    value: ''
  });

  const showModal = (type: ModalState['type'], title: string, message: string, onConfirm?: () => void) => {
    setModal({ show: true, type, title, message, onConfirm });
  };

  const hideModal = () => {
    setModal(prev => ({ ...prev, show: false }));
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === settlements.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(settlements.map(s => s.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const openEditModal = (type: 'date' | 'amount', ids?: string[]) => {
    const targetIds = ids || Array.from(selectedIds);
    if (targetIds.length === 0) {
      showModal('warning', isRTL ? 'تنبيه' : 'Warning', isRTL ? 'يرجى تحديد تسوية واحدة على الأقل' : 'Please select at least one settlement');
      return;
    }

    let defaultValue = '';
    if (targetIds.length === 1) {
      const settlement = settlements.find(s => s.id === targetIds[0]);
      if (settlement) {
        defaultValue = type === 'date' ? settlement.settlement_date : settlement.amount.toString();
      }
    } else {
      defaultValue = type === 'date' ? new Date().toISOString().split('T')[0] : '';
    }

    setEditModal({
      show: true,
      type,
      settlementIds: targetIds,
      value: defaultValue
    });
  };

  const handleBulkEdit = async () => {
    if (!editModal.value) {
      showModal('warning', isRTL ? 'تنبيه' : 'Warning', isRTL ? 'يرجى إدخال القيمة' : 'Please enter a value');
      return;
    }

    const updateData = editModal.type === 'date'
      ? { settlement_date: editModal.value }
      : { amount: parseFloat(editModal.value) };

    try {
      for (const id of editModal.settlementIds) {
        const settlement = settlements.find(s => s.id === id);
        const oldValue = editModal.type === 'date' ? settlement?.settlement_date : settlement?.amount;

        const { error } = await supabase
          .from('partner_settlements')
          .update(updateData)
          .eq('id', id);

        if (error) throw error;

        await supabase.from('audit_logs').insert({
          table_name: 'partner_settlements',
          record_id: id,
          action: 'update',
          old_values: { [editModal.type === 'date' ? 'settlement_date' : 'amount']: oldValue },
          new_values: updateData,
          user_id: user?.id,
          metadata: {
            edit_type: editModal.type,
            bulk_edit: editModal.settlementIds.length > 1
          }
        });
      }

      setEditModal({ show: false, type: 'date', settlementIds: [], value: '' });
      setSelectedIds(new Set());
      fetchData();
      showModal(
        'success',
        isRTL ? 'تمت العملية بنجاح' : 'Success',
        isRTL
          ? `تم تعديل ${editModal.settlementIds.length} تسوية بنجاح`
          : `Successfully updated ${editModal.settlementIds.length} settlement(s)`
      );
    } catch (error: any) {
      console.error('Error updating settlements:', error);
      showModal(
        'error',
        isRTL ? 'خطأ' : 'Error',
        error.message || (isRTL ? 'حدث خطأ أثناء التعديل' : 'Error updating settlements')
      );
    }
  };

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

      // Fetch settlements history (exclude voided settlements)
      const { data: settlementsData, error: settlementsError } = await supabase
        .from('v_partner_settlements_history')
        .select('*')
        .neq('status', 'voided')
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
      showModal(
        'warning',
        isRTL ? 'تنبيه' : 'Warning',
        isRTL ? 'يرجى تعبئة جميع الحقول المطلوبة' : 'Please fill all required fields'
      );
      return;
    }

    if (formData.from_partner_id === formData.to_partner_id) {
      showModal(
        'warning',
        isRTL ? 'تنبيه' : 'Warning',
        isRTL ? 'لا يمكن التسوية من وإلى نفس الشريك' : 'Cannot settle from and to same partner'
      );
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

      setShowSettlementModal(false);
      resetForm();
      fetchData();
      showModal(
        'success',
        isRTL ? 'تمت العملية بنجاح' : 'Success',
        isRTL ? 'تمت إضافة التسوية بنجاح' : 'Settlement added successfully'
      );
    } catch (error: any) {
      console.error('Error adding settlement:', error);
      showModal(
        'error',
        isRTL ? 'خطأ' : 'Error',
        error.message || (isRTL ? 'حدث خطأ أثناء إضافة التسوية' : 'Error adding settlement')
      );
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
    showModal(
      'confirm',
      isRTL ? 'تأكيد الإلغاء' : 'Confirm Void',
      isRTL ? 'هل أنت متأكد من إلغاء هذه التسوية؟' : 'Are you sure you want to void this settlement?',
      async () => {
        hideModal();
        try {
          const { error } = await supabase
            .from('partner_settlements')
            .update({ status: 'voided' })
            .eq('id', settlementId);

          if (error) throw error;

          fetchData();
          showModal(
            'success',
            isRTL ? 'تمت العملية بنجاح' : 'Success',
            isRTL ? 'تم إلغاء التسوية بنجاح' : 'Settlement voided successfully'
          );
        } catch (error: any) {
          console.error('Error voiding settlement:', error);
          showModal(
            'error',
            isRTL ? 'خطأ' : 'Error',
            error.message || (isRTL ? 'حدث خطأ أثناء إلغاء التسوية' : 'Error voiding settlement')
          );
        }
      }
    );
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
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
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

          {canEdit && selectedIds.size > 0 && (
            <div className="mt-4 flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
              <span className="text-sm text-blue-800 font-medium">
                {isRTL ? `تم تحديد ${selectedIds.size} تسوية` : `${selectedIds.size} selected`}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => openEditModal('date')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 text-sm font-medium"
                >
                  <Calendar className="h-4 w-4" />
                  {isRTL ? 'تعديل التاريخ' : 'Edit Date'}
                </button>
                <button
                  onClick={() => openEditModal('amount')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 text-sm font-medium"
                >
                  <DollarSign className="h-4 w-4" />
                  {isRTL ? 'تعديل المبلغ' : 'Edit Amount'}
                </button>
              </div>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                {isRTL ? 'إلغاء التحديد' : 'Clear selection'}
              </button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {canEdit && (
                  <th className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={settlements.length > 0 && selectedIds.size === settlements.length}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                  </th>
                )}
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
                  {isRTL ? 'إجراءات' : 'Actions'}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {settlements.map((settlement) => (
                <tr key={settlement.id} className={`hover:bg-gray-50 ${selectedIds.has(settlement.id) ? 'bg-blue-50' : ''}`}>
                  {canEdit && (
                    <td className="px-4 py-4 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(settlement.id)}
                        onChange={() => toggleSelect(settlement.id)}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                    </td>
                  )}
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
                    <div className="flex items-center gap-2">
                      {canEdit && (
                        <button
                          onClick={() => openEditModal('date', [settlement.id])}
                          className="text-blue-600 hover:text-blue-800 p-1"
                          title={isRTL ? 'تعديل' : 'Edit'}
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleVoidSettlement(settlement.id)}
                        className="text-red-600 hover:text-red-800 flex items-center gap-1"
                        title={isRTL ? 'إلغاء التسوية' : 'Void Settlement'}
                      >
                        <X className="h-4 w-4" />
                        {isRTL ? 'إلغاء' : 'Void'}
                      </button>
                    </div>
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

      {/* Custom Modal */}
      {modal.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className={`p-6 ${
              modal.type === 'success' ? 'bg-green-50' :
              modal.type === 'error' ? 'bg-red-50' :
              modal.type === 'warning' ? 'bg-amber-50' :
              'bg-blue-50'
            }`}>
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-full ${
                  modal.type === 'success' ? 'bg-green-100' :
                  modal.type === 'error' ? 'bg-red-100' :
                  modal.type === 'warning' ? 'bg-amber-100' :
                  'bg-blue-100'
                }`}>
                  {modal.type === 'success' && <CheckCircle className="h-6 w-6 text-green-600" />}
                  {modal.type === 'error' && <X className="h-6 w-6 text-red-600" />}
                  {modal.type === 'warning' && <AlertTriangle className="h-6 w-6 text-amber-600" />}
                  {modal.type === 'confirm' && <AlertTriangle className="h-6 w-6 text-blue-600" />}
                </div>
                <div>
                  <h3 className={`text-lg font-bold ${
                    modal.type === 'success' ? 'text-green-800' :
                    modal.type === 'error' ? 'text-red-800' :
                    modal.type === 'warning' ? 'text-amber-800' :
                    'text-blue-800'
                  }`}>
                    {modal.title}
                  </h3>
                </div>
              </div>
            </div>

            <div className="p-6">
              <p className="text-gray-700 text-base leading-relaxed">
                {modal.message}
              </p>
            </div>

            <div className="px-6 pb-6 flex gap-3">
              {modal.type === 'confirm' ? (
                <>
                  <button
                    onClick={() => modal.onConfirm?.()}
                    className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors"
                  >
                    {isRTL ? 'نعم، إلغاء' : 'Yes, Void'}
                  </button>
                  <button
                    onClick={hideModal}
                    className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
                  >
                    {isRTL ? 'تراجع' : 'Cancel'}
                  </button>
                </>
              ) : (
                <button
                  onClick={hideModal}
                  className={`w-full px-4 py-2.5 rounded-lg font-medium transition-colors ${
                    modal.type === 'success' ? 'bg-green-600 hover:bg-green-700 text-white' :
                    modal.type === 'error' ? 'bg-red-600 hover:bg-red-700 text-white' :
                    'bg-amber-600 hover:bg-amber-700 text-white'
                  }`}
                >
                  {isRTL ? 'حسناً' : 'OK'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editModal.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-6 border-b border-gray-200 bg-blue-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-full">
                  {editModal.type === 'date' ? (
                    <Calendar className="h-5 w-5 text-blue-600" />
                  ) : (
                    <DollarSign className="h-5 w-5 text-blue-600" />
                  )}
                </div>
                <h3 className="text-lg font-bold text-blue-800">
                  {editModal.type === 'date'
                    ? (isRTL ? 'تعديل التاريخ' : 'Edit Date')
                    : (isRTL ? 'تعديل المبلغ' : 'Edit Amount')}
                </h3>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">
                {editModal.settlementIds.length === 1
                  ? (isRTL ? 'تعديل تسوية واحدة' : 'Editing 1 settlement')
                  : (isRTL ? `تعديل ${editModal.settlementIds.length} تسويات` : `Editing ${editModal.settlementIds.length} settlements`)}
              </p>

              {editModal.type === 'date' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {isRTL ? 'التاريخ الجديد' : 'New Date'}
                  </label>
                  <input
                    type="date"
                    value={editModal.value}
                    onChange={(e) => setEditModal({ ...editModal, value: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-lg"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {isRTL ? 'المبلغ الجديد' : 'New Amount'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={editModal.value}
                    onChange={(e) => setEditModal({ ...editModal, value: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-lg"
                    placeholder={isRTL ? 'أدخل المبلغ' : 'Enter amount'}
                  />
                </div>
              )}
            </div>

            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={handleBulkEdit}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
              >
                {isRTL ? 'حفظ التعديلات' : 'Save Changes'}
              </button>
              <button
                onClick={() => setEditModal({ show: false, type: 'date', settlementIds: [], value: '' })}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
              >
                {isRTL ? 'إلغاء' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
