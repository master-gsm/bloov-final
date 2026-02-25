import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'en' | 'ar';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  isRTL: boolean;
}

const translations: Record<Language, Record<string, string>> = {
  en: {
    'app.name': 'BLOOV',
    'app.tagline': 'Accounting System',
    'nav.dashboard': 'Dashboard',
    'nav.sales': 'Sales',
    'nav.purchases': 'Purchases',
    'nav.products': 'Products',
    'nav.inventory': 'Inventory',
    'nav.customers': 'Customers',
    'nav.suppliers': 'Suppliers',
    'nav.partners': 'Partners',
    'nav.reports': 'Reports',
    'nav.users': 'Users',
    'nav.settings': 'Settings',
    'auth.login': 'Sign In',
    'auth.logout': 'Sign Out',
    'auth.email': 'Email',
    'auth.password': 'Password',
    'auth.signInButton': 'Sign In',
    'auth.welcome': 'Welcome to BLOOV',
    'auth.description': 'A comprehensive accounting system designed specifically for BLOOV',
    'auth.forgotPassword': 'Forgot password?',
    'auth.resetPassword': 'Reset Password',
    'auth.backToLogin': 'Back to login',
    'auth.resetPasswordDescription': 'Enter your email to reset your password',
    'auth.sendResetLink': 'Send Reset Link',
    'auth.resetEmailSent': 'Password reset email sent! Check your inbox.',
    'auth.resetError': 'Failed to send reset email. Please try again.',
    'dashboard.totalSales': 'Total Sales',
    'dashboard.totalPurchases': 'Total Purchases',
    'dashboard.netProfit': 'Net Profit',
    'dashboard.inventory': 'Inventory Value',
    'dashboard.partners': 'Partner Shares',
    'dashboard.recentSales': 'Recent Sales',
    'dashboard.lowStock': 'Low Stock Items',
    'partners.sami': 'Sami',
    'partners.anas': 'Anas',
    'products.natural': 'Natural Flowers',
    'products.artificial': 'Artificial Flowers',
    'common.loading': 'Loading...',
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.add': 'Add',
    'common.search': 'Search',
    'common.filter': 'Filter',
    'common.export': 'Export',
    'common.print': 'Print',
    'common.actions': 'Actions',
  },
  ar: {
    'app.name': 'BLOOV',
    'app.tagline': 'نظام محاسبي',
    'nav.dashboard': 'لوحة التحكم',
    'nav.sales': 'المبيعات',
    'nav.purchases': 'المشتريات',
    'nav.products': 'المنتجات',
    'nav.inventory': 'المخزون',
    'nav.customers': 'العملاء',
    'nav.suppliers': 'الموردين',
    'nav.partners': 'الشركاء',
    'nav.reports': 'التقارير',
    'nav.users': 'المستخدمين',
    'nav.settings': 'الإعدادات',
    'auth.login': 'تسجيل الدخول',
    'auth.logout': 'تسجيل الخروج',
    'auth.email': 'البريد الإلكتروني',
    'auth.password': 'كلمة المرور',
    'auth.signInButton': 'دخول',
    'auth.welcome': 'مرحباً بك في BLOOV',
    'auth.description': 'نظام محاسبي صُمم خصيصاً لـ BLOOV',
    'auth.forgotPassword': 'نسيت كلمة المرور؟',
    'auth.resetPassword': 'إعادة تعيين كلمة المرور',
    'auth.backToLogin': 'العودة لتسجيل الدخول',
    'auth.resetPasswordDescription': 'أدخل بريدك الإلكتروني لإعادة تعيين كلمة المرور',
    'auth.sendResetLink': 'إرسال رابط إعادة التعيين',
    'auth.resetEmailSent': 'تم إرسال رابط إعادة التعيين! تفقد بريدك الإلكتروني.',
    'auth.resetError': 'فشل إرسال البريد. حاول مرة أخرى.',
    'dashboard.totalSales': 'إجمالي المبيعات',
    'dashboard.totalPurchases': 'إجمالي المشتريات',
    'dashboard.netProfit': 'صافي الربح',
    'dashboard.inventory': 'قيمة المخزون',
    'dashboard.partners': 'حصص الشركاء',
    'dashboard.recentSales': 'المبيعات الأخيرة',
    'dashboard.lowStock': 'المنتجات منخفضة المخزون',
    'partners.sami': 'سامي',
    'partners.anas': 'أنس',
    'products.natural': 'ورد طبيعي',
    'products.artificial': 'ورد صناعي',
    'common.loading': 'جاري التحميل...',
    'common.save': 'حفظ',
    'common.cancel': 'إلغاء',
    'common.delete': 'حذف',
    'common.edit': 'تعديل',
    'common.add': 'إضافة',
    'common.search': 'بحث',
    'common.filter': 'تصفية',
    'common.export': 'تصدير',
    'common.print': 'طباعة',
    'common.actions': 'إجراءات',
  },
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('language');
    return (saved === 'ar' || saved === 'en') ? saved : 'ar';
  });

  useEffect(() => {
    localStorage.setItem('language', language);
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  }, [language]);

  const t = (key: string): string => {
    return translations[language][key] || key;
  };

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
  };

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        t,
        isRTL: language === 'ar',
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
