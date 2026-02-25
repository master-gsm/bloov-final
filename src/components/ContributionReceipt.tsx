import { useRef, useEffect, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabase';
import { getCategoryLabel } from '../lib/expenseCategories';
import { Printer, X, Download } from 'lucide-react';

interface ContributionReceiptProps {
  contribution: {
    id: string;
    amount: number;
    description: string;
    description_ar?: string;
    contribution_date: string;
    contribution_type?: string;
    created_at: string;
  };
  partner: {
    name: string;
    name_ar: string;
  };
  onClose: () => void;
}

export function ContributionReceipt({ contribution, partner, onClose }: ContributionReceiptProps) {
  const { language } = useLanguage();
  const isRTL = language === 'ar';
  const printRef = useRef<HTMLDivElement>(null);

  const [companyName, setCompanyName] = useState('BLOOV');
  const [companyNameAr, setCompanyNameAr] = useState('BLOOV');
  const [taxNumber, setTaxNumber] = useState('');

  useEffect(() => {
    const loadSettings = async () => {
      const { data } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle();
      if (data) {
        const s = data as any;
        if (s.company_name) setCompanyName(s.company_name);
        if (s.company_name_ar) setCompanyNameAr(s.company_name_ar);
        if (s.tax_number) setTaxNumber(s.tax_number);
      }
    };
    loadSettings();
  }, []);

  const handlePrint = () => {
    window.print();
  };

  const formatCurrency = (amount: number) => {
    return amount.toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(isRTL ? 'ar-SA' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const receiptNumber = `RC-${contribution.id.substring(0, 8).toUpperCase()}`;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between print:hidden">
          <h2 className="text-xl font-bold text-gray-800">
            {isRTL ? 'إيصال دفعة' : 'Payment Receipt'}
          </h2>
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition"
            >
              <Printer className="w-4 h-4" />
              {isRTL ? 'طباعة' : 'Print'}
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div ref={printRef} className="p-8" dir={isRTL ? 'rtl' : 'ltr'}>
          <div className="max-w-3xl mx-auto bg-white">
            <div className="text-center mb-8 pb-6 border-b-2 border-gray-300">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                {isRTL ? companyNameAr : companyName}
              </h1>
              <p className="text-gray-600 text-lg">
                {isRTL ? 'إيصال دفعة شريك' : 'Partner Contribution Receipt'}
              </p>
              {taxNumber && (
                <p className="text-gray-500 text-sm mt-2">
                  {isRTL ? 'الرقم الضريبي: ' : 'Tax Number: '}
                  {taxNumber}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-6 mb-8">
              <div>
                <h3 className="font-bold text-gray-700 mb-2">
                  {isRTL ? 'معلومات الإيصال' : 'Receipt Information'}
                </h3>
                <div className="space-y-1 text-sm">
                  <p>
                    <span className="text-gray-600">{isRTL ? 'رقم الإيصال:' : 'Receipt #:'}</span>{' '}
                    <span className="font-semibold">{receiptNumber}</span>
                  </p>
                  <p>
                    <span className="text-gray-600">{isRTL ? 'التاريخ:' : 'Date:'}</span>{' '}
                    <span className="font-semibold">{formatDate(contribution.contribution_date)}</span>
                  </p>
                  <p>
                    <span className="text-gray-600">{isRTL ? 'وقت الإصدار:' : 'Issued:'}</span>{' '}
                    <span className="font-semibold">{formatDate(contribution.created_at)}</span>
                  </p>
                </div>
              </div>

              <div className={isRTL ? 'text-right' : 'text-left'}>
                <h3 className="font-bold text-gray-700 mb-2">
                  {isRTL ? 'معلومات الشريك' : 'Partner Information'}
                </h3>
                <div className="space-y-1 text-sm">
                  <p>
                    <span className="text-gray-600">{isRTL ? 'الاسم:' : 'Name:'}</span>{' '}
                    <span className="font-semibold">{isRTL ? partner.name_ar : partner.name}</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-6 mb-8">
              <h3 className="font-bold text-gray-700 mb-4">
                {isRTL ? 'تفاصيل الدفعة' : 'Payment Details'}
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">{isRTL ? 'نوع الدفعة:' : 'Payment Type:'}</span>
                  <span className="font-semibold">
                    {contribution.contribution_type
                      ? getCategoryLabel(contribution.contribution_type, isRTL)
                      : (isRTL ? 'تشغيلي' : 'Operational')}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">{isRTL ? 'الوصف:' : 'Description:'}</span>
                  <span className="font-semibold">
                    {isRTL
                      ? (contribution.description_ar || contribution.description)
                      : contribution.description}
                  </span>
                </div>
                <div className="border-t border-gray-300 pt-3 mt-3">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-bold text-gray-800">
                      {isRTL ? 'المبلغ الإجمالي:' : 'Total Amount:'}
                    </span>
                    <span className="text-2xl font-bold text-teal-600">
                      {formatCurrency(contribution.amount)} {isRTL ? 'ر.س' : 'SAR'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t-2 border-gray-300 pt-6 text-center">
              <p className="text-gray-500 text-sm mb-2">
                {isRTL
                  ? 'تم استلام المبلغ المذكور أعلاه بالكامل'
                  : 'The above amount has been received in full'}
              </p>
              <p className="text-gray-400 text-xs">
                {isRTL
                  ? 'هذا إيصال إلكتروني ولا يحتاج إلى توقيع'
                  : 'This is an electronic receipt and does not require a signature'}
              </p>
            </div>

            <div className="mt-8 pt-6 border-t border-gray-200 text-center text-gray-400 text-xs">
              <p>
                {isRTL
                  ? `تم الإنشاء بواسطة نظام ${companyNameAr} المحاسبي`
                  : `Generated by ${companyName} Accounting System`}
              </p>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print\\:hidden {
            display: none !important;
          }
          ${printRef.current?.parentElement?.className} * {
            visibility: visible;
          }
          ${printRef.current?.parentElement?.className} {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
