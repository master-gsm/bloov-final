import { createClient } from "npm:@supabase/supabase-js@2.57.4";

function usernameToSlug(username: string): string {
  const normalized = username.toLowerCase().trim();
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash + data[i]) | 0;
  }
  const hashStr = Math.abs(hash).toString(36);
  const safeChars = normalized.replace(/[^a-z0-9]/g, "");
  if (safeChars.length >= 3) {
    return safeChars.slice(0, 20) + "_" + hashStr;
  }
  return "user_" + hashStr + "_" + Date.now().toString(36);
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonRes(body: Record<string, unknown>, status: number) {
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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonRes({ error: "Server misconfiguration" }, 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonRes({ error: "Missing authorization header" }, 401);
    }

    const token = authHeader.replace("Bearer ", "").trim();
    if (!token || token === anonKey) {
      return jsonRes({ error: "Missing user token" }, 401);
    }

    const {
      data: { user: requestingUser },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !requestingUser) {
      return jsonRes({
        error: "Unauthorized: Invalid or expired session",
        details: authError?.message,
        hint: "token_length=" + token.length,
      }, 401);
    }

    const { data: userProfile, error: profileError } = await supabaseAdmin
      .from("users")
      .select("role, is_active, branch_id")
      .eq("id", requestingUser.id)
      .maybeSingle();

    if (
      profileError ||
      !userProfile ||
      !["admin", "super_admin"].includes(userProfile.role) ||
      !userProfile.is_active
    ) {
      return jsonRes({ error: "Forbidden: Admin access required" }, 403);
    }

    const body = await req.json();
    const { username, password, fullName, role, permissions, branch_id } = body;
    const displayName = fullName || username;

    if (!username || !password || !role) {
      return jsonRes({ error: "Missing required fields: username, password, role" }, 400);
    }

    if (!["admin", "accountant", "viewer", "observer"].includes(role)) {
      return jsonRes({ error: "Invalid role" }, 400);
    }

    const targetBranchId = branch_id || userProfile.branch_id;
    const emailSlug = usernameToSlug(username);
    const email = `${emailSlug}@bloov.local`;

    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u: { email?: string }) => u.email === email
    );

    const { data: existingByUsername } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("username", username.trim().toLowerCase())
      .maybeSingle();

    if (existingByUsername) {
      return jsonRes({ error: "اسم المستخدم موجود مسبقاً / Username already exists" }, 400);
    }

    if (existingUser) {
      const { data: existingProfile } = await supabaseAdmin
        .from("users")
        .select("id")
        .eq("id", existingUser.id)
        .maybeSingle();

      if (!existingProfile) {
        await supabaseAdmin.auth.admin.deleteUser(existingUser.id);
      } else {
        return jsonRes({ error: "A user with this username already exists" }, 400);
      }
    }

    const { data: newUser, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (createError) {
      return jsonRes({ error: createError.message }, 400);
    }

    const { error: insertError } = await supabaseAdmin.from("users").insert({
      id: newUser.user.id,
      full_name: displayName,
      username: username.trim().toLowerCase(),
      role,
      is_active: true,
      permissions: permissions || {},
      branch_id: targetBranchId,
    });

    if (insertError) {
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      return jsonRes({
        error: "Failed to create user profile",
        details: insertError.message,
      }, 500);
    }

    return jsonRes({
      success: true,
      userId: newUser.user.id,
      user: {
        id: newUser.user.id,
        email: newUser.user.email,
        fullName: displayName,
        role,
        branch_id: targetBranchId,
      },
    }, 200);
  } catch (error) {
    console.error("create-user error:", error);
    return jsonRes({
      error: error instanceof Error ? error.message : "Internal server error",
    }, 500);
  }
});
