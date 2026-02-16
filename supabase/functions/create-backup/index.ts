import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function refreshGoogleToken(
  refreshToken: string,
  supabase: any
): Promise<{ success: boolean; access_token?: string; error?: string }> {
  try {
    const clientId = Deno.env.get("GOOGLE_DRIVE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_DRIVE_CLIENT_SECRET");

    if (!clientId || !clientSecret) {
      return { success: false, error: "Google Drive credentials not configured" };
    }

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      return { success: false, error: "Failed to refresh token" };
    }

    const tokens = await response.json();

    const newCredentials = {
      access_token: tokens.access_token,
      refresh_token: refreshToken,
      token_type: tokens.token_type,
      expires_in: tokens.expires_in,
      created_at: new Date().toISOString(),
    };

    await supabase
      .from("settings")
      .update({ google_drive_credentials: newCredentials })
      .eq("id", 1);

    return { success: true, access_token: tokens.access_token };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function uploadToGoogleDrive(
  filename: string,
  content: string,
  credentials: any,
  folderId: string,
  supabase: any
): Promise<{ success: boolean; fileId?: string; error?: string }> {
  try {
    if (!credentials || !credentials.access_token) {
      return { success: false, error: "Missing Google Drive credentials" };
    }

    let accessToken = credentials.access_token;

    const metadata = {
      name: filename,
      parents: folderId ? [folderId] : [],
      mimeType: "application/json",
    };

    const boundary = "-------314159265358979323846";
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const multipartRequestBody =
      delimiter +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      JSON.stringify(metadata) +
      delimiter +
      "Content-Type: application/json\r\n\r\n" +
      content +
      closeDelimiter;

    let response = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body: multipartRequestBody,
      }
    );

    if (response.status === 401 && credentials.refresh_token) {
      const refreshResult = await refreshGoogleToken(credentials.refresh_token, supabase);

      if (refreshResult.success && refreshResult.access_token) {
        accessToken = refreshResult.access_token;

        response = await fetch(
          "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "Content-Type": `multipart/related; boundary=${boundary}`,
            },
            body: multipartRequestBody,
          }
        );
      } else {
        return { success: false, error: "Token expired and refresh failed" };
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `Google Drive upload failed: ${errorText}` };
    }

    const result = await response.json();
    return { success: true, fileId: result.id };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

const TABLES_TO_BACKUP = [
  'branches',
  'users',
  'employees',
  'partners',
  'partner_contributions',
  'partner_distributions',
  'partner_settlements',
  'suppliers',
  'supplier_payments',
  'customers',
  'customer_payments',
  'customer_loyalty',
  'loyalty_transactions',
  'products',
  'product_recipes',
  'inventory',
  'inventory_movements',
  'branch_stock',
  'sales',
  'sale_items',
  'sale_item_materials',
  'purchases',
  'purchase_items',
  'expenses',
  'operating_expenses',
  'setup_expenses',
  'cash_registers',
  'cash_shifts',
  'cash_transactions',
  'salla_orders',
  'salla_order_items',
  'settings',
  'audit_logs',
  'activity_log',
  'employee_commissions',
  'salary_payments',
  'wastage',
  'permissions',
  'role_permissions',
  'ai_insights',
  'ai_forecasts',
  'ai_analysis_logs',
  'sms_logs',
];

interface BackupData {
  metadata: {
    created_at: string;
    version: string;
    total_records: number;
    tables_count: number;
  };
  data: Record<string, any[]>;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const startTime = Date.now();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const { data: userProfile } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!userProfile || userProfile.role !== "admin") {
      throw new Error("Only admins can create backups");
    }

    const backupData: BackupData = {
      metadata: {
        created_at: new Date().toISOString(),
        version: "1.0",
        total_records: 0,
        tables_count: 0,
      },
      data: {},
    };

    let totalRecords = 0;
    let successfulTables = 0;
    const errors: string[] = [];

    for (const table of TABLES_TO_BACKUP) {
      try {
        const { data, error } = await supabase
          .from(table)
          .select("*");

        if (error) {
          errors.push(`${table}: ${error.message}`);
          continue;
        }

        if (data && data.length > 0) {
          backupData.data[table] = data;
          totalRecords += data.length;
          successfulTables++;
        }
      } catch (err) {
        errors.push(`${table}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    backupData.metadata.total_records = totalRecords;
    backupData.metadata.tables_count = successfulTables;

    const backupJson = JSON.stringify(backupData, null, 2);
    const backupSize = new Blob([backupJson]).size;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup_${timestamp}.json`;

    const { error: uploadError } = await supabase.storage
      .from('backups')
      .upload(filename, backupJson, {
        contentType: 'application/json',
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Failed to save backup to server: ${uploadError.message}`);
    }

    const { data: settings } = await supabase
      .from('settings')
      .select('google_drive_enabled, google_drive_credentials, google_drive_folder_id')
      .single();

    let googleDriveResult = null;
    if (settings?.google_drive_enabled && settings?.google_drive_credentials) {
      googleDriveResult = await uploadToGoogleDrive(
        filename,
        backupJson,
        settings.google_drive_credentials,
        settings.google_drive_folder_id || '',
        supabase
      );
    }

    await supabase
      .from('settings')
      .update({ last_backup_date: new Date().toISOString() })
      .eq('id', settings?.id || 1);

    const endTime = Date.now();
    const executionTime = ((endTime - startTime) / 1000).toFixed(2);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Backup created successfully",
        data: {
          filename,
          size: backupSize,
          size_mb: (backupSize / (1024 * 1024)).toFixed(2),
          total_records: totalRecords,
          tables_count: successfulTables,
          execution_time: `${executionTime} seconds`,
          created_at: backupData.metadata.created_at,
          download_url: `${supabaseUrl}/storage/v1/object/public/backups/${filename}`,
          backup_data: backupData,
          google_drive_upload: googleDriveResult,
        },
        errors: errors.length > 0 ? errors : undefined,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err) {
    console.error("Backup error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : "Failed to create backup",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
