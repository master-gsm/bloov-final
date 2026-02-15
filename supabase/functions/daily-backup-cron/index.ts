import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Daily Backup Cron Job
 *
 * هذه الوظيفة تُشغّل تلقائياً كل يوم الساعة 2 صباحاً
 * لأخذ نسخة احتياطية كاملة من النظام
 *
 * يمكن تشغيلها أيضاً يدوياً عبر HTTP request
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // إنشاء Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Starting daily backup cron job...");

    // التحقق من تفعيل النسخ اليومي
    const { data: settings, error: settingsError } = await supabase
      .from("backup_settings")
      .select("*")
      .single();

    if (settingsError) {
      throw new Error(`Failed to fetch settings: ${settingsError.message}`);
    }

    if (!settings.daily_backup_enabled) {
      console.log("Daily backup is disabled. Skipping...");
      return new Response(
        JSON.stringify({
          success: true,
          message: "Daily backup is disabled",
          skipped: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!settings.google_drive_enabled || !settings.google_drive_credentials) {
      console.log("Google Drive not configured. Skipping backup...");
      return new Response(
        JSON.stringify({
          success: false,
          message: "Google Drive not configured",
          skipped: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // إنشاء سجل نسخ احتياطي
    const { data: logEntry, error: logError } = await supabase
      .from("backup_logs")
      .insert({
        backup_type: "full",
        status: "processing",
        started_at: new Date().toISOString(),
        metadata: {
          triggered_by: "cron",
          scheduled_time: settings.daily_backup_time,
        },
      })
      .select()
      .single();

    if (logError) throw logError;

    console.log(`Backup log created: ${logEntry.id}`);

    // تحديد جميع الجداول للنسخ الاحتياطي
    const tablesToBackup = [
      'products', 'categories', 'customers', 'suppliers',
      'sales', 'sale_items', 'purchases', 'purchase_items',
      'inventory', 'inventory_movements', 'partners',
      'partner_contributions', 'expenses', 'operating_expenses',
      'setup_expenses', 'cash_registers', 'cash_transactions',
      'cash_shifts', 'customer_loyalty', 'loyalty_transactions',
      'settings', 'users', 'branches', 'user_permissions',
      'wastage', 'salla_orders'
    ];

    console.log(`Backing up ${tablesToBackup.length} tables...`);

    // جمع البيانات من جميع الجداول
    const backupData: Record<string, any[]> = {};
    let totalRecords = 0;
    const errors: string[] = [];

    for (const table of tablesToBackup) {
      try {
        const { data, error } = await supabase
          .from(table)
          .select("*");

        if (error) {
          errors.push(`${table}: ${error.message}`);
          console.error(`Error backing up table ${table}:`, error);
        } else if (data) {
          backupData[table] = data;
          totalRecords += data.length;
          console.log(`✓ ${table}: ${data.length} records`);
        }
      } catch (err) {
        errors.push(`${table}: ${err.message}`);
        console.error(`Exception backing up table ${table}:`, err);
      }
    }

    console.log(`Total records collected: ${totalRecords}`);

    // إضافة metadata شاملة
    const backupPayload = {
      version: "1.0",
      timestamp: new Date().toISOString(),
      backup_type: "full",
      scheduled_backup: true,
      tables_count: Object.keys(backupData).length,
      total_records: totalRecords,
      system_info: {
        supabase_url: supabaseUrl,
        backup_date: new Date().toISOString().split('T')[0],
        backup_time: new Date().toISOString().split('T')[1],
      },
      errors: errors.length > 0 ? errors : null,
      data: backupData,
    };

    const backupJson = JSON.stringify(backupPayload, null, 2);
    const backupSize = new TextEncoder().encode(backupJson).length;

    console.log(`Backup size: ${(backupSize / 1024 / 1024).toFixed(2)} MB`);

    // رفع إلى Google Drive
    let googleDriveFileId = null;
    let googleDriveUrl = null;

    try {
      const fileName = `bloov_daily_backup_${new Date().toISOString().split('T')[0]}_${Date.now()}.json`;

      const uploadResult = await uploadToGoogleDrive(
        backupJson,
        fileName,
        settings.google_drive_folder_id,
        settings.google_drive_credentials
      );

      googleDriveFileId = uploadResult.id;
      googleDriveUrl = uploadResult.webViewLink;

      console.log(`✓ Uploaded to Google Drive: ${googleDriveFileId}`);
    } catch (uploadError) {
      console.error("Google Drive upload failed:", uploadError);
      errors.push(`Google Drive upload: ${uploadError.message}`);
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
        error_message: errors.length > 0 ? errors.join("; ") : null,
        completed_at: new Date().toISOString(),
        metadata: {
          triggered_by: "cron",
          tables: Object.keys(backupData),
          tables_count: Object.keys(backupData).length,
          errors_count: errors.length,
        },
      })
      .eq("id", logEntry.id);

    // تنظيف النسخ القديمة (الاحتفاظ بآخر retention_days)
    if (googleDriveFileId) {
      console.log("Cleaning up old backups...");
      const { data: cleanupResult } = await supabase
        .rpc("cleanup_old_backups");

      console.log(`Cleaned up ${cleanupResult || 0} old backup logs`);
    }

    const result = {
      success: googleDriveFileId ? true : false,
      backup_id: logEntry.id,
      backup_size: backupSize,
      backup_size_mb: (backupSize / 1024 / 1024).toFixed(2),
      records_count: totalRecords,
      tables_backed_up: Object.keys(backupData).length,
      google_drive_url: googleDriveUrl,
      errors: errors.length > 0 ? errors : null,
      timestamp: new Date().toISOString(),
    };

    console.log("Daily backup completed:", result);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Daily backup cron job error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

// رفع الملف إلى Google Drive
async function uploadToGoogleDrive(
  content: string,
  fileName: string,
  folderId: string,
  credentials: string
): Promise<{ id: string; webViewLink: string }> {
  const creds = JSON.parse(credentials);
  const accessToken = await getAccessToken(creds);

  const metadata = {
    name: fileName,
    parents: [folderId],
    mimeType: "application/json",
  };

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

// الحصول على access token
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
