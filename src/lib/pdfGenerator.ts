import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { supabase } from './supabase';

interface SaleItem {
  product_name: string;
  quantity: number;
  unit_price: number;
  discount: number;
  total: number;
}

interface Sale {
  id: string;
  sale_number: string;
  customer_name: string | null;
  customer_phone: string | null;
  sale_date: string;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  payment_method: string | null;
  notes: string | null;
}

interface CompanyInfo {
  name: string;
  vatNumber: string;
  address: string;
  phone: string;
  email: string;
}

const COMPANY_INFO: CompanyInfo = {
  name: 'BLOOV',
  vatNumber: '300000000000003',
  address: 'Riyadh, Saudi Arabia',
  phone: '+966 XX XXX XXXX',
  email: 'info@bloov.com'
};

function generateZATCAQRCode(sale: Sale, companyInfo: CompanyInfo): string {
  const sellerName = companyInfo.name;
  const vatNumber = companyInfo.vatNumber;
  const timestamp = new Date(sale.sale_date).toISOString();
  const totalWithVAT = sale.total.toFixed(2);
  const vatAmount = sale.tax.toFixed(2);

  function toTLV(tag: number, value: string): string {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(value);
    return String.fromCharCode(tag, bytes.length) + value;
  }

  const qrData =
    toTLV(1, sellerName) +
    toTLV(2, vatNumber) +
    toTLV(3, timestamp) +
    toTLV(4, totalWithVAT) +
    toTLV(5, vatAmount);

  return btoa(qrData);
}

