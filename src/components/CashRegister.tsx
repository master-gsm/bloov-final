import { useEffect, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Wallet, Plus, X, Lock, Unlock, Receipt, DollarSign,
  Calendar, Save, Clock, ArrowDownCircle, ArrowUpCircle, TrendingUp
} from 'lucide-react';

interface CashRegisterRecord {
  id: string;
  open_date: string;
  opening_balance: number;
  closing_balance: number | null;
  expected_balance: number | null;
  status: string;
  opened_by: string;
  closed_by: string | null;
  opened_at: string;
  closed_at: string | null;
  notes: string | null;
}

interface RegisterTransaction {
  id: string;
  transaction_type: 'sale' | 'expense' | 'deposit' | 'withdrawal';
  amount: number;
  description: string | null;
  description_ar: string | null;
  created_at: string;
}

interface Expense {
  id: string;
  expense_number: string;
  category: string;
  amount: number;
  description: string | null;
  expense_date: string;
  payment_method: string;
  created_at: string;
}

const EXPENSE_CATEGORIES = [
  { value: 'rent', ar: 'إيجار', en: 'Rent' },
  { value: 'salaries', ar: 'رواتب', en: 'Salaries' },
  { value: 'delivery', ar: 'توصيل', en: 'Delivery' },
  { value: 'purchases', ar: 'مشتريات', en: 'Purchases' },
  { value: 'utilities', ar: 'خدمات', en: 'Utilities' },
  { value: 'maintenance', ar: 'صيانة', en: 'Maintenance' },
  { value: 'other', ar: 'أخرى', en: 'Other' },
];

