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

function errorResponse(message: string, statusCode: number, details?: string) {
  return new Response(
    JSON.stringify({
      success: false,
      error: message,
      statusCode,
      details: details || null,
    }),
    {
      status: statusCode,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
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

  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });
  } catch (fetchError: any) {
    throw new Error(`Network error connecting to OpenAI: ${fetchError.message}`);
  }

  if (!response.ok) {
    let errorMessage = response.statusText;
    let errorDetails = '';
    try {
      const errorData = await response.json();
      errorMessage = errorData.error?.message || response.statusText;
      errorDetails = errorData.error?.type || '';
    } catch {
      // Could not parse error JSON
    }
    const err = new Error(`OpenAI API error (${response.status}): ${errorMessage}`);
    (err as any).statusCode = response.status;
    (err as any).errorType = errorDetails;
    throw err;
  }

  const result = await response.json();
  const processingTime = Date.now() - startTime;

  return {
    content: result.choices[0].message.content,
    tokensUsed: result.usage?.total_tokens || 0,
    processingTime,
  };
}

async function callGemini(apiKey: string, model: string, messages: any[], _responseFormat?: any) {
  const startTime = Date.now();

  const geminiModel = model || 'gemini-2.0-flash';

  const contents = messages.map((msg: any) => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));

  const requestBody = {
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2000,
      responseMimeType: 'application/json',
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
  } catch (fetchError: any) {
    throw new Error(`Network error connecting to Gemini: ${fetchError.message}`);
  }

  if (!response.ok) {
    let errorMessage = response.statusText;
    let errorDetails = '';
    try {
      const errorData = await response.json();
      errorMessage = errorData.error?.message || response.statusText;
      errorDetails = errorData.error?.status || '';
    } catch {
      // Could not parse error JSON
    }

    let statusCode = response.status;
    if (statusCode === 400 && errorDetails === 'INVALID_ARGUMENT') {
      statusCode = 401;
      errorDetails = 'invalid_api_key';
    }

    const err = new Error(`Gemini API error (${response.status}): ${errorMessage}`);
    (err as any).statusCode = statusCode;
    (err as any).errorType = errorDetails;
    throw err;
  }

  const result = await response.json();
  const processingTime = Date.now() - startTime;

  const candidate = result.candidates?.[0];
  if (!candidate?.content?.parts?.[0]?.text) {
    throw new Error('Gemini returned an empty response');
  }

  const totalTokens = (result.usageMetadata?.promptTokenCount || 0) +
    (result.usageMetadata?.candidatesTokenCount || 0);

  return {
    content: candidate.content.parts[0].text,
    tokensUsed: totalTokens,
    processingTime,
  };
}

function callAI(provider: string, apiKey: string, model: string, messages: any[], responseFormat?: any) {
  if (provider === 'gemini') {
    return callGemini(apiKey, model, messages, responseFormat);
  }
  return callOpenAI(apiKey, model, messages, responseFormat);
}

