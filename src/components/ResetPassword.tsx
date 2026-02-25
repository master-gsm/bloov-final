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
      <div className="min-h-screen flex items-center justify-center login-background px-4">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-violet-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-violet-700">{isRTL ? 'جاري التحميل...' : 'Loading...'}</p>
        </div>
      </div>
    );
  }

  if (hasSession === false) {
    return (
      <div className="min-h-screen flex items-center justify-center login-background px-4">
        <div className="max-w-md w-full text-center bg-white/85 backdrop-blur-md p-8 rounded-2xl shadow-2xl border border-violet-200/40">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-violet-900 mb-4">
            {isRTL ? 'رابط غير صالح أو منتهي الصلاحية' : 'Invalid or Expired Link'}
          </h2>
          <div className="text-right space-y-3 mb-6" dir={isRTL ? 'rtl' : 'ltr'}>
            <p className="text-violet-700/70">
              {isRTL ? 'إذا نسيت كلمة المرور، يرجى:' : 'If you forgot your password, please:'}
            </p>
            <ul className="list-disc list-inside space-y-2 text-violet-800">
              <li>{isRTL ? 'التواصل مع المسؤول لإعادة تعيين كلمة المرور' : 'Contact the admin to reset your password'}</li>
              <li>{isRTL ? 'أو طلب رابط جديد من صفحة تسجيل الدخول' : 'Or request a new link from the login page'}</li>
            </ul>
          </div>
          <button
            onClick={() => window.location.href = '/'}
            className="w-full bg-gradient-to-r from-violet-600 to-purple-600 text-white py-3 px-4 rounded-lg hover:from-violet-700 hover:to-purple-700 transition font-medium shadow-lg"
          >
            {isRTL ? 'العودة إلى تسجيل الدخول' : 'Back to Login'}
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center login-background px-4">
        <div className="max-w-md w-full text-center bg-white/85 backdrop-blur-md p-8 rounded-2xl shadow-2xl border border-violet-200/40">
          <CheckCircle className="w-16 h-16 text-violet-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-violet-900 mb-2">
            {isRTL ? 'تم تحديث كلمة المرور بنجاح!' : 'Password Updated Successfully!'}
          </h2>
          <p className="text-violet-700/70">
            {isRTL ? 'جاري إعادة التوجيه...' : 'Redirecting...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center login-background px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex justify-center mb-6">
            <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-4 shadow-lg">
              <img
                src="/لقطة_شاشة_2026-02-11_184526.png"
                alt="BLOOV Logo"
                className="h-20 w-auto"
              />
            </div>
          </div>
          <h2 className="text-3xl font-bold text-violet-900 drop-shadow-sm">
            {t('auth.resetPassword')}
          </h2>
          <p className="mt-2 text-sm text-violet-700/80">
            {isRTL ? 'أدخل كلمة المرور الجديدة' : 'Enter your new password'}
          </p>
        </div>

        <form className="mt-8 space-y-6 bg-white/85 backdrop-blur-md p-8 rounded-2xl shadow-2xl border border-violet-200/40" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-violet-900 mb-1">
                {isRTL ? 'كلمة المرور الجديدة' : 'New Password'}
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-violet-200/60 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent transition bg-white/90"
                placeholder="********"
                minLength={6}
              />
            </div>

            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium text-violet-900 mb-1">
                {isRTL ? 'تأكيد كلمة المرور' : 'Confirm Password'}
              </label>
              <input
                id="confirm-password"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 border border-violet-200/60 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent transition bg-white/90"
                placeholder="********"
                minLength={6}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-purple-600 text-white py-3 px-4 rounded-lg hover:from-violet-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-lg"
          >
            <Lock className="w-5 h-5" />
            {loading ? t('common.loading') : (isRTL ? 'تحديث كلمة المرور' : 'Update Password')}
          </button>
        </form>
      </div>
    </div>
  );
}
