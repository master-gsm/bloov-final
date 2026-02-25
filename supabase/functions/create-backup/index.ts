import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const TABLES_TO_BACKUP = [
  'branches',
  'users',
  'employees',
  'partners',
  'partner_contributions',
  'partner_settlements',
  'suppliers',
  'customers',
  'loyalty_transactions',
  'products',
  'inventory',
  'inventory_movements',
  'sales',
  'sale_items',
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
  'employee_commissions',
  'wastage',
  'permissions',
  'ai_insights',
  'ai_forecasts',
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
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const startTime = Date.now();

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    console.log("[create-backup] Initializing service client...");
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    console.log("[create-backup] Verifying user token...");
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      console.error("[create-backup] Auth error:", userError?.message);
      throw new Error(`Unauthorized: ${userError?.message ?? "invalid token"}`);
    }

    console.log("[create-backup] Checking admin role for user:", user.id);
    const { data: userProfile, error: profileError } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      throw new Error(`Failed to fetch user profile: ${profileError.message}`);
    }

    if (!userProfile || (userProfile.role !== "admin" && userProfile.role !== "super_admin")) {
      // Log unauthorized attempt
      await supabase.from("audit_logs").insert({
        action: "BACKUP_API_ACCESS_DENIED",
        table_name: "backup",
        user_id: user.id,
        metadata: {
          attempted_at: new Date().toISOString(),
          user_role: userProfile?.role || "unknown",
          reason: "Insufficient permissions",
          endpoint: "/functions/v1/create-backup"
        }
      });
      throw new Error("Only admins can create backups");
    }

    console.log("[create-backup] Starting data collection...");
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
        const { data, error } = await supabase.from(table).select("*");
        if (error) {
          console.warn(`[create-backup] Table ${table} error: ${error.message}`);
          errors.push(`${table}: ${error.message}`);
          continue;
        }
        if (data && data.length > 0) {
          backupData.data[table] = data;
          totalRecords += data.length;
          successfulTables++;
          console.log(`[create-backup] ${table}: ${data.length} records`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.warn(`[create-backup] Table ${table} exception: ${msg}`);
        errors.push(`${table}: ${msg}`);
      }
    }

    backupData.metadata.total_records = totalRecords;
    backupData.metadata.tables_count = successfulTables;

    console.log(`[create-backup] Collected ${totalRecords} records from ${successfulTables} tables`);

    const backupJson = JSON.stringify(backupData, null, 2);
    const backupSize = new Blob([backupJson]).size;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup_${timestamp}.json`;

    console.log(`[create-backup] Uploading ${filename} (${(backupSize / 1024 / 1024).toFixed(2)} MB) to storage...`);

    const { error: uploadError } = await supabase.storage
      .from("backups")
      .upload(filename, backupJson, {
        contentType: "application/json",
        upsert: false,
      });

    if (uploadError) {
      console.error("[create-backup] Upload error:", JSON.stringify(uploadError));
      throw new Error(
        `Upload to storage failed: ${uploadError.message}` +
        (uploadError.statusCode ? ` (HTTP ${uploadError.statusCode})` : "") +
        (uploadError.error ? ` — ${uploadError.error}` : "")
      );
    }

    console.log("[create-backup] Upload successful. Updating last_backup_date...");

    await supabase
      .from("settings")
      .update({ last_backup_date: new Date().toISOString() })
      .eq("id", 1);

    const executionTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[create-backup] Done in ${executionTime}s`);

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
        },
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[create-backup] Fatal error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
