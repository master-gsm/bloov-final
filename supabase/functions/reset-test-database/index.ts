import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ResetRequest {
  confirmationText: string;
  branchId?: string;
  mode?: 'test' | 'production';
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: userProfile } = await supabase
      .from("users")
      .select("role, full_name, branch_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!userProfile || !['admin', 'super_admin'].includes(userProfile.role)) {
      await supabase.from("audit_logs").insert({
        user_id: user.id,
        action: "reset_database_attempt_denied",
        metadata: { reason: "insufficient_permissions", role: userProfile?.role },
        ip_address: req.headers.get("x-forwarded-for") || "unknown",
      });

      return new Response(
        JSON.stringify({ success: false, error: "Only admins can reset database" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { confirmationText, branchId, mode = 'test' } = await req.json() as ResetRequest;

    if (confirmationText !== "RESET") {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid confirmation text. Must be 'RESET'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (mode === 'production') {
      return new Response(
        JSON.stringify({ success: false, error: "Reset in production mode is not allowed" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tablesToReset = [
      'employee_commissions',
      'salary_payments',
      'loyalty_transactions',
      'customer_loyalty',
      'sale_items',
      'sales',
      'cash_transactions',
      'cash_shifts',
      'cash_registers',
      'purchase_items',
      'purchases',
      'operating_expenses',
      'partner_contributions',
      'inventory_movements',
      'inventory',
      'salla_orders',
      'products',
      'categories',
      'customers',
      'suppliers',
      'partners',
    ];

    let totalDeleted = 0;
    const deletionDetails: Record<string, number> = {};

    for (const table of tablesToReset) {
      try {
        let query = supabase.from(table).delete();

        if (branchId) {
          query = query.eq('branch_id', branchId);
        } else {
          query = query.neq('id', '00000000-0000-0000-0000-000000000000');
        }

        const { data, error, count } = await query.select('id', { count: 'exact' });

        if (!error) {
          const deletedCount = count || 0;
          deletionDetails[table] = deletedCount;
          totalDeleted += deletedCount;
        }
      } catch (err) {
        console.error(`Error resetting table ${table}:`, err);
      }
    }

    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "reset_test_database",
      branch_id: branchId || null,
      records_affected: totalDeleted,
      metadata: {
        mode,
        branch_id: branchId,
        deletion_details: deletionDetails,
        confirmed_by: userProfile.full_name,
      },
      ip_address: req.headers.get("x-forwarded-for") || "unknown",
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully reset ${totalDeleted} records`,
        total_deleted: totalDeleted,
        details: deletionDetails,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Reset error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