export async function generateInvoicePDF(
  sale: Sale,
  items: SaleItem[]
): Promise<Blob> {
  try {
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 15;
    let yPos = margin;

    pdf.setFillColor(139, 92, 246);
    pdf.rect(0, 0, pageWidth, 35, 'F');

    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(28);
    pdf.setFont('helvetica', 'bold');
    pdf.text('BLOOV', margin, 15);
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text('Elegant Flowers & Gifts', margin, 25);

    pdf.setFillColor(255, 255, 255);
    pdf.setTextColor(0, 0, 0);

    yPos = 45;

    pdf.setFontSize(18);
    pdf.setFont('helvetica', 'bold');
    pdf.text('TAX INVOICE', margin, yPos);

    yPos += 10;

    pdf.setDrawColor(139, 92, 246);
    pdf.setLineWidth(0.5);
    pdf.line(margin, yPos, pageWidth - margin, yPos);

    yPos += 8;

    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');

    pdf.text('Company Information:', margin, yPos);
    yPos += 5;
    pdf.setFontSize(9);
    pdf.text(`${COMPANY_INFO.name}`, margin + 5, yPos);
    yPos += 4;
    pdf.text(`VAT: ${COMPANY_INFO.vatNumber}`, margin + 5, yPos);
    yPos += 4;
    pdf.text(`${COMPANY_INFO.address}`, margin + 5, yPos);
    yPos += 4;
    pdf.text(`${COMPANY_INFO.phone} | ${COMPANY_INFO.email}`, margin + 5, yPos);

    yPos += 8;

    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Invoice Details:', margin, yPos);
    yPos += 5;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text(`Invoice No: ${sale.sale_number}`, margin + 5, yPos);
    yPos += 4;
    const invoiceDate = new Date(sale.sale_date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    pdf.text(`Date: ${invoiceDate}`, margin + 5, yPos);
    yPos += 4;
    if (sale.customer_name) {
      pdf.text(`Customer: ${sale.customer_name}`, margin + 5, yPos);
      yPos += 4;
    }
    if (sale.customer_phone) {
      pdf.text(`Phone: ${sale.customer_phone}`, margin + 5, yPos);
      yPos += 4;
    }

    yPos += 5;

    pdf.setDrawColor(200, 200, 200);
    pdf.setLineWidth(0.3);
    pdf.line(margin, yPos, pageWidth - margin, yPos);

    yPos += 8;

    pdf.setFillColor(245, 245, 247);
    pdf.rect(margin, yPos - 5, pageWidth - 2 * margin, 8, 'F');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.text('Item', margin + 2, yPos);
    pdf.text('Qty', pageWidth - 80, yPos, { align: 'right' });
    pdf.text('Price', pageWidth - 60, yPos, { align: 'right' });
    pdf.text('Disc.', pageWidth - 40, yPos, { align: 'right' });
    pdf.text('Total', pageWidth - margin - 2, yPos, { align: 'right' });

    yPos += 8;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);

    items.forEach((item, index) => {
      if (yPos > pageHeight - 60) {
        pdf.addPage();
        yPos = margin;
      }

      const itemName = item.product_name.length > 25
        ? item.product_name.substring(0, 22) + '...'
        : item.product_name;

      pdf.text(itemName, margin + 2, yPos);
      pdf.text(item.quantity.toString(), pageWidth - 80, yPos, { align: 'right' });
      pdf.text(item.unit_price.toFixed(2), pageWidth - 60, yPos, { align: 'right' });
      pdf.text(item.discount.toFixed(2), pageWidth - 40, yPos, { align: 'right' });
      pdf.text(item.total.toFixed(2), pageWidth - margin - 2, yPos, { align: 'right' });

      yPos += 6;

      if (index < items.length - 1) {
        pdf.setDrawColor(240, 240, 240);
        pdf.setLineWidth(0.1);
        pdf.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 2;
      }
    });

    yPos += 5;

    pdf.setDrawColor(139, 92, 246);
    pdf.setLineWidth(0.5);
    pdf.line(margin, yPos, pageWidth - margin, yPos);

    yPos += 8;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);

    const summaryX = pageWidth - 70;
    const labelX = summaryX - 35;

    pdf.text('Subtotal:', labelX, yPos);
    pdf.text(`${sale.subtotal.toFixed(2)} SAR`, summaryX, yPos, { align: 'right' });
    yPos += 6;

    if (sale.discount > 0) {
      pdf.text('Discount:', labelX, yPos);
      pdf.text(`${sale.discount.toFixed(2)} SAR`, summaryX, yPos, { align: 'right' });
      yPos += 6;
    }

    pdf.text('VAT (15%):', labelX, yPos);
    pdf.text(`${sale.tax.toFixed(2)} SAR`, summaryX, yPos, { align: 'right' });
    yPos += 8;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.setFillColor(139, 92, 246);
    pdf.rect(labelX - 30, yPos - 6, 100, 10, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.text('Total:', labelX, yPos);
    pdf.text(`${sale.total.toFixed(2)} SAR`, summaryX, yPos, { align: 'right' });

    pdf.setTextColor(0, 0, 0);

    yPos += 15;

    if (sale.payment_method) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      const paymentMethodMap: Record<string, string> = {
        cash: 'Cash',
        card: 'Card',
        bank_transfer: 'Bank Transfer'
      };
      pdf.text(`Payment Method: ${paymentMethodMap[sale.payment_method] || sale.payment_method}`, margin, yPos);
      yPos += 6;
    }

    if (sale.notes) {
      pdf.text(`Notes: ${sale.notes}`, margin, yPos);
      yPos += 6;
    }

    const qrData = generateZATCAQRCode(sale, COMPANY_INFO);
    const qrCodeDataUrl = await QRCode.toDataURL(qrData, {
      width: 200,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    const qrSize = 35;
    const qrX = pageWidth - margin - qrSize;
    const qrY = pageHeight - margin - qrSize - 15;

    pdf.addImage(qrCodeDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);

    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.text('Scan for Invoice Verification', qrX + qrSize / 2, qrY + qrSize + 4, { align: 'center' });

    pdf.setFontSize(8);
    pdf.setTextColor(100, 100, 100);
    pdf.text('Thank you for your business!', pageWidth / 2, pageHeight - 10, { align: 'center' });

    return pdf.output('blob');
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw new Error('Failed to generate PDF invoice');
  }
}

export async function shareInvoiceViaWhatsApp(
  sale: Sale,
  items: SaleItem[],
  customerPhone: string
): Promise<void> {
  try {
    console.log('Starting PDF generation...');
    const pdfBlob = await generateInvoicePDF(sale, items);
    console.log('PDF generated successfully, size:', pdfBlob.size);

    const fileName = `BLOOV-Invoice-${sale.sale_number}.pdf`;

    let cleanPhone = customerPhone.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('00')) {
      cleanPhone = cleanPhone.slice(2);
    } else if (cleanPhone.startsWith('0')) {
      cleanPhone = '966' + cleanPhone.slice(1);
    } else if (!cleanPhone.startsWith('966')) {
      cleanPhone = '966' + cleanPhone;
    }

    const { data: settings } = await supabase
      .from('settings')
      .select('business_whatsapp')
      .eq('id', 1)
      .maybeSingle();

    const businessWhatsApp = settings?.business_whatsapp || '966XXXXXXXXX';
    let cleanBusinessPhone = businessWhatsApp.replace(/[^0-9]/g, '');
    if (cleanBusinessPhone.startsWith('00')) {
      cleanBusinessPhone = cleanBusinessPhone.slice(2);
    } else if (cleanBusinessPhone.startsWith('0')) {
      cleanBusinessPhone = '966' + cleanBusinessPhone.slice(1);
    } else if (!cleanBusinessPhone.startsWith('966')) {
      cleanBusinessPhone = '966' + cleanBusinessPhone;
    }

    let shareSuccessful = false;

    if (navigator.share && navigator.canShare) {
      try {
        const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
        console.log('File created:', file.name, file.size, file.type);

        const shareData: ShareData = {
          files: [file]
        };

        if (navigator.canShare(shareData)) {
          console.log('Share API available, opening share dialog...');
          await navigator.share(shareData);
          shareSuccessful = true;
          console.log('Share successful!');
          return;
        }
      } catch (error: any) {
        console.error('Share API error:', error);
        if (error.name === 'AbortError') {
          console.log('User cancelled share');
          return;
        }
      }
    }

    if (!shareSuccessful) {
      console.log('Desktop fallback: Download PDF and open WhatsApp');

      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setTimeout(() => {
        const messageText = `مرحباً 👋
شكراً لتسوقك في BLOOV 🌸

📄 رقم الفاتورة: ${sale.sale_number}
💰 المجموع: ${sale.total.toFixed(2)} ر.س
شامل ضريبة القيمة المضافة 15%

نتطلع لخدمتك مجدداً!
📲 للتواصل: https://wa.me/${cleanBusinessPhone}`;

        const message = encodeURIComponent(messageText);
        const whatsappUrl = `https://wa.me/${cleanPhone}?text=${message}`;
        window.open(whatsappUrl, '_blank');
        console.log('WhatsApp opened - Please attach the downloaded PDF');
      }, 500);
    }
  } catch (error) {
    console.error('Error in shareInvoiceViaWhatsApp:', error);
    throw error;
  }
}

export async function downloadInvoicePDF(sale: Sale, items: SaleItem[]): Promise<void> {
  const pdfBlob = await generateInvoicePDF(sale, items);
  const fileName = `BLOOV-Invoice-${sale.sale_number}.pdf`;

  const url = URL.createObjectURL(pdfBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