export function CashRegister() {
  const { language } = useLanguage();
  const { user } = useAuth();
  const isRTL = language === 'ar';

  const [activeRegister, setActiveRegister] = useState<CashRegisterRecord | null>(null);
  const [registers, setRegisters] = useState<CashRegisterRecord[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [movements, setMovements] = useState<RegisterTransaction[]>([]);
  const [currentBalance, setCurrentBalance] = useState(0);
  const [cashIn, setCashIn] = useState(0);
  const [cashOut, setCashOut] = useState(0);
  const [loading, setLoading] = useState(true);

  const [showOpenForm, setShowOpenForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [closingBalance, setClosingBalance] = useState(0);
  const [closeNotes, setCloseNotes] = useState('');

  const [expenseCategory, setExpenseCategory] = useState('other');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expensePayment, setExpensePayment] = useState('cash');
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState<'register' | 'movements' | 'expenses' | 'history'>('register');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];

      const [regRes, expRes, historyRes] = await Promise.all([
        supabase.from('cash_registers').select('*').eq('status', 'open').order('opened_at', { ascending: false }).limit(1),
        supabase.from('expenses').select('*').gte('expense_date', today).order('created_at', { ascending: false }),
        supabase.from('cash_registers').select('*').order('opened_at', { ascending: false }).limit(30),
      ]);

      if (expRes.data) setExpenses(expRes.data as any[]);
      if (historyRes.data) setRegisters(historyRes.data as any[]);

      if (regRes.data && regRes.data.length > 0) {
        const reg = regRes.data[0] as CashRegisterRecord;
        setActiveRegister(reg);

        const { data: txData } = await supabase
          .from('register_transactions')
          .select('*')
          .eq('register_id', reg.id)
          .order('created_at', { ascending: false });

        if (txData) {
          setMovements(txData as RegisterTransaction[]);
          const totalIn = txData.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
          const totalOut = Math.abs(txData.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0));
          setCashIn(totalIn);
          setCashOut(totalOut);
          setCurrentBalance(reg.opening_balance + totalIn - totalOut);
        }
      } else {
        setActiveRegister(null);
        setMovements([]);
        setCashIn(0);
        setCashOut(0);
        setCurrentBalance(0);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openRegister = async () => {
    setSubmitting(true);
    const { error } = await supabase.from('cash_registers').insert({
      opening_balance: openingBalance,
      opened_by: user?.id,
      status: 'open',
    });
    if (!error) {
      setShowOpenForm(false);
      setOpeningBalance(0);
      await loadData();
    }
    setSubmitting(false);
  };

  const closeRegister = async () => {
    if (!activeRegister) return;
    setSubmitting(true);

    const { error } = await supabase.from('cash_registers').update({
      closing_balance: closingBalance,
      expected_balance: currentBalance,
      status: 'closed',
      closed_by: user?.id,
      closed_at: new Date().toISOString(),
      notes: closeNotes || null,
    }).eq('id', activeRegister.id);

    if (!error) {
      setShowCloseForm(false);
      setActiveRegister(null);
      setClosingBalance(0);
      setCloseNotes('');
      await loadData();
    }
    setSubmitting(false);
  };

  const addExpense = async () => {
    if (!expenseAmount || parseFloat(expenseAmount) <= 0) return;
    setSubmitting(true);

    const num = `EXP-${Date.now().toString(36).toUpperCase()}`;
    const { error } = await supabase.from('expenses').insert({
      expense_number: num,
      category: expenseCategory,
      amount: parseFloat(expenseAmount),
      description: expenseDescription || null,
      payment_method: expensePayment,
      cash_register_id: activeRegister?.id || null,
      created_by: user?.id,
    });

    if (!error) {
      setShowExpenseForm(false);
      setExpenseAmount('');
      setExpenseDescription('');
      setExpenseCategory('other');
      setExpensePayment('cash');
      await loadData();
    }
    setSubmitting(false);
  };

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat(isRTL ? 'ar-SA' : 'en-US', { minimumFractionDigits: 2 }).format(n);

  const getCategoryLabel = (val: string) => {
    const cat = EXPENSE_CATEGORIES.find(c => c.value === val);
    return cat ? (isRTL ? cat.ar : cat.en) : val;
  };

  const getMovementLabel = (tx: RegisterTransaction) => {
    if (tx.description_ar && isRTL) return tx.description_ar;
    return tx.description || (tx.transaction_type === 'sale' ? (isRTL ? 'بيع نقدي' : 'Cash Sale') : (isRTL ? 'مصروف' : 'Expense'));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-16 h-16 border-4 border-teal-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{isRTL ? 'الصندوق' : 'Cash Register'}</h2>
          <p className="text-gray-500 mt-1">{isRTL ? 'إدارة الصندوق والمصروفات اليومية' : 'Manage daily cash and expenses'}</p>
        </div>
        <div className="flex gap-2">
          {!activeRegister ? (
            <button onClick={() => setShowOpenForm(true)} className="flex items-center gap-2 bg-teal-600 text-white px-4 py-2.5 rounded-lg hover:bg-teal-700 transition font-medium">
              <Unlock className="w-5 h-5" /> {isRTL ? 'فتح الصندوق' : 'Open Register'}
            </button>
          ) : (
            <>
              <button onClick={() => setShowExpenseForm(true)} className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-4 py-2.5 rounded-lg hover:bg-gray-50 transition font-medium">
                <Plus className="w-5 h-5" /> {isRTL ? 'إضافة مصروف' : 'Add Expense'}
              </button>
              <button onClick={() => { setClosingBalance(currentBalance); setShowCloseForm(true); }} className="flex items-center gap-2 bg-red-600 text-white px-4 py-2.5 rounded-lg hover:bg-red-700 transition font-medium">
                <Lock className="w-5 h-5" /> {isRTL ? 'إغلاق الصندوق' : 'Close Register'}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex gap-2 border-b overflow-x-auto">
        {(['register', 'movements', 'expenses', 'history'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition whitespace-nowrap ${tab === t ? 'border-teal-600 text-teal-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t === 'register' ? (isRTL ? 'الصندوق' : 'Register')
              : t === 'movements' ? (isRTL ? 'الحركات' : 'Movements')
              : t === 'expenses' ? (isRTL ? 'المصروفات' : 'Expenses')
              : (isRTL ? 'السجل' : 'History')}
          </button>
        ))}
      </div>

      {tab === 'register' && (
        <>
          {activeRegister ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl shadow-sm border p-5">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-blue-100 rounded-lg"><Wallet className="w-5 h-5 text-blue-600" /></div>
                    <span className="text-sm text-gray-500">{isRTL ? 'رصيد الفتح' : 'Opening'}</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{formatCurrency(activeRegister.opening_balance)}</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-5">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-green-100 rounded-lg"><ArrowUpCircle className="w-5 h-5 text-green-600" /></div>
                    <span className="text-sm text-gray-500">{isRTL ? 'مبيعات نقدية' : 'Cash In'}</span>
                  </div>
                  <p className="text-2xl font-bold text-green-600">+{formatCurrency(cashIn)}</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-5">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-red-100 rounded-lg"><ArrowDownCircle className="w-5 h-5 text-red-600" /></div>
                    <span className="text-sm text-gray-500">{isRTL ? 'مصروفات نقدية' : 'Cash Out'}</span>
                  </div>
                  <p className="text-2xl font-bold text-red-600">-{formatCurrency(cashOut)}</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-5 bg-teal-50 border-teal-200">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-teal-100 rounded-lg"><DollarSign className="w-5 h-5 text-teal-600" /></div>
                    <span className="text-sm text-teal-700 font-medium">{isRTL ? 'الرصيد الحالي' : 'Current Balance'}</span>
                  </div>
                  <p className="text-2xl font-bold text-teal-700">{formatCurrency(currentBalance)}</p>
                  <p className="text-xs text-teal-500 mt-1">{isRTL ? 'محسوب من الحركات الفعلية' : 'Calculated from movements'}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl shadow-sm border p-6">
                  <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-teal-600" />
                    {isRTL ? 'ملخص الوردية' : 'Shift Summary'}
                  </h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between py-2 border-b border-gray-100">
                      <span className="text-gray-500">{isRTL ? 'رصيد الفتح' : 'Opening Balance'}</span>
                      <span className="font-medium text-gray-900">{formatCurrency(activeRegister.opening_balance)} {isRTL ? 'ر.س' : 'SAR'}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-gray-100">
                      <span className="text-gray-500">{isRTL ? 'إجمالي المبيعات النقدية' : 'Total Cash Sales'}</span>
                      <span className="font-medium text-green-600">+{formatCurrency(cashIn)} {isRTL ? 'ر.س' : 'SAR'}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-gray-100">
                      <span className="text-gray-500">{isRTL ? 'إجمالي المصروفات النقدية' : 'Total Cash Expenses'}</span>
                      <span className="font-medium text-red-600">-{formatCurrency(cashOut)} {isRTL ? 'ر.س' : 'SAR'}</span>
                    </div>
                    <div className="flex justify-between py-2 pt-3 border-t-2 border-gray-200">
                      <span className="font-bold text-gray-900">{isRTL ? 'الرصيد المتوقع' : 'Expected Balance'}</span>
                      <span className="font-bold text-teal-600">{formatCurrency(currentBalance)} {isRTL ? 'ر.س' : 'SAR'}</span>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <Calendar className="w-3.5 h-3.5" />
                      {isRTL ? 'فُتح في:' : 'Opened at:'} {new Date(activeRegister.opened_at).toLocaleTimeString(isRTL ? 'ar-SA' : 'en-US')}
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border p-6">
                  <h3 className="font-bold text-gray-900 mb-4">{isRTL ? 'آخر الحركات' : 'Recent Movements'}</h3>
                  {movements.length === 0 ? (
                    <p className="text-gray-400 text-center py-6 text-sm">{isRTL ? 'لا توجد حركات بعد' : 'No movements yet'}</p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {movements.slice(0, 10).map(tx => (
                        <div key={tx.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center gap-2">
                            {tx.amount > 0
                              ? <ArrowUpCircle className="w-4 h-4 text-green-500 shrink-0" />
                              : <ArrowDownCircle className="w-4 h-4 text-red-500 shrink-0" />}
                            <div>
                              <span className="text-sm font-medium text-gray-900">{getMovementLabel(tx)}</span>
                              <p className="text-xs text-gray-400">{new Date(tx.created_at).toLocaleTimeString(isRTL ? 'ar-SA' : 'en-US', { hour: '2-digit', minute: '2-digit' })}</p>
                            </div>
                          </div>
                          <span className={`text-sm font-bold ${tx.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {tx.amount > 0 ? '+' : ''}{formatCurrency(tx.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border p-12 text-center">
              <Lock className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <h3 className="text-xl font-bold text-gray-700 mb-2">{isRTL ? 'الصندوق مغلق' : 'Register Closed'}</h3>
              <p className="text-gray-400 mb-6">{isRTL ? 'افتح الصندوق لبدء العمليات اليومية' : 'Open the register to start daily operations'}</p>
              <button onClick={() => setShowOpenForm(true)} className="bg-teal-600 text-white px-6 py-3 rounded-lg hover:bg-teal-700 transition font-medium inline-flex items-center gap-2">
                <Unlock className="w-5 h-5" /> {isRTL ? 'فتح الصندوق' : 'Open Register'}
              </button>
            </div>
          )}
        </>
      )}

      {tab === 'movements' && (
        <div className="bg-white rounded-xl shadow-sm border">
          <div className="p-6 border-b">
            <h3 className="font-bold text-gray-900">{isRTL ? 'سجل حركات الصندوق' : 'Cash Movements'}</h3>
            {activeRegister && (
              <p className="text-sm text-gray-500 mt-1">
                {isRTL ? `الرصيد الحالي: ${formatCurrency(currentBalance)} ر.س` : `Current balance: ${formatCurrency(currentBalance)} SAR`}
              </p>
            )}
          </div>
          {!activeRegister || movements.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <Receipt className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p>{isRTL ? 'لا توجد حركات' : 'No movements'}</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">{isRTL ? 'الوقت' : 'Time'}</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">{isRTL ? 'النوع' : 'Type'}</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">{isRTL ? 'الوصف' : 'Description'}</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500">{isRTL ? 'المبلغ' : 'Amount'}</th>
                </tr>
              </thead>
              <tbody>
                {movements.map(tx => (
                  <tr key={tx.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="py-3 px-4 text-sm text-gray-500">
                      {new Date(tx.created_at).toLocaleTimeString(isRTL ? 'ar-SA' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        tx.transaction_type === 'sale' ? 'bg-green-100 text-green-700'
                        : tx.transaction_type === 'expense' ? 'bg-red-100 text-red-700'
                        : tx.transaction_type === 'deposit' ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-700'
                      }`}>
                        {tx.transaction_type === 'sale' ? (isRTL ? 'بيع' : 'Sale')
                          : tx.transaction_type === 'expense' ? (isRTL ? 'مصروف' : 'Expense')
                          : tx.transaction_type === 'deposit' ? (isRTL ? 'إيداع' : 'Deposit')
                          : (isRTL ? 'سحب' : 'Withdrawal')}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-700">{getMovementLabel(tx)}</td>
                    <td className={`py-3 px-4 text-sm font-bold text-right ${tx.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {tx.amount > 0 ? '+' : ''}{formatCurrency(tx.amount)} {isRTL ? 'ر.س' : 'SAR'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-bold">
                  <td colSpan={3} className="py-3 px-4 text-sm text-gray-700">{isRTL ? 'الرصيد الحالي' : 'Current Balance'}</td>
                  <td className="py-3 px-4 text-sm text-teal-700 text-right">{formatCurrency(currentBalance)} {isRTL ? 'ر.س' : 'SAR'}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      {tab === 'expenses' && (
        <div className="bg-white rounded-xl shadow-sm border">
          <div className="p-6 border-b flex items-center justify-between">
            <h3 className="font-bold text-gray-900">{isRTL ? 'سجل المصروفات' : 'Expense Records'}</h3>
            <button onClick={() => setShowExpenseForm(true)} className="flex items-center gap-2 bg-teal-600 text-white px-3 py-2 rounded-lg hover:bg-teal-700 transition text-sm font-medium">
              <Plus className="w-4 h-4" /> {isRTL ? 'إضافة' : 'Add'}
            </button>
          </div>
          {expenses.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <Receipt className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p>{isRTL ? 'لا توجد مصروفات' : 'No expenses'}</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">{isRTL ? 'الرقم' : 'Number'}</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">{isRTL ? 'التصنيف' : 'Category'}</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">{isRTL ? 'الوصف' : 'Description'}</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">{isRTL ? 'الدفع' : 'Payment'}</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500">{isRTL ? 'المبلغ' : 'Amount'}</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map(exp => (
                  <tr key={exp.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="py-3 px-4 text-sm font-mono text-gray-500">{exp.expense_number}</td>
                    <td className="py-3 px-4 text-sm">{getCategoryLabel(exp.category)}</td>
                    <td className="py-3 px-4 text-sm text-gray-600">{exp.description || '-'}</td>
                    <td className="py-3 px-4 text-sm">
                      {exp.payment_method === 'cash' ? (isRTL ? 'نقدي' : 'Cash')
                        : exp.payment_method === 'transfer' ? (isRTL ? 'تحويل' : 'Transfer')
                        : (isRTL ? 'بطاقة' : 'Card')}
                    </td>
                    <td className="py-3 px-4 text-sm font-bold text-red-600 text-right">{formatCurrency(exp.amount)} {isRTL ? 'ر.س' : 'SAR'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="bg-white rounded-xl shadow-sm border">
          <div className="p-6 border-b">
            <h3 className="font-bold text-gray-900">{isRTL ? 'سجل الصندوق' : 'Register History'}</h3>
          </div>
          {registers.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <Clock className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p>{isRTL ? 'لا يوجد سجل' : 'No history'}</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">{isRTL ? 'التاريخ' : 'Date'}</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">{isRTL ? 'الحالة' : 'Status'}</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500">{isRTL ? 'رصيد الفتح' : 'Opening'}</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500">{isRTL ? 'المتوقع' : 'Expected'}</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500">{isRTL ? 'الفعلي' : 'Actual'}</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500">{isRTL ? 'الفرق' : 'Diff'}</th>
                </tr>
              </thead>
              <tbody>
                {registers.map(reg => {
                  const diff = reg.closing_balance !== null && reg.expected_balance !== null
                    ? reg.closing_balance - reg.expected_balance
                    : null;
                  return (
                    <tr key={reg.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="py-3 px-4 text-sm">{new Date(reg.opened_at).toLocaleDateString(isRTL ? 'ar-SA' : 'en-US')}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${reg.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                          {reg.status === 'open' ? (isRTL ? 'مفتوح' : 'Open') : (isRTL ? 'مغلق' : 'Closed')}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-right">{formatCurrency(reg.opening_balance)}</td>
                      <td className="py-3 px-4 text-sm text-right">{reg.expected_balance !== null ? formatCurrency(reg.expected_balance) : '-'}</td>
                      <td className="py-3 px-4 text-sm text-right">{reg.closing_balance !== null ? formatCurrency(reg.closing_balance) : '-'}</td>
                      <td className="py-3 px-4 text-sm text-right font-medium">
                        {diff !== null ? (
                          <span className={diff === 0 ? 'text-green-600' : diff > 0 ? 'text-blue-600' : 'text-red-600'}>
                            {diff > 0 ? '+' : ''}{formatCurrency(diff)}
                          </span>
                        ) : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showOpenForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-bold">{isRTL ? 'فتح الصندوق' : 'Open Register'}</h3>
              <button onClick={() => setShowOpenForm(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'الرصيد الافتتاحي (ر.س)' : 'Opening Balance (SAR)'}</label>
                <input type="number" min="0" step="0.01" value={openingBalance} onChange={(e) => setOpeningBalance(parseFloat(e.target.value) || 0)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent" dir="ltr" />
              </div>
              <p className="text-xs text-gray-500">{isRTL ? 'سيتم تسجيل جميع المبيعات النقدية والمصروفات تلقائياً في الصندوق.' : 'All cash sales and expenses will be automatically recorded in this register.'}</p>
              <button onClick={openRegister} disabled={submitting} className="w-full bg-teal-600 text-white py-2.5 rounded-lg hover:bg-teal-700 transition font-medium disabled:opacity-50 flex items-center justify-center gap-2">
                <Unlock className="w-4 h-4" /> {submitting ? (isRTL ? 'جاري الفتح...' : 'Opening...') : (isRTL ? 'فتح' : 'Open')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCloseForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-bold">{isRTL ? 'إغلاق الصندوق' : 'Close Register'}</h3>
              <button onClick={() => setShowCloseForm(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-gray-50 p-3 rounded-lg space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">{isRTL ? 'الرصيد المتوقع' : 'Expected Balance'}</span>
                  <span className="font-bold">{formatCurrency(currentBalance)}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-400">
                  <span>{isRTL ? `فتح: ${formatCurrency(activeRegister?.opening_balance || 0)} + مبيعات: ${formatCurrency(cashIn)} - مصروفات: ${formatCurrency(cashOut)}` : `Opening: ${formatCurrency(activeRegister?.opening_balance || 0)} + Sales: ${formatCurrency(cashIn)} - Expenses: ${formatCurrency(cashOut)}`}</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'الرصيد الفعلي (ر.س)' : 'Actual Balance (SAR)'}</label>
                <input type="number" min="0" step="0.01" value={closingBalance} onChange={(e) => setClosingBalance(parseFloat(e.target.value) || 0)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent" dir="ltr" />
              </div>
              {closingBalance !== currentBalance && (
                <div className={`text-sm p-2 rounded-lg ${closingBalance > currentBalance ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700'}`}>
                  {isRTL ? 'الفرق:' : 'Difference:'} {formatCurrency(closingBalance - currentBalance)} {isRTL ? 'ر.س' : 'SAR'}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'ملاحظات' : 'Notes'}</label>
                <textarea value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} rows={2} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm resize-none" />
              </div>
              <button onClick={closeRegister} disabled={submitting} className="w-full bg-red-600 text-white py-2.5 rounded-lg hover:bg-red-700 transition font-medium disabled:opacity-50 flex items-center justify-center gap-2">
                <Lock className="w-4 h-4" /> {submitting ? (isRTL ? 'جاري الإغلاق...' : 'Closing...') : (isRTL ? 'إغلاق الصندوق' : 'Close Register')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showExpenseForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-bold">{isRTL ? 'إضافة مصروف' : 'Add Expense'}</h3>
              <button onClick={() => setShowExpenseForm(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'التصنيف' : 'Category'}</label>
                <select value={expenseCategory} onChange={(e) => setExpenseCategory(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent">
                  {EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{isRTL ? c.ar : c.en}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'المبلغ (ر.س)' : 'Amount (SAR)'}</label>
                <input type="number" min="0" step="0.01" value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent" dir="ltr" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'طريقة الدفع' : 'Payment Method'}</label>
                <select value={expensePayment} onChange={(e) => setExpensePayment(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent">
                  <option value="cash">{isRTL ? 'نقدي' : 'Cash'}</option>
                  <option value="transfer">{isRTL ? 'تحويل' : 'Transfer'}</option>
                  <option value="card">{isRTL ? 'بطاقة' : 'Card'}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'الوصف' : 'Description'}</label>
                <input type="text" value={expenseDescription} onChange={(e) => setExpenseDescription(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent" dir="rtl" />
              </div>
              <button onClick={addExpense} disabled={submitting || !expenseAmount} className="w-full bg-teal-600 text-white py-2.5 rounded-lg hover:bg-teal-700 transition font-medium disabled:opacity-50 flex items-center justify-center gap-2">
                <Save className="w-4 h-4" /> {submitting ? (isRTL ? 'جاري الحفظ...' : 'Saving...') : (isRTL ? 'حفظ' : 'Save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
