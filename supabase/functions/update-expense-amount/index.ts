import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", details: authError?.message }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: userData, error: userError } = await adminClient
      .from("users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (userError || !userData) {
      return new Response(
        JSON.stringify({ error: "User not found", details: userError?.message }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const allowedRoles = ["admin", "super_admin", "accountant"];
    if (!allowedRoles.includes(userData.role)) {
      return new Response(
        JSON.stringify({ error: "Insufficient permissions" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { ids, amount } = await req.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid ids" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (typeof amount !== "number" || amount < 0) {
      return new Response(
        JSON.stringify({ error: "Invalid amount" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const id of ids) {
      const { error: rpcError } = await adminClient.rpc(
        "update_setup_expense_amount",
        { p_id: id, p_amount: amount }
      );

      if (rpcError) {
        results.push({ id, success: false, error: rpcError.message });
      } else {
        const { data: verify } = await adminClient
          .from("setup_expenses")
          .select("amount")
          .eq("id", id)
          .maybeSingle();

        results.push({
          id,
          success: verify?.amount !== undefined && Number(verify.amount) === amount,
          error: verify?.amount !== undefined && Number(verify.amount) !== amount
            ? `Amount is ${verify.amount}, expected ${amount}`
            : undefined,
        });
      }
    }

    const allSuccess = results.every((r) => r.success);
    const errors = results.filter((r) => !r.success);

    if (!allSuccess) {
      return new Response(
        JSON.stringify({
          error: "Some updates failed",
          details: errors,
          results,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, updated: ids.length, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
