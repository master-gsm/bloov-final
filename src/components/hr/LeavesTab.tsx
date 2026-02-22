import { useState } from 'react';
import { Plus, X, Save, Loader2, CheckCircle, XCircle, Clock, CalendarDays } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { EmployeeLeave, Employee } from './types';

interface Props {
  isRTL: boolean;
  leaves: EmployeeLeave[];
  employees: Employee[];
  userProfile: any;
  loading: boolean;
  onRefresh: () => void;
}

const leaveTypeLabel = (type: string, isRTL: boolean) => {
  const map: Record<string, [string, string]> = {
    annual: ['سنوية', 'Annual'],
    sick:   ['مرضية', 'Sick'],
    unpaid: ['بدون راتب', 'Unpaid'],
  };
  return isRTL ? map[type]?.[0] : map[type]?.[1];
};

const statusConfig: Record<string, { ar: string; en: string; color: string; icon: React.ReactNode }> = {
  pending:  { ar: 'قيد الانتظار', en: 'Pending',  color: 'bg-amber-100 text-amber-700',  icon: <Clock className="w-3 h-3" /> },
  approved: { ar: 'معتمدة',      en: 'Approved', color: 'bg-green-100 text-green-700',  icon: <CheckCircle className="w-3 h-3" /> },
  rejected: { ar: 'مرفوضة',     en: 'Rejected', color: 'bg-red-100 text-red-700',      icon: <XCircle className="w-3 h-3" /> },
};

export function LeavesTab({ isRTL, leaves, employees, userProfile, loading, onRefresh }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    employee_id: '',
    leave_type: 'annual' as const,
    start_date: '',
    end_date: '',
    days: 1,
    reason: '',
  });

  const calcDays = (start: string, end: string) => {
    if (!start || !end) return 1;
    const diff = (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(1, Math.round(diff) + 1);
  };

  const handleDateChange = (field: 'start_date' | 'end_date', value: string) => {
    const updated = { ...form, [field]: value };
    updated.days = calcDays(
      field === 'start_date' ? value : form.start_date,
      field === 'end_date'   ? value : form.end_date,
    );
    setForm(updated);
  };

  const handleSubmit = async () => {
    if (!form.employee_id || !form.start_date || !form.end_date) {
      setError(isRTL ? 'الرجاء تعبئة جميع الحقول المطلوبة' : 'Please fill all required fields');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const emp = employees.find(e => e.id === form.employee_id);
      const { error: err } = await supabase.from('employee_leaves').insert([{
        ...form,
        branch_id: emp?.branch_id || userProfile?.branch_id,
        status: 'pending',
        created_by: userProfile?.id,
      }]);
      if (err) throw err;
      setShowModal(false);
      resetForm();
      onRefresh();
    } catch (e: any) {
      setError(e.message || 'Error saving leave');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (leaveId: string, newStatus: 'approved' | 'rejected') => {
    await supabase
      .from('employee_leaves')
      .update({ status: newStatus, approved_by: userProfile?.id })
      .eq('id', leaveId);
    onRefresh();
  };

  const resetForm = () => {
    setForm({ employee_id: '', leave_type: 'annual', start_date: '', end_date: '', days: 1, reason: '' });
    setError('');
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          className="flex items-center gap-2 bg-teal-600 text-white px-5 py-2.5 rounded-lg hover:bg-teal-700 transition text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          {isRTL ? 'طلب إجازة' : 'New Leave Request'}
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                {[
                  isRTL ? 'الموظف' : 'Employee',
                  isRTL ? 'نوع الإجازة' : 'Leave Type',
                  isRTL ? 'من' : 'From',
                  isRTL ? 'إلى' : 'To',
                  isRTL ? 'الأيام' : 'Days',
                  isRTL ? 'السبب' : 'Reason',
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
              ) : leaves.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                  <CalendarDays className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  {isRTL ? 'لا توجد طلبات إجازة' : 'No leave requests'}
                </td></tr>
              ) : leaves.map(leave => {
                const cfg = statusConfig[leave.status];
                return (
                  <tr key={leave.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {leave.employees?.full_name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                        leave.leave_type === 'annual' ? 'bg-blue-100 text-blue-700' :
                        leave.leave_type === 'sick'   ? 'bg-orange-100 text-orange-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {leaveTypeLabel(leave.leave_type, isRTL)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{leave.start_date}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{leave.end_date}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900">{leave.days}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 max-w-[120px] truncate">{leave.reason || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${cfg.color}`}>
                        {cfg.icon}
                        {isRTL ? cfg.ar : cfg.en}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {leave.status === 'pending' && (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleStatusChange(leave.id, 'approved')}
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                            title={isRTL ? 'اعتماد' : 'Approve'}
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleStatusChange(leave.id, 'rejected')}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                            title={isRTL ? 'رفض' : 'Reject'}
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
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
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">
                {isRTL ? 'طلب إجازة جديد' : 'New Leave Request'}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 rounded-lg">
                {error}
              </div>
            )}

            <div className="space-y-4">
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
                  {employees.filter(e => e.is_active && !e.termination_date).map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.full_name} ({isRTL ? 'رصيد' : 'Balance'}: {emp.vacation_balance_days ?? 0} {isRTL ? 'يوم' : 'days'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isRTL ? 'نوع الإجازة *' : 'Leave Type *'}
                </label>
                <select
                  value={form.leave_type}
                  onChange={e => setForm({ ...form, leave_type: e.target.value as any })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                >
                  <option value="annual">{isRTL ? 'سنوية' : 'Annual'}</option>
                  <option value="sick">{isRTL ? 'مرضية' : 'Sick'}</option>
                  <option value="unpaid">{isRTL ? 'بدون راتب' : 'Unpaid'}</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isRTL ? 'من تاريخ *' : 'Start Date *'}
                  </label>
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={e => handleDateChange('start_date', e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isRTL ? 'إلى تاريخ *' : 'End Date *'}
                  </label>
                  <input
                    type="date"
                    value={form.end_date}
                    min={form.start_date}
                    onChange={e => handleDateChange('end_date', e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              {form.start_date && form.end_date && (
                <div className="bg-teal-50 border border-teal-200 rounded-lg px-4 py-2.5 flex justify-between items-center">
                  <span className="text-sm text-teal-700 font-medium">
                    {isRTL ? 'عدد الأيام:' : 'Days:'}
                  </span>
                  <span className="text-xl font-bold text-teal-700">{form.days}</span>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isRTL ? 'السبب' : 'Reason'}
                </label>
                <textarea
                  value={form.reason}
                  onChange={e => setForm({ ...form, reason: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2.5 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium"
              >
                {isRTL ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="flex-1 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition font-medium flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {isRTL ? 'حفظ الطلب' : 'Save Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
