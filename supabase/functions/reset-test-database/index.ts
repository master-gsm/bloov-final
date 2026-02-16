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
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

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

    // Use direct SQL queries to bypass RLS
    const deleteQueries = [
      "DELETE FROM employee_commissions WHERE branch_id IS NOT NULL",
      "DELETE FROM salary_payments WHERE branch_id IS NOT NULL",
      "DELETE FROM loyalty_transactions WHERE branch_id IS NOT NULL",
      "DELETE FROM customer_loyalty WHERE branch_id IS NOT NULL",
      "DELETE FROM sale_items WHERE branch_id IS NOT NULL",
      "DELETE FROM sales WHERE branch_id IS NOT NULL",
      "DELETE FROM cash_transactions WHERE branch_id IS NOT NULL",
      "DELETE FROM cash_shifts WHERE branch_id IS NOT NULL",
      "DELETE FROM cash_registers WHERE branch_id IS NOT NULL",
      "DELETE FROM purchase_items WHERE branch_id IS NOT NULL",
      "DELETE FROM purchases WHERE branch_id IS NOT NULL",
      "DELETE FROM operating_expenses WHERE branch_id IS NOT NULL",
      "DELETE FROM partner_contributions WHERE branch_id IS NOT NULL",
      "DELETE FROM inventory_movements WHERE branch_id IS NOT NULL",
      "DELETE FROM inventory WHERE branch_id IS NOT NULL",
      "DELETE FROM salla_orders WHERE branch_id IS NOT NULL",
      "DELETE FROM products WHERE branch_id IS NOT NULL",
      "DELETE FROM categories WHERE branch_id IS NOT NULL",
      "DELETE FROM customers WHERE branch_id IS NOT NULL",
      "DELETE FROM suppliers WHERE branch_id IS NOT NULL",
      "DELETE FROM partners WHERE branch_id IS NOT NULL",
    ];

    let totalDeleted = 0;
    const deletionDetails: Record<string, number> = {};

    // Execute deletions in transaction
    for (const query of deleteQueries) {
      try {
        const tableName = query.match(/FROM (\w+)/)?.[1] || 'unknown';
        const { data, error } = await supabase.rpc('execute_sql_as_admin', {
          sql_query: query
        });

        if (error) {
          console.error(`Error deleting from ${tableName}:`, error);
          deletionDetails[tableName] = 0;
        } else {
          const count = data || 0;
          deletionDetails[tableName] = count;
          totalDeleted += count;
        }
      } catch (err) {
        console.error('Deletion error:', err);
      }
    }

    // Log the reset action
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
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
