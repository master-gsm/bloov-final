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
    <div className="min-h-screen flex items-center justify-center login-background px-4 relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-accent/[0.04] rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-[400px] h-[400px] bg-accent/[0.03] rounded-full blur-3xl"></div>
      </div>

      <div className="max-w-md w-full space-y-8 relative z-10">
        <div className="text-center">
          <div className="flex justify-center mb-8">
            <div className="bg-white rounded-2xl p-5 shadow-soft-lg border border-lux-border">
              <img
                src="/لقطة_شاشة_2026-02-11_184526.png"
                alt="BLOOV Logo"
                className="h-20 w-auto"
              />
            </div>
          </div>
          <h2 className="text-3xl font-bold text-primary tracking-tight">
            {showResetForm ? t('auth.resetPassword') : t('auth.welcome')}
          </h2>
          <p className="mt-2 text-sm text-secondary">
            {showResetForm ? t('auth.resetPasswordDescription') : t('auth.description')}
          </p>
        </div>

        {!showResetForm ? (
          <form className="mt-8 space-y-6 bg-white p-8 rounded-2xl shadow-soft-lg border border-lux-border" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            <div className="space-y-5">
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-secondary mb-2">
                  {isRTL ? 'اسم المستخدم' : 'Username'}
                </label>
                <input
                  id="username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-3 bg-lux-bg border border-lux-border rounded-xl text-primary focus:ring-2 focus:ring-accent/20 focus:border-accent/40 transition-all placeholder:text-muted"
                  placeholder={isRTL ? 'اسم المستخدم أو البريد الإلكتروني' : 'Username or Email'}
                  dir="ltr"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-secondary mb-2">
                  {t('auth.password')}
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-lux-bg border border-lux-border rounded-xl text-primary focus:ring-2 focus:ring-accent/20 focus:border-accent/40 transition-all placeholder:text-muted"
                  placeholder="********"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowResetForm(true)}
                className="text-sm text-secondary hover:text-accent font-medium transition-colors"
              >
                {t('auth.forgotPassword')}
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-accent text-white py-3.5 px-4 rounded-xl hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent/30 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-semibold shadow-soft-md hover:shadow-soft-lg"
            >
              <LogIn className="w-5 h-5" />
              {loading ? t('common.loading') : t('auth.signInButton')}
            </button>
          </form>
        ) : (
          <form className="mt-8 space-y-6 bg-white p-8 rounded-2xl shadow-soft-lg border border-lux-border" onSubmit={handleResetPassword}>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            {success && (
              <div className="bg-accent-subtle border border-accent/20 text-accent px-4 py-3 rounded-xl text-sm">
                {success}
              </div>
            )}

            <div>
              <label htmlFor="reset-email" className="block text-sm font-medium text-secondary mb-2">
                {t('auth.email')}
              </label>
              <input
                id="reset-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-lux-bg border border-lux-border rounded-xl text-primary focus:ring-2 focus:ring-accent/20 focus:border-accent/40 transition-all placeholder:text-muted"
                placeholder={isRTL ? 'البريد الإلكتروني' : 'Email'}
                dir="ltr"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-accent text-white py-3.5 px-4 rounded-xl hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent/30 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-semibold shadow-soft-md"
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
              className="w-full flex items-center justify-center gap-2 text-secondary py-3 px-4 rounded-xl border border-lux-border hover:bg-lux-hover focus:outline-none focus:ring-2 focus:ring-accent/15 transition-all font-medium"
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
