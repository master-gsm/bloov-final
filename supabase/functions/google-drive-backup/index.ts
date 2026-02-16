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

  let logEntryId: string | null = null;

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

    // التحقق من JWT token باستخدام service role
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error("Authentication failed:", authError);
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // التحقق من أن المستخدم admin أو super_admin
    const { data: userData } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (!userData || !["admin", "super_admin"].includes(userData.role)) {
      console.error("User not authorized:", user.id);
      return new Response(
        JSON.stringify({ success: false, error: "Insufficient permissions" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[Backup] Starting backup by user:", user.id, "role:", userData.role);

    const { backupType = 'full', tables } = await req.json() as BackupRequest;

    // إنشاء سجل نسخ احتياطي
    const { data: logEntry, error: logError } = await supabase
      .from("backup_logs")
      .insert({
        backup_type: backupType,
        status: "in_progress",
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (logError) throw logError;
    logEntryId = logEntry.id;

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

    console.log("[Backup] Checking Google Drive settings...");
    console.log("[Backup] Has credentials:", !!settings.google_drive_credentials);
    console.log("[Backup] Has folder_id:", !!settings.google_drive_folder_id);

    if (settings.google_drive_credentials && settings.google_drive_folder_id) {
      try {
        console.log("[Backup] Starting Google Drive upload...");
        const uploadResult = await uploadToGoogleDrive(
          backupJson,
          `bloov_backup_${backupType}_${Date.now()}.json`,
          settings.google_drive_folder_id,
          settings.google_drive_credentials
        );

        googleDriveFileId = uploadResult.id;
        googleDriveUrl = uploadResult.webViewLink;
        console.log("[Backup] Google Drive upload successful:", googleDriveFileId);
      } catch (uploadError) {
        console.error("[Backup] Google Drive upload failed:", uploadError);
        // لا نفشل النسخة بالكامل إذا فشل الرفع
      }
    } else {
      console.log("[Backup] Skipping Google Drive upload - not configured");
    }

    // تحديث سجل النسخ الاحتياطي بنجاح
    const fileName = `bloov_backup_${backupType}_${Date.now()}.json`;
    await supabase
      .from("backup_logs")
      .update({
        status: googleDriveFileId ? "success" : "failed",
        finished_at: new Date().toISOString(),
        file_name: fileName,
        file_id: googleDriveFileId,
        file_size: backupSize,
        record_count: totalRecords,
        error_message: googleDriveFileId ? null : "Failed to upload to Google Drive",
        http_status: googleDriveFileId ? 200 : 500,
      })
      .eq("id", logEntry.id);

    console.log("[Backup] Backup completed. Success:", !!googleDriveFileId);

    return new Response(
      JSON.stringify({
        success: !!googleDriveFileId,
        backup_id: logEntry.id,
        file_name: fileName,
        file_size: backupSize,
        record_count: totalRecords,
        google_drive_url: googleDriveUrl,
        tables_backed_up: Object.keys(backupData).length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Backup error:", error);

    // تحديث السجل بالفشل إذا حدث خطأ
    if (logEntryId) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        await supabase
          .from("backup_logs")
          .update({
            status: "failed",
            finished_at: new Date().toISOString(),
            error_message: error.message || "Unknown error",
            http_status: 500,
          })
          .eq("id", logEntryId);
      } catch (updateError) {
        console.error("Failed to update error status:", updateError);
      }
    }

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

  // رفع الملف باستخدام multipart/related
  const boundary = "bloov_boundary_" + Date.now();
  const delimiter = "\r\n--" + boundary + "\r\n";
  const closeDelimiter = "\r\n--" + boundary + "--";

  const multipartRequestBody =
    delimiter +
    "Content-Type: application/json\r\n\r\n" +
    JSON.stringify(metadata) +
    delimiter +
    "Content-Type: application/json\r\n\r\n" +
    content +
    closeDelimiter;

  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: multipartRequestBody,
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
