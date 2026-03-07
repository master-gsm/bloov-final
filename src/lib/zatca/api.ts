import { ZATCASettings, ZATCASubmissionResult, ZATCAValidationResult } from './types';

const ZATCA_ENDPOINTS = {
  sandbox: {
    compliance: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal',
    reporting: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal/invoices/reporting/single',
    clearance: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal/invoices/clearance/single'
  },
  production: {
    compliance: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core',
    reporting: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core/invoices/reporting/single',
    clearance: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core/invoices/clearance/single'
  }
} as const;

export interface ZATCACredentials {
  username: string;
  password: string;
}

export class ZATCAClient {
  private settings: ZATCASettings;
  private credentials?: ZATCACredentials;

  constructor(settings: ZATCASettings) {
    this.settings = settings;
  }

  setCredentials(credentials: ZATCACredentials): void {
    this.credentials = credentials;
  }

  private getEndpoints() {
    return ZATCA_ENDPOINTS[this.settings.mode];
  }

  private getAuthHeader(): string {
    if (!this.credentials) {
      throw new Error('ZATCA credentials not set');
    }
    const credentials = btoa(`${this.credentials.username}:${this.credentials.password}`);
    return `Basic ${credentials}`;
  }

  async submitComplianceCheck(
    invoiceXml: string,
    invoiceHash: string,
    uuid: string
  ): Promise<ZATCASubmissionResult> {
    const endpoints = this.getEndpoints();

    try {
      const response = await fetch(endpoints.compliance + '/compliance/invoices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Accept-Language': 'en',
          'Accept-Version': 'V2',
          'Authorization': this.getAuthHeader()
        },
        body: JSON.stringify({
          invoiceHash,
          uuid,
          invoice: btoa(invoiceXml)
        })
      });

      return this.parseResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async reportInvoice(
    invoiceXml: string,
    invoiceHash: string,
    uuid: string
  ): Promise<ZATCASubmissionResult> {
    const endpoints = this.getEndpoints();

    try {
      const response = await fetch(endpoints.reporting, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Accept-Language': 'en',
          'Accept-Version': 'V2',
          'Authorization': this.getAuthHeader(),
          'Clearance-Status': '0'
        },
        body: JSON.stringify({
          invoiceHash,
          uuid,
          invoice: btoa(invoiceXml)
        })
      });

      return this.parseResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async clearInvoice(
    invoiceXml: string,
    invoiceHash: string,
    uuid: string
  ): Promise<ZATCASubmissionResult> {
    const endpoints = this.getEndpoints();

    try {
      const response = await fetch(endpoints.clearance, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Accept-Language': 'en',
          'Accept-Version': 'V2',
          'Authorization': this.getAuthHeader(),
          'Clearance-Status': '1'
        },
        body: JSON.stringify({
          invoiceHash,
          uuid,
          invoice: btoa(invoiceXml)
        })
      });

      return this.parseResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async parseResponse(response: Response): Promise<ZATCASubmissionResult> {
    const data = await response.json();

    if (response.ok) {
      const validationResults: ZATCAValidationResult[] = [];
      const warningMessages: string[] = [];
      const errorMessages: string[] = [];

      if (data.validationResults?.infoMessages) {
        for (const msg of data.validationResults.infoMessages) {
          validationResults.push({
            type: 'INFO',
            code: msg.code || '',
            category: msg.category || '',
            message: msg.message || '',
            status: 'PASS'
          });
        }
      }

      if (data.validationResults?.warningMessages) {
        for (const msg of data.validationResults.warningMessages) {
          validationResults.push({
            type: 'WARNING',
            code: msg.code || '',
            category: msg.category || '',
            message: msg.message || '',
            status: 'WARNING'
          });
          warningMessages.push(msg.message || msg.code);
        }
      }

      if (data.validationResults?.errorMessages) {
        for (const msg of data.validationResults.errorMessages) {
          validationResults.push({
            type: 'ERROR',
            code: msg.code || '',
            category: msg.category || '',
            message: msg.message || '',
            status: 'ERROR'
          });
          errorMessages.push(msg.message || msg.code);
        }
      }

      const hasErrors = errorMessages.length > 0;
      const status = hasErrors ? 'rejected' : (data.clearanceStatus === 'CLEARED' ? 'cleared' : 'reported');

      return {
        success: !hasErrors,
        status,
        clearanceStatus: data.clearanceStatus,
        validationResults,
        warningMessages,
        errorMessages,
        invoiceHash: data.invoiceHash,
        clearedInvoice: data.clearedInvoice,
        qrCode: data.qrCode
      };
    } else {
      return {
        success: false,
        status: 'error',
        errorMessages: [data.message || `HTTP Error: ${response.status}`]
      };
    }
  }

  private handleError(error: unknown): ZATCASubmissionResult {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      success: false,
      status: 'error',
      errorMessages: [message]
    };
  }
}

export async function requestProductionCSID(
  otp: string,
  csr: string,
  mode: 'sandbox' | 'production' = 'sandbox'
): Promise<{
  success: boolean;
  binarySecurityToken?: string;
  secret?: string;
  errors?: string[];
}> {
  const baseUrl = mode === 'sandbox'
    ? 'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal'
    : 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core';

  try {
    const response = await fetch(`${baseUrl}/compliance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'OTP': otp,
        'Accept-Version': 'V2'
      },
      body: JSON.stringify({
        csr: btoa(csr)
      })
    });

    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        binarySecurityToken: data.binarySecurityToken,
        secret: data.secret
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        errors: [error.message || `HTTP Error: ${response.status}`]
      };
    }
  } catch (error) {
    return {
      success: false,
      errors: [error instanceof Error ? error.message : 'Network error']
    };
  }
}

export async function requestProductionCredentials(
  complianceRequestId: string,
  binarySecurityToken: string,
  secret: string,
  mode: 'sandbox' | 'production' = 'sandbox'
): Promise<{
  success: boolean;
  productionBinarySecurityToken?: string;
  productionSecret?: string;
  errors?: string[];
}> {
  const baseUrl = mode === 'sandbox'
    ? 'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal'
    : 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core';

  try {
    const response = await fetch(`${baseUrl}/production/csids`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Version': 'V2',
        'Authorization': `Basic ${btoa(`${binarySecurityToken}:${secret}`)}`
      },
      body: JSON.stringify({
        compliance_request_id: complianceRequestId
      })
    });

    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        productionBinarySecurityToken: data.binarySecurityToken,
        productionSecret: data.secret
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        errors: [error.message || `HTTP Error: ${response.status}`]
      };
    }
  } catch (error) {
    return {
      success: false,
      errors: [error instanceof Error ? error.message : 'Network error']
    };
  }
}
