# BLOOV Invoice PDF Generation and WhatsApp Sharing Guide

## Overview

The BLOOV Accounting System now includes a comprehensive PDF invoice generation system that is fully compliant with ZATCA (Saudi Arabian Tax Authority) requirements. This feature allows you to generate professional, branded invoices and share them directly via WhatsApp.

## Features

### 1. **ZATCA-Compliant PDF Generation**
- Automatic generation of tax-compliant invoices
- Includes mandatory ZATCA QR code for invoice verification
- Properly formatted VAT calculations and displays
- Company VAT number included on all invoices
- Bilingual (Arabic/English) invoice layout

### 2. **Professional Design**
- Clean, elegant BLOOV-branded design
- Purple gradient header with company logo
- Organized layout with clear sections
- Professional typography and spacing
- Print-ready format (A4)

### 3. **Smart WhatsApp Sharing**
- **Mobile Devices**: Uses native Web Share API to share PDF directly to WhatsApp
- **Desktop**: Downloads PDF first, then opens WhatsApp with a message
- Automatic phone number formatting (Saudi Arabia +966)
- Pre-filled message in Arabic with invoice details

### 4. **PDF Download**
- Direct PDF download option
- Properly named files: `BLOOV-Invoice-{InvoiceNumber}.pdf`
- Available from both list view and detail view

## How to Use

### From Sales List View

1. Navigate to the Sales page
2. Find the invoice you want to share/download
3. In the Actions column, you'll see three buttons:
   - **Blue (Printer Icon)**: Print preview
   - **Purple (Download Icon)**: Download PDF
   - **Green (WhatsApp Icon)**: Share via WhatsApp

### From Invoice Detail View

1. Click the "View" (Eye icon) button on any sale
2. At the bottom of the invoice details, you'll see:
   - **Print**: Opens print preview
   - **PDF**: Downloads the invoice as PDF
   - **WhatsApp**: Shares invoice via WhatsApp (if customer has phone)
   - **Cancel**: Cancels the invoice

### WhatsApp Sharing Behavior

#### On Mobile (iPhone, iPad, Android):
1. Click the WhatsApp button
2. System generates the PDF
3. Native share sheet appears
4. Select WhatsApp from the options
5. Choose contact or group
6. Message is pre-filled with invoice details
7. PDF is attached automatically
8. Send!

#### On Desktop:
1. Click the WhatsApp button
2. PDF downloads automatically to your Downloads folder
3. WhatsApp Web opens in a new tab with pre-filled message
4. Drag and drop the downloaded PDF into the chat
5. Send!

## Invoice Content

### Header Section
- BLOOV logo and branding (purple gradient)
- Company name in English and Arabic
- Tagline: "Elegant Flowers & Gifts"

### Company Information
- Company name (Arabic and English)
- VAT Registration Number
- Address (Arabic)
- Phone and email

### Invoice Details
- Invoice number
- Invoice date (formatted in English)
- Customer name (if available)
- Customer phone (if available)

### Items Table
Columns:
- Item name / المنتج
- Quantity (Qty)
- Unit Price
- Discount (Disc.)
- Total

### Summary Section
- Subtotal
- Discount (if applicable)
- VAT (15%)
- **Total** (highlighted in purple)

### Footer
- Payment method (Cash/Card/Bank Transfer)
- Notes (if any)
- ZATCA QR Code (bottom right)
- QR code description in Arabic and English
- Thank you message (bilingual)

## ZATCA QR Code

The QR code includes the following ZATCA-required information:
1. Seller name (Arabic)
2. VAT registration number
3. Invoice timestamp (ISO format)
4. Total amount with VAT
5. VAT amount

This QR code can be scanned by customers or tax authorities to verify the invoice authenticity.

## Technical Details

### Libraries Used
- **jsPDF**: PDF generation engine
- **QRCode**: QR code generation for ZATCA compliance

### ZATCA TLV Format
The QR code uses the Tag-Length-Value (TLV) format required by ZATCA:
- Tag 1: Seller Name
- Tag 2: VAT Number
- Tag 3: Timestamp
- Tag 4: Total with VAT
- Tag 5: VAT Amount

