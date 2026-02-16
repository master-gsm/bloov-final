import { AlertCircle, TestTube } from 'lucide-react';
import { useTestMode } from '../contexts/TestModeContext';
import { useLanguage } from '../contexts/LanguageContext';

export function TestModeAlert() {
  const { isTestMode } = useTestMode();
  const { language } = useLanguage();
  const isRTL = language === 'ar';

  if (!isTestMode) return null;

  return (
    <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white py-2 px-4 shadow-lg border-b-2 border-amber-600">
      <div className="max-w-7xl mx-auto flex items-center justify-center gap-3 animate-pulse">
        <TestTube className="w-5 h-5" />
        <p className="text-sm font-bold">
          {isRTL ? '🧪 وضع التجربة مفعّل - لن يتم حفظ أي بيانات في قاعدة البيانات!' : '🧪 TEST MODE ACTIVE - No data will be saved to database!'}
        </p>
        <AlertCircle className="w-5 h-5" />
      </div>
    </div>
  );
}
