import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SallaOrderItem {
  product_id?: string;
  name: string;
  quantity: number;
  price: number;
  total: number;
}

interface SallaWebhookPayload {
  event: string;
  merchant: number;
  created_at: string;
  data: {
    id: number;
    reference_id?: string;
    customer?: {
      name?: string;
      mobile?: string;
      email?: string;
    };
    amounts?: {
      total?: number;
      subtotal?: number;
      shipping_cost?: number;
      payment_fee?: number;
      tax?: number;
    };
    items?: SallaOrderItem[];
    status?: {
      name?: string;
    };
  };
}

// Verify Salla webhook signature
async function verifySignature(
  payload: string,
  signature: string | null,
  secret: string
): Promise<boolean> {
  if (!signature) {
    return false;
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload)
  );

  const computedSignature = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return computedSignature === signature;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  let requestBody = "";

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get Salla webhook secret from settings
    const { data: settings } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "salla_webhook_secret")
      .maybeSingle();

    const webhookSecret = settings?.value || "";

    // Read and verify signature
    requestBody = await req.text();
    const signature = req.headers.get("X-Salla-Signature");

    if (webhookSecret && !await verifySignature(requestBody, signature, webhookSecret)) {
      console.error("Invalid webhook signature detected", {
        hasSignature: !!signature,
        hasSecret: !!webhookSecret,
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid signature",
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Parse webhook payload
    const payload: SallaWebhookPayload = JSON.parse(requestBody);

    console.log("Received Salla webhook:", payload.event);

    // Handle different event types
    const orderData = payload.data;
    const sallaOrderId = `SALLA-${orderData.id}`;

    // Check if order already exists (Idempotency)
    const { data: existingSale } = await supabase
      .from("sales")
      .select("id, status")
      .eq("salla_order_id", sallaOrderId)
      .maybeSingle();

    // Handle order cancellation or refund
    if (["order.cancelled", "order.refunded"].includes(payload.event)) {
      if (!existingSale) {
        return new Response(
          JSON.stringify({
            success: true,
            message: "Order not found, nothing to cancel"
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Update sale status to cancelled/returned
      await supabase
        .from("sales")
        .update({ status: "returned" })
        .eq("id", existingSale.id);

      // Reverse inventory (add back quantities)
      const { data: saleItems } = await supabase
        .from("sale_items")
        .select("product_id, quantity")
        .eq("sale_id", existingSale.id);

      if (saleItems) {
        for (const item of saleItems) {
          if (item.product_id) {
            await supabase.rpc("reverse_inventory_on_sale_cancellation", {
              p_product_id: item.product_id,
              p_quantity: item.quantity,
            });
          }
        }
      }

      console.log(`Order ${sallaOrderId} cancelled/refunded and inventory reversed`);

      return new Response(
        JSON.stringify({
          success: true,
          message: "Order cancelled/refunded successfully",
          sale_id: existingSale.id
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Only process order.created and order.updated events
    if (!["order.created", "order.updated"].includes(payload.event)) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "Event ignored"
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // If order already exists, skip processing (Idempotency)
    if (existingSale) {
      console.log(`Order ${sallaOrderId} already processed (idempotent)`);
      return new Response(
        JSON.stringify({
          success: true,
          message: "Order already processed",
          sale_id: existingSale.id
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get or create customer
    let customerId = null;
    if (orderData.customer) {
      const customerPhone = orderData.customer.mobile || "";
      const customerName = orderData.customer.name || "Salla Customer";

      // Try to find existing customer by phone
      const { data: existingCustomer } = await supabase
        .from("customers")
        .select("id")
        .eq("phone", customerPhone)
        .maybeSingle();

      if (existingCustomer) {
        customerId = existingCustomer.id;
      } else if (customerPhone) {
        // Create new customer
        const { data: newCustomer } = await supabase
          .from("customers")
          .insert({
            name: customerName,
            phone: customerPhone,
            email: orderData.customer.email || null,
            total_purchases: 0,
            loyalty_points: 0,
          })
          .select("id")
          .single();

        if (newCustomer) {
          customerId = newCustomer.id;
        }
      }
    }

    // Calculate totals
    const subtotal = orderData.amounts?.subtotal || 0;
    const shippingCost = orderData.amounts?.shipping_cost || 0;
    const paymentFee = orderData.amounts?.payment_fee || 0;
    const tax = orderData.amounts?.tax || 0;
    const totalAmount = orderData.amounts?.total || subtotal + shippingCost + tax;

    // Create sale record
    const { data: sale, error: saleError } = await supabase
      .from("sales")
      .insert({
        customer_id: customerId,
        total_amount: totalAmount,
        discount: 0,
        tax: tax,
        payment_method: "online",
        source: "salla",
        salla_order_id: sallaOrderId,
        salla_shipping_cost: shippingCost,
        salla_payment_gateway_fee: paymentFee,
        notes: `Salla Order #${orderData.id}${orderData.reference_id ? ` - Ref: ${orderData.reference_id}` : ""}`,
      })
      .select("id")
      .single();

    if (saleError) {
      console.error("Error creating sale:", saleError);
      throw saleError;
    }

    // Process sale items
    if (orderData.items && orderData.items.length > 0) {
      for (const item of orderData.items) {
        // Try to find matching product by name
        const { data: product } = await supabase
          .from("products")
          .select("id, cost_price")
          .ilike("name", `%${item.name}%`)
          .maybeSingle();

        if (product) {
          // Create sale item
          await supabase.from("sale_items").insert({
            sale_id: sale.id,
            product_id: product.id,
            quantity: item.quantity,
            unit_price: item.price,
            total_price: item.total,
          });

          // Update inventory
          await supabase.rpc("update_inventory_on_sale", {
            p_product_id: product.id,
            p_quantity: item.quantity,
          });
        } else {
          // Product not found - log for manual review
          console.warn(`Product not found for Salla item: ${item.name}`);

          // Create note about missing product
          await supabase.from("sale_items").insert({
            sale_id: sale.id,
            product_id: null,
            quantity: item.quantity,
            unit_price: item.price,
            total_price: item.total,
          });
        }
      }
    }

    // Update customer totals if customer exists
    if (customerId) {
      const { data: customerSales } = await supabase
        .from("sales")
        .select("total_amount")
        .eq("customer_id", customerId);

      if (customerSales) {
        const totalPurchases = customerSales.reduce(
          (sum, s) => sum + (s.total_amount || 0),
          0
        );
        const loyaltyPoints = Math.floor(totalPurchases / 100);

        await supabase
          .from("customers")
          .update({
            total_purchases: totalPurchases,
            loyalty_points: loyaltyPoints,
          })
          .eq("id", customerId);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Order processed successfully",
        sale_id: sale.id,
        salla_order_id: sallaOrderId,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error processing Salla webhook:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
