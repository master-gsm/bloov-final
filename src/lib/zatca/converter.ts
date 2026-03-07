import { ZATCAInvoice, ZATCALineItem, ZATCAParty, ZATCASettings, ZATCA_INVOICE_TYPES } from './types';

interface Sale {
  id: string;
  invoice_uuid?: string;
  sale_number: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  sale_date: string;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  payment_method?: string | null;
  notes?: string | null;
  previous_hash?: string | null;
  invoice_hash?: string | null;
  buyer_type?: string;
  company_name?: string | null;
  company_vat_number?: string | null;
  company_address?: string | null;
}

interface SaleItem {
  product_id?: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  discount: number;
  total: number;
}

export function convertSaleToZATCAInvoice(
  sale: Sale,
  items: SaleItem[],
  settings: ZATCASettings
): ZATCAInvoice {
  const saleDate = new Date(sale.sale_date);
  const issueDate = saleDate.toISOString().split('T')[0];
  const issueTime = saleDate.toISOString().split('T')[1].substring(0, 8);

  const isB2B = sale.buyer_type === 'business' && sale.company_vat_number;
  const invoiceType = isB2B ? 'standard' : 'simplified';

  const seller: ZATCAParty = {
    name: settings.businessName,
    nameAr: settings.businessNameAr,
    vatNumber: settings.taxNumber,
    streetName: settings.address || '',
    cityName: settings.city || 'Riyadh',
    postalZone: settings.postalCode || '',
    countryCode: 'SA'
  };

  let buyer: ZATCAParty | undefined;
  if (isB2B) {
    buyer = {
      name: sale.company_name || sale.customer_name || '',
      vatNumber: sale.company_vat_number || '',
      streetName: sale.company_address || '',
      cityName: '',
      countryCode: 'SA'
    };
  }

  const lineItems: ZATCALineItem[] = items.map((item, index) => {
    const taxPercent = 15;
    const lineExtension = item.total;
    const taxAmount = lineExtension * (taxPercent / 100);

    return {
      id: item.product_id || `item-${index + 1}`,
      name: item.product_name,
      quantity: item.quantity,
      unitCode: 'PCE',
      unitPrice: item.unit_price,
      discount: item.discount,
      taxAmount: taxAmount,
      taxPercent: taxPercent,
      taxCategory: 'S',
      lineExtensionAmount: lineExtension
    };
  });

  const invoice: ZATCAInvoice = {
    invoiceUUID: sale.invoice_uuid || crypto.randomUUID(),
    invoiceNumber: sale.sale_number,
    issueDate,
    issueTime,
    invoiceType,
    invoiceTypeCode: ZATCA_INVOICE_TYPES.STANDARD,
    currency: 'SAR',
    seller,
    buyer,
    lineItems,
    taxExclusiveAmount: sale.subtotal,
    taxInclusiveAmount: sale.total,
    allowanceTotalAmount: sale.discount,
    taxAmount: sale.tax,
    paymentMeans: sale.payment_method || undefined,
    notes: sale.notes || undefined,
    previousInvoiceHash: sale.previous_hash || undefined,
    invoiceHash: sale.invoice_hash || undefined
  };

  return invoice;
}

export function validateZATCAInvoice(invoice: ZATCAInvoice): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!invoice.invoiceUUID) {
    errors.push('Invoice UUID is required');
  }

  if (!invoice.invoiceNumber) {
    errors.push('Invoice number is required');
  }

  if (!invoice.issueDate) {
    errors.push('Issue date is required');
  } else {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(invoice.issueDate)) {
      errors.push('Issue date must be in YYYY-MM-DD format');
    }
  }

  if (!invoice.issueTime) {
    errors.push('Issue time is required');
  } else {
    const timeRegex = /^\d{2}:\d{2}:\d{2}$/;
    if (!timeRegex.test(invoice.issueTime)) {
      errors.push('Issue time must be in HH:MM:SS format');
    }
  }

  if (!invoice.seller.name) {
    errors.push('Seller name is required');
  }

  if (!invoice.seller.vatNumber) {
    errors.push('Seller VAT number is required');
  } else if (!/^\d{15}$/.test(invoice.seller.vatNumber)) {
    warnings.push('Seller VAT number should be 15 digits');
  }

  if (invoice.invoiceType === 'standard' && !invoice.buyer) {
    errors.push('Buyer information is required for standard invoices');
  }

  if (invoice.buyer?.vatNumber && !/^\d{15}$/.test(invoice.buyer.vatNumber)) {
    warnings.push('Buyer VAT number should be 15 digits');
  }

  if (!invoice.lineItems || invoice.lineItems.length === 0) {
    errors.push('At least one line item is required');
  }

  for (let i = 0; i < invoice.lineItems.length; i++) {
    const item = invoice.lineItems[i];
    if (!item.name) {
      errors.push(`Line item ${i + 1}: Name is required`);
    }
    if (item.quantity <= 0) {
      errors.push(`Line item ${i + 1}: Quantity must be positive`);
    }
    if (item.unitPrice < 0) {
      errors.push(`Line item ${i + 1}: Unit price cannot be negative`);
    }
  }

  const calculatedTax = invoice.lineItems.reduce((sum, item) => sum + item.taxAmount, 0);
  const taxDifference = Math.abs(calculatedTax - invoice.taxAmount);
  if (taxDifference > 0.01) {
    warnings.push(`Tax amount mismatch: calculated ${calculatedTax.toFixed(2)}, declared ${invoice.taxAmount.toFixed(2)}`);
  }

  const calculatedSubtotal = invoice.lineItems.reduce((sum, item) => sum + item.lineExtensionAmount, 0);
  const subtotalDifference = Math.abs(calculatedSubtotal - invoice.taxExclusiveAmount);
  if (subtotalDifference > 0.01) {
    warnings.push(`Subtotal mismatch: calculated ${calculatedSubtotal.toFixed(2)}, declared ${invoice.taxExclusiveAmount.toFixed(2)}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

export function formatCurrency(amount: number, currency: string = 'SAR'): string {
  return new Intl.NumberFormat('ar-SA', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

export function formatDate(dateString: string, locale: string = 'ar-SA'): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(date);
}
