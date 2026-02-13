# WhatsApp Invoice Sharing Guide

## Overview

The Bloov Accounting System now includes an enhanced WhatsApp sharing feature that automatically includes your business WhatsApp contact link in every invoice sent to customers.

## New Features

### 1. Business WhatsApp Number Configuration

Admins can now configure the business WhatsApp number that will appear in all shared invoices:

**Location**: Settings → Business Information → Contact Information

**Field**: WhatsApp Number (رقم واتساب للتواصل)

**Format**: International format without '+' sign (e.g., `966501234567`)

**Examples**:
- Saudi Arabia: `966501234567`
- UAE: `971501234567`
- Egypt: `201234567890`

### 2. Enhanced Invoice Message

When sharing an invoice via WhatsApp, the message now includes:

```
📄 مرفق لكم فاتورة BLOOV رقم {invoiceNumber}
💰 المجموع: {amount} ر.س (شامل ضريبة القيمة المضافة 15%)
🌸 شكراً لثقتكم بنا.
📲 للتواصل السريع: https://wa.me/{yourBusinessNumber}
```

**Benefits**:
- Professional appearance
- Direct contact link for customers
- Easy for customers to reach out
- Increases customer engagement

### 3. How It Works

#### On Mobile Devices:

1. Navigate to Sales → View invoice
2. Click "Share via WhatsApp" button
3. Select customer's WhatsApp contact
4. Both the PDF and the formatted message are sent together
5. Customer receives:
   - PDF invoice attachment
   - Professional message with your contact link

#### On Desktop:

1. Navigate to Sales → View invoice
2. Click "Share via WhatsApp" button
3. PDF is downloaded automatically
4. WhatsApp Web opens with the pre-formatted message
5. Drag and drop the PDF into WhatsApp
6. Send to customer

## Setup Instructions

### Step 1: Configure Your Business WhatsApp Number

1. Login as Admin
2. Go to **Settings** page
3. Select **Business Information** tab
4. Scroll to **Contact Information** section
5. Enter your WhatsApp number in international format
   - Example: `966501234567`
   - Remove any spaces, dashes, or special characters
   - Do NOT include the '+' sign
6. Click **Save Settings** button

### Step 2: Test the Feature

1. Go to **Sales** page
2. Find any existing invoice
3. Click the WhatsApp icon next to the invoice
4. Verify the message includes your contact link
5. Send a test invoice to your own number

### Step 3: Train Your Staff

Ensure all sales staff know:
- How to share invoices via WhatsApp
- That the contact link is automatically included
- The professional message format

## Message Formatting

### Arabic Message:
```
📄 مرفق لكم فاتورة BLOOV رقم INV-001
💰 المجموع: 150.00 ر.س (شامل ضريبة القيمة المضافة 15%)
🌸 شكراً لثقتكم بنا.
📲 للتواصل السريع: https://wa.me/966501234567
```

### What Customers See:
- 📄 Invoice number
- 💰 Total amount with tax note
- 🌸 Thank you message
- 📲 Clickable WhatsApp link

### What Happens When Customer Clicks Link:
- WhatsApp opens automatically
- A new chat with your business number starts
- Customer can immediately message you
- You can respond from any device

## Technical Details

### Database Changes

A new column `business_whatsapp` has been added to the `settings` table to store your business WhatsApp number.

### Web Share API

The system uses the native Web Share API on mobile devices for seamless sharing of both PDF and text together.

### Fallback Mechanism

On desktop or unsupported browsers:
1. PDF downloads automatically
2. WhatsApp Web opens with the message
3. User manually drags PDF into chat

### URL Encoding

All message text is properly encoded to support:
- Arabic text
- Emojis
- Special characters
- URLs

## Best Practices

### For Administrators:

1. **Keep Number Updated**: Ensure the WhatsApp number is always current
2. **Use Business Account**: Consider using WhatsApp Business for professional features
3. **Monitor Messages**: Regularly check incoming customer messages
4. **Quick Responses**: Train staff to respond promptly to WhatsApp inquiries

### For Sales Staff:

1. **Always Include PDF**: Ensure the PDF is attached with every message
2. **Verify Number**: Double-check customer phone number before sending
3. **Professional Tone**: Maintain professional communication
4. **Follow Up**: Check if customer received the invoice

### For Customers:

1. **Click the Link**: Easy one-click contact with your business
2. **Save Number**: Customers can save your business number
3. **Quick Questions**: Easy to ask questions about the invoice
4. **Order Tracking**: Can message for order updates

## Troubleshooting

### Issue: WhatsApp number not appearing in invoices

**Solution**:
1. Go to Settings → Business Information
2. Verify the WhatsApp number is saved
3. Click "Save Settings" again
4. Try sharing an invoice

### Issue: Invalid WhatsApp number format

**Solution**:
- Use international format: `966501234567`
- Remove spaces: `966 50 123 4567` → `966501234567`
- Remove dashes: `966-50-123-4567` → `966501234567`
- Remove plus sign: `+966501234567` → `966501234567`

### Issue: Message not properly formatted

**Solution**:
- Emojis are automatically included
- Text is automatically encoded
- Refresh the page and try again

### Issue: PDF not sending with message

**Mobile**: Use the share button, select WhatsApp, attach PDF

**Desktop**:
1. PDF downloads first
2. WhatsApp Web opens
3. Manually drag PDF into chat
4. Message text is pre-filled

## Security & Privacy

- WhatsApp numbers are stored securely in the database
- Only admins can view and edit the business WhatsApp number
- Customer phone numbers are validated before sending
- All communications use WhatsApp's end-to-end encryption

## Future Enhancements

Planned features:
- Multiple WhatsApp numbers for different departments
- Custom message templates
- WhatsApp Business API integration
- Automated invoice delivery
- Read receipts and delivery status

## Support

For issues or questions:
1. Check this guide first
2. Verify your settings configuration
3. Test with a sample invoice
4. Contact system administrator

---

**Version**: 1.0
**Last Updated**: February 2026
**Compatible With**: All modern browsers and mobile devices
