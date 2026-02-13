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

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse webhook payload
    const payload: SallaWebhookPayload = await req.json();

    console.log("Received Salla webhook:", payload.event);

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

    const orderData = payload.data;
    const sallaOrderId = `SALLA-${orderData.id}`;

    // Check if order already exists
    const { data: existingSale } = await supabase
      .from("sales")
      .select("id")
      .eq("salla_order_id", sallaOrderId)
      .maybeSingle();

    if (existingSale) {
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
