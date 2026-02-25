import { useRef, useEffect, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabase';
import { Printer, X, MessageCircle, ArrowLeft } from 'lucide-react';

interface InvoicePrintProps {
  sale: any;
  items: any[];
  onClose: () => void;
  onWhatsApp: () => void;
}

function generateZatcaQR(sellerName: string, vatNumber: string, timestamp: string, total: string, vatAmount: string): string {
  const tlv = (tag: number, value: string) => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(value);
    return [tag, bytes.length, ...bytes];
  };

  const data = [
    ...tlv(1, sellerName),
    ...tlv(2, vatNumber),
    ...tlv(3, timestamp),
    ...tlv(4, total),
    ...tlv(5, vatAmount),
  ];

  const base64 = btoa(String.fromCharCode(...data));
  return base64;
}

export function InvoicePrint({ sale, items, onClose, onWhatsApp }: InvoicePrintProps) {
  const { language } = useLanguage();
  const isRTL = language === 'ar';
  const printRef = useRef<HTMLDivElement>(null);

  const [companyName, setCompanyName] = useState('BLOOV');
  const [companyNameAr, setCompanyNameAr] = useState('BLOOV');
  const [businessType, setBusinessType] = useState('Flowers & Gifts');
  const [businessTypeAr, setBusinessTypeAr] = useState('محل ورد وهدايا');
  const [taxNumber, setTaxNumber] = useState('');
  const [receiptFooter, setReceiptFooter] = useState('');
  const [receiptFooterAr, setReceiptFooterAr] = useState('');
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(true);
  const [loyaltyRate, setLoyaltyRate] = useState('1');

  useEffect(() => {
    const loadSettings = async () => {
      const { data } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle();
      if (data) {
        const s = data as any;
        if (s.business_name) setCompanyName(s.business_name);
        if (s.business_name_ar) setCompanyNameAr(s.business_name_ar);
        if (s.business_type) setBusinessType(s.business_type);
        if (s.business_type_ar) setBusinessTypeAr(s.business_type_ar);
        if (s.tax_number) setTaxNumber(s.tax_number);
        if (s.receipt_footer) setReceiptFooter(s.receipt_footer);
        if (s.receipt_footer_ar) setReceiptFooterAr(s.receipt_footer_ar);
        if (s.loyalty_enabled) setLoyaltyEnabled(String(s.loyalty_enabled) === 'true');
        if (s.loyalty_points_per_sar) setLoyaltyRate(String(s.loyalty_points_per_sar));
      }
    };
    loadSettings();
  }, []);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'decimal', minimumFractionDigits: 2 }).format(amount);

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

  const customerName = sale.customer_name || (sale.customers ? (sale.customers.name_ar || sale.customers.name) : 'Walk-in');
  const customerPhone = sale.customer_phone || sale.customers?.phone || '';
  const isB2B = sale.buyer_type === 'business';

  const qrData = generateZatcaQR(
    companyName,
    taxNumber || '300000000000003',
    new Date(sale.sale_date).toISOString(),
    sale.total.toFixed(2),
    sale.tax.toFixed(2)
  );

  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrData)}`;

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl">
      <head>
        <title>${companyName} Invoice - ${sale.sale_number}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Tahoma, sans-serif; font-size: 12px; color: #333; padding: 20px; direction: rtl; }
          .invoice { max-width: 80mm; margin: 0 auto; }
          .header { text-align: center; margin-bottom: 15px; border-bottom: 2px dashed #ccc; padding-bottom: 10px; }
          .header h1 { font-size: 24px; font-weight: bold; margin-bottom: 2px; }
          .header p { font-size: 10px; color: #666; }
          .info { margin-bottom: 10px; font-size: 11px; }
          .info div { display: flex; justify-content: space-between; margin-bottom: 3px; }
          table { width: 100%; border-collapse: collapse; margin: 10px 0; }
          th { border-bottom: 1px solid #333; padding: 4px 2px; text-align: right; font-size: 10px; }
          td { padding: 4px 2px; font-size: 11px; border-bottom: 1px dashed #eee; }
          .totals { border-top: 2px dashed #ccc; padding-top: 8px; margin-top: 8px; }
          .totals div { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 11px; }
          .totals .grand-total { font-size: 16px; font-weight: bold; border-top: 1px solid #333; padding-top: 6px; margin-top: 6px; }
          .qr { text-align: center; margin: 15px 0; }
          .qr img { width: 120px; height: 120px; }
          .footer { text-align: center; font-size: 10px; color: #666; border-top: 2px dashed #ccc; padding-top: 10px; margin-top: 10px; }
          .vatinfo { text-align: center; font-size: 9px; color: #999; margin-top: 5px; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        ${printContent.innerHTML}
        <script>window.print(); window.close();</script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{isRTL ? 'معاينة الفاتورة' : 'Invoice Preview'}</h2>
          <p className="text-gray-500 mt-1">{sale.sale_number}</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handlePrint} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 transition font-medium">
            <Printer className="w-5 h-5" /> {isRTL ? 'طباعة' : 'Print'}
          </button>
          {customerPhone && (
            <button onClick={onWhatsApp} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2.5 rounded-lg hover:bg-green-700 transition font-medium">
              <MessageCircle className="w-5 h-5" /> WhatsApp
            </button>
          )}
          <button onClick={onClose} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 px-4 py-2.5">
            <ArrowLeft className="w-5 h-5" /> {isRTL ? 'رجوع' : 'Back'}
          </button>
        </div>
      </div>

      <div className="flex justify-center">
        <div className="bg-white shadow-xl rounded-xl p-8 w-[350px]">
          <div ref={printRef}>
            <div className="invoice">
              <div className="header">
                <h1>{companyName}</h1>
                <p>{isRTL ? businessTypeAr : businessType}</p>
                {taxNumber && (
                  <p style={{ fontSize: '9px', marginTop: '4px' }}>
                    {isRTL ? 'الرقم الضريبي' : 'VAT No'}: {taxNumber}
                  </p>
                )}
              </div>

              <div className="info">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                  <span>{isRTL ? 'رقم الفاتورة' : 'Invoice'}</span>
                  <span style={{ fontFamily: 'monospace' }}>{sale.sale_number}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                  <span>{isRTL ? 'التاريخ' : 'Date'}</span>
                  <span>{formatDate(sale.sale_date)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                  <span>{isRTL ? 'العميل' : 'Customer'}</span>
                  <span>{customerName}</span>
                </div>
                {customerPhone && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                    <span>{isRTL ? 'الجوال' : 'Phone'}</span>
                    <span dir="ltr">{customerPhone}</span>
                  </div>
                )}
                {isB2B && sale.company_name && (
                  <div style={{ borderTop: '1px dashed #ccc', marginTop: '6px', paddingTop: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                      <span style={{ fontWeight: 'bold' }}>{isRTL ? 'اسم الشركة' : 'Company'}</span>
                      <span style={{ fontWeight: 'bold' }}>{sale.company_name}</span>
                    </div>
                    {sale.company_vat_number && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                        <span>{isRTL ? 'الرقم الضريبي للمشتري' : 'Buyer VAT No.'}</span>
                        <span dir="ltr" style={{ fontFamily: 'monospace', fontSize: '10px' }}>{sale.company_vat_number}</span>
                      </div>
                    )}
                    {sale.company_address && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                        <span>{isRTL ? 'العنوان' : 'Address'}</span>
                        <span>{sale.company_address}</span>
                      </div>
                    )}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                  <span>{isRTL ? 'الدفع' : 'Payment'}</span>
                  <span>{sale.payment_method === 'cash' ? (isRTL ? 'نقدي' : 'Cash') : sale.payment_method === 'card' ? (isRTL ? 'بطاقة' : 'Card') : (isRTL ? 'تحويل' : 'Transfer')}</span>
                </div>
              </div>

              <table>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'right' }}>{isRTL ? 'المنتج' : 'Item'}</th>
                    <th style={{ textAlign: 'center', width: '40px' }}>{isRTL ? 'كمية' : 'Qty'}</th>
                    <th style={{ textAlign: 'left', width: '60px' }}>{isRTL ? 'السعر' : 'Price'}</th>
                    <th style={{ textAlign: 'left', width: '70px' }}>{isRTL ? 'الإجمالي' : 'Total'}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item: any, i: number) => (
                    <tr key={i}>
                      <td>{item.products ? (item.products.name_ar || item.products.name) : '-'}</td>
                      <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                      <td style={{ textAlign: 'left' }}>{formatCurrency(item.unit_price)}</td>
                      <td style={{ textAlign: 'left' }}>{formatCurrency(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="totals">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>{isRTL ? 'المجموع قبل الضريبة' : 'Subtotal'}</span>
                  <span>{formatCurrency(sale.subtotal)} {isRTL ? 'ر.س' : 'SAR'}</span>
                </div>
                {sale.discount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span>{isRTL ? 'الخصم' : 'Discount'}</span>
                    <span>-{formatCurrency(sale.discount)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>{isRTL ? 'ضريبة القيمة المضافة (15%)' : 'VAT (15%)'}</span>
                  <span>{formatCurrency(sale.tax)} {isRTL ? 'ر.س' : 'SAR'}</span>
                </div>
                <div className="grand-total" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: 'bold', borderTop: '1px solid #333', paddingTop: '6px', marginTop: '6px' }}>
                  <span>{isRTL ? 'الإجمالي شامل الضريبة' : 'Total (incl. VAT)'}</span>
                  <span>{formatCurrency(sale.total)} {isRTL ? 'ر.س' : 'SAR'}</span>
                </div>
              </div>

              <div className="qr" style={{ textAlign: 'center', margin: '15px 0' }}>
                <img src={qrImageUrl} alt="ZATCA QR" style={{ width: '120px', height: '120px' }} />
                <p style={{ fontSize: '8px', color: '#999', marginTop: '4px' }}>ZATCA E-Invoice QR</p>
              </div>

              <div className="footer" style={{ textAlign: 'center', fontSize: '10px', color: '#666', borderTop: '2px dashed #ccc', paddingTop: '10px' }}>
                <p>
                  {isRTL
                    ? (receiptFooterAr || `شكراً لتسوقكم في ${companyName}`)
                    : (receiptFooter || `Thank you for shopping at ${companyName}`)}
                </p>
                {loyaltyEnabled && (
                  <p style={{ marginTop: '3px' }}>
                    {isRTL
                      ? `برنامج الولاء: كل ${loyaltyRate} ريال = ${loyaltyRate} نقطة`
                      : `Loyalty: Every ${loyaltyRate} SAR = ${loyaltyRate} point`}
                  </p>
                )}
              </div>

              <div className="vatinfo" style={{ textAlign: 'center', fontSize: '8px', color: '#aaa', marginTop: '8px' }}>
                <p>
                  {isB2B
                    ? (isRTL ? 'هذه فاتورة ضريبية (B2B) وفقاً لمتطلبات هيئة الزكاة والضريبة والجمارك' : 'Tax Invoice (B2B) per ZATCA requirements')
                    : (isRTL ? 'هذه فاتورة ضريبية مبسطة وفقاً لمتطلبات هيئة الزكاة والضريبة والجمارك' : 'Simplified tax invoice per ZATCA requirements')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
