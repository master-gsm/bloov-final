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

    const { confirmationText, branchId } = await req.json() as ResetRequest;

    if (confirmationText !== "RESET") {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid confirmation text. Must be 'RESET'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Only delete: Sales, Purchases, Cash Register, and Expenses
    let totalDeleted = 0;
    const deletionDetails: Record<string, number> = {};

    // Delete sale_items first (foreign key dependency)
    const { error: saleItemsError } = await supabase
      .from('sale_items')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (!saleItemsError) {
      deletionDetails['sale_items'] = 0;
    }

    // Delete sales
    const { error: salesError } = await supabase
      .from('sales')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (!salesError) {
      deletionDetails['sales'] = 0;
    }

    // Delete purchase_items first (foreign key dependency)
    const { error: purchaseItemsError } = await supabase
      .from('purchase_items')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (!purchaseItemsError) {
      deletionDetails['purchase_items'] = 0;
    }

    // Delete purchases
    const { error: purchasesError } = await supabase
      .from('purchases')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (!purchasesError) {
      deletionDetails['purchases'] = 0;
    }

    // Delete cash transactions
    const { error: cashTransError } = await supabase
      .from('cash_transactions')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (!cashTransError) {
      deletionDetails['cash_transactions'] = 0;
    }

    // Delete cash shifts
    const { error: cashShiftsError } = await supabase
      .from('cash_shifts')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (!cashShiftsError) {
      deletionDetails['cash_shifts'] = 0;
    }

    // Delete operating expenses
    const { error: expensesError } = await supabase
      .from('operating_expenses')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (!expensesError) {
      deletionDetails['operating_expenses'] = 0;
    }

    totalDeleted = Object.values(deletionDetails).reduce((a, b) => a + b, 0);

    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "reset_test_database",
      branch_id: branchId || null,
      records_affected: totalDeleted,
      metadata: {
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
