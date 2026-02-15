import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface BackupRequest {
  backupType: 'full' | 'incremental' | 'images';
  tables?: string[];
}

interface GoogleDriveSettings {
  enabled: boolean;
  folder_id: string;
  access_token: string;
  refresh_token: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // إنشاء Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // التحقق من الـ authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const { backupType = 'full', tables } = await req.json() as BackupRequest;

    // إنشاء سجل نسخ احتياطي
    const { data: logEntry, error: logError } = await supabase
      .from("backup_logs")
      .insert({
        backup_type: backupType,
        status: "processing",
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (logError) throw logError;

    // جلب إعدادات Google Drive
    const { data: settings, error: settingsError } = await supabase
      .from("backup_settings")
      .select("*")
      .single();

    if (settingsError || !settings?.google_drive_enabled) {
      await supabase
        .from("backup_logs")
        .update({
          status: "failed",
          error_message: "Google Drive not configured",
          completed_at: new Date().toISOString(),
        })
        .eq("id", logEntry.id);

      return new Response(
        JSON.stringify({
          success: false,
          error: "Google Drive not enabled or configured"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // تحديد الجداول للنسخ الاحتياطي
    const tablesToBackup = tables || [
      'products', 'categories', 'customers', 'suppliers',
      'sales', 'sale_items', 'purchases', 'purchase_items',
      'inventory', 'inventory_movements', 'partners',
      'partner_contributions', 'expenses', 'operating_expenses',
      'cash_registers', 'cash_transactions', 'cash_shifts',
      'customer_loyalty', 'loyalty_transactions', 'settings',
      'users', 'branches'
    ];

    // جمع البيانات من جميع الجداول
    const backupData: Record<string, any[]> = {};
    let totalRecords = 0;

    for (const table of tablesToBackup) {
      try {
        const { data, error } = await supabase
          .from(table)
          .select("*");

        if (!error && data) {
          backupData[table] = data;
          totalRecords += data.length;
        }
      } catch (err) {
        console.error(`Error backing up table ${table}:`, err);
        // استمر في النسخ حتى لو فشل جدول واحد
      }
    }

    // إضافة metadata
    const backupPayload = {
      version: "1.0",
      timestamp: new Date().toISOString(),
      backup_type: backupType,
      tables_count: Object.keys(backupData).length,
      total_records: totalRecords,
      data: backupData,
    };

    const backupJson = JSON.stringify(backupPayload, null, 2);
    const backupSize = new TextEncoder().encode(backupJson).length;

    // رفع إلى Google Drive
    let googleDriveFileId = null;
    let googleDriveUrl = null;

    if (settings.google_drive_credentials && settings.google_drive_folder_id) {
      try {
        const uploadResult = await uploadToGoogleDrive(
          backupJson,
          `bloov_backup_${backupType}_${Date.now()}.json`,
          settings.google_drive_folder_id,
          settings.google_drive_credentials
        );

        googleDriveFileId = uploadResult.id;
        googleDriveUrl = uploadResult.webViewLink;
      } catch (uploadError) {
        console.error("Google Drive upload failed:", uploadError);
        // لا نفشل النسخة بالكامل إذا فشل الرفع
      }
    }

    // تحديث سجل النسخ الاحتياطي
    await supabase
      .from("backup_logs")
      .update({
        status: googleDriveFileId ? "success" : "failed",
        backup_size: backupSize,
        records_count: totalRecords,
        google_drive_file_id: googleDriveFileId,
        google_drive_url: googleDriveUrl,
        error_message: googleDriveFileId ? null : "Failed to upload to Google Drive",
        completed_at: new Date().toISOString(),
        metadata: {
          tables: Object.keys(backupData),
          tables_count: Object.keys(backupData).length,
        },
      })
      .eq("id", logEntry.id);

    return new Response(
      JSON.stringify({
        success: true,
        backup_id: logEntry.id,
        backup_size: backupSize,
        records_count: totalRecords,
        google_drive_url: googleDriveUrl,
        tables_backed_up: Object.keys(backupData).length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Backup error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

// وظيفة رفع الملف إلى Google Drive
async function uploadToGoogleDrive(
  content: string,
  fileName: string,
  folderId: string,
  credentials: string
): Promise<{ id: string; webViewLink: string }> {
  // فك تشفير الـ credentials
  const creds = JSON.parse(credentials);

  // الحصول على access token
  const accessToken = await getAccessToken(creds);

  // إنشاء metadata للملف
  const metadata = {
    name: fileName,
    parents: [folderId],
    mimeType: "application/json",
  };

  // رفع الملف
  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" })
  );
  form.append(
    "file",
    new Blob([content], { type: "application/json" })
  );

  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: form,
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google Drive upload failed: ${error}`);
  }

  return await response.json();
}

// الحصول على access token من Google
async function getAccessToken(credentials: any): Promise<string> {
  if (credentials.access_token) {
    return credentials.access_token;
  }

  if (credentials.refresh_token) {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: credentials.client_id,
        client_secret: credentials.client_secret,
        refresh_token: credentials.refresh_token,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to refresh Google Drive access token");
    }

    const data = await response.json();
    return data.access_token;
  }

  throw new Error("No valid Google Drive credentials");
}
