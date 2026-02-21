import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CreateUserRequest {
  username: string;
  password: string;
  fullName?: string;
  role: "admin" | "accountant" | "viewer" | "observer";
  permissions?: Record<string, boolean>;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    console.log("Environment check:", {
      hasUrl: !!supabaseUrl,
      hasServiceKey: !!supabaseServiceKey,
    });

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing environment variables");
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    console.log("DEBUG: Authorization Header:", authHeader);

    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return new Response(
        JSON.stringify({ error: "Invalid authorization token" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const {
      data: { user: requestingUser },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    console.log("DEBUG: User Object:", requestingUser);
    console.log("DEBUG: Auth Error:", authError?.message);

    if (authError || !requestingUser) {
      console.error("Auth error:", authError);
      return new Response(
        JSON.stringify({
          error: "Unauthorized: Invalid or expired session",
          details: authError?.message,
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: userProfile, error: profileError } = await supabaseAdmin
      .from("users")
      .select("role, is_active")
      .eq("id", requestingUser.id)
      .maybeSingle();

    if (
      profileError ||
      !userProfile ||
      userProfile.role !== "admin" ||
      !userProfile.is_active
    ) {
      return new Response(
        JSON.stringify({
          error: "Forbidden: Admin access required",
          details: profileError?.message,
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { username, password, fullName, role, permissions }: CreateUserRequest =
      await req.json();

    const displayName = fullName || username;

    if (!username || !password || !role) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: username, password, role" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const userPermissions = permissions || {};

    if (!["admin", "accountant", "viewer", "observer"].includes(role)) {
      return new Response(
        JSON.stringify({ error: "Invalid role" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const email = `${username.toLowerCase()}@bloov.local`;

    const { data: newUser, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (createError) {
      return new Response(
        JSON.stringify({ error: createError.message }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { error: insertError } = await supabaseAdmin.from("users").insert({
      id: newUser.user.id,
      full_name: displayName,
      role: role,
      is_active: true,
      permissions: userPermissions,
    });

    if (insertError) {
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);

      return new Response(
        JSON.stringify({
          error: "Failed to create user profile",
          details: insertError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const employeeCode = `EMP-${Date.now().toString(36).toUpperCase()}`;
    const { error: employeeError } = await supabaseAdmin
      .from("employees")
      .insert({
        user_id: newUser.user.id,
        employee_code: employeeCode,
        full_name: displayName,
        position: role,
        is_active: true,
      });

    if (employeeError) {
      console.error("Failed to create employee record:", employeeError.message);
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: newUser.user.id,
          email: newUser.user.email,
          fullName: displayName,
          role,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Internal server error",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
