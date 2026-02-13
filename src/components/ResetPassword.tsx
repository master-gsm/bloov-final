import { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabase';
import { Lock, CheckCircle, AlertCircle } from 'lucide-react';

export function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const { t, language } = useLanguage();
  const isRTL = language === 'ar';

  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      setHasSession(!!session);
      if (!session) {
        console.error('No active session found for password reset');
      }
    } catch (err) {
      console.error('Error checking session:', err);
      setHasSession(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError(isRTL ? 'كلمات المرور غير متطابقة' : 'Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError(isRTL ? 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' : 'Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      });

      if (error) throw error;

      setSuccess(true);

      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
    } catch (err: any) {
      setError(err.message || (isRTL ? 'فشل تحديث كلمة المرور' : 'Failed to update password'));
    } finally {
      setLoading(false);
    }
  };

  if (hasSession === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-white to-teal-50 px-4">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-gray-600">{isRTL ? 'جاري التحميل...' : 'Loading...'}</p>
        </div>
      </div>
    );
  }

  if (hasSession === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-white to-teal-50 px-4">
        <div className="max-w-md w-full text-center bg-white p-8 rounded-2xl shadow-xl">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            {isRTL ? 'رابط غير صالح أو منتهي الصلاحية' : 'Invalid or Expired Link'}
          </h2>
          <div className="text-right space-y-3 mb-6" dir={isRTL ? 'rtl' : 'ltr'}>
            <p className="text-gray-600">
              {isRTL ? 'إذا نسيت كلمة المرور، يرجى:' : 'If you forgot your password, please:'}
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li>{isRTL ? 'التواصل مع المسؤول لإعادة تعيين كلمة المرور' : 'Contact the admin to reset your password'}</li>
              <li>{isRTL ? 'أو طلب رابط جديد من صفحة تسجيل الدخول' : 'Or request a new link from the login page'}</li>
            </ul>
          </div>
          <button
            onClick={() => window.location.href = '/'}
            className="w-full bg-gradient-to-r from-teal-600 to-teal-700 text-white py-3 px-4 rounded-lg hover:from-teal-700 hover:to-teal-800 transition font-medium"
          >
            {isRTL ? 'العودة إلى تسجيل الدخول' : 'Back to Login'}
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-white to-teal-50 px-4">
        <div className="max-w-md w-full text-center bg-white p-8 rounded-2xl shadow-xl">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {isRTL ? 'تم تحديث كلمة المرور بنجاح!' : 'Password Updated Successfully!'}
          </h2>
          <p className="text-gray-600">
            {isRTL ? 'جاري إعادة التوجيه...' : 'Redirecting...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-white to-teal-50 px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex justify-center mb-6">
            <img
              src="/لقطة_شاشة_2026-02-11_184526.png"
              alt="BLOOV Logo"
              className="h-24 w-auto"
            />
          </div>
          <h2 className="text-3xl font-bold text-gray-900">
            {t('auth.resetPassword')}
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            {isRTL ? 'أدخل كلمة المرور الجديدة' : 'Enter your new password'}
          </p>
        </div>

        <form className="mt-8 space-y-6 bg-white p-8 rounded-2xl shadow-xl" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                {isRTL ? 'كلمة المرور الجديدة' : 'New Password'}
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
                placeholder="********"
                minLength={6}
              />
            </div>

            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-1">
                {isRTL ? 'تأكيد كلمة المرور' : 'Confirm Password'}
              </label>
              <input
                id="confirm-password"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
                placeholder="********"
                minLength={6}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-teal-600 to-teal-700 text-white py-3 px-4 rounded-lg hover:from-teal-700 hover:to-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            <Lock className="w-5 h-5" />
            {loading ? t('common.loading') : (isRTL ? 'تحديث كلمة المرور' : 'Update Password')}
          </button>
        </form>
      </div>
    </div>
  );
}
