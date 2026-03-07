export * from './types';
export * from './xmlGenerator';
export * from './hashUtils';
export * from './converter';
export * from './api';

import { supabase } from '../supabase';
import { ZATCAInvoice, ZATCASettings, ZATCASubmissionResult } from './types';
import { generateZATCAXML } from './xmlGenerator';
import { computeInvoiceHash, generateTLVQRCode, signInvoice } from './hashUtils';
import { convertSaleToZATCAInvoice, validateZATCAInvoice } from './converter';
import { ZATCAClient } from './api';

export async function getZATCASettings(): Promise<ZATCASettings | null> {
  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    enabled: data.zatca_enabled || false,
    mode: data.zatca_mode || 'sandbox',
    otp: data.zatca_otp || undefined,
    taxNumber: data.tax_number || '',
    businessName: data.business_name || '',
    businessNameAr: data.business_name_ar || undefined,
    address: data.business_address || undefined,
    city: data.business_city || undefined,
    postalCode: data.business_postal_code || undefined,
    certificateBase64: data.zatca_certificate || undefined,
    privateKeyBase64: data.zatca_private_key || undefined
  };
}

export async function processZATCAInvoice(
  saleId: string,
  items: Array<{
    product_id?: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    discount: number;
    total: number;
  }>
): Promise<{
  success: boolean;
  xml?: string;
  hash?: string;
  qrCode?: string;
  error?: string;
}> {
  try {
    const settings = await getZATCASettings();
    if (!settings || !settings.enabled) {
      return { success: false, error: 'ZATCA integration is not enabled' };
    }

    const { data: sale, error: saleError } = await supabase
      .from('sales')
      .select('*')
      .eq('id', saleId)
      .maybeSingle();

    if (saleError || !sale) {
      return { success: false, error: 'Sale not found' };
    }

    const invoice = convertSaleToZATCAInvoice(sale, items, settings);

    const validation = validateZATCAInvoice(invoice);
    if (!validation.valid) {
      return { success: false, error: validation.errors.join(', ') };
    }

    const xml = generateZATCAXML(invoice);

    const hash = await computeInvoiceHash(xml);

    let signedXml = xml;
    if (settings.privateKeyBase64) {
      try {
        const signature = await signInvoice(xml, settings.privateKeyBase64);
        invoice.signature = signature;
        signedXml = generateZATCAXML(invoice);
      } catch {
        console.warn('Failed to sign invoice, proceeding without signature');
      }
    }

    const qrCode = generateTLVQRCode(invoice, settings, hash, invoice.signature);

    await supabase
      .from('sales')
      .update({
        invoice_hash: hash,
        zatca_status: 'pending',
        updated_at: new Date().toISOString()
      })
      .eq('id', saleId);

    return {
      success: true,
      xml: signedXml,
      hash,
      qrCode
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

export async function submitToZATCA(
  saleId: string,
  xml: string,
  hash: string
): Promise<ZATCASubmissionResult> {
  const settings = await getZATCASettings();
  if (!settings || !settings.enabled) {
    return {
      success: false,
      status: 'error',
      errorMessages: ['ZATCA integration is not enabled']
    };
  }

  const { data: sale, error: saleError } = await supabase
    .from('sales')
    .select('invoice_uuid, buyer_type')
    .eq('id', saleId)
    .maybeSingle();

  if (saleError || !sale) {
    return {
      success: false,
      status: 'error',
      errorMessages: ['Sale not found']
    };
  }

  const client = new ZATCAClient(settings);

  if (!settings.certificateBase64) {
    return {
      success: false,
      status: 'error',
      errorMessages: ['ZATCA credentials not configured']
    };
  }

  const isB2B = sale.buyer_type === 'business';

  let result: ZATCASubmissionResult;
  if (isB2B) {
    result = await client.clearInvoice(xml, hash, sale.invoice_uuid);
  } else {
    result = await client.reportInvoice(xml, hash, sale.invoice_uuid);
  }

  const updateData: Record<string, unknown> = {
    zatca_status: result.status,
    zatca_response: {
      validationResults: result.validationResults,
      warningMessages: result.warningMessages,
      errorMessages: result.errorMessages
    },
    updated_at: new Date().toISOString()
  };

  if (result.status === 'cleared') {
    updateData.zatca_cleared_at = new Date().toISOString();
  }

  if (result.errorMessages && result.errorMessages.length > 0) {
    updateData.zatca_error_message = result.errorMessages.join('; ');
  }

  if (result.qrCode) {
    updateData.zatca_qr_code = result.qrCode;
  }

  await supabase
    .from('sales')
    .update(updateData)
    .eq('id', saleId);

  return result;
}

export async function getZATCAStatus(saleId: string): Promise<{
  status: string;
  errorMessage?: string;
  clearedAt?: string;
  response?: Record<string, unknown>;
}> {
  const { data, error } = await supabase
    .from('sales')
    .select('zatca_status, zatca_error_message, zatca_cleared_at, zatca_response')
    .eq('id', saleId)
    .maybeSingle();

  if (error || !data) {
    return { status: 'unknown' };
  }

  return {
    status: data.zatca_status || 'pending',
    errorMessage: data.zatca_error_message || undefined,
    clearedAt: data.zatca_cleared_at || undefined,
    response: data.zatca_response as Record<string, unknown> || undefined
  };
}
