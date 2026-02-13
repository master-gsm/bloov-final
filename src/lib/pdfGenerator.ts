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

async function generateInvoiceImage(sale: Sale, items: SaleItem[]): Promise<Blob> {
  try {
    console.log('[generateInvoiceImage] Starting...');

    console.log('[generateInvoiceImage] Generating QR code...');
    const qrCodeData = generateZATCAQRCode(sale, COMPANY_INFO);
    const qrCodeDataUrl = await QRCode.toDataURL(qrCodeData);
    console.log('[generateInvoiceImage] QR code generated');

    console.log('[generateInvoiceImage] Creating canvas...');
    const canvas = document.createElement('canvas');
    canvas.width = 800;

    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const tax = subtotal * 0.15;
    const total = subtotal + tax;

    const rowHeight = 40;
    const headerHeight = 250;
    const footerHeight = 200;
    canvas.height = headerHeight + (items.length * rowHeight) + footerHeight;
    console.log('[generateInvoiceImage] Canvas dimensions:', canvas.width, 'x', canvas.height);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error('[generateInvoiceImage] Failed to get canvas context');
      throw new Error('Cannot get canvas context');
    }
    console.log('[generateInvoiceImage] Canvas context obtained');

    console.log('[generateInvoiceImage] Drawing background...');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    console.log('[generateInvoiceImage] Drawing header...');
    ctx.fillStyle = '#2563eb';
    ctx.font = 'bold 40px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('BLOOV', 400, 60);

    ctx.fillStyle = '#666666';
    ctx.font = '18px Arial';
    ctx.fillText('Accounting System', 400, 95);

    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(50, 120);
    ctx.lineTo(750, 120);
    ctx.stroke();

    console.log('[generateInvoiceImage] Drawing invoice info...');
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'right';
    ctx.fillText('Tax Invoice', 750, 155);

    ctx.font = '16px Arial';
    ctx.fillText(`Invoice: ${sale.sale_number}`, 750, 185);
    ctx.fillText(`Date: ${new Date(sale.sale_date).toLocaleDateString()}`, 750, 210);

    if (sale.customer_name) {
      ctx.fillText(`Customer: ${sale.customer_name}`, 750, 235);
    }

    ctx.textAlign = 'left';
    ctx.font = '14px Arial';
    ctx.fillText(COMPANY_INFO.name, 50, 155);
    ctx.font = '12px Arial';
    ctx.fillText(`VAT: ${COMPANY_INFO.vatNumber}`, 50, 175);
    ctx.fillText(COMPANY_INFO.address, 50, 195);
    ctx.fillText(COMPANY_INFO.phone, 50, 215);

    console.log('[generateInvoiceImage] Drawing table header...');
    let yPos = headerHeight;

    ctx.fillStyle = '#2563eb';
    ctx.fillRect(50, yPos, 700, 35);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'right';
    ctx.fillText('Product', 720, yPos + 22);
    ctx.textAlign = 'center';
    ctx.fillText('Qty', 520, yPos + 22);
    ctx.fillText('Price', 390, yPos + 22);
    ctx.fillText('Disc', 260, yPos + 22);
    ctx.fillText('Total', 130, yPos + 22);

    yPos += 35;
    ctx.font = '15px Arial';

    console.log('[generateInvoiceImage] Drawing items...');
    items.forEach((item, index) => {
      if (index % 2 === 0) {
        ctx.fillStyle = '#f9fafb';
        ctx.fillRect(50, yPos, 700, rowHeight);
      }

      ctx.fillStyle = '#000000';
      ctx.textAlign = 'right';
      ctx.fillText(item.product_name, 720, yPos + 25);
      ctx.textAlign = 'center';
      ctx.fillText(item.quantity.toString(), 520, yPos + 25);
      ctx.fillText(`${item.unit_price.toFixed(2)} SAR`, 390, yPos + 25);
      ctx.fillText(`${item.discount.toFixed(2)} SAR`, 260, yPos + 25);
      ctx.fillText(`${item.total.toFixed(2)} SAR`, 130, yPos + 25);

      yPos += rowHeight;
    });

    yPos += 30;

    console.log('[generateInvoiceImage] Loading QR code image...');
    const qrImage = new Image();
    await new Promise((resolve, reject) => {
      qrImage.onload = () => {
        console.log('[generateInvoiceImage] QR image loaded');
        resolve(null);
      };
      qrImage.onerror = (err) => {
        console.error('[generateInvoiceImage] QR image load failed:', err);
        reject(err);
      };
      qrImage.src = qrCodeDataUrl;
    });

    console.log('[generateInvoiceImage] Drawing QR code...');
    ctx.drawImage(qrImage, 60, yPos, 120, 120);

    console.log('[generateInvoiceImage] Drawing totals...');
    const summaryX = 450;
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(summaryX, yPos);
    ctx.lineTo(740, yPos);
    ctx.stroke();

    yPos += 30;
    ctx.fillStyle = '#000000';
    ctx.font = '16px Arial';
    ctx.textAlign = 'right';
    ctx.fillText('Subtotal:', summaryX + 60, yPos);
    ctx.fillText(`${subtotal.toFixed(2)} SAR`, 730, yPos);

    yPos += 25;
    ctx.fillText('VAT (15%):', summaryX + 60, yPos);
    ctx.fillText(`${tax.toFixed(2)} SAR`, 730, yPos);

    yPos += 35;
    ctx.fillStyle = '#2563eb';
    ctx.fillRect(summaryX, yPos - 25, 290, 40);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px Arial';
    ctx.fillText('Total:', summaryX + 60, yPos);
    ctx.fillText(`${total.toFixed(2)} SAR`, 730, yPos);

    yPos += 60;
    ctx.fillStyle = '#2563eb';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Thank you!', 400, yPos);

    console.log('[generateInvoiceImage] Converting canvas to blob...');

    try {
      const dataUrl = canvas.toDataURL('image/png', 0.95);
      console.log('[generateInvoiceImage] Data URL created, length:', dataUrl.length);

      const base64Data = dataUrl.split(',')[1];
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);

      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const blob = new Blob([bytes], { type: 'image/png' });
      console.log('[generateInvoiceImage] Blob created successfully, size:', blob.size);

      return blob;
    } catch (err) {
      console.error('[generateInvoiceImage] Canvas conversion error:', err);
      throw err;
    }
  } catch (error) {
    console.error('[generateInvoiceImage] Error:', error);
    throw error;
  }
}

