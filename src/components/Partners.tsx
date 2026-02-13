import { useEffect, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { uploadFile, getSignedUrl } from '../lib/fileUpload';
import { Users, Plus, TrendingUp, ArrowRightLeft, DollarSign, Calendar, X, ShieldAlert, Trash2, FileSpreadsheet, Paperclip, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

interface Partner {
  id: string;
  name: string;
  name_ar: string;
  share_percentage: number;
  email: string | null;
  phone: string | null;
}

interface Contribution {
  id: string;
  partner_id: string;
  amount: number;
  description: string;
  description_ar: string | null;
  contribution_date: string;
  contribution_type?: string;
  attachment_url?: string | null;
  created_at: string;
}

interface Settlement {
  id: string;
  from_partner_id: string;
  to_partner_id: string;
  amount: number;
  description: string;
  description_ar: string | null;
  settlement_date: string;
  attachment_url?: string | null;
  created_at: string;
}

export function Partners() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const isRTL = language === 'ar';
  const [partners, setPartners] = useState<Partner[]>([]);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalProfit, setTotalProfit] = useState(0);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showSettlementForm, setShowSettlementForm] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState('');
  const [fromPartner, setFromPartner] = useState('');
  const [toPartner, setToPartner] = useState('');
  const [amount, setAmount] = useState('');
  const [settlementAmount, setSettlementAmount] = useState('');
  const [description, setDescription] = useState('');
  const [descriptionAr, setDescriptionAr] = useState('');
  const [settlementDescription, setSettlementDescription] = useState('');
  const [settlementDescriptionAr, setSettlementDescriptionAr] = useState('');
  const [contribDate, setContribDate] = useState(new Date().toISOString().split('T')[0]);
  const [contributionType, setContributionType] = useState('operational');
  const [settlementDate, setSettlementDate] = useState(new Date().toISOString().split('T')[0]);
  const [contributionFile, setContributionFile] = useState<File | null>(null);
  const [settlementFile, setSettlementFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleteSettlementConfirm, setDeleteSettlementConfirm] = useState<string | null>(null);

  useEffect(() => {
    checkAdminAndLoad();
  }, [user]);

  const checkAdminAndLoad = async () => {
    if (!user) return;
    try {
      const { data: role } = await supabase.rpc('get_my_role');

      const admin = role === 'admin';
      setIsAdmin(admin);

      if (!admin) {
        setLoading(false);
        return;
      }

      await loadData();
    } catch (err) {
      console.error('Error:', err);
      setLoading(false);
    }
  };

  const loadData = async () => {
    try {
      const [partnersRes, contribRes, settlementsRes, salesRes, purchasesRes, expensesRes] = await Promise.all([
        supabase.from('partners').select('*').eq('is_active', true).order('share_percentage', { ascending: false }),
        supabase.from('partner_contributions').select('*').order('contribution_date', { ascending: false }),
        supabase.from('partner_settlements').select('*').order('settlement_date', { ascending: false }),
        supabase.from('sales').select('total, status'),
        supabase.from('purchases').select('total'),
        supabase.from('operating_expenses').select('amount'),
      ]);

      if (partnersRes.data) setPartners(partnersRes.data);
      if (contribRes.data) setContributions(contribRes.data);
      if (settlementsRes.data) setSettlements(settlementsRes.data);

      if (salesRes.data) {
        const revenue = salesRes.data
          .filter((sale) => sale.status === 'completed' || sale.status === 'paid')
          .reduce((sum, sale) => sum + Number(sale.total || 0), 0);
        setTotalRevenue(revenue);
      }

      if (purchasesRes.data && salesRes.data && expensesRes.data) {
        const totalPurchases = purchasesRes.data.reduce((sum, purchase) => sum + Number(purchase.total || 0), 0);
        const totalExpenses = expensesRes.data.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
        const revenue = salesRes.data
          .filter((sale) => sale.status === 'completed' || sale.status === 'paid')
          .reduce((sum, sale) => sum + Number(sale.total || 0), 0);

        const profit = revenue - totalPurchases - totalExpenses;
        setTotalProfit(profit);
      }
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddContribution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPartner || !amount) return;
    setError('');
    setSubmitting(true);

    try {
      let attachmentUrl = null;
      if (contributionFile) {
        attachmentUrl = await uploadFile(contributionFile, 'partner_contributions');
        if (!attachmentUrl) {
          setError(isRTL ? 'فشل رفع الملف' : 'Failed to upload file');
          setSubmitting(false);
          return;
        }
      }

      const { error: insertError } = await supabase.from('partner_contributions').insert({
        partner_id: selectedPartner,
        amount: parseFloat(amount),
        description: descriptionAr || 'دفعة رسوم تأسيس',
        description_ar: descriptionAr || null,
        contribution_date: contribDate,
        contribution_type: contributionType,
        attachment_url: attachmentUrl,
        created_by: user?.id,
      });

      if (insertError) throw insertError;

      setShowAddForm(false);
      setSelectedPartner('');
      setAmount('');
      setDescription('');
      setDescriptionAr('');
      setContribDate(new Date().toISOString().split('T')[0]);
      setContributionType('operational');
      setContributionFile(null);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Error adding contribution');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('partner_contributions').delete().eq('id', id);
      if (error) throw error;
      setDeleteConfirm(null);
      await loadData();
    } catch (err) {
      console.error('Error deleting:', err);
    }
  };

  const handleAddSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromPartner || !toPartner || !settlementAmount) return;
    if (fromPartner === toPartner) {
      setError(isRTL ? 'لا يمكن إضافة دفعة من شريك لنفسه' : 'Cannot add payment from a partner to themselves');
      return;
    }
    setError('');
    setSubmitting(true);

    try {
      let attachmentUrl = null;
      if (settlementFile) {
        attachmentUrl = await uploadFile(settlementFile, 'partner_settlements');
        if (!attachmentUrl) {
          setError(isRTL ? 'فشل رفع الملف' : 'Failed to upload file');
          setSubmitting(false);
          return;
        }
      }

      const { error: insertError } = await supabase.from('partner_settlements').insert({
        from_partner_id: fromPartner,
        to_partner_id: toPartner,
        amount: parseFloat(settlementAmount),
        description: settlementDescriptionAr || 'دفعة تصفية',
        description_ar: settlementDescriptionAr || null,
        settlement_date: settlementDate,
        attachment_url: attachmentUrl,
        created_by: user?.id,
      });

      if (insertError) throw insertError;

      setShowSettlementForm(false);
      setFromPartner('');
      setToPartner('');
      setSettlementAmount('');
      setSettlementDescription('');
      setSettlementDescriptionAr('');
      setSettlementDate(new Date().toISOString().split('T')[0]);
      setSettlementFile(null);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Error adding settlement');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSettlement = async (id: string) => {
    try {
      const { error } = await supabase.from('partner_settlements').delete().eq('id', id);
      if (error) throw error;
      setDeleteSettlementConfirm(null);
      await loadData();
    } catch (err) {
      console.error('Error deleting settlement:', err);
    }
  };

  const getPartnerTotal = (partnerId: string) =>
    contributions.filter((c) => c.partner_id === partnerId).reduce((sum, c) => sum + Number(c.amount), 0);

  const getPartnerContributions = (partnerId: string) =>
    contributions.filter((c) => c.partner_id === partnerId);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'decimal', minimumFractionDigits: 2 }).format(amount);

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString(isRTL ? 'ar-SA' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  const exportToExcel = () => {
    const workbook = XLSX.utils.book_new();

    const mainReportData = [
      [isRTL ? 'تقرير دفعات الشركاء' : 'Partners Payments Report'],
      [isRTL ? 'نظام بلوف المحاسبي' : 'BLOOV Accounting System'],
      [isRTL ? `التاريخ: ${new Date().toLocaleDateString('ar-SA')}` : `Date: ${new Date().toLocaleDateString('en-US')}`],
      [],
    ];

    partners.forEach((partner, index) => {
      const partnerContribs = getPartnerContributions(partner.id);
      const partnerSettlementsPaid = settlements.filter((s) => s.from_partner_id === partner.id);
      const partnerSettlementsReceived = settlements.filter((s) => s.to_partner_id === partner.id);

      const partnerTotal = getPartnerTotal(partner.id);
      const settledPaid = partnerSettlementsPaid.reduce((sum, s) => sum + Number(s.amount), 0);
      const settledReceived = partnerSettlementsReceived.reduce((sum, s) => sum + Number(s.amount), 0);

      if (index > 0) {
        mainReportData.push([]);
        mainReportData.push([]);
      }

      mainReportData.push([isRTL ? `${partner.name_ar} - نسبة الحصة ${partner.share_percentage}%` : `${partner.name} - Share ${partner.share_percentage}%`]);
      mainReportData.push([]);

      if (partnerContribs.length > 0) {
        mainReportData.push([isRTL ? 'دفعات رسوم التأسيس:' : 'Setup Fee Payments:']);
        mainReportData.push([isRTL ? 'التاريخ' : 'Date', isRTL ? 'البيان' : 'Description', isRTL ? 'المبلغ (ر.س)' : 'Amount (SAR)']);

        partnerContribs.forEach((contrib) => {
          mainReportData.push([
            formatDate(contrib.contribution_date),
            isRTL ? (contrib.description_ar || contrib.description) : contrib.description,
            Number(contrib.amount).toFixed(2),
          ]);
        });

        mainReportData.push([]);
        mainReportData.push([isRTL ? 'إجمالي دفعات رسوم التأسيس:' : 'Total Setup Fees Paid:', '', `${partnerTotal.toFixed(2)} ${isRTL ? 'ر.س' : 'SAR'}`]);
      } else {
        mainReportData.push([isRTL ? 'لا توجد دفعات رسوم تأسيس' : 'No setup fee payments']);
      }

      if (partnerSettlementsPaid.length > 0) {
        mainReportData.push([]);
        mainReportData.push([isRTL ? 'دفعات التصفية المدفوعة:' : 'Settlement Payments Made:']);
        mainReportData.push([isRTL ? 'التاريخ' : 'Date', isRTL ? 'البيان' : 'Description', isRTL ? 'المبلغ (ر.س)' : 'Amount (SAR)']);

        partnerSettlementsPaid.forEach((settlement) => {
          const toPartnerData = partners.find((p) => p.id === settlement.to_partner_id);
          mainReportData.push([
            formatDate(settlement.settlement_date),
            isRTL
              ? `${settlement.description_ar || settlement.description} (إلى ${toPartnerData ? toPartnerData.name_ar : ''})`
              : `${settlement.description} (to ${toPartnerData ? toPartnerData.name : ''})`,
            Number(settlement.amount).toFixed(2),
          ]);
        });

        mainReportData.push([]);
        mainReportData.push([isRTL ? 'إجمالي دفعات التصفية المدفوعة:' : 'Total Settlements Paid:', '', `${settledPaid.toFixed(2)} ${isRTL ? 'ر.س' : 'SAR'}`]);
      }

      if (partnerSettlementsReceived.length > 0) {
        mainReportData.push([]);
        mainReportData.push([isRTL ? 'دفعات التصفية المستلمة:' : 'Settlement Payments Received:']);
        mainReportData.push([isRTL ? 'التاريخ' : 'Date', isRTL ? 'البيان' : 'Description', isRTL ? 'المبلغ (ر.س)' : 'Amount (SAR)']);

        partnerSettlementsReceived.forEach((settlement) => {
          const fromPartnerData = partners.find((p) => p.id === settlement.from_partner_id);
          mainReportData.push([
            formatDate(settlement.settlement_date),
            isRTL
              ? `${settlement.description_ar || settlement.description} (من ${fromPartnerData ? fromPartnerData.name_ar : ''})`
              : `${settlement.description} (from ${fromPartnerData ? fromPartnerData.name : ''})`,
            Number(settlement.amount).toFixed(2),
          ]);
        });

        mainReportData.push([]);
        mainReportData.push([isRTL ? 'إجمالي دفعات التصفية المستلمة:' : 'Total Settlements Received:', '', `${settledReceived.toFixed(2)} ${isRTL ? 'ر.س' : 'SAR'}`]);
      }

      const partnerExpected = totalSetupFees * (Number(partner.share_percentage) / 100);
      const partnerOwes = partnerExpected - partnerTotal - settledPaid + settledReceived;

      mainReportData.push([]);
      mainReportData.push([isRTL ? 'الملخص المالي:' : 'Financial Summary:']);
      mainReportData.push([isRTL ? 'المبلغ المطلوب (حسب الحصة)' : 'Required Amount (by share)', '', `${partnerExpected.toFixed(2)} ${isRTL ? 'ر.س' : 'SAR'}`]);
      mainReportData.push([isRTL ? 'إجمالي المدفوع' : 'Total Paid', '', `${partnerTotal.toFixed(2)} ${isRTL ? 'ر.س' : 'SAR'}`]);
      mainReportData.push([isRTL ? 'دفعات التصفية (مدفوعة)' : 'Settlements (paid)', '', `${settledPaid.toFixed(2)} ${isRTL ? 'ر.س' : 'SAR'}`]);
      mainReportData.push([isRTL ? 'دفعات التصفية (مستلمة)' : 'Settlements (received)', '', `${settledReceived.toFixed(2)} ${isRTL ? 'ر.س' : 'SAR'}`]);
      mainReportData.push([
        isRTL ? 'الرصيد النهائي' : 'Final Balance',
        '',
        partnerOwes > 0
          ? `${isRTL ? 'يحتاج يدفع' : 'Owes'} ${partnerOwes.toFixed(2)} ${isRTL ? 'ر.س' : 'SAR'}`
          : partnerOwes < 0
          ? `${isRTL ? 'له مبلغ' : 'Owed'} ${Math.abs(partnerOwes).toFixed(2)} ${isRTL ? 'ر.س' : 'SAR'}`
          : isRTL ? 'متساوي' : 'Settled'
      ]);
    });

    mainReportData.push([]);
    mainReportData.push([]);
    mainReportData.push([isRTL ? '═══════════════════════════════════════' : '═══════════════════════════════════════']);
    mainReportData.push([isRTL ? 'الملخص الإجمالي' : 'Overall Summary']);
    mainReportData.push([isRTL ? '═══════════════════════════════════════' : '═══════════════════════════════════════']);
    mainReportData.push([]);
    mainReportData.push([isRTL ? 'إجمالي رسوم التأسيس لجميع الشركاء:' : 'Total Setup Fees (All Partners):', '', `${totalSetupFees.toFixed(2)} ${isRTL ? 'ر.س' : 'SAR'}`]);

    const totalSettlementAmount = settlements.reduce((sum, s) => sum + Number(s.amount), 0);
    mainReportData.push([isRTL ? 'إجمالي دفعات التصفية:' : 'Total Settlement Payments:', '', `${totalSettlementAmount.toFixed(2)} ${isRTL ? 'ر.س' : 'SAR'}`]);

    const mainWorksheet = XLSX.utils.aoa_to_sheet(mainReportData);
    mainWorksheet['!cols'] = [
      { wch: 30 },
      { wch: 40 },
      { wch: 25 },
    ];

    XLSX.utils.book_append_sheet(workbook, mainWorksheet, isRTL ? 'تقرير الشركاء' : 'Partners Report');

    const fileName = isRTL
      ? `تقرير_الشركاء_${new Date().toISOString().split('T')[0]}.xlsx`
      : `Partners_Report_${new Date().toISOString().split('T')[0]}.xlsx`;

    XLSX.writeFile(workbook, fileName);
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

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md">
          <div className="bg-red-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-10 h-10 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {isRTL ? 'غير مصرح' : 'Access Restricted'}
          </h2>
          <p className="text-gray-500">
            {isRTL ? 'هذا القسم متاح فقط للمدير' : 'This section is only available for administrators'}
          </p>
        </div>
      </div>
    );
  }

  const sami = partners.find((p) => p.name === 'Sami');
  const anas = partners.find((p) => p.name === 'Anas');

  const samiTotal = sami ? getPartnerTotal(sami.id) : 0;
  const anasTotal = anas ? getPartnerTotal(anas.id) : 0;
  const totalSetupFees = samiTotal + anasTotal;
  const difference = samiTotal - anasTotal;

  const samiExpected = totalSetupFees * (sami ? Number(sami.share_percentage) / 100 : 0.6);
  const anasExpected = totalSetupFees * (anas ? Number(anas.share_percentage) / 100 : 0.4);

  const samiSettlementsPaid = sami ? settlements.filter((s) => s.from_partner_id === sami.id).reduce((sum, s) => sum + Number(s.amount), 0) : 0;
  const samiSettlementsReceived = sami ? settlements.filter((s) => s.to_partner_id === sami.id).reduce((sum, s) => sum + Number(s.amount), 0) : 0;
  const anasSettlementsPaid = anas ? settlements.filter((s) => s.from_partner_id === anas.id).reduce((sum, s) => sum + Number(s.amount), 0) : 0;
  const anasSettlementsReceived = anas ? settlements.filter((s) => s.to_partner_id === anas.id).reduce((sum, s) => sum + Number(s.amount), 0) : 0;

  const samiOwes = samiExpected - samiTotal - samiSettlementsPaid + samiSettlementsReceived;
  const anasOwes = anasExpected - anasTotal - anasSettlementsPaid + anasSettlementsReceived;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('nav.partners')}</h2>
          <p className="text-gray-500 mt-1">
            {isRTL ? 'تتبع رسوم التأسيس والأرصدة بين الشركاء' : 'Track setup fees and balances between partners'}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={exportToExcel}
            disabled={contributions.length === 0}
            className="flex items-center gap-2 bg-green-600 text-white px-4 py-2.5 rounded-lg hover:bg-green-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileSpreadsheet className="w-5 h-5" />
            {isRTL ? 'تصدير Excel' : 'Export Excel'}
          </button>
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 bg-teal-600 text-white px-4 py-2.5 rounded-lg hover:bg-teal-700 transition font-medium"
          >
            <Plus className="w-5 h-5" />
            {isRTL ? 'إضافة دفعة' : 'Add Payment'}
          </button>
          <button
            onClick={() => setShowSettlementForm(true)}
            className="flex items-center gap-2 bg-amber-600 text-white px-4 py-2.5 rounded-lg hover:bg-amber-700 transition font-medium"
          >
            <ArrowRightLeft className="w-5 h-5" />
            {isRTL ? 'إضافة تصفية' : 'Add Settlement'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-teal-50 p-2.5 rounded-lg">
              <DollarSign className="w-5 h-5 text-teal-600" />
            </div>
            <p className="text-sm text-gray-500">{isRTL ? 'إجمالي رسوم التأسيس' : 'Total Setup Fees'}</p>
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalSetupFees)} <span className="text-sm font-normal text-gray-500">{isRTL ? 'ر.س' : 'SAR'}</span></p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-blue-50 p-2.5 rounded-lg">
              <TrendingUp className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-sm text-gray-500">{isRTL ? `دفعات ${sami ? (isRTL ? sami.name_ar : sami.name) : 'سامي'}` : `${sami ? sami.name : 'Sami'}'s Payments`}</p>
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(samiTotal)} <span className="text-sm font-normal text-gray-500">{isRTL ? 'ر.س' : 'SAR'}</span></p>
          <p className="text-xs text-gray-400 mt-1">{sami ? `${sami.share_percentage}%` : '60%'} {isRTL ? 'حصة' : 'share'}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-amber-50 p-2.5 rounded-lg">
              <TrendingUp className="w-5 h-5 text-amber-600" />
            </div>
            <p className="text-sm text-gray-500">{isRTL ? `دفعات ${anas ? (isRTL ? anas.name_ar : anas.name) : 'أنس'}` : `${anas ? anas.name : 'Anas'}'s Payments`}</p>
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(anasTotal)} <span className="text-sm font-normal text-gray-500">{isRTL ? 'ر.س' : 'SAR'}</span></p>
          <p className="text-xs text-gray-400 mt-1">{anas ? `${anas.share_percentage}%` : '40%'} {isRTL ? 'حصة' : 'share'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl shadow-sm border border-blue-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-white p-2.5 rounded-lg shadow-sm">
              <DollarSign className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-sm text-blue-900 font-medium">{isRTL ? 'رأس المال المستثمر' : 'Invested Capital'}</p>
          </div>
          <p className="text-2xl font-bold text-blue-900">{formatCurrency(totalSetupFees)} <span className="text-sm font-normal text-blue-700">{isRTL ? 'ر.س' : 'SAR'}</span></p>
          <p className="text-xs text-blue-700 mt-2">{isRTL ? 'إجمالي رسوم التأسيس المدفوعة' : 'Total setup fees paid'}</p>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl shadow-sm border border-green-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-white p-2.5 rounded-lg shadow-sm">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <p className="text-sm text-green-900 font-medium">{isRTL ? 'الأرباح المحققة' : 'Total Profit'}</p>
          </div>
          <p className="text-2xl font-bold text-green-900">
            {formatCurrency(totalProfit > 0 ? totalProfit : 0)} <span className="text-sm font-normal text-green-700">{isRTL ? 'ر.س' : 'SAR'}</span>
          </p>
          <p className="text-xs text-green-700 mt-2">{isRTL ? 'الإيرادات - التكاليف' : 'Revenue - Costs'}</p>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl shadow-sm border border-purple-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-white p-2.5 rounded-lg shadow-sm">
              <ArrowRightLeft className="w-5 h-5 text-purple-600" />
            </div>
            <p className="text-sm text-purple-900 font-medium">{isRTL ? 'المتبقي لاسترجاع رأس المال' : 'Remaining to Recover'}</p>
          </div>
          <p className="text-2xl font-bold text-purple-900">
            {formatCurrency(totalSetupFees - (totalProfit > 0 ? totalProfit : 0))} <span className="text-sm font-normal text-purple-700">{isRTL ? 'ر.س' : 'SAR'}</span>
          </p>
          <p className="text-xs text-purple-700 mt-2">
            {totalProfit >= totalSetupFees
              ? (isRTL ? 'تم استرجاع رأس المال بالكامل' : 'Capital fully recovered')
              : (isRTL ? `${((totalProfit / totalSetupFees) * 100).toFixed(1)}% مسترجع` : `${((totalProfit / totalSetupFees) * 100).toFixed(1)}% recovered`)}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-3 mb-4">
          <ArrowRightLeft className="w-5 h-5 text-gray-600" />
          <h3 className="text-lg font-bold text-gray-900">{isRTL ? 'التسوية بين الشركاء' : 'Settlement Between Partners'}</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="bg-teal-50 p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-teal-100 w-10 h-10 rounded-full flex items-center justify-center">
                  <Users className="w-5 h-5 text-teal-700" />
                </div>
                <div>
                  <p className="font-bold text-gray-900">{sami ? (isRTL ? sami.name_ar : sami.name) : (isRTL ? 'سامي' : 'Sami')}</p>
                  <p className="text-xs text-gray-500">{sami ? `${sami.share_percentage}%` : '60%'} {isRTL ? 'حصة' : 'share'}</p>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">{isRTL ? 'المبلغ المدفوع' : 'Amount Paid'}</span>
                  <span className="font-bold text-gray-900">{formatCurrency(samiTotal)} {isRTL ? 'ر.س' : 'SAR'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">{isRTL ? 'المبلغ المطلوب حسب الحصة' : 'Required (by share)'}</span>
                  <span className="font-medium text-gray-900">{formatCurrency(samiExpected)} {isRTL ? 'ر.س' : 'SAR'}</span>
                </div>
                <div className="border-t border-teal-200 pt-2 flex justify-between">
                  <span className="text-gray-700 font-medium">{isRTL ? 'الرصيد' : 'Balance'}</span>
                  <span className={`font-bold ${samiOwes > 0 ? 'text-red-600' : samiOwes < 0 ? 'text-green-600' : 'text-gray-900'}`}>
                    {samiOwes > 0
                      ? `${isRTL ? 'يحتاج يدفع' : 'Owes'} ${formatCurrency(samiOwes)}`
                      : samiOwes < 0
                      ? `${isRTL ? 'له مبلغ' : 'Owed'} ${formatCurrency(Math.abs(samiOwes))}`
                      : (isRTL ? 'متساوي' : 'Settled')}
                  </span>
                </div>
              </div>
            </div>

            {sami && getPartnerContributions(sami.id).length > 0 && (
              <div className="bg-white">
                <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                  <h4 className="font-semibold text-gray-700 text-sm flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    {isRTL ? 'سجل المدفوعات' : 'Payment History'}
                  </h4>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full">
                    <tbody>
                      {getPartnerContributions(sami.id).map((contrib) => (
                        <tr key={contrib.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition">
                          <td className="py-2.5 px-4 text-xs text-gray-600">{formatDate(contrib.contribution_date)}</td>
                          <td className="py-2.5 px-4 text-xs text-gray-700">{isRTL ? (contrib.description_ar || contrib.description) : contrib.description}</td>
                          <td className="py-2.5 px-4 text-xs font-bold text-gray-900 text-right">{formatCurrency(Number(contrib.amount))} {isRTL ? 'ر.س' : 'SAR'}</td>
                          <td className="py-2.5 px-4 w-10">
                            {contrib.attachment_url && (
                              <button
                                onClick={async () => {
                                  const url = await getSignedUrl(contrib.attachment_url!);
                                  if (url) window.open(url, '_blank');
                                }}
                                className="p-1 text-blue-500 hover:bg-blue-50 rounded transition"
                                title={isRTL ? 'تحميل الإيصال' : 'Download receipt'}
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                          <td className="py-2.5 px-4 w-10">
                            <button
                              onClick={() => setDeleteConfirm(contrib.id)}
                              className="p-1 text-red-500 hover:bg-red-50 rounded transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="bg-amber-50 p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-amber-100 w-10 h-10 rounded-full flex items-center justify-center">
                  <Users className="w-5 h-5 text-amber-700" />
                </div>
                <div>
                  <p className="font-bold text-gray-900">{anas ? (isRTL ? anas.name_ar : anas.name) : (isRTL ? 'أنس' : 'Anas')}</p>
                  <p className="text-xs text-gray-500">{anas ? `${anas.share_percentage}%` : '40%'} {isRTL ? 'حصة' : 'share'}</p>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">{isRTL ? 'المبلغ المدفوع' : 'Amount Paid'}</span>
                  <span className="font-bold text-gray-900">{formatCurrency(anasTotal)} {isRTL ? 'ر.س' : 'SAR'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">{isRTL ? 'المبلغ المطلوب حسب الحصة' : 'Required (by share)'}</span>
                  <span className="font-medium text-gray-900">{formatCurrency(anasExpected)} {isRTL ? 'ر.س' : 'SAR'}</span>
                </div>
                <div className="border-t border-amber-200 pt-2 flex justify-between">
                  <span className="text-gray-700 font-medium">{isRTL ? 'الرصيد' : 'Balance'}</span>
                  <span className={`font-bold ${anasOwes > 0 ? 'text-red-600' : anasOwes < 0 ? 'text-green-600' : 'text-gray-900'}`}>
                    {anasOwes > 0
                      ? `${isRTL ? 'يحتاج يدفع' : 'Owes'} ${formatCurrency(anasOwes)}`
                      : anasOwes < 0
                      ? `${isRTL ? 'له مبلغ' : 'Owed'} ${formatCurrency(Math.abs(anasOwes))}`
                      : (isRTL ? 'متساوي' : 'Settled')}
                  </span>
                </div>
              </div>
            </div>

            {anas && getPartnerContributions(anas.id).length > 0 && (
              <div className="bg-white">
                <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                  <h4 className="font-semibold text-gray-700 text-sm flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    {isRTL ? 'سجل المدفوعات' : 'Payment History'}
                  </h4>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full">
                    <tbody>
                      {getPartnerContributions(anas.id).map((contrib) => (
                        <tr key={contrib.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition">
                          <td className="py-2.5 px-4 text-xs text-gray-600">{formatDate(contrib.contribution_date)}</td>
                          <td className="py-2.5 px-4 text-xs text-gray-700">{isRTL ? (contrib.description_ar || contrib.description) : contrib.description}</td>
                          <td className="py-2.5 px-4 text-xs font-bold text-gray-900 text-right">{formatCurrency(Number(contrib.amount))} {isRTL ? 'ر.س' : 'SAR'}</td>
                          <td className="py-2.5 px-4 w-10">
                            {contrib.attachment_url && (
                              <button
                                onClick={async () => {
                                  const url = await getSignedUrl(contrib.attachment_url!);
                                  if (url) window.open(url, '_blank');
                                }}
                                className="p-1 text-blue-500 hover:bg-blue-50 rounded transition"
                                title={isRTL ? 'تحميل الإيصال' : 'Download receipt'}
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                          <td className="py-2.5 px-4 w-10">
                            <button
                              onClick={() => setDeleteConfirm(contrib.id)}
                              className="p-1 text-red-500 hover:bg-red-50 rounded transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        {(samiOwes !== 0 || anasOwes !== 0) && (
          <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
            <p className="text-center font-medium text-gray-700">
              {samiOwes < 0 && anasOwes > 0
                ? (isRTL
                  ? `${anas ? anas.name_ar : 'أنس'} يدين لـ ${sami ? sami.name_ar : 'سامي'} بمبلغ ${formatCurrency(Math.abs(samiOwes))} ر.س`
                  : `${anas ? anas.name : 'Anas'} owes ${sami ? sami.name : 'Sami'} ${formatCurrency(Math.abs(samiOwes))} SAR`)
                : samiOwes > 0 && anasOwes < 0
                ? (isRTL
                  ? `${sami ? sami.name_ar : 'سامي'} يدين لـ ${anas ? anas.name_ar : 'أنس'} بمبلغ ${formatCurrency(Math.abs(anasOwes))} ر.س`
                  : `${sami ? sami.name : 'Sami'} owes ${anas ? anas.name : 'Anas'} ${formatCurrency(Math.abs(anasOwes))} SAR`)
                : (isRTL ? 'الحسابات متوازنة' : 'Accounts are balanced')}
            </p>
          </div>
        )}
      </div>

      {settlements.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
            <ArrowRightLeft className="w-5 h-5 text-amber-600" />
            <h3 className="font-bold text-gray-900">
              {isRTL ? 'سجل دفعات التصفية' : 'Settlement Payments History'}
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-3 px-6 font-semibold text-gray-600 text-sm">{isRTL ? 'التاريخ' : 'Date'}</th>
                  <th className="text-left py-3 px-6 font-semibold text-gray-600 text-sm">{isRTL ? 'من' : 'From'}</th>
                  <th className="text-left py-3 px-6 font-semibold text-gray-600 text-sm">{isRTL ? 'إلى' : 'To'}</th>
                  <th className="text-left py-3 px-6 font-semibold text-gray-600 text-sm">{isRTL ? 'المبلغ' : 'Amount'}</th>
                  <th className="text-left py-3 px-6 font-semibold text-gray-600 text-sm">{isRTL ? 'الوصف' : 'Description'}</th>
                  <th className="text-left py-3 px-6 font-semibold text-gray-600 text-sm w-16"></th>
                  <th className="text-left py-3 px-6 font-semibold text-gray-600 text-sm w-16"></th>
                </tr>
              </thead>
              <tbody>
                {settlements.map((settlement) => {
                  const fromPartnerData = partners.find((p) => p.id === settlement.from_partner_id);
                  const toPartnerData = partners.find((p) => p.id === settlement.to_partner_id);
                  return (
                    <tr key={settlement.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition">
                      <td className="py-3 px-6 text-sm text-gray-600">{formatDate(settlement.settlement_date)}</td>
                      <td className="py-3 px-6 text-sm text-gray-700 font-medium">
                        {fromPartnerData ? (isRTL ? fromPartnerData.name_ar : fromPartnerData.name) : '-'}
                      </td>
                      <td className="py-3 px-6 text-sm text-gray-700 font-medium">
                        {toPartnerData ? (isRTL ? toPartnerData.name_ar : toPartnerData.name) : '-'}
                      </td>
                      <td className="py-3 px-6 text-sm font-bold text-amber-600">
                        {formatCurrency(Number(settlement.amount))} {isRTL ? 'ر.س' : 'SAR'}
                      </td>
                      <td className="py-3 px-6 text-sm text-gray-600">
                        {isRTL ? (settlement.description_ar || settlement.description) : settlement.description}
                      </td>
                      <td className="py-3 px-6">
                        {settlement.attachment_url && (
                          <button
                            onClick={async () => {
                              const url = await getSignedUrl(settlement.attachment_url!);
                              if (url) window.open(url, '_blank');
                            }}
                            className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition"
                            title={isRTL ? 'تحميل الإيصال' : 'Download receipt'}
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                      <td className="py-3 px-6">
                        <button
                          onClick={() => setDeleteSettlementConfirm(settlement.id)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAddForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="border-b px-6 py-4 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900">
                {isRTL ? 'إضافة دفعة رسوم تأسيس' : 'Add Setup Fee Payment'}
              </h3>
              <button onClick={() => setShowAddForm(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddContribution} className="p-6 space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'الشريك' : 'Partner'}</label>
                <select
                  required
                  value={selectedPartner}
                  onChange={(e) => setSelectedPartner(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                >
                  <option value="">{isRTL ? 'اختر الشريك' : 'Select Partner'}</option>
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>{isRTL ? p.name_ar : p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'المبلغ (ر.س)' : 'Amount (SAR)'}</label>
                <input
                  type="number"
                  required
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'التاريخ' : 'Date'}</label>
                <input
                  type="date"
                  required
                  value={contribDate}
                  onChange={(e) => setContribDate(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'تصنيف الدفعة' : 'Payment Type'}</label>
                <select
                  required
                  value={contributionType}
                  onChange={(e) => setContributionType(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                >
                  <option value="operational">{isRTL ? 'تشغيلي' : 'Operational'}</option>
                  <option value="government">{isRTL ? 'حكومي' : 'Government'}</option>
                  <option value="assets">{isRTL ? 'أصول' : 'Assets'}</option>
                  <option value="other">{isRTL ? 'آخر' : 'Other'}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'الوصف' : 'Description'}</label>
                <input
                  type="text"
                  value={descriptionAr}
                  onChange={(e) => setDescriptionAr(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder={isRTL ? 'رسوم تأسيس' : 'Setup fee'}
                  dir="rtl"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Paperclip className="w-4 h-4 inline mr-1" />
                  {isRTL ? 'إرفاق إيصال' : 'Attach Receipt'}
                </label>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => setContributionFile(e.target.files?.[0] || null)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                />
                {contributionFile && (
                  <p className="text-xs text-gray-500 mt-1">
                    {isRTL ? 'الملف المحدد: ' : 'Selected: '}{contributionFile.name}
                  </p>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-teal-600 text-white py-2.5 rounded-lg hover:bg-teal-700 transition disabled:opacity-50 font-medium"
                >
                  {submitting ? (isRTL ? 'جاري الحفظ...' : 'Saving...') : (isRTL ? 'حفظ' : 'Save')}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-lg hover:bg-gray-200 transition font-medium"
                >
                  {isRTL ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSettlementForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="border-b px-6 py-4 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900">
                {isRTL ? 'إضافة دفعة تصفية بين الشركاء' : 'Add Settlement Payment'}
              </h3>
              <button onClick={() => setShowSettlementForm(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSettlement} className="p-6 space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'من الشريك' : 'From Partner'}</label>
                <select
                  required
                  value={fromPartner}
                  onChange={(e) => setFromPartner(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                >
                  <option value="">{isRTL ? 'اختر الشريك الدافع' : 'Select paying partner'}</option>
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>{isRTL ? p.name_ar : p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'إلى الشريك' : 'To Partner'}</label>
                <select
                  required
                  value={toPartner}
                  onChange={(e) => setToPartner(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                >
                  <option value="">{isRTL ? 'اختر الشريك المستلم' : 'Select receiving partner'}</option>
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>{isRTL ? p.name_ar : p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'المبلغ (ر.س)' : 'Amount (SAR)'}</label>
                <input
                  type="number"
                  required
                  step="0.01"
                  min="0.01"
                  value={settlementAmount}
                  onChange={(e) => setSettlementAmount(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'التاريخ' : 'Date'}</label>
                <input
                  type="date"
                  required
                  value={settlementDate}
                  onChange={(e) => setSettlementDate(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'الوصف' : 'Description'}</label>
                <input
                  type="text"
                  value={settlementDescriptionAr}
                  onChange={(e) => setSettlementDescriptionAr(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder={isRTL ? 'دفعة تصفية' : 'Settlement payment'}
                  dir="rtl"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Paperclip className="w-4 h-4 inline mr-1" />
                  {isRTL ? 'إرفاق إيصال' : 'Attach Receipt'}
                </label>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => setSettlementFile(e.target.files?.[0] || null)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm"
                />
                {settlementFile && (
                  <p className="text-xs text-gray-500 mt-1">
                    {isRTL ? 'الملف المحدد: ' : 'Selected: '}{settlementFile.name}
                  </p>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-amber-600 text-white py-2.5 rounded-lg hover:bg-amber-700 transition disabled:opacity-50 font-medium"
                >
                  {submitting ? (isRTL ? 'جاري الحفظ...' : 'Saving...') : (isRTL ? 'حفظ' : 'Save')}
                </button>
                <button
                  type="button"
                  onClick={() => setShowSettlementForm(false)}
                  className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-lg hover:bg-gray-200 transition font-medium"
                >
                  {isRTL ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 text-center">
            <Trash2 className="w-12 h-12 text-red-500 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              {isRTL ? 'تأكيد الحذف' : 'Confirm Delete'}
            </h3>
            <p className="text-gray-500 mb-6 text-sm">
              {isRTL ? 'هل أنت متأكد من حذف هذه الدفعة؟' : 'Are you sure you want to delete this payment?'}
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

      {deleteSettlementConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 text-center">
            <Trash2 className="w-12 h-12 text-red-500 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              {isRTL ? 'تأكيد الحذف' : 'Confirm Delete'}
            </h3>
            <p className="text-gray-500 mb-6 text-sm">
              {isRTL ? 'هل أنت متأكد من حذف دفعة التصفية هذه؟' : 'Are you sure you want to delete this settlement payment?'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleDeleteSettlement(deleteSettlementConfirm)}
                className="flex-1 bg-red-600 text-white py-2.5 rounded-lg hover:bg-red-700 transition font-medium"
              >
                {isRTL ? 'حذف' : 'Delete'}
              </button>
              <button
                onClick={() => setDeleteSettlementConfirm(null)}
                className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-lg hover:bg-gray-200 transition font-medium"
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
