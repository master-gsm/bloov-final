import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing authorization header" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user: requestingUser },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !requestingUser) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const { data: adminProfile, error: profileError } = await supabaseAdmin
      .from("users")
      .select("role, is_active")
      .eq("id", requestingUser.id)
      .maybeSingle();

    if (profileError) {
      return jsonResponse(
        { error: `Profile lookup failed: ${profileError.message}` },
        500
      );
    }

    if (
      !adminProfile ||
      adminProfile.role !== "admin" ||
      !adminProfile.is_active
    ) {
      return jsonResponse({ error: "Forbidden: Admin access required" }, 403);
    }

    const body = await req.json();
    const { action, userId } = body;

    if (!action || !userId) {
      return jsonResponse(
        { error: "Missing required fields: action, userId" },
        400
      );
    }

    if (action === "update_password") {
      const { newPassword } = body;
      if (!newPassword || newPassword.length < 6) {
        return jsonResponse(
          { error: "Password must be at least 6 characters" },
          400
        );
      }

      const { error: updateError } =
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          password: newPassword,
        });

      if (updateError) {
        return jsonResponse({ error: updateError.message }, 400);
      }

      return jsonResponse(
        { success: true, message: "Password updated" },
        200
      );
    }

    if (action === "update_user") {
      const { newName, newRole, branch_id, sectionPermissions } = body;
      const updates: Record<string, unknown> = {};
      if (newName) updates.full_name = newName;
      if (
        newRole &&
        ["admin", "accountant", "viewer", "observer"].includes(newRole)
      )
        updates.role = newRole;
      if (branch_id !== undefined) updates.branch_id = branch_id || null;
      updates.updated_at = new Date().toISOString();

      const { error: updateError } = await supabaseAdmin
        .from("users")
        .update(updates)
        .eq("id", userId);

      if (updateError) {
        return jsonResponse({ error: updateError.message }, 400);
      }

      if (sectionPermissions && typeof sectionPermissions === "object") {
        for (const [section, perms] of Object.entries(sectionPermissions)) {
          const p = perms as {
            view: boolean;
            create: boolean;
            edit: boolean;
            delete: boolean;
          };
          const { error: permError } = await supabaseAdmin
            .from("user_permissions")
            .upsert(
              {
                user_id: userId,
                section,
                can_view: p.view ?? false,
                can_create: p.create ?? false,
                can_edit: p.edit ?? false,
                can_delete: p.delete ?? false,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "user_id,section" }
            );

          if (permError) {
            return jsonResponse(
              { error: `Permission update failed: ${permError.message}` },
              400
            );
          }
        }
      }

      return jsonResponse({ success: true, message: "User updated" }, 200);
    }

    if (action === "delete_user") {
      if (userId === requestingUser.id) {
        return jsonResponse(
          { error: "Cannot delete your own account" },
          400
        );
      }

      const { error: rpcError } = await supabaseAdmin.rpc("safe_delete_user", {
        p_user_id: userId,
      });

      if (rpcError) {
        console.error("safe_delete_user RPC error:", JSON.stringify(rpcError));
        return jsonResponse(
          {
            error: `Delete profile failed: ${rpcError.message}`,
            code: rpcError.code,
            details: rpcError.details,
          },
          400
        );
      }

      const { error: authDelError } =
        await supabaseAdmin.auth.admin.deleteUser(userId);

      if (authDelError) {
        console.error("Auth delete error:", JSON.stringify(authDelError));
        return jsonResponse(
          { error: `Delete auth failed: ${authDelError.message}` },
          400
        );
      }

      return jsonResponse({ success: true, message: "User deleted" }, 200);
    }

    return jsonResponse({ error: "Invalid action" }, 400);
  } catch (error) {
    console.error("Unhandled error in manage-user:", error);
    const msg =
      error instanceof Error ? error.message : "Internal server error";
    return jsonResponse({ error: msg }, 500);
  }
});
