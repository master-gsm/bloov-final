import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface AIRequest {
  type: 'forecast' | 'categorization' | 'natural_query' | 'customer_insights' | 'expense_categorization';
  data?: any;
  query?: string;
}

interface AISettings {
  ai_enabled: boolean;
  ai_api_key: string;
  ai_model: string;
  ai_provider: string;
}

async function callOpenAI(apiKey: string, model: string, messages: any[], responseFormat?: any) {
  const startTime = Date.now();

  const requestBody: any = {
    model,
    messages,
    temperature: 0.7,
    max_tokens: 2000,
  };

  if (responseFormat) {
    requestBody.response_format = responseFormat;
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
  }

  const result = await response.json();
  const processingTime = Date.now() - startTime;

  return {
    content: result.choices[0].message.content,
    tokensUsed: result.usage?.total_tokens || 0,
    processingTime,
  };
}

async function generateSalesForecast(supabase: any, userId: string, data: any) {
  const { data: sales, error } = await supabase
    .from('sales')
    .select('sale_date, total, sale_items(quantity, product_id, products(name, name_ar, category))')
    .order('sale_date', { ascending: true })
    .limit(500);

  if (error) throw error;

  const salesByProduct = new Map();
  const salesByDate = new Map();

  sales.forEach((sale: any) => {
    const date = sale.sale_date.split('T')[0];
    if (!salesByDate.has(date)) {
      salesByDate.set(date, { revenue: 0, quantity: 0 });
    }
    salesByDate.get(date).revenue += parseFloat(sale.total || 0);

    if (sale.sale_items) {
      sale.sale_items.forEach((item: any) => {
        if (item.product_id) {
          if (!salesByProduct.has(item.product_id)) {
            salesByProduct.set(item.product_id, {
              name: item.products?.name || 'Unknown',
              category: item.products?.category || 'general',
              totalQuantity: 0,
              totalRevenue: 0,
            });
          }
          const product = salesByProduct.get(item.product_id);
          product.totalQuantity += item.quantity || 0;
        }
      });
    }
  });

  const historicalSummary = {
    totalSales: sales.length,
    dateRange: sales.length > 0 ? `${sales[0].sale_date} to ${sales[sales.length - 1].sale_date}` : 'N/A',
    topProducts: Array.from(salesByProduct.entries())
      .sort((a, b) => b[1].totalQuantity - a[1].totalQuantity)
      .slice(0, 10)
      .map(([id, data]) => ({ name: data.name, quantity: data.totalQuantity, category: data.category })),
    dailyAverages: {
      revenue: Array.from(salesByDate.values()).reduce((sum, day) => sum + day.revenue, 0) / salesByDate.size,
    },
  };

  const prompt = `You are a business analyst for a flower shop. Analyze this sales data and provide a forecast:

Historical Data Summary:
- Total Sales: ${historicalSummary.totalSales}
- Date Range: ${historicalSummary.dateRange}
- Daily Average Revenue: ${historicalSummary.dailyAverages.revenue.toFixed(2)} SAR
- Top Products: ${JSON.stringify(historicalSummary.topProducts, null, 2)}

Based on this data, provide:
1. Next 30-day sales forecast (daily predictions)
2. Seasonal trends identified (flowers are seasonal)
3. Inventory recommendations for top products
4. Revenue predictions with confidence scores

Respond ONLY with valid JSON in this exact format:
{
  "forecast": {
    "next30Days": {
      "totalRevenue": number,
      "averageDailyRevenue": number,
      "confidence": number (0-1)
    },
    "topProductsInventory": [
      {
        "productName": string,
        "recommendedStock": number,
        "reason": string
      }
    ],
    "seasonalInsights": string,
    "keyTrends": [string]
  }
}`;

  return prompt;
}

async function categorizеExpense(description: string, amount: number) {
  const prompt = `You are an accounting assistant for a flower shop business. Categorize this expense:

Expense Description: ${description}
Amount: ${amount} SAR

Categories available:
- Inventory Purchase (flowers, plants, supplies)
- Operating Expenses (rent, utilities, maintenance)
- Marketing & Advertising
- Staff Salaries
- Transportation & Delivery
- Packaging & Supplies
- Professional Services
- Miscellaneous

Respond ONLY with valid JSON:
{
  "category": "exact category name from list above",
  "confidence": number (0-1),
  "reasoning": "brief explanation"
}`;

  return prompt;
}

