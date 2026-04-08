import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "Server misconfiguration" }, 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json();
    const { email, newPassword, secretKey } = body;

    if (secretKey !== "bloov-super-admin-reset-2026") {
      return jsonResponse({ error: "Invalid secret key" }, 403);
    }

    if (!email || !newPassword) {
      return jsonResponse({ error: "Missing email or newPassword" }, 400);
    }

    if (newPassword.length < 4) {
      return jsonResponse({ error: "Password must be at least 4 characters" }, 400);
    }

    const username = email.includes("@") ? email.split("@")[0] : email;

    const { data: userProfile, error: profileError } = await supabaseAdmin
      .from("users")
      .select("id, role, username")
      .eq("username", username)
      .maybeSingle();

    if (profileError) {
      return jsonResponse({ error: `Profile lookup failed: ${profileError.message}` }, 500);
    }

    if (!userProfile) {
      return jsonResponse({ error: `User not found: ${email}` }, 404);
    }

    if (!["admin", "super_admin"].includes(userProfile.role)) {
      return jsonResponse({ error: "This function only resets admin/super_admin passwords" }, 403);
    }

    const userId = userProfile.id;

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { password: newPassword }
    );

    if (updateError) {
      return jsonResponse({ error: `Failed to update password: ${updateError.message}` }, 400);
    }

    return jsonResponse({
      success: true,
      message: `Password updated successfully for ${email}`,
      userId: userId
    }, 200);

  } catch (error) {
    console.error("Error in reset-admin-password:", error);
    const msg = error instanceof Error ? error.message : "Internal server error";
    return jsonResponse({ error: msg }, 500);
  }
});