async function uploadImageToStorage(
  imageBlob: Blob,
  fileName: string,
  saleId: string
): Promise<string | null> {
  try {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      console.error('No authenticated user');
      return null;
    }

    const filePath = `${authData.user.id}/${saleId}/${fileName}`;
    console.log('Uploading image to:', filePath);

    const { data, error } = await supabase.storage
      .from('invoices')
      .upload(filePath, imageBlob, {
        contentType: 'image/png',
        upsert: true
      });

    if (error) {
      console.error('Upload error:', error);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from('invoices')
      .getPublicUrl(filePath);

    console.log('Upload successful, public URL:', urlData.publicUrl);
    return urlData.publicUrl;
  } catch (error) {
    console.error('Error uploading to storage:', error);
    return null;
  }
}

export async function shareInvoiceViaWhatsApp(
  sale: Sale,
  items: SaleItem[],
  customerPhone: string
): Promise<void> {
  try {
    console.log('Starting invoice image generation...');
    const imageBlob = await generateInvoiceImage(sale, items);
    console.log('Invoice image generated successfully, size:', imageBlob.size);

    const fileName = `BLOOV-Invoice-${sale.sale_number}.png`;

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
        const file = new File([imageBlob], fileName, { type: 'image/png' });
        console.log('Image file created:', file.name, file.size, file.type);

        const shareData: ShareData = {
          files: [file],
          text: `مرحباً 👋\nشكراً لتسوقك في BLOOV 🌸\n\n📄 رقم الفاتورة: ${sale.sale_number}\n💰 المجموع: ${sale.total.toFixed(2)} ر.س\n\nنتطلع لخدمتك مجدداً!`
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
      console.log('Uploading invoice image to cloud storage...');
      const publicUrl = await uploadImageToStorage(imageBlob, fileName, sale.id);

      if (publicUrl) {
        const messageText = `مرحباً 👋
شكراً لتسوقك في BLOOV 🌸

📄 رقم الفاتورة: ${sale.sale_number}
💰 المجموع: ${sale.total.toFixed(2)} ر.س
شامل ضريبة القيمة المضافة 15%

🖼️ صورة الفاتورة:
${publicUrl}

نتطلع لخدمتك مجدداً!
📲 للتواصل: https://wa.me/${cleanBusinessPhone}`;

        const message = encodeURIComponent(messageText);
        const whatsappUrl = `https://wa.me/${cleanPhone}?text=${message}`;
        window.open(whatsappUrl, '_blank');
        console.log('WhatsApp opened with invoice image link');
      } else {
        console.error('Failed to upload invoice image');
        throw new Error('فشل رفع صورة الفاتورة. تحقق من الاتصال بالإنترنت.');
      }
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
