import { User, ChevronRight, ChevronLeft, LogIn } from 'lucide-react';
import type { POSEmployee } from './types';

interface POSEmployeeSelectProps {
  employees: POSEmployee[];
  isRTL: boolean;
  onSelect: (employee: POSEmployee) => void;
  onClose: () => void;
  loading: boolean;
}

export function POSEmployeeSelect({ employees, isRTL, onSelect, onClose, loading }: POSEmployeeSelectProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/80 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="bg-gradient-to-br from-gray-900 to-gray-800 px-8 py-8 text-center">
          <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <LogIn className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">BLOOV POS</h1>
          <p className="text-gray-400 text-sm">
            {isRTL ? 'اختر الموظف لبدء جلسة البيع' : 'Select employee to start session'}
          </p>
        </div>

        <div className="px-6 py-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-1">
            {isRTL ? 'الموظفون المتاحون' : 'Available Employees'}
          </p>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-3 border-gray-200 border-t-gray-800 rounded-full animate-spin" />
            </div>
          ) : employees.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <User className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p className="text-sm">{isRTL ? 'لا يوجد موظفون نشطون' : 'No active employees found'}</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {employees.map(emp => (
                <button
                  key={emp.id}
                  onClick={() => onSelect(emp)}
                  className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl border border-gray-100 hover:border-gray-300 hover:bg-gray-50 transition-all group ${isRTL ? 'flex-row-reverse text-right' : ''}`}
                >
                  <div className="w-10 h-10 rounded-xl bg-gray-100 group-hover:bg-gray-200 flex items-center justify-center flex-shrink-0 transition-colors">
                    <User className="w-5 h-5 text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {isRTL ? (emp.full_name_ar || emp.full_name) : emp.full_name}
                    </p>
                    {emp.commission_rate && emp.commission_rate > 0 ? (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {isRTL ? `عمولة ${emp.commission_rate}%` : `${emp.commission_rate}% commission`}
                      </p>
                    ) : null}
                  </div>
                  {isRTL ? (
                    <ChevronLeft className="w-4 h-4 text-gray-300 group-hover:text-gray-500 flex-shrink-0 transition-colors" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 flex-shrink-0 transition-colors" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 pb-6">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-2xl border border-gray-200 text-sm font-medium text-gray-500 hover:bg-gray-50 transition-colors"
          >
            {isRTL ? 'إلغاء والعودة' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}
