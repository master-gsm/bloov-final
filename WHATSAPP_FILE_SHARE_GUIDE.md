# WhatsApp File Sharing - Complete Implementation Guide

## Overview
This guide explains how the WhatsApp file sharing feature works in the BLOOV Accounting System. The system uses the **Web Share API** to share invoice files (PDF or PNG images) directly to WhatsApp with accompanying text messages.

---

## How It Works

### User Workflow

1. **User clicks "Send WhatsApp" button** on an invoice
2. **System generates invoice file** (tries PDF first, falls back to PNG if needed)
3. **Native share dialog opens** (Windows Share menu, Mac Share menu, or Mobile Share sheet)
4. **User selects WhatsApp** from the list of apps
5. **WhatsApp opens** with the invoice file AND text message pre-attached
6. **User selects contact** and sends

---

## Technical Implementation

### 1. File Generation (PDF or Image)

#### PDF Generation (Primary Method)
```typescript
// Uses jsPDF library to create professional invoices
const pdfBlob = await generateInvoicePDF(sale, items);
const pdfFile = new File([pdfBlob], `BLOOV-Invoice-${sale.sale_number}.pdf`, {
  type: 'application/pdf',
  lastModified: Date.now()
});
```

**Features:**
- Professional tax invoice format
- ZATCA-compliant QR code
- Company branding and VAT information
- Itemized product list with prices
- Payment method and notes
- Total, subtotal, tax breakdown

#### Image Generation (Fallback Method)
```typescript
// Uses Canvas API to create image invoices
const imageBlob = await generateInvoiceImage(sale, items);
const imageFile = new File([imageBlob], `BLOOV-Invoice-${sale.sale_number}.png`, {
  type: 'image/png',
  lastModified: Date.now()
});
```

**Features:**
- Canvas-based rendering
- High-quality PNG output (800px width)
- Dynamic height based on items
- QR code integration
- Full invoice details

---

### 2. Web Share API Integration

#### Share Data Structure
```typescript
const shareData: ShareData = {
  files: [invoiceFile],           // PDF or PNG file
  text: cleanMessageText,         // Arabic greeting message
  title: `Invoice ${sale.sale_number}`  // Optional title
};
```

#### Share API Checks
```typescript
// Check if Web Share API is available
const hasShareAPI = typeof navigator.share === 'function';

// Check if we can share files
const canShare = navigator.canShare && navigator.canShare(shareData);

// Trigger share dialog
await navigator.share(shareData);
```

---

### 3. Fallback Strategies

The system has multiple fallback strategies to ensure maximum compatibility:

#### Fallback Chain:

**Level 1: PDF with Title**
```typescript
{ files: [pdfFile], text: message, title: invoiceNumber }
```

**Level 2: PDF without Title**
```typescript
{ files: [pdfFile], text: message }
```

**Level 3: PNG Image**
```typescript
{ files: [imageFile], text: message }
```

**Level 4: WhatsApp Direct Link + Download**
```typescript
// Open WhatsApp with text only
window.open(`https://wa.me/${phone}?text=${encodedMessage}`, '_blank');

// Auto-download the file separately
downloadFile(invoiceFile);
```

**Level 5: WhatsApp with Text Only**
```typescript
// Last resort - text message only
window.open(`https://wa.me/${phone}?text=${encodedMessage}`, '_blank');
```

---

## Message Format

### Arabic Message Template
```
مرحباً
شكراً لتسوقك في BLOOV
رقم الفاتورة: INV-0001
المجموع: 250.50 ر.س
نتطلع لخدمتك مجدداً
```

### Phone Number Formatting
```typescript
// Clean and format phone number
let cleanPhone = phone.replace(/[^0-9]/g, '');

// Handle different formats
if (cleanPhone.startsWith('00')) {
  cleanPhone = cleanPhone.slice(2);        // Remove 00
} else if (cleanPhone.startsWith('0')) {
  cleanPhone = '966' + cleanPhone.slice(1); // Convert to international
} else if (!cleanPhone.startsWith('966')) {
  cleanPhone = '966' + cleanPhone;          // Add country code
}

