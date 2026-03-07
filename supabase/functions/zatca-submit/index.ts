import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

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

interface ZATCARequest {
  action: 'compliance' | 'report' | 'clear' | 'get-csid';
  saleId?: string;
  invoiceXml?: string;
  invoiceHash?: string;
  invoiceUuid?: string;
  otp?: string;
  csr?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: ZATCARequest = await req.json();
    const { action, saleId, invoiceXml, invoiceHash, invoiceUuid, otp, csr } = body;

    const { data: settings, error: settingsError } = await supabase
      .from('settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (settingsError || !settings) {
      return new Response(
        JSON.stringify({ success: false, error: 'Settings not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const mode = (settings.zatca_mode || 'sandbox') as 'sandbox' | 'production';
    const endpoints = ZATCA_ENDPOINTS[mode];

    if (action === 'get-csid' && otp && csr) {
      const response = await fetch(`${endpoints.compliance}/compliance`, {
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

      const data = await response.json();

      if (response.ok) {
        await supabase
          .from('settings')
          .update({
            zatca_certificate: data.binarySecurityToken,
            zatca_secret: data.secret,
            updated_at: new Date().toISOString()
          })
          .eq('id', 1);

        return new Response(
          JSON.stringify({
            success: true,
            binarySecurityToken: data.binarySecurityToken,
            message: 'CSID obtained successfully'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        return new Response(
          JSON.stringify({ success: false, error: data.message || 'Failed to get CSID' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }
    }

    if (!settings.zatca_certificate || !settings.zatca_secret) {
      return new Response(
        JSON.stringify({ success: false, error: 'ZATCA credentials not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const authHeader = `Basic ${btoa(`${settings.zatca_certificate}:${settings.zatca_secret}`)}`;

    if (action === 'compliance' && invoiceXml && invoiceHash && invoiceUuid) {
      const response = await fetch(`${endpoints.compliance}/compliance/invoices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Accept-Language': 'en',
          'Accept-Version': 'V2',
          'Authorization': authHeader
        },
        body: JSON.stringify({
          invoiceHash,
          uuid: invoiceUuid,
          invoice: btoa(invoiceXml)
        })
      });

      const data = await response.json();

      return new Response(
        JSON.stringify({
          success: response.ok,
          status: response.ok ? 'passed' : 'failed',
          validationResults: data.validationResults,
          reportingStatus: data.reportingStatus
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if ((action === 'report' || action === 'clear') && invoiceXml && invoiceHash && invoiceUuid && saleId) {
      const endpoint = action === 'report' ? endpoints.reporting : endpoints.clearance;
      const clearanceStatus = action === 'report' ? '0' : '1';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Accept-Language': 'en',
          'Accept-Version': 'V2',
          'Authorization': authHeader,
          'Clearance-Status': clearanceStatus
        },
        body: JSON.stringify({
          invoiceHash,
          uuid: invoiceUuid,
          invoice: btoa(invoiceXml)
        })
      });

      const data = await response.json();

      const hasErrors = data.validationResults?.errorMessages?.length > 0;
      const zatcaStatus = hasErrors ? 'rejected' : (data.clearanceStatus === 'CLEARED' ? 'cleared' : 'reported');

      const updateData: Record<string, unknown> = {
        zatca_status: zatcaStatus,
        zatca_response: {
          validationResults: data.validationResults,
          reportingStatus: data.reportingStatus,
          clearanceStatus: data.clearanceStatus
        },
        updated_at: new Date().toISOString()
      };

      if (zatcaStatus === 'cleared') {
        updateData.zatca_cleared_at = new Date().toISOString();
      }

      if (hasErrors) {
        updateData.zatca_error_message = data.validationResults.errorMessages
          .map((e: { message?: string; code?: string }) => e.message || e.code)
          .join('; ');
      }

      if (data.clearedInvoice) {
        updateData.zatca_cleared_invoice = data.clearedInvoice;
      }

      await supabase
        .from('sales')
        .update(updateData)
        .eq('id', saleId);

      return new Response(
        JSON.stringify({
          success: !hasErrors,
          status: zatcaStatus,
          validationResults: data.validationResults,
          clearedInvoice: data.clearedInvoice,
          qrCode: data.qrCode
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Invalid action or missing parameters' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
