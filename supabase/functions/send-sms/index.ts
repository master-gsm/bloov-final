import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface SMSRequest {
  recipients: Array<{
    phone: string;
    name: string;
    customerId?: string;
  }>;
  message: string;
}

interface SMSSettings {
  sms_api_key: string;
  sms_sender_id: string;
  sms_provider_url: string;
  sms_provider_name: string;
  sms_enabled: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { recipients, message }: SMSRequest = await req.json();

    if (!recipients || recipients.length === 0) {
      throw new Error('No recipients provided');
    }

    if (!message || message.trim().length === 0) {
      throw new Error('Message cannot be empty');
    }

    const { data: settings, error: settingsError } = await supabase
      .from('settings')
      .select('sms_api_key, sms_sender_id, sms_provider_url, sms_provider_name, sms_enabled')
      .single();

    if (settingsError || !settings) {
      throw new Error('Failed to load SMS settings');
    }

    const smsSettings = settings as SMSSettings;

    if (!smsSettings.sms_enabled) {
      throw new Error('SMS feature is not enabled');
    }

    if (!smsSettings.sms_api_key || smsSettings.sms_api_key.trim().length === 0) {
      throw new Error('SMS API key is not configured');
    }

    const results = {
      success: 0,
      failed: 0,
      total: recipients.length,
      errors: [] as string[],
    };

    for (const recipient of recipients) {
      try {
        let smsResult;

        if (smsSettings.sms_provider_name.toLowerCase() === 'unifonic') {
          smsResult = await sendViaUnifonic(
            recipient.phone,
            message,
            smsSettings.sms_api_key,
            smsSettings.sms_sender_id,
            smsSettings.sms_provider_url
          );
        } else if (smsSettings.sms_provider_name.toLowerCase() === 'yamamah') {
          smsResult = await sendViaYamamah(
            recipient.phone,
            message,
            smsSettings.sms_api_key,
            smsSettings.sms_sender_id,
            smsSettings.sms_provider_url
          );
        } else {
          smsResult = await sendViaGeneric(
            recipient.phone,
            message,
            smsSettings.sms_api_key,
            smsSettings.sms_sender_id,
            smsSettings.sms_provider_url
          );
        }

        await supabase.from('sms_logs').insert({
          recipient_phone: recipient.phone,
          recipient_name: recipient.name,
          message_body: message,
          status: smsResult.success ? 'success' : 'failed',
          provider_message_id: smsResult.messageId,
          error_message: smsResult.error,
          sent_by: user.id,
          cost: smsResult.cost || 0,
        });

        if (smsResult.success) {
          results.success++;
        } else {
          results.failed++;
          results.errors.push(`${recipient.name} (${recipient.phone}): ${smsResult.error}`);
        }

        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        results.failed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.errors.push(`${recipient.name} (${recipient.phone}): ${errorMessage}`);

        await supabase.from('sms_logs').insert({
          recipient_phone: recipient.phone,
          recipient_name: recipient.name,
          message_body: message,
          status: 'failed',
          error_message: errorMessage,
          sent_by: user.id,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        results,
        message: `Sent ${results.success} of ${results.total} messages successfully`,
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );

  } catch (error) {
    console.error('SMS Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send SMS',
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});

async function sendViaUnifonic(
  phone: string,
  message: string,
  apiKey: string,
  senderId: string,
  apiUrl: string
): Promise<{ success: boolean; messageId?: string; error?: string; cost?: number }> {
  try {
    const cleanPhone = phone.replace(/[^0-9+]/g, '');

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        AppSid: apiKey,
        SenderID: senderId,
        Recipient: cleanPhone,
        Body: message,
      }),
    });

    const result = await response.json();

    if (result.success === 'true' || result.success === true) {
      return {
        success: true,
        messageId: result.data?.MessageID || result.MessageID,
        cost: result.data?.Cost || result.Cost || 0,
      };
    } else {
      return {
        success: false,
        error: result.message || result.errorCode || 'Unifonic API error',
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

async function sendViaYamamah(
  phone: string,
  message: string,
  apiKey: string,
  senderId: string,
  apiUrl: string
): Promise<{ success: boolean; messageId?: string; error?: string; cost?: number }> {
  try {
    const cleanPhone = phone.replace(/[^0-9+]/g, '');

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        sender: senderId,
        recipient: cleanPhone,
        message: message,
      }),
    });

    const result = await response.json();

    if (result.status === 'success' || result.code === 200) {
      return {
        success: true,
        messageId: result.messageId || result.id,
        cost: result.cost || 0,
      };
    } else {
      return {
        success: false,
        error: result.message || result.error || 'Yamamah API error',
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

async function sendViaGeneric(
  phone: string,
  message: string,
  apiKey: string,
  senderId: string,
  apiUrl: string
): Promise<{ success: boolean; messageId?: string; error?: string; cost?: number }> {
  try {
    const cleanPhone = phone.replace(/[^0-9+]/g, '');

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        sender: senderId,
        to: cleanPhone,
        message: message,
      }),
    });

    if (response.ok) {
      const result = await response.json();
      return {
        success: true,
        messageId: result.id || result.messageId || 'unknown',
        cost: result.cost || 0,
      };
    } else {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}