### File Format
- Format: PDF (Portable Document Format)
- Size: A4 (210mm × 297mm)
- Orientation: Portrait
- Font: Helvetica
- Colors: BLOOV brand purple (#8B5CF6)

## Customization

### Company Information
Update the company details in `/src/lib/pdfGenerator.ts`:

```typescript
const COMPANY_INFO: CompanyInfo = {
  name: 'BLOOV',
  nameAr: 'بلوف',
  vatNumber: '300000000000003', // Update with your VAT number
  address: 'Riyadh, Saudi Arabia',
  addressAr: 'الرياض، المملكة العربية السعودية',
  phone: '+966 XX XXX XXXX', // Update with your phone
  email: 'info@bloov.com' // Update with your email
};
```

### WhatsApp Message Template
The message sent with the invoice can be customized in the `shareInvoiceViaWhatsApp` function:

```typescript
text: `مرحباً 👋
شكراً لتسوقك في BLOOV 🌸
📄 رقم الفاتورة: ${sale.sale_number}
💰 المجموع: ${sale.total.toFixed(2)} ر.س
شامل ضريبة القيمة المضافة 15%`
```

### Brand Colors
The primary brand color (purple) can be adjusted:
- Header background: RGB(139, 92, 246)
- Accent lines: RGB(139, 92, 246)
- Total highlight: RGB(139, 92, 246)

## Browser Compatibility

### Web Share API Support:
- ✅ Chrome for Android
- ✅ Safari on iOS/iPadOS
- ✅ Samsung Internet
- ✅ Edge Mobile
- ❌ Desktop browsers (uses fallback download)

### PDF Generation Support:
- ✅ All modern browsers (Chrome, Firefox, Safari, Edge)
- ✅ Internet Explorer 11+ (with polyfills)

## Troubleshooting

### PDF Not Generating
**Problem**: Error message when clicking PDF/WhatsApp button

**Solutions**:
1. Check browser console for errors
2. Ensure invoice has items (empty invoices cannot be generated)
3. Clear browser cache and reload
4. Try in a different browser

### WhatsApp Not Opening
**Problem**: WhatsApp doesn't open after clicking button

**Solutions**:
1. Ensure customer has a phone number
2. Check phone number format (should be Saudi +966)
3. Verify WhatsApp is installed (mobile) or logged in (web)
4. Try copying the phone number and opening WhatsApp manually

### PDF Download Not Starting
**Problem**: File doesn't download to device

**Solutions**:
1. Check browser's download settings
2. Allow downloads from the site
3. Check popup blocker settings
4. Ensure sufficient storage space

### QR Code Not Scanning
**Problem**: ZATCA QR code won't scan

**Solutions**:
1. Ensure good print quality (300 DPI minimum)
2. Check QR code size (should be at least 2cm × 2cm)
3. Verify VAT number is correct
4. Test with ZATCA's official QR scanner app

## Security and Privacy

- PDFs are generated client-side (in the browser)
- No invoice data is sent to external servers for PDF generation
- Phone numbers are validated and formatted securely
- QR codes contain only ZATCA-required information
- Files are temporarily stored in browser memory only

## Performance

- PDF generation time: ~500ms - 2 seconds
- Depends on:
  - Number of items in invoice
  - Device processing power
  - Browser performance
- No server round-trip required (faster)
- No file size limits (client-side generation)

## Future Enhancements

Potential additions:
- Email PDF directly from the app
- Batch PDF generation for multiple invoices
- Custom PDF templates per customer
- Logo upload functionality
- Multiple language support
- Digital signature integration
- Cloud storage integration (Google Drive, Dropbox)

## Support

For issues or questions:
1. Check this guide first
2. Review browser console for errors
3. Test in another browser
4. Contact system administrator

## Version History

**v1.0** (Current)
- Initial release
- ZATCA-compliant QR code generation
- Web Share API integration
- Mobile-first design
- Bilingual support (Arabic/English)
- Professional BLOOV branding
