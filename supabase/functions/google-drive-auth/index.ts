import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const clientId = Deno.env.get("GOOGLE_DRIVE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_DRIVE_CLIENT_SECRET");

    if (!clientId || !clientSecret) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Google Drive credentials not configured. Please add GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET to environment variables.",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (action === "get-auth-url") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        throw new Error("Missing authorization header");
      }

      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);

      if (userError || !user) {
        throw new Error("Unauthorized");
      }

      const { data: userProfile } = await supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!userProfile || userProfile.role !== "admin") {
        throw new Error("Only admins can connect Google Drive");
      }

      const redirectUri = `${supabaseUrl}/functions/v1/google-drive-auth?action=callback`;
      const scope = "https://www.googleapis.com/auth/drive.file";
      const state = user.id;

      const authUrl =
        `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${clientId}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent(scope)}&` +
        `access_type=offline&` +
        `prompt=consent&` +
        `state=${state}`;

      return new Response(
        JSON.stringify({
          success: true,
          auth_url: authUrl,
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    if (action === "callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      if (error) {
        return new Response(
          `<html><body><script>window.opener.postMessage({success: false, error: "${error}"}, "*"); window.close();</script></body></html>`,
          {
            headers: {
              "Content-Type": "text/html",
            },
          }
        );
      }

      if (!code || !state) {
        return new Response(
          `<html><body><script>window.opener.postMessage({success: false, error: "Missing code or state"}, "*"); window.close();</script></body></html>`,
          {
            headers: {
              "Content-Type": "text/html",
            },
          }
        );
      }

      const redirectUri = `${supabaseUrl}/functions/v1/google-drive-auth?action=callback`;

      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        return new Response(
          `<html><body><script>window.opener.postMessage({success: false, error: "Token exchange failed: ${errorText}"}, "*"); window.close();</script></body></html>`,
          {
            headers: {
              "Content-Type": "text/html",
            },
          }
        );
      }

      const tokens = await tokenResponse.json();

      const credentials = {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_type: tokens.token_type,
        expires_in: tokens.expires_in,
        created_at: new Date().toISOString(),
      };

      const { error: updateError } = await supabase
        .from("settings")
        .update({
          google_drive_credentials: credentials,
        })
        .eq("id", 1);

      if (updateError) {
        return new Response(
          `<html><body><script>window.opener.postMessage({success: false, error: "Failed to save credentials"}, "*"); window.close();</script></body></html>`,
          {
            headers: {
              "Content-Type": "text/html",
            },
          }
        );
      }

      return new Response(
        `<html><body><script>window.opener.postMessage({success: true}, "*"); window.close();</script></body></html>`,
        {
          headers: {
            "Content-Type": "text/html",
          },
        }
      );
    }

    if (action === "disconnect") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        throw new Error("Missing authorization header");
      }

      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);

      if (userError || !user) {
        throw new Error("Unauthorized");
      }

      const { data: userProfile } = await supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!userProfile || userProfile.role !== "admin") {
        throw new Error("Only admins can disconnect Google Drive");
      }

      const { error: updateError } = await supabase
        .from("settings")
        .update({
          google_drive_credentials: null,
          google_drive_enabled: false,
        })
        .eq("id", 1);

      if (updateError) {
        throw new Error("Failed to disconnect");
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Disconnected successfully",
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: "Invalid action",
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err) {
    console.error("Google Drive auth error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
