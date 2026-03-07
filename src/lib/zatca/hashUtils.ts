import { ZATCAInvoice, ZATCASettings } from './types';
import { generateCanonicalXML } from './xmlGenerator';

export async function computeInvoiceHash(xml: string): Promise<string> {
  const canonicalXml = generateCanonicalXML(xml);
  const encoder = new TextEncoder();
  const data = encoder.encode(canonicalXml);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return btoa(String.fromCharCode(...hashArray));
}

export function generateTLVQRCode(
  invoice: ZATCAInvoice,
  settings: ZATCASettings,
  invoiceHash?: string,
  signature?: string
): string {
  const fields: Array<{ tag: number; value: string }> = [
    { tag: 1, value: settings.businessName },
    { tag: 2, value: settings.taxNumber },
    { tag: 3, value: `${invoice.issueDate}T${invoice.issueTime}` },
    { tag: 4, value: invoice.taxInclusiveAmount.toFixed(2) },
    { tag: 5, value: invoice.taxAmount.toFixed(2) }
  ];

  if (invoiceHash) {
    fields.push({ tag: 6, value: invoiceHash });
  }

  if (signature) {
    fields.push({ tag: 7, value: signature });
  }

  if (settings.certificateBase64) {
    fields.push({ tag: 8, value: settings.certificateBase64 });
  }

  let tlvString = '';
  for (const field of fields) {
    const valueBytes = new TextEncoder().encode(field.value);
    tlvString += String.fromCharCode(field.tag);
    tlvString += String.fromCharCode(valueBytes.length);
    tlvString += field.value;
  }

  return btoa(tlvString);
}

export function decodeTLVQRCode(base64Data: string): Record<number, string> {
  try {
    const decoded = atob(base64Data);
    const result: Record<number, string> = {};
    let offset = 0;

    while (offset < decoded.length) {
      const tag = decoded.charCodeAt(offset);
      const length = decoded.charCodeAt(offset + 1);
      const value = decoded.substring(offset + 2, offset + 2 + length);
      result[tag] = value;
      offset += 2 + length;
    }

    return result;
  } catch {
    return {};
  }
}

export async function generateCSR(
  commonName: string,
  organizationIdentifier: string,
  organizationUnit: string,
  organizationName: string,
  countryName: string,
  invoiceType: string,
  location: string,
  industryCode: string
): Promise<{ csr: string; privateKey: string }> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'ECDSA',
      namedCurve: 'P-256'
    },
    true,
    ['sign', 'verify']
  );

  const privateKeyBuffer = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
  const privateKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(privateKeyBuffer)));

  const csrData = buildCSRStructure({
    commonName,
    organizationIdentifier,
    organizationUnit,
    organizationName,
    countryName,
    invoiceType,
    location,
    industryCode
  });

  return {
    csr: `-----BEGIN CERTIFICATE REQUEST-----\n${csrData}\n-----END CERTIFICATE REQUEST-----`,
    privateKey: `-----BEGIN PRIVATE KEY-----\n${privateKeyBase64}\n-----END PRIVATE KEY-----`
  };
}

function buildCSRStructure(params: {
  commonName: string;
  organizationIdentifier: string;
  organizationUnit: string;
  organizationName: string;
  countryName: string;
  invoiceType: string;
  location: string;
  industryCode: string;
}): string {
  const subject = [
    `CN=${params.commonName}`,
    `serialNumber=1-${params.organizationIdentifier}|2-${params.invoiceType}|3-${params.location}`,
    `OU=${params.organizationUnit}`,
    `O=${params.organizationName}`,
    `C=${params.countryName}`
  ].join(',');

  return btoa(subject);
}

export async function signInvoice(
  xml: string,
  privateKeyPem: string
): Promise<string> {
  try {
    const privateKeyBase64 = privateKeyPem
      .replace('-----BEGIN PRIVATE KEY-----', '')
      .replace('-----END PRIVATE KEY-----', '')
      .replace(/\s/g, '');

    const privateKeyBuffer = Uint8Array.from(atob(privateKeyBase64), c => c.charCodeAt(0));

    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      privateKeyBuffer,
      {
        name: 'ECDSA',
        namedCurve: 'P-256'
      },
      false,
      ['sign']
    );

    const canonicalXml = generateCanonicalXML(xml);
    const encoder = new TextEncoder();
    const data = encoder.encode(canonicalXml);

    const signatureBuffer = await crypto.subtle.sign(
      {
        name: 'ECDSA',
        hash: 'SHA-256'
      },
      privateKey,
      data
    );

    const signatureArray = Array.from(new Uint8Array(signatureBuffer));
    return btoa(String.fromCharCode(...signatureArray));
  } catch (error) {
    console.error('Error signing invoice:', error);
    throw new Error('Failed to sign invoice');
  }
}

export async function verifySignature(
  xml: string,
  signature: string,
  publicKeyPem: string
): Promise<boolean> {
  try {
    const publicKeyBase64 = publicKeyPem
      .replace('-----BEGIN PUBLIC KEY-----', '')
      .replace('-----END PUBLIC KEY-----', '')
      .replace(/\s/g, '');

    const publicKeyBuffer = Uint8Array.from(atob(publicKeyBase64), c => c.charCodeAt(0));

    const publicKey = await crypto.subtle.importKey(
      'spki',
      publicKeyBuffer,
      {
        name: 'ECDSA',
        namedCurve: 'P-256'
      },
      false,
      ['verify']
    );

    const canonicalXml = generateCanonicalXML(xml);
    const encoder = new TextEncoder();
    const data = encoder.encode(canonicalXml);

    const signatureBuffer = Uint8Array.from(atob(signature), c => c.charCodeAt(0));

    return await crypto.subtle.verify(
      {
        name: 'ECDSA',
        hash: 'SHA-256'
      },
      publicKey,
      signatureBuffer,
      data
    );
  } catch {
    return false;
  }
}
