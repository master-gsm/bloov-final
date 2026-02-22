import { useState } from 'react';
import { Plus, X, Save, Loader2, FileText, Calculator, CheckCircle, Banknote } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { EmployeeSettlement, Employee } from './types';

interface Props {
  isRTL: boolean;
  settlements: EmployeeSettlement[];
  employees: Employee[];
  userProfile: any;
  loading: boolean;
  onRefresh: () => void;
}

const statusConfig: Record<string, { ar: string; en: string; color: string }> = {
  draft:    { ar: 'مسودة',   en: 'Draft',    color: 'bg-gray-100 text-gray-700'   },
  approved: { ar: 'معتمدة',  en: 'Approved', color: 'bg-green-100 text-green-700' },
  paid:     { ar: 'مدفوعة', en: 'Paid',     color: 'bg-teal-100 text-teal-700'   },
};

export function SettlementsTab({ isRTL, settlements, employees, userProfile, loading, onRefresh }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    employee_id: '',
    last_working_day: '',
    termination_by: 'employer' as 'employer' | 'resignation',
    years_of_service: 0,
    end_of_service: 0,
    unused_vacation_days: 0,
    unused_vacation_compensation: 0,
    pending_commissions: 0,
    deductions: 0,
    final_amount: 0,
    notes: '',
  });

  const [calcResult, setCalcResult] = useState<any>(null);

  const handleCalculate = async () => {
    if (!form.employee_id || !form.last_working_day) {
      setError(isRTL ? 'اختر الموظف وآخر يوم عمل أولاً' : 'Select employee and last working day first');
      return;
    }
    setCalculating(true);
    setError('');
    try {
      const { data, error: err } = await supabase.rpc('calculate_end_of_service', {
        p_employee_id: form.employee_id,
        p_last_day: form.last_working_day,
        p_termination_by: form.termination_by,
      });
      if (err) throw err;
      const r = data?.[0];
      if (r) {
        setCalcResult(r);
        setForm(prev => ({
          ...prev,
          years_of_service:             parseFloat(r.years_of_service) || 0,
          end_of_service:               parseFloat(r.end_of_service)   || 0,
          unused_vacation_days:         parseFloat(r.unused_vacation_days) || 0,
          unused_vacation_compensation: parseFloat(r.unused_vacation_compensation) || 0,
          pending_commissions:          parseFloat(r.pending_commissions) || 0,
          final_amount:                 parseFloat(r.suggested_final_amount) || 0,
        }));
      }
    } catch (e: any) {
      setError(e.message || 'Calculation error');
    } finally {
      setCalculating(false);
    }
  };

  const recomputeFinal = (updated: typeof form) => {
    updated.final_amount =
      updated.end_of_service +
      updated.unused_vacation_compensation +
      updated.pending_commissions -
      updated.deductions;
    return updated;
  };

  const handleSave = async () => {
    if (!form.employee_id || !form.last_working_day) {
      setError(isRTL ? 'الرجاء تعبئة الحقول المطلوبة' : 'Please fill required fields');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const emp = employees.find(e => e.id === form.employee_id);
      const { error: err } = await supabase.from('employee_settlements').insert([{
        employee_id:                  form.employee_id,
        branch_id:                    emp?.branch_id || userProfile?.branch_id,
        last_working_day:             form.last_working_day,
        years_of_service:             form.years_of_service,
        end_of_service:               form.end_of_service,
        unused_vacation_days:         form.unused_vacation_days,
        unused_vacation_compensation: form.unused_vacation_compensation,
        pending_commissions:          form.pending_commissions,
        deductions:                   form.deductions,
        final_amount:                 form.final_amount,
        notes:                        form.notes,
        status:                       'draft',
        created_by:                   userProfile?.id,
      }]);
      if (err) throw err;

      await supabase.from('employees').update({
        termination_date: form.last_working_day,
        is_active: false,
      }).eq('id', form.employee_id);

      setShowModal(false);
      resetForm();
      onRefresh();
    } catch (e: any) {
      setError(e.message || 'Error saving settlement');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (id: string, newStatus: 'approved' | 'paid') => {
    const update: any = { status: newStatus };
    if (newStatus === 'approved') update.approved_by = userProfile?.id;
    if (newStatus === 'paid') update.paid_at = new Date().toISOString();
    await supabase.from('employee_settlements').update(update).eq('id', id);
    onRefresh();
  };

  const resetForm = () => {
    setForm({
      employee_id: '', last_working_day: '', termination_by: 'employer',
      years_of_service: 0, end_of_service: 0, unused_vacation_days: 0,
      unused_vacation_compensation: 0, pending_commissions: 0, deductions: 0,
      final_amount: 0, notes: '',
    });
    setCalcResult(null);
    setError('');
  };

  const fmt = (n: number) => n.toLocaleString('ar-SA', { minimumFractionDigits: 2 });
  const cur = isRTL ? 'ر.س' : 'SAR';

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          className="flex items-center gap-2 bg-teal-600 text-white px-5 py-2.5 rounded-lg hover:bg-teal-700 transition text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          {isRTL ? 'تسوية نهاية خدمة' : 'New Settlement'}
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                {[
                  isRTL ? 'الموظف' : 'Employee',
                  isRTL ? 'آخر يوم عمل' : 'Last Day',
                  isRTL ? 'سنوات الخدمة' : 'Years',
                  isRTL ? 'مكافأة نهاية الخدمة' : 'Gratuity',
                  isRTL ? 'تعويض الإجازة' : 'Vacation Comp.',
                  isRTL ? 'المبلغ الإجمالي' : 'Final Amount',
                  isRTL ? 'الحالة' : 'Status',
                  isRTL ? 'الإجراءات' : 'Actions',
                ].map((h, i) => (
                  <th key={i} className="px-4 py-3 text-right text-sm font-medium text-gray-700">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center">
                  <Loader2 className="w-7 h-7 animate-spin mx-auto text-teal-600" />
                </td></tr>
              ) : settlements.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                  <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  {isRTL ? 'لا توجد تسويات' : 'No settlements'}
                </td></tr>
              ) : settlements.map(s => {
                const cfg = statusConfig[s.status];
                return (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{s.employees?.full_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{s.last_working_day}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{Number(s.years_of_service).toFixed(1)}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900">{fmt(s.end_of_service)} {cur}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{fmt(s.unused_vacation_compensation)} {cur}</td>
                    <td className="px-4 py-3 text-sm font-bold text-teal-700">{fmt(s.final_amount)} {cur}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${cfg.color}`}>
                        {isRTL ? cfg.ar : cfg.en}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {s.status === 'draft' && (
                          <button
                            onClick={() => handleStatusChange(s.id, 'approved')}
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                            title={isRTL ? 'اعتماد' : 'Approve'}
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                        )}
                        {s.status === 'approved' && (
                          <button
                            onClick={() => handleStatusChange(s.id, 'paid')}
                            className="p-1.5 text-teal-600 hover:bg-teal-50 rounded"
                            title={isRTL ? 'تسجيل الدفع' : 'Mark as Paid'}
                          >
                            <Banknote className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 space-y-5 my-8">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">
                {isRTL ? 'تسوية نهاية خدمة' : 'End-of-Service Settlement'}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 rounded-lg">{error}</div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isRTL ? 'الموظف *' : 'Employee *'}
                </label>
                <select
                  value={form.employee_id}
                  onChange={e => setForm({ ...form, employee_id: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">{isRTL ? 'اختر موظفاً' : 'Select employee'}</option>
                  {employees.filter(e => e.is_active).map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isRTL ? 'آخر يوم عمل *' : 'Last Working Day *'}
                </label>
                <input
                  type="date"
                  value={form.last_working_day}
                  onChange={e => setForm({ ...form, last_working_day: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isRTL ? 'سبب الإنهاء' : 'Termination By'}
                </label>
                <select
                  value={form.termination_by}
                  onChange={e => setForm({ ...form, termination_by: e.target.value as any })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                >
                  <option value="employer">{isRTL ? 'إنهاء من صاحب العمل' : 'Terminated by Employer'}</option>
                  <option value="resignation">{isRTL ? 'استقالة الموظف' : 'Employee Resignation'}</option>
                </select>
              </div>

              <div className="flex items-end">
                <button
                  onClick={handleCalculate}
                  disabled={calculating || !form.employee_id || !form.last_working_day}
                  className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {calculating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
                  {isRTL ? 'احتساب المكافأة' : 'Calculate Gratuity'}
                </button>
              </div>
            </div>

            {calcResult && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2 text-sm">
                <p className="font-semibold text-blue-800 mb-2">
                  {isRTL ? 'نتائج الاحتساب (نظام العمل السعودي)' : 'Calculation Results (Saudi Labor Law)'}
                </p>
                <div className="grid grid-cols-2 gap-2 text-blue-700">
                  <span>{isRTL ? 'سنوات الخدمة:' : 'Years of service:'}</span>
                  <span className="font-bold">{Number(calcResult.years_of_service).toFixed(2)}</span>
                  <span>{isRTL ? 'مكافأة نهاية الخدمة:' : 'Gratuity:'}</span>
                  <span className="font-bold">{fmt(calcResult.end_of_service)} {cur}</span>
                  <span>{isRTL ? 'رصيد الإجازات:' : 'Vacation balance:'}</span>
                  <span className="font-bold">{calcResult.unused_vacation_days} {isRTL ? 'يوم' : 'days'}</span>
                  <span>{isRTL ? 'تعويض الإجازة:' : 'Vacation compensation:'}</span>
                  <span className="font-bold">{fmt(calcResult.unused_vacation_compensation)} {cur}</span>
                  <span>{isRTL ? 'عمولات معلقة:' : 'Pending commissions:'}</span>
                  <span className="font-bold">{fmt(calcResult.pending_commissions)} {cur}</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { key: 'end_of_service',               label: isRTL ? 'مكافأة نهاية الخدمة' : 'Gratuity' },
                { key: 'unused_vacation_compensation',  label: isRTL ? 'تعويض الإجازة' : 'Vacation Compensation' },
                { key: 'pending_commissions',           label: isRTL ? 'عمولات معلقة' : 'Pending Commissions' },
                { key: 'deductions',                    label: isRTL ? 'الخصومات' : 'Deductions' },
              ].map(field => (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
                  <input
                    type="number"
                    value={(form as any)[field.key]}
                    onChange={e => {
                      const updated = { ...form, [field.key]: parseFloat(e.target.value) || 0 };
                      setForm(recomputeFinal(updated));
                    }}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                    min="0"
                    step="0.01"
                  />
                </div>
              ))}

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isRTL ? 'ملاحظات' : 'Notes'}
                </label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            <div className="bg-teal-50 border border-teal-200 rounded-lg px-4 py-3 flex justify-between items-center">
              <span className="text-sm font-medium text-teal-800">
                {isRTL ? 'المبلغ الإجمالي النهائي:' : 'Total Final Amount:'}
              </span>
              <span className="text-2xl font-bold text-teal-700">{fmt(form.final_amount)} {cur}</span>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2.5 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium"
              >
                {isRTL ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition font-medium flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {isRTL ? 'حفظ التسوية' : 'Save Settlement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
