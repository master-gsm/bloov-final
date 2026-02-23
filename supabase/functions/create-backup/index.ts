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

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (userError || !user) {
      throw new Error("Unauthorized - Please login again");
    }

    const { data: userProfile, error: profileError } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      throw new Error(`Failed to fetch user profile: ${profileError.message}`);
    }

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
        const { data, error } = await supabase.from(table).select("*");
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

    const { data: bucketData, error: bucketError } = await supabase.storage.getBucket('backups');
    if (bucketError || !bucketData) {
      throw new Error(`Storage bucket "backups" does not exist.`);
    }

    const { error: uploadError } = await supabase.storage
      .from('backups')
      .upload(filename, backupJson, {
        contentType: 'application/json',
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message} (status: ${uploadError.statusCode ?? 'unknown'})`);
    }

    await supabase
      .from('settings')
      .update({ last_backup_date: new Date().toISOString() })
      .eq('id', 1);

    const executionTime = (((Date.now() - startTime)) / 1000).toFixed(2);

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
