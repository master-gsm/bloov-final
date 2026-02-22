import { useState } from 'react';
import { Plus, X, Save, Loader2, Banknote, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Employee } from './types';

interface Loan {
  id: string;
  employee_id: string;
  loan_amount: number;
  monthly_deduction: number;
  remaining_balance: number;
  status: 'active' | 'completed' | 'cancelled';
  notes: string;
  created_at: string;
  employees?: { full_name: string };
}

interface Props {
  isRTL: boolean;
  loans: Loan[];
  employees: Employee[];
  userProfile: any;
  loading: boolean;
  onRefresh: () => void;
}

const statusCfg: Record<string, { ar: string; en: string; cls: string }> = {
  active:    { ar: 'نشطة',    en: 'Active',    cls: 'bg-blue-100 text-blue-700' },
  completed: { ar: 'مكتملة',  en: 'Completed', cls: 'bg-green-100 text-green-700' },
  cancelled: { ar: 'ملغاة',   en: 'Cancelled', cls: 'bg-gray-100 text-gray-600' },
};

export function LoansTab({ isRTL, loans, employees, userProfile, loading, onRefresh }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    employee_id: '',
    loan_amount: 0,
    monthly_deduction: 0,
    notes: '',
  });

  const cur = isRTL ? 'ر.س' : 'SAR';
  const fmt = (n: number) => (n || 0).toLocaleString('ar-SA', { minimumFractionDigits: 2 });

  const handleSave = async () => {
    if (!form.employee_id || form.loan_amount <= 0 || form.monthly_deduction <= 0) {
      setError(isRTL ? 'الرجاء تعبئة جميع الحقول' : 'Please fill all required fields');
      return;
    }
    if (form.monthly_deduction > form.loan_amount) {
      setError(isRTL ? 'القسط الشهري لا يمكن أن يتجاوز مبلغ السلفة' : 'Monthly deduction cannot exceed loan amount');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const emp = employees.find(e => e.id === form.employee_id);
      const { error: err } = await supabase.from('employee_loans').insert([{
        employee_id:       form.employee_id,
        branch_id:         emp?.branch_id || userProfile?.branch_id,
        loan_amount:       form.loan_amount,
        monthly_deduction: form.monthly_deduction,
        remaining_balance: form.loan_amount,
        notes:             form.notes,
        status:            'active',
        created_by:        userProfile?.id,
      }]);
      if (err) throw err;
      setShowModal(false);
      resetForm();
      onRefresh();
    } catch (e: any) {
      setError(e.message || 'Error saving loan');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (loanId: string) => {
    if (!confirm(isRTL ? 'إلغاء هذه السلفة؟' : 'Cancel this loan?')) return;
    await supabase.from('employee_loans').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', loanId);
    onRefresh();
  };

  const resetForm = () => {
    setForm({ employee_id: '', loan_amount: 0, monthly_deduction: 0, notes: '' });
    setError('');
  };

  const totalActive    = loans.filter(l => l.status === 'active').reduce((s, l) => s + l.remaining_balance, 0);
  const totalCompleted = loans.filter(l => l.status === 'completed').length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border shadow-sm p-5">
          <p className="text-sm text-gray-500 mb-1">{isRTL ? 'السلف النشطة' : 'Active Loans'}</p>
          <p className="text-2xl font-bold text-blue-600">{loans.filter(l => l.status === 'active').length}</p>
        </div>
        <div className="bg-white rounded-xl border shadow-sm p-5">
          <p className="text-sm text-gray-500 mb-1">{isRTL ? 'إجمالي الرصيد المتبقي' : 'Total Remaining'}</p>
          <p className="text-2xl font-bold text-red-600">{fmt(totalActive)} {cur}</p>
        </div>
        <div className="bg-white rounded-xl border shadow-sm p-5">
          <p className="text-sm text-gray-500 mb-1">{isRTL ? 'السلف المكتملة' : 'Completed Loans'}</p>
          <p className="text-2xl font-bold text-green-600">{totalCompleted}</p>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          className="flex items-center gap-2 bg-teal-600 text-white px-5 py-2.5 rounded-lg hover:bg-teal-700 transition text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          {isRTL ? 'إضافة سلفة' : 'Add Loan'}
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                {[
                  isRTL ? 'الموظف' : 'Employee',
                  isRTL ? 'مبلغ السلفة' : 'Loan Amount',
                  isRTL ? 'القسط الشهري' : 'Monthly Deduction',
                  isRTL ? 'الرصيد المتبقي' : 'Remaining Balance',
                  isRTL ? 'الحالة' : 'Status',
                  isRTL ? 'الإجراءات' : 'Actions',
                ].map((h, i) => (
                  <th key={i} className="px-4 py-3 text-right text-sm font-medium text-gray-700">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center">
                  <Loader2 className="w-7 h-7 animate-spin mx-auto text-teal-600" />
                </td></tr>
              ) : loans.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                  <Banknote className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  {isRTL ? 'لا توجد سلف' : 'No loans found'}
                </td></tr>
              ) : loans.map(loan => {
                const cfg = statusCfg[loan.status];
                const pct = loan.loan_amount > 0
                  ? Math.round(((loan.loan_amount - loan.remaining_balance) / loan.loan_amount) * 100)
                  : 100;
                return (
                  <tr key={loan.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{loan.employees?.full_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{fmt(loan.loan_amount)} {cur}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{fmt(loan.monthly_deduction)} {cur}</td>
                    <td className="px-4 py-3 text-sm">
                      <div className="space-y-1">
                        <span className={`font-semibold ${loan.remaining_balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {fmt(loan.remaining_balance)} {cur}
                        </span>
                        <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-teal-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-gray-400">{pct}% {isRTL ? 'مسدد' : 'paid'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${cfg.cls}`}>
                        {isRTL ? cfg.ar : cfg.en}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {loan.status === 'active' && (
                        <button
                          onClick={() => handleCancel(loan.id)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                          title={isRTL ? 'إلغاء السلفة' : 'Cancel loan'}
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">{isRTL ? 'إضافة سلفة' : 'Add Employee Loan'}</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 rounded-lg">{error}</div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'الموظف *' : 'Employee *'}</label>
                <select
                  value={form.employee_id}
                  onChange={e => setForm({ ...form, employee_id: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">{isRTL ? 'اختر موظفاً' : 'Select employee'}</option>
                  {employees.filter(e => e.is_active && !e.termination_date).map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'مبلغ السلفة *' : 'Loan Amount *'}</label>
                <input
                  type="number"
                  value={form.loan_amount || ''}
                  onChange={e => setForm({ ...form, loan_amount: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  min="1" step="0.01"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'القسط الشهري *' : 'Monthly Deduction *'}</label>
                <input
                  type="number"
                  value={form.monthly_deduction || ''}
                  onChange={e => setForm({ ...form, monthly_deduction: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  min="1" step="0.01"
                  placeholder="0.00"
                />
              </div>

              {form.loan_amount > 0 && form.monthly_deduction > 0 && (
                <div className="bg-teal-50 border border-teal-200 rounded-lg px-4 py-2.5 text-sm text-teal-700">
                  {isRTL
                    ? `عدد الأقساط: ${Math.ceil(form.loan_amount / form.monthly_deduction)} شهر`
                    : `Installments: ${Math.ceil(form.loan_amount / form.monthly_deduction)} months`}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'ملاحظات' : 'Notes'}</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2.5 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium">
                {isRTL ? 'إلغاء' : 'Cancel'}
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-medium flex items-center justify-center gap-2 disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {isRTL ? 'حفظ السلفة' : 'Save Loan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
