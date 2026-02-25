import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { LogIn, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';

export function LoginForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showResetForm, setShowResetForm] = useState(false);
  const { signIn } = useAuth();
  const { t, language } = useLanguage();
  const isRTL = language === 'ar';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const email = username.includes('@')
        ? username.toLowerCase()
        : `${username.toLowerCase()}@bloov.local`;
      await signIn(email, password);
    } catch (err) {
      setError(isRTL ? 'اسم المستخدم أو كلمة المرور غير صحيحة' : 'Invalid username or password');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });

      if (error) throw error;

      setSuccess(t('auth.resetEmailSent'));
      setEmail('');
      setTimeout(() => {
        setShowResetForm(false);
        setSuccess('');
      }, 3000);
    } catch (err) {
      setError(t('auth.resetError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center app-background px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex justify-center mb-6">
            <img
              src="/لقطة_شاشة_2026-02-11_184526.png"
              alt="BLOOV Logo"
              className="h-24 w-auto"
            />
          </div>
          <h2 className="text-3xl font-bold text-teal-900">
            {showResetForm ? t('auth.resetPassword') : t('auth.welcome')}
          </h2>
          <p className="mt-2 text-sm text-teal-600/70">
            {showResetForm ? t('auth.resetPasswordDescription') : t('auth.description')}
          </p>
        </div>

        {!showResetForm ? (
          <form className="mt-8 space-y-6 bg-white p-8 rounded-2xl shadow-xl" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-teal-900 mb-1">
                  {isRTL ? 'اسم المستخدم' : 'Username'}
                </label>
                <input
                  id="username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-3 border border-teal-200/50 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent transition bg-white/80"
                  placeholder={isRTL ? 'اسم المستخدم أو البريد الإلكتروني' : 'Username or Email'}
                  dir="ltr"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-teal-900 mb-1">
                  {t('auth.password')}
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-teal-200/50 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent transition bg-white/80"
                  placeholder="********"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowResetForm(true)}
                className="text-sm text-teal-600 hover:text-teal-700 font-medium transition"
              >
                {t('auth.forgotPassword')}
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-teal-600 to-emerald-600 text-white py-3 px-4 rounded-lg hover:from-teal-700 hover:to-emerald-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-md"
            >
              <LogIn className="w-5 h-5" />
              {loading ? t('common.loading') : t('auth.signInButton')}
            </button>
          </form>
        ) : (
          <form className="mt-8 space-y-6 bg-white/90 backdrop-blur-sm p-8 rounded-2xl shadow-xl border border-teal-100/50" onSubmit={handleResetPassword}>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {success && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-600 px-4 py-3 rounded-lg text-sm">
                {success}
              </div>
            )}

            <div>
              <label htmlFor="reset-email" className="block text-sm font-medium text-teal-900 mb-1">
                {t('auth.email')}
              </label>
              <input
                id="reset-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-teal-200/50 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent transition bg-white/80"
                placeholder={isRTL ? 'البريد الإلكتروني' : 'Email'}
                dir="ltr"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-teal-600 to-emerald-600 text-white py-3 px-4 rounded-lg hover:from-teal-700 hover:to-emerald-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-md"
            >
              {loading ? t('common.loading') : t('auth.sendResetLink')}
            </button>

            <button
              type="button"
              onClick={() => {
                setShowResetForm(false);
                setError('');
                setSuccess('');
              }}
              className="w-full flex items-center justify-center gap-2 text-teal-700 py-3 px-4 rounded-lg border border-teal-200/50 hover:bg-teal-50 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 transition font-medium"
            >
              <ArrowLeft className={`w-5 h-5 ${isRTL ? 'rotate-180' : ''}`} />
              {t('auth.backToLogin')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