// Result: 966501234567
```

---

## Browser Compatibility

### ✅ Full Support (File Sharing)
- **Windows 10/11**: Edge, Chrome
- **macOS**: Safari 14+, Chrome
- **iOS 13+**: Safari, Chrome
- **Android 8+**: Chrome, Samsung Browser

### ⚠️ Partial Support (Text Only)
- **Older Firefox versions**: Text sharing works, file sharing may not
- **Older Chrome versions (<89)**: May fallback to text only

### ❌ No Support
- **Internet Explorer**: Not supported (system doesn't support IE anyway)
- **Very old mobile browsers**: Will fallback to text + download

---

## Platform-Specific Behavior

### Windows 10/11
1. Native share menu appears
2. Shows WhatsApp Desktop (if installed)
3. Shows other share targets (Mail, OneNote, etc.)
4. File + text are attached together

### macOS
1. macOS share sheet appears
2. Shows WhatsApp if installed
3. Shows AirDrop, Messages, Mail, etc.
4. File + text are shared together

### iOS (iPhone/iPad)
1. iOS share sheet appears
2. Shows WhatsApp, Messages, Mail, etc.
3. Full integration with file + text
4. Can also save to Files app

### Android
1. Android share menu appears
2. Shows WhatsApp and other apps
3. File + text are shared together
4. Recent apps appear at top

---

## Error Handling

### Handled Scenarios

#### User Cancelled Share
```typescript
if (error.name === 'AbortError') {
  console.log('User cancelled share dialog');
  return; // Silent exit, no error message
}
```

#### PDF Generation Failed
```typescript
catch (pdfError) {
  console.warn('PDF failed, trying image...');
  const imageBlob = await generateInvoiceImage(sale, items);
  // Continue with image
}
```

#### Both PDF and Image Failed
```typescript
catch (imageError) {
  console.warn('Both formats failed, opening WhatsApp with text only');
  window.open(whatsappUrl, '_blank');
  return;
}
```

#### Share API Not Available
```typescript
if (!hasShareAPI) {
  console.warn('Share API not available');
  window.open(whatsappUrl, '_blank'); // Direct WhatsApp link
  return;
}
```

#### Cannot Share Files
```typescript
if (!canShare) {
  console.warn('Cannot share files on this device');
  window.open(whatsappUrl, '_blank');    // Open WhatsApp
  downloadFile(invoiceFile);              // Download file separately
  return;
}
```

---

## Logging and Debugging

### Console Logs
The system provides comprehensive console logging for debugging:

```typescript
console.log('[shareInvoiceViaWhatsApp] Starting...');
console.log('[shareInvoiceViaWhatsApp] Sale:', sale.id, sale.sale_number);
console.log('[shareInvoiceViaWhatsApp] Items count:', items.length);
console.log('[shareInvoiceViaWhatsApp] Web Share API available:', hasShareAPI);
console.log('[shareInvoiceViaWhatsApp] PDF generated successfully, size:', pdfBlob.size);
console.log('[shareInvoiceViaWhatsApp] Can share data with file:', canShare);
console.log('[shareInvoiceViaWhatsApp] Opening native share sheet...');
console.log('[shareInvoiceViaWhatsApp] Share completed successfully!');
```

### Debugging Steps

**If file sharing doesn't work:**

1. **Open browser console** (F12)
2. **Look for these logs:**
   - `Web Share API available: false` → Browser doesn't support it
   - `Can share data with file: false` → Device/browser can't share files
   - `PDF generation failed` → PDF creation issue
   - `Image generation also failed` → Canvas issue
3. **Check file generation:**
   - Look for file size in bytes
   - Verify File object properties (name, size, type)
4. **Test fallback:**
   - Should open WhatsApp with text
   - File should download separately

---

## File Details

### PDF File
- **Filename:** `BLOOV-Invoice-{INVOICE_NUMBER}.pdf`
- **MIME Type:** `application/pdf`
- **Size:** Typically 20-50 KB
- **Features:** Multi-page support, embedded QR code, professional formatting

### PNG Image File
- **Filename:** `BLOOV-Invoice-{INVOICE_NUMBER}.png`
- **MIME Type:** `image/png`
- **Width:** 800px
- **Height:** Dynamic (based on items)
- **Quality:** 0.95 (high quality)
- **Size:** Typically 50-200 KB

---

## Security & Privacy

### Data Handling
- ✅ Files are generated client-side (no server upload)
- ✅ Files are temporary (not saved permanently)
- ✅ Phone numbers are formatted but not logged
- ✅ Share API is secure (browser-native)
- ✅ User controls which app receives the file

### No Data Leaves System Until User Shares
- Invoice generation happens in browser
- File exists only in memory
- User explicitly chooses to share
- User selects recipient in WhatsApp

---

## Testing Checklist

### For Developers

**Test on Different Devices:**
- ✅ Windows 10/11 Desktop
- ✅ macOS Desktop
- ✅ iOS (iPhone)
- ✅ Android Phone
- ✅ Tablet (iPad/Android)

**Test Different Browsers:**
- ✅ Chrome/Edge (Latest)
- ✅ Safari (Latest)
- ✅ Firefox (Latest)
- ✅ Mobile browsers

**Test Different Scenarios:**
- ✅ Invoice with few items (1-3)
- ✅ Invoice with many items (20+)
- ✅ Invoice with discount
- ✅ Invoice with notes
- ✅ Customer with/without phone
- ✅ Cancel share dialog
- ✅ Share to WhatsApp
- ✅ Share to other apps

**Verify Fallbacks:**
- ✅ PDF generation works
- ✅ Image fallback works
- ✅ Text-only fallback works
- ✅ File download fallback works

---

## Troubleshooting

### Issue: Share dialog doesn't open
**Solution:** Check browser compatibility, try updating browser

### Issue: File not attached in WhatsApp
**Solution:**
- Check if Web Share API supports files on device
- Try the "Download + Open WhatsApp" fallback
- Manually attach downloaded file

### Issue: PDF generation fails
**Solution:** System automatically falls back to PNG image

### Issue: Both PDF and Image fail
**Solution:**
- Check console for errors
- Clear browser cache
- Try different browser

### Issue: Wrong phone number format
**Solution:** System auto-formats, but verify customer phone starts with 0 or 966

---

## Code Files

### Main Implementation
- **`src/lib/pdfGenerator.ts`** - File generation and share logic
  - `generateInvoicePDF()` - Creates PDF invoices
  - `generateInvoiceImage()` - Creates PNG invoices
  - `shareInvoiceViaWhatsApp()` - Handles Web Share API

### UI Integration
- **`src/components/Sales.tsx`** - WhatsApp button and UI
  - `sendWhatsApp()` - Button click handler
  - User feedback and error handling

---

## Future Enhancements

### Potential Improvements
1. **Let user choose PDF or Image** before sharing
2. **Add invoice preview** before sharing
3. **Support for multiple files** (invoice + receipt)
4. **Custom message templates** per customer
5. **Share history tracking** for auditing
6. **Bulk WhatsApp sharing** for multiple invoices
7. **Email as alternative** to WhatsApp

### Performance Optimizations
1. **Cache QR codes** to speed up generation
2. **Pre-generate files** when viewing invoice
3. **Optimize image size** based on network speed
4. **Use Web Workers** for PDF generation

---

## API Reference

### shareInvoiceViaWhatsApp()

**Parameters:**
```typescript
sale: Sale              // Invoice data object
items: SaleItem[]       // Array of sale items
customerPhone: string   // Customer phone number
```

**Returns:**
```typescript
Promise<void>
```

**Throws:**
- File generation errors (logged, handled with fallback)
- Share API errors (logged, handled with fallback)
- User cancellation (silent, no error)

**Example Usage:**
```typescript
try {
  await shareInvoiceViaWhatsApp(invoice, items, '0501234567');
  console.log('Share completed!');
} catch (error) {
  if (error.name !== 'AbortError') {
    console.error('Share failed:', error);
  }
}
```

---

## Best Practices

### For Users
1. **Test before production**: Try sharing on your device first
2. **Keep WhatsApp updated**: Latest version works best
3. **Check phone numbers**: Verify customer phone is correct
4. **Use WiFi for first share**: Files download faster

### For Developers
1. **Always check API availability** before using
2. **Provide fallback options** for every feature
3. **Log errors comprehensively** for debugging
4. **Handle user cancellation gracefully** (no error message)
5. **Test on real devices** not just emulators

---

## Conclusion

The WhatsApp file sharing feature provides a seamless way to send professional invoices to customers. With multiple fallback strategies, comprehensive error handling, and cross-platform support, it works reliably across different devices and browsers.

**Key Benefits:**
- ✅ Professional invoices (PDF or Image)
- ✅ One-click sharing to WhatsApp
- ✅ Automatic file + text attachment
- ✅ Works on desktop and mobile
- ✅ Graceful fallbacks for compatibility
- ✅ ZATCA-compliant QR codes
- ✅ Bilingual support (Arabic/English)

---

**Last Updated:** February 13, 2026
**Version:** 2.0
**Status:** ✅ Production Ready
