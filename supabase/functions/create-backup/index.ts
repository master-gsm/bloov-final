import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CredentialSource {
  clientId: string;
  clientSecret: string;
  source: "env" | "db";
}

async function resolveGoogleClientCredentials(
  supabase: any
): Promise<CredentialSource | null> {
  const envClientId = Deno.env.get("GOOGLE_DRIVE_CLIENT_ID");
  const envClientSecret = Deno.env.get("GOOGLE_DRIVE_CLIENT_SECRET");

  if (envClientId && envClientSecret) {
    console.log("[create-backup] Using ENV credentials for Google Drive token refresh");
    return { clientId: envClientId, clientSecret: envClientSecret, source: "env" };
  }

  console.log("[create-backup] ENV not found, falling back to DB credentials for token refresh");

  const { data, error } = await supabase
    .from("settings")
    .select("google_drive_client_id, google_drive_client_secret")
    .eq("id", 1)
    .single();

  if (error || !data) {
    console.error("[create-backup] Failed to load DB credentials:", error?.message);
    return null;
  }

  if (data.google_drive_client_id && data.google_drive_client_secret) {
    console.log("[create-backup] Fallback to DB credentials successful");
    return {
      clientId: data.google_drive_client_id,
      clientSecret: data.google_drive_client_secret,
      source: "db",
    };
  }

  console.error("[create-backup] No Google Drive client credentials found in ENV or DB");
  return null;
}

async function refreshGoogleToken(
  refreshToken: string,
  supabase: any
): Promise<{ success: boolean; access_token?: string; error?: string }> {
  try {
    const creds = await resolveGoogleClientCredentials(supabase);

    if (!creds) {
      return { success: false, error: "Google Drive client credentials not configured in ENV or DB" };
    }

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
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

    console.log(`[create-backup] Token refreshed successfully (credential source: ${creds.source})`);

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

    console.log("[create-backup] Step 1: Checking authorization");
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    console.log("[create-backup] Step 2: Creating user-scoped client");
    const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    console.log("[create-backup] Step 3: Getting authenticated user");
    const { data: { user }, error: userError } = await userSupabase.auth.getUser();

    if (userError || !user) {
      console.error("[create-backup] User error:", userError);
      throw new Error("Unauthorized - Please login again");
    }

    console.log("[create-backup] Step 4: Fetching user profile for user:", user.id);
    const { data: userProfile, error: profileError } = await userSupabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("[create-backup] Error fetching user profile:", profileError);
      throw new Error(`Failed to fetch user profile: ${profileError.message}`);
    }

    console.log("[create-backup] Step 5: User profile:", userProfile);
    if (!userProfile || userProfile.role !== "admin") {
      throw new Error("Only admins can create backups");
    }

    console.log("[create-backup] Step 6: Creating service client for data access");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

    const bucketName = 'backups';
    console.log("[create-backup] Step 7: Uploading backup to storage bucket");
    console.log("Uploading to bucket:", bucketName);

    const { data: bucketData, error: bucketError } = await supabase.storage.getBucket(bucketName);
    if (bucketError || !bucketData) {
      console.error("[create-backup] Bucket not found:", bucketError?.message);
      throw new Error(`Storage bucket "${bucketName}" does not exist. Please create it first.`);
    }

    const uploadResult = await supabase.storage
      .from(bucketName)
      .upload(filename, backupJson, {
        contentType: 'application/json',
        upsert: false,
      });

    console.log("Upload result:", uploadResult);

    if (uploadResult.error) {
      console.error("[create-backup] Upload error:", uploadResult.error);
      throw new Error(`Failed to save backup to server: ${uploadResult.error.message}`);
    }

    const uploadData = uploadResult.data;
    console.log("[create-backup] Step 8: Backup uploaded successfully:", uploadData);

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
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("[create-backup] Error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : "Failed to create backup",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
