export interface ZATCAInvoice {
  invoiceUUID: string;
  invoiceNumber: string;
  issueDate: string;
  issueTime: string;
  invoiceType: 'standard' | 'simplified';
  invoiceTypeCode: '388' | '381' | '383';
  currency: string;

  seller: ZATCAParty;
  buyer?: ZATCAParty;

  lineItems: ZATCALineItem[];

  taxExclusiveAmount: number;
  taxInclusiveAmount: number;
  allowanceTotalAmount: number;
  taxAmount: number;

  paymentMeans?: string;
  notes?: string;

  previousInvoiceHash?: string;
  invoiceHash?: string;
  qrCode?: string;
  signature?: string;
}

export interface ZATCAParty {
  name: string;
  nameAr?: string;
  vatNumber: string;
  streetName?: string;
  buildingNumber?: string;
  cityName?: string;
  postalZone?: string;
  countryCode: string;
  countrySubdivision?: string;
}

export interface ZATCALineItem {
  id: string;
  name: string;
  quantity: number;
  unitCode: string;
  unitPrice: number;
  discount: number;
  taxAmount: number;
  taxPercent: number;
  taxCategory: 'S' | 'Z' | 'E' | 'O';
  lineExtensionAmount: number;
  roundingAmount?: number;
}

export interface ZATCASettings {
  enabled: boolean;
  mode: 'sandbox' | 'production';
  otp?: string;
  taxNumber: string;
  businessName: string;
  businessNameAr?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  certificateBase64?: string;
  privateKeyBase64?: string;
}

export interface ZATCASubmissionResult {
  success: boolean;
  status: 'reported' | 'cleared' | 'rejected' | 'error';
  clearanceStatus?: string;
  validationResults?: ZATCAValidationResult[];
  warningMessages?: string[];
  errorMessages?: string[];
  invoiceHash?: string;
  clearedInvoice?: string;
  qrCode?: string;
}

export interface ZATCAValidationResult {
  type: 'INFO' | 'WARNING' | 'ERROR';
  code: string;
  category: string;
  message: string;
  status: 'PASS' | 'WARNING' | 'ERROR';
}

export const ZATCA_TAX_CATEGORIES = {
  S: { code: 'S', name: 'Standard Rate', percent: 15 },
  Z: { code: 'Z', name: 'Zero Rate', percent: 0 },
  E: { code: 'E', name: 'Exempt', percent: 0 },
  O: { code: 'O', name: 'Out of Scope', percent: 0 }
} as const;

export const ZATCA_INVOICE_TYPES = {
  STANDARD: '388',
  DEBIT_NOTE: '383',
  CREDIT_NOTE: '381'
} as const;

export const ZATCA_NAMESPACES = {
  cac: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
  ext: 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
  sig: 'urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2',
  sac: 'urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2',
  sbc: 'urn:oasis:names:specification:ubl:schema:xsd:SignatureBasicComponents-2',
  ds: 'http://www.w3.org/2000/09/xmldsig#',
  xades: 'http://uri.etsi.org/01903/v1.3.2#'
} as const;