async function generateSalesForecast(supabase: any, userId: string, data: any) {
  const { data: sales, error } = await supabase
    .from('sales')
    .select('sale_date, total, sale_items(quantity, product_id, products(name, name_ar, category))')
    .eq('status', 'confirmed')
    .order('sale_date', { ascending: true })
    .limit(500);

  if (error) throw new Error(`Database error fetching sales: ${error.message}`);

  const salesByProduct = new Map();
  const salesByDate = new Map();

  sales.forEach((sale: any) => {
    const date = sale.sale_date?.split('T')[0];
    if (!date) return;
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

  const avgRevenue = salesByDate.size > 0
    ? Array.from(salesByDate.values()).reduce((sum: number, day: any) => sum + day.revenue, 0) / salesByDate.size
    : 0;

  const historicalSummary = {
    totalSales: sales.length,
    dateRange: sales.length > 0 ? `${sales[0].sale_date} to ${sales[sales.length - 1].sale_date}` : 'N/A',
    topProducts: Array.from(salesByProduct.entries())
      .sort((a: any, b: any) => b[1].totalQuantity - a[1].totalQuantity)
      .slice(0, 10)
      .map(([_id, data]: any) => ({ name: data.name, quantity: data.totalQuantity, category: data.category })),
    dailyAverages: { revenue: avgRevenue },
  };

  return `You are a business analyst for a flower shop. Analyze this sales data and provide a forecast:

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
}

function buildExpenseCategorizePrompt(description: string, amount: number) {
  return `You are an accounting assistant for a flower shop business. Categorize this expense:

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
}

async function analyzeNaturalQuery(supabase: any, query: string) {
  const [salesData, customersData, productsData, expensesData] = await Promise.all([
    supabase.from('sales').select('sale_date, total, payment_method, gross_profit').eq('status', 'confirmed').order('sale_date', { ascending: false }).limit(100),
    supabase.from('customers').select('name, total_spend, total_orders, tier, last_purchase_date').order('total_spend', { ascending: false }).limit(50),
    supabase.from('products').select('name, name_ar, category, selling_price').limit(50),
    supabase.from('operating_expenses').select('amount, expense_type, expense_date, description').eq('is_deleted', false).order('expense_date', { ascending: false }).limit(50),
  ]);

  const context = {
    recentSales: salesData.data || [],
    topCustomers: customersData.data || [],
    products: productsData.data || [],
    recentExpenses: expensesData.data || [],
  };

  return `You are a business intelligence assistant for a flower shop. Answer this question using the provided data:

Question: ${query}

Business Data Summary:
- Recent Sales (last 100): ${JSON.stringify(context.recentSales.slice(0, 10), null, 2)}
- Top Customers (by spend): ${JSON.stringify(context.topCustomers.slice(0, 10), null, 2)}
- Products: ${JSON.stringify(context.products.slice(0, 10), null, 2)}
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
}

async function generateCustomerInsights(supabase: any) {
  const { data: customers, error } = await supabase
    .from('customers')
    .select('id, name, name_ar, phone, email, tier, total_spend, total_orders, last_purchase_date, loyalty_points')
    .order('total_spend', { ascending: false })
    .limit(100);

  if (error) throw new Error(`Database error fetching customers: ${error.message}`);

  const atRiskCustomers = (customers || []).filter((c: any) => {
    if (!c.last_purchase_date) return false;
    const daysSinceLastPurchase = Math.floor(
      (new Date().getTime() - new Date(c.last_purchase_date).getTime()) / (1000 * 60 * 60 * 24)
    );
    return (c.tier === 'VIP' || c.tier === 'Frequent') && daysSinceLastPurchase > 30;
  });

  return `You are a customer retention specialist for a flower shop. Analyze these at-risk high-value customers:

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
      "messageTemplate": "personalized message",
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
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse('Missing authorization header', 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return errorResponse('Unauthorized - invalid session', 401, authError?.message);
    }

    let body: AIRequest;
    try {
      body = await req.json();
    } catch {
      return errorResponse('Invalid request body', 400);
    }

    const { type, data, query } = body;

    if (!type) {
      return errorResponse('Missing "type" in request body', 400);
    }

    const { data: settings, error: settingsError } = await supabase
      .from('settings')
      .select('ai_enabled, ai_api_key, ai_model, ai_provider')
      .maybeSingle();

    if (settingsError) {
      console.error('Settings query error:', settingsError);
      return errorResponse('Failed to load AI settings from database', 500, settingsError.message);
    }

    if (!settings) {
      return errorResponse('No settings record found. Please configure AI in Settings.', 404);
    }

    const aiSettings = settings as AISettings;

    if (!aiSettings.ai_enabled) {
      return errorResponse('AI features are not enabled. Enable them in Settings.', 403);
    }

    if (!aiSettings.ai_api_key || aiSettings.ai_api_key.trim().length === 0) {
      return errorResponse('AI API key is not configured. Add it in Settings.', 403);
    }

    const apiKey = aiSettings.ai_api_key.trim();
    const provider = aiSettings.ai_provider || 'openai';
    const defaultModel = provider === 'gemini' ? 'gemini-2.0-flash' : 'gpt-4o-mini';
    const model = aiSettings.ai_model || defaultModel;

    console.log(`[AI] Request type=${type}, model=${model}, provider=${provider}, key_length=${apiKey.length}`);

    let prompt = '';
    const responseFormat: any = { type: 'json_object' };

    switch (type) {
      case 'forecast':
        prompt = await generateSalesForecast(supabase, user.id, data);
        break;
      case 'expense_categorization':
        if (!data?.description || !data?.amount) {
          return errorResponse('Missing expense description or amount', 400);
        }
        prompt = buildExpenseCategorizePrompt(data.description, data.amount);
        break;
      case 'natural_query':
        if (!query?.trim()) {
          return errorResponse('Missing query text', 400);
        }
        prompt = await analyzeNaturalQuery(supabase, query);
        break;
      case 'customer_insights':
        prompt = await generateCustomerInsights(supabase);
        break;
      default:
        return errorResponse(`Invalid AI request type: "${type}"`, 400);
    }

    console.log(`[AI] Calling ${provider} model=${model}, prompt_length=${prompt.length}`);

    const aiResult = await callAI(provider, apiKey, model, [{ role: 'user', content: prompt }], responseFormat);

    console.log(`[AI] ${provider} response: tokens=${aiResult.tokensUsed}, time=${aiResult.processingTime}ms`);

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(aiResult.content);
    } catch {
      console.warn('[AI] Failed to parse AI response as JSON, returning raw');
      parsedResponse = { raw: aiResult.content };
    }

    try {
      await supabase.from('ai_analysis_logs').insert({
        query_type: type,
        input_data: { data, query },
        ai_response: parsedResponse,
        user_query: query || null,
        summary: aiResult.content.substring(0, 500),
        tokens_used: aiResult.tokensUsed,
        processing_time_ms: aiResult.processingTime,
        created_by: user.id,
      });
    } catch (logError) {
      console.warn('[AI] Failed to log AI result:', logError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: parsedResponse,
        tokensUsed: aiResult.tokensUsed,
        processingTime: aiResult.processingTime,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    const statusCode = (error as any).statusCode || 500;
    const errorType = (error as any).errorType || '';

    console.error(`[AI] Error (${statusCode}): ${error.message}`);
    if (error.stack) console.error(`[AI] Stack: ${error.stack}`);

    let userMessage = error.message || 'An error occurred during AI analysis';

    if (statusCode === 401 && errorType === 'invalid_api_key') {
      userMessage = 'Invalid API key. Please check your key in Settings.';
    } else if (statusCode === 429) {
      userMessage = 'Rate limit exceeded. Please wait a moment and try again.';
    } else if (statusCode === 402) {
      userMessage = 'Billing issue. Please check your account billing settings.';
    } else if (statusCode === 404) {
      userMessage = 'The selected AI model is not available. Try changing the model in Settings.';
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: userMessage,
        statusCode,
        errorType,
      }),
      {
        status: statusCode > 500 ? 500 : statusCode,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
