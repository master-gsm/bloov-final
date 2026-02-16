import { useState } from 'react';
import { Trash2, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

interface ResetTestDatabaseButtonProps {
  isRTL: boolean;
  setBackupMessage: (message: string) => void;
}

export function ResetTestDatabaseButton({ isRTL, setBackupMessage }: ResetTestDatabaseButtonProps) {
  const { isAdmin } = useAuth();
  const [isResetting, setIsResetting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');

  if (!isAdmin) {
    return null;
  }

  const handleReset = async () => {
    if (confirmationText !== 'RESET') {
      setBackupMessage(
        isRTL
          ? 'خطأ: يجب كتابة كلمة RESET بالأحرف الكبيرة للتأكيد'
          : 'Error: You must type RESET in capital letters to confirm'
      );
      return;
    }

    setIsResetting(true);
    setBackupMessage('');

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        throw new Error(
          isRTL
            ? 'الجلسة منتهية. يرجى تسجيل الخروج والدخول مرة أخرى'
            : 'Session expired. Please logout and login again'
        );
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reset-test-database`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
        },
        body: JSON.stringify({
          confirmationText: 'RESET',
          mode: 'test',
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error(
            isRTL
              ? 'غير مصرح. يرجى تسجيل الدخول مرة أخرى'
              : 'Unauthorized. Please login again'
          );
        }
        if (response.status === 403) {
          throw new Error(
            isRTL
              ? 'صلاحيات غير كافية. يجب أن تكون مسؤول'
              : 'Insufficient permissions. You must be an admin'
          );
        }
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to reset database');
      }

      setBackupMessage(
        isRTL
          ? `✅ تم تنظيف ${result.total_deleted} سجل بنجاح`
          : `✅ Successfully reset ${result.total_deleted} records`
      );

      setShowConfirmModal(false);
      setConfirmationText('');

      setTimeout(() => {
        window.location.reload();
      }, 2000);

    } catch (error: any) {
      console.error('Reset error:', error);
      setBackupMessage(
        isRTL
          ? `❌ خطأ: ${error.message}`
          : `❌ Error: ${error.message}`
      );
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setShowConfirmModal(true)}
        disabled={isResetting}
        className="w-full flex items-center justify-center gap-2 bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
      >
        <Trash2 className="w-5 h-5" />
        {isRTL ? 'تنظيف بيانات التجربة' : 'Reset Test Database'}
      </button>

      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-100 rounded-full">
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">
                  {isRTL ? 'تأكيد التنظيف' : 'Confirm Reset'}
                </h3>
                <p className="text-sm text-gray-600">
                  {isRTL ? 'هذا الإجراء خطير ولا يمكن التراجع عنه' : 'This action is dangerous and cannot be undone'}
                </p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-900 font-medium mb-2">
                {isRTL ? 'سيتم حذف البيانات التالية فقط:' : 'Only the following data will be deleted:'}
              </p>
              <ul className="text-xs text-red-800 space-y-1 list-disc list-inside">
                <li>{isRTL ? 'جميع المبيعات والفواتير' : 'All sales and invoices'}</li>
                <li>{isRTL ? 'جميع المشتريات' : 'All purchases'}</li>
                <li>{isRTL ? 'جميع حركات الصندوق' : 'All cash register transactions'}</li>
                <li>{isRTL ? 'جميع المصروفات' : 'All expenses'}</li>
              </ul>
              <p className="text-xs text-red-700 mt-3 font-medium">
                {isRTL ? '✅ لن يتم حذف: المنتجات، العملاء، الموردين، المخزون' : '✅ Will NOT delete: Products, Customers, Suppliers, Inventory'}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                {isRTL
                  ? 'اكتب كلمة RESET بالأحرف الكبيرة للتأكيد:'
                  : 'Type RESET in capital letters to confirm:'}
              </label>
              <input
                type="text"
                value={confirmationText}
                onChange={(e) => setConfirmationText(e.target.value)}
                className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 transition font-mono text-center text-lg"
                placeholder="RESET"
                autoFocus
                dir="ltr"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowConfirmModal(false);
                  setConfirmationText('');
                }}
                disabled={isResetting}
                className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium disabled:opacity-50"
              >
                {isRTL ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={handleReset}
                disabled={isResetting || confirmationText !== 'RESET'}
                className="flex-1 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isResetting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {isRTL ? 'جاري التنظيف...' : 'Resetting...'}
                  </>
                ) : (
                  <>
                    <Trash2 className="w-5 h-5" />
                    {isRTL ? 'تأكيد التنظيف' : 'Confirm Reset'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
