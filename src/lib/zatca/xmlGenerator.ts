import { ZATCAInvoice, ZATCALineItem, ZATCAParty, ZATCA_NAMESPACES } from './types';

export function generateZATCAXML(invoice: ZATCAInvoice): string {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="${ZATCA_NAMESPACES.cac}"
         xmlns:cbc="${ZATCA_NAMESPACES.cbc}"
         xmlns:ext="${ZATCA_NAMESPACES.ext}">
  ${generateExtensions(invoice)}
  <cbc:ProfileID>reporting:1.0</cbc:ProfileID>
  <cbc:ID>${escapeXml(invoice.invoiceNumber)}</cbc:ID>
  <cbc:UUID>${invoice.invoiceUUID}</cbc:UUID>
  <cbc:IssueDate>${invoice.issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${invoice.issueTime}</cbc:IssueTime>
  <cbc:InvoiceTypeCode name="${invoice.invoiceType === 'simplified' ? '0200000' : '0100000'}">${invoice.invoiceTypeCode}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${invoice.currency}</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>${invoice.currency}</cbc:TaxCurrencyCode>
  ${invoice.notes ? `<cbc:Note>${escapeXml(invoice.notes)}</cbc:Note>` : ''}
  ${generateAdditionalDocumentReference(invoice)}
  ${generateAccountingSupplierParty(invoice.seller)}
  ${invoice.buyer ? generateAccountingCustomerParty(invoice.buyer) : ''}
  ${invoice.paymentMeans ? generatePaymentMeans(invoice.paymentMeans) : ''}
  ${generateAllowanceCharge(invoice.allowanceTotalAmount)}
  ${generateTaxTotal(invoice)}
  ${generateLegalMonetaryTotal(invoice)}
  ${invoice.lineItems.map((item, index) => generateInvoiceLine(item, index + 1)).join('\n  ')}
</Invoice>`;

  return xml;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function generateExtensions(invoice: ZATCAInvoice): string {
  return `<ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionURI>urn:oasis:names:specification:ubl:dsig:enveloped:xades</ext:ExtensionURI>
      <ext:ExtensionContent>
        <!-- Digital Signature Placeholder -->
        ${invoice.signature ? `<sig:UBLDocumentSignatures xmlns:sig="${ZATCA_NAMESPACES.sig}">
          <sac:SignatureInformation xmlns:sac="${ZATCA_NAMESPACES.sac}">
            <cbc:ID>urn:oasis:names:specification:ubl:signature:1</cbc:ID>
            <sbc:ReferencedSignatureID xmlns:sbc="${ZATCA_NAMESPACES.sbc}">urn:oasis:names:specification:ubl:signature:Invoice</sbc:ReferencedSignatureID>
            <ds:Signature xmlns:ds="${ZATCA_NAMESPACES.ds}" Id="signature">
              ${invoice.signature}
            </ds:Signature>
          </sac:SignatureInformation>
        </sig:UBLDocumentSignatures>` : ''}
      </ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>`;
}

function generateAdditionalDocumentReference(invoice: ZATCAInvoice): string {
  let refs = '';

  refs += `<cac:AdditionalDocumentReference>
    <cbc:ID>ICV</cbc:ID>
    <cbc:UUID>${invoice.invoiceNumber.replace(/[^0-9]/g, '') || '1'}</cbc:UUID>
  </cac:AdditionalDocumentReference>`;

  if (invoice.previousInvoiceHash) {
    refs += `
  <cac:AdditionalDocumentReference>
    <cbc:ID>PIH</cbc:ID>
    <cac:Attachment>
      <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${invoice.previousInvoiceHash}</cbc:EmbeddedDocumentBinaryObject>
    </cac:Attachment>
  </cac:AdditionalDocumentReference>`;
  }

  if (invoice.qrCode) {
    refs += `
  <cac:AdditionalDocumentReference>
    <cbc:ID>QR</cbc:ID>
    <cac:Attachment>
      <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${invoice.qrCode}</cbc:EmbeddedDocumentBinaryObject>
    </cac:Attachment>
  </cac:AdditionalDocumentReference>`;
  }

  refs += `
  <cac:Signature>
    <cbc:ID>urn:oasis:names:specification:ubl:signature:Invoice</cbc:ID>
    <cbc:SignatureMethod>urn:oasis:names:specification:ubl:dsig:enveloped:xades</cbc:SignatureMethod>
  </cac:Signature>`;

  return refs;
}

function generateAccountingSupplierParty(seller: ZATCAParty): string {
  return `<cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="CRN">${escapeXml(seller.vatNumber)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PostalAddress>
        <cbc:StreetName>${escapeXml(seller.streetName || '')}</cbc:StreetName>
        <cbc:BuildingNumber>${escapeXml(seller.buildingNumber || '')}</cbc:BuildingNumber>
        <cbc:CityName>${escapeXml(seller.cityName || '')}</cbc:CityName>
        <cbc:PostalZone>${escapeXml(seller.postalZone || '')}</cbc:PostalZone>
        <cbc:CountrySubentity>${escapeXml(seller.countrySubdivision || '')}</cbc:CountrySubentity>
        <cac:Country>
          <cbc:IdentificationCode>${seller.countryCode}</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${escapeXml(seller.vatNumber)}</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXml(seller.name)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>`;
}

function generateAccountingCustomerParty(buyer: ZATCAParty): string {
  return `<cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="NAT">${escapeXml(buyer.vatNumber || 'NA')}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PostalAddress>
        <cbc:StreetName>${escapeXml(buyer.streetName || '')}</cbc:StreetName>
        <cbc:BuildingNumber>${escapeXml(buyer.buildingNumber || '')}</cbc:BuildingNumber>
        <cbc:CityName>${escapeXml(buyer.cityName || '')}</cbc:CityName>
        <cbc:PostalZone>${escapeXml(buyer.postalZone || '')}</cbc:PostalZone>
        <cac:Country>
          <cbc:IdentificationCode>${buyer.countryCode}</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXml(buyer.name)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>`;
}

function generatePaymentMeans(paymentMethod: string): string {
  const paymentMeansCode = getPaymentMeansCode(paymentMethod);
  return `<cac:PaymentMeans>
    <cbc:PaymentMeansCode>${paymentMeansCode}</cbc:PaymentMeansCode>
  </cac:PaymentMeans>`;
}

function getPaymentMeansCode(method: string): string {
  const codes: Record<string, string> = {
    'cash': '10',
    'card': '48',
    'bank_transfer': '42',
    'credit': '30'
  };
  return codes[method] || '1';
}

function generateAllowanceCharge(amount: number): string {
  if (amount <= 0) return '';

  return `<cac:AllowanceCharge>
    <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
    <cbc:AllowanceChargeReason>Discount</cbc:AllowanceChargeReason>
    <cbc:Amount currencyID="SAR">${amount.toFixed(2)}</cbc:Amount>
    <cac:TaxCategory>
      <cbc:ID>S</cbc:ID>
      <cbc:Percent>15.00</cbc:Percent>
      <cac:TaxScheme>
        <cbc:ID>VAT</cbc:ID>
      </cac:TaxScheme>
    </cac:TaxCategory>
  </cac:AllowanceCharge>`;
}

function generateTaxTotal(invoice: ZATCAInvoice): string {
  const taxSubtotals = groupTaxByCategory(invoice.lineItems);

  return `<cac:TaxTotal>
    <cbc:TaxAmount currencyID="${invoice.currency}">${invoice.taxAmount.toFixed(2)}</cbc:TaxAmount>
    ${taxSubtotals.map(subtotal => `
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${invoice.currency}">${subtotal.taxableAmount.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${invoice.currency}">${subtotal.taxAmount.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>${subtotal.category}</cbc:ID>
        <cbc:Percent>${subtotal.percent.toFixed(2)}</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`).join('')}
  </cac:TaxTotal>`;
}

function groupTaxByCategory(items: ZATCALineItem[]): Array<{
  category: string;
  percent: number;
  taxableAmount: number;
  taxAmount: number;
}> {
  const grouped: Record<string, { category: string; percent: number; taxableAmount: number; taxAmount: number }> = {};

  for (const item of items) {
    const key = `${item.taxCategory}-${item.taxPercent}`;
    if (!grouped[key]) {
      grouped[key] = {
        category: item.taxCategory,
        percent: item.taxPercent,
        taxableAmount: 0,
        taxAmount: 0
      };
    }
    grouped[key].taxableAmount += item.lineExtensionAmount;
    grouped[key].taxAmount += item.taxAmount;
  }

  return Object.values(grouped);
}

function generateLegalMonetaryTotal(invoice: ZATCAInvoice): string {
  return `<cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${invoice.currency}">${invoice.taxExclusiveAmount.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${invoice.currency}">${invoice.taxExclusiveAmount.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${invoice.currency}">${invoice.taxInclusiveAmount.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="${invoice.currency}">${invoice.allowanceTotalAmount.toFixed(2)}</cbc:AllowanceTotalAmount>
    <cbc:PayableAmount currencyID="${invoice.currency}">${invoice.taxInclusiveAmount.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>`;
}

function generateInvoiceLine(item: ZATCALineItem, lineNumber: number): string {
  return `<cac:InvoiceLine>
    <cbc:ID>${lineNumber}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${item.unitCode}">${item.quantity}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="SAR">${item.lineExtensionAmount.toFixed(2)}</cbc:LineExtensionAmount>
    ${item.discount > 0 ? `
    <cac:AllowanceCharge>
      <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
      <cbc:AllowanceChargeReason>Line Discount</cbc:AllowanceChargeReason>
      <cbc:Amount currencyID="SAR">${item.discount.toFixed(2)}</cbc:Amount>
    </cac:AllowanceCharge>` : ''}
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="SAR">${item.taxAmount.toFixed(2)}</cbc:TaxAmount>
      <cbc:RoundingAmount currencyID="SAR">${(item.lineExtensionAmount + item.taxAmount).toFixed(2)}</cbc:RoundingAmount>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Name>${escapeXml(item.name)}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>${item.taxCategory}</cbc:ID>
        <cbc:Percent>${item.taxPercent.toFixed(2)}</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="SAR">${item.unitPrice.toFixed(2)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`;
}

export function generateCanonicalXML(xml: string): string {
  return xml
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/>\s+</g, '><')
    .replace(/\s+/g, ' ')
    .trim();
}