async function analyzeNaturalQuery(supabase: any, query: string) {
  const [salesData, customersData, productsData, expensesData] = await Promise.all([
    supabase.from('sales').select('sale_date, total, payment_method, gross_profit').order('sale_date', { ascending: false }).limit(100),
    supabase.from('customers').select('name, total_spend, total_orders, tier, last_purchase_date').order('total_spend', { ascending: false }).limit(50),
    supabase.from('products').select('name, name_ar, category, quantity, reorder_level, selling_price').order('quantity', { ascending: true }).limit(50),
    supabase.from('operating_expenses').select('amount, expense_type, date, description').order('date', { ascending: false }).limit(50),
  ]);

  const context = {
    recentSales: salesData.data || [],
    topCustomers: customersData.data || [],
    lowStockProducts: productsData.data || [],
    recentExpenses: expensesData.data || [],
  };

  const prompt = `You are a business intelligence assistant for a flower shop. Answer this question using the provided data:

Question: ${query}

Business Data Summary:
- Recent Sales (last 100): ${JSON.stringify(context.recentSales.slice(0, 10), null, 2)}
- Top Customers (by spend): ${JSON.stringify(context.topCustomers.slice(0, 10), null, 2)}
- Low Stock Products: ${JSON.stringify(context.lowStockProducts.slice(0, 10), null, 2)}
- Recent Expenses: ${JSON.stringify(context.recentExpenses.slice(0, 10), null, 2)}

Provide a clear, actionable answer with:
1. Direct answer to the question
2. Supporting data/numbers
3. Actionable recommendations if applicable

Respond ONLY with valid JSON:
{
  "answer": "direct answer to the question",
  "data": {
    "key metrics or numbers supporting the answer"
  },
  "recommendations": ["actionable recommendation 1", "recommendation 2"],
  "visualizationSuggestion": "chart type if applicable (bar, line, pie, table)"
}`;

  return prompt;
}

async function generateCustomerInsights(supabase: any) {
  const { data: customers, error } = await supabase
    .from('customers')
    .select('id, name, name_ar, phone, email, tier, total_spend, total_orders, last_purchase_date, loyalty_points')
    .order('total_spend', { ascending: false })
    .limit(100);

  if (error) throw error;

  const atRiskCustomers = customers.filter((c: any) => {
    if (!c.last_purchase_date) return false;
    const daysSinceLastPurchase = Math.floor(
      (new Date().getTime() - new Date(c.last_purchase_date).getTime()) / (1000 * 60 * 60 * 24)
    );
    return (c.tier === 'VIP' || c.tier === 'Frequent') && daysSinceLastPurchase > 30;
  });

  const prompt = `You are a customer retention specialist for a flower shop. Analyze these at-risk high-value customers:

At-Risk Customers (VIP/Frequent who haven't purchased in 30+ days):
${JSON.stringify(atRiskCustomers.slice(0, 20), null, 2)}

For each at-risk customer, provide:
1. Risk assessment (high/medium/low)
2. Personalized discount code suggestion (percentage)
3. Personalized message template
4. Product recommendations based on their history

Respond ONLY with valid JSON:
{
  "insights": [
    {
      "customerId": "uuid",
      "customerName": "name",
      "riskLevel": "high|medium|low",
      "daysSinceLastPurchase": number,
      "suggestedDiscount": number (percentage),
      "messageTemplate": "personalized message with {customer_name} placeholder",
      "recommendedProducts": ["product suggestions"],
      "reasoning": "why they're at risk"
    }
  ],
  "summary": {
    "totalAtRisk": number,
    "potentialRevenueLoss": number,
    "recommendedActions": ["action 1", "action 2"]
  }
}`;

  return prompt;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { type, data, query }: AIRequest = await req.json();

    const { data: settings, error: settingsError } = await supabase
      .from('settings')
      .select('ai_enabled, ai_api_key, ai_model, ai_provider')
      .single();

    if (settingsError || !settings) {
      throw new Error('Failed to load AI settings');
    }

    const aiSettings = settings as AISettings;

    if (!aiSettings.ai_enabled) {
      throw new Error('AI features are not enabled');
    }

    if (!aiSettings.ai_api_key || aiSettings.ai_api_key.trim().length === 0) {
      throw new Error('AI API key is not configured');
    }

    let prompt = '';
    let responseFormat: any = { type: 'json_object' };

    switch (type) {
      case 'forecast':
        prompt = await generateSalesForecast(supabase, user.id, data);
        break;
      case 'expense_categorization':
        prompt = await categorizeExpense(data.description, data.amount);
        break;
      case 'natural_query':
        prompt = await analyzeNaturalQuery(supabase, query || '');
        break;
      case 'customer_insights':
        prompt = await generateCustomerInsights(supabase);
        break;
      default:
        throw new Error('Invalid AI request type');
    }

    const aiResult = await callOpenAI(
      aiSettings.ai_api_key,
      aiSettings.ai_model,
      [{ role: 'user', content: prompt }],
      responseFormat
    );

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(aiResult.content);
    } catch {
      parsedResponse = { raw: aiResult.content };
    }

    await supabase.from('ai_analysis_logs').insert({
      query_type: type,
      input_data: { data, query },
      ai_response: parsedResponse,
      user_query: query,
      summary: aiResult.content.substring(0, 500),
      tokens_used: aiResult.tokensUsed,
      processing_time_ms: aiResult.processingTime,
      created_by: user.id,
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: parsedResponse,
        tokensUsed: aiResult.tokensUsed,
        processingTime: aiResult.processingTime,
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error: any) {
    console.error('AI Analysis Error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'An error occurred during AI analysis',
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
