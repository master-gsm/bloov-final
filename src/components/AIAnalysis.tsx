import { useEffect, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabase';
import {
  Brain,
  TrendingUp,
  Search,
  Users,
  AlertTriangle,
  Sparkles,
  Calendar,
  DollarSign,
  ShoppingCart,
  Target,
  Zap,
  FileText,
  Send,
  Loader2,
  CheckCircle,
  XCircle,
  MessageSquare,
  BarChart3,
  Settings as SettingsIcon
} from 'lucide-react';

interface Forecast {
  next30Days: {
    totalRevenue: number;
    averageDailyRevenue: number;
    confidence: number;
  };
  topProductsInventory: Array<{
    productName: string;
    recommendedStock: number;
    reason: string;
  }>;
  seasonalInsights: string;
  keyTrends: string[];
}

interface CustomerInsight {
  customerId: string;
  customerName: string;
  riskLevel: 'high' | 'medium' | 'low';
  daysSinceLastPurchase: number;
  suggestedDiscount: number;
  messageTemplate: string;
  recommendedProducts: string[];
  reasoning: string;
}

interface InsightsResponse {
  insights: CustomerInsight[];
  summary: {
    totalAtRisk: number;
    potentialRevenueLoss: number;
    recommendedActions: string[];
  };
}

interface ExpenseCategory {
  category: string;
  confidence: number;
  reasoning: string;
}

interface NaturalQueryResponse {
  answer: string;
  data: any;
  recommendations: string[];
  visualizationSuggestion: string;
}

export function AIAnalysis() {
  const { t, language } = useLanguage();
  const isRTL = language === 'ar';
  const [activeTab, setActiveTab] = useState<'forecast' | 'query' | 'insights' | 'expense'>('query');
  const [loading, setLoading] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [checkingSettings, setCheckingSettings] = useState(true);

  const [forecastData, setForecastData] = useState<Forecast | null>(null);
  const [customerInsights, setCustomerInsights] = useState<InsightsResponse | null>(null);
  const [naturalQuery, setNaturalQuery] = useState('');
  const [queryResponse, setQueryResponse] = useState<NaturalQueryResponse | null>(null);
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState<ExpenseCategory | null>(null);

  const [error, setError] = useState('');
  const [tokensUsed, setTokensUsed] = useState(0);

  useEffect(() => {
    checkAISettings();
  }, []);

  const checkAISettings = async () => {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('ai_enabled, ai_api_key')
        .single();

      if (error) throw error;

      setAiEnabled(!!data?.ai_enabled && (data?.ai_api_key?.length ?? 0) > 0);
    } catch (err) {
      console.error('Error checking AI settings:', err);
      setAiEnabled(false);
    } finally {
      setCheckingSettings(false);
    }
  };

  const callAIService = async (type: string, payload: any) => {
    setLoading(true);
    setError('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-analysis`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'AI analysis failed');
      }

      setTokensUsed((prev) => prev + (result.tokensUsed || 0));
      return result.data;
    } catch (err: any) {
      setError(err.message || 'Failed to process AI request');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const generateForecast = async () => {
    try {
      const data = await callAIService('forecast', { type: 'forecast' });
      setForecastData(data.forecast);
    } catch (err) {
      console.error('Forecast error:', err);
    }
  };

  const analyzeQuery = async () => {
    if (!naturalQuery.trim()) {
      setError(isRTL ? 'الرجاء إدخال سؤال' : 'Please enter a question');
      return;
    }

    try {
      const data = await callAIService('natural_query', {
        type: 'natural_query',
        query: naturalQuery
      });
      setQueryResponse(data);
    } catch (err) {
      console.error('Query error:', err);
    }
  };

  const generateInsights = async () => {
    try {
      const data = await callAIService('customer_insights', {
        type: 'customer_insights'
      });
      setCustomerInsights(data);
    } catch (err) {
      console.error('Insights error:', err);
    }
  };

  const categorizeExpense = async () => {
    if (!expenseDescription.trim() || !expenseAmount) {
      setError(isRTL ? 'الرجاء إدخال الوصف والمبلغ' : 'Please enter description and amount');
      return;
    }

    try {
      const data = await callAIService('expense_categorization', {
        type: 'expense_categorization',
        data: {
          description: expenseDescription,
          amount: parseFloat(expenseAmount)
        }
      });
      setExpenseCategory(data);
    } catch (err) {
      console.error('Categorization error:', err);
    }
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'high': return 'bg-red-100 text-red-800 border-red-300';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'low': return 'bg-green-100 text-green-800 border-green-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  if (checkingSettings) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Loader2 className="w-16 h-16 text-teal-600 animate-spin mx-auto" />
          <p className="mt-4 text-gray-600">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (!aiEnabled) {
    return (
      <div className="p-6">
        <div className="max-w-2xl mx-auto">
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-300 rounded-2xl p-8 text-center">
            <div className="w-20 h-20 bg-amber-200 rounded-full flex items-center justify-center mx-auto mb-4">
              <Brain className="w-10 h-10 text-amber-700" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">
              {isRTL ? 'التحليل الذكي غير مفعّل' : 'AI Analysis Not Enabled'}
            </h2>
            <p className="text-gray-700 mb-6">
              {isRTL
                ? 'لاستخدام ميزات الذكاء الاصطناعي، يجب تفعيل الخدمة وإضافة مفتاح API في الإعدادات.'
                : 'To use AI features, please enable the service and add your API key in Settings.'}
            </p>
            <div className="bg-white rounded-lg p-4 text-right mb-6">
              <h3 className="font-semibold text-gray-900 mb-2">
                {isRTL ? 'خطوات التفعيل:' : 'Setup Steps:'}
              </h3>
              <ol className="text-sm text-gray-700 space-y-2" style={{ textAlign: isRTL ? 'right' : 'left' }}>
                <li>1. {isRTL ? 'اذهب إلى صفحة الإعدادات' : 'Go to Settings page'}</li>
                <li>2. {isRTL ? 'أضف مفتاح OpenAI API الخاص بك' : 'Add your OpenAI API key'}</li>
                <li>3. {isRTL ? 'فعّل خيار "تفعيل الذكاء الاصطناعي"' : 'Enable "AI Analysis" option'}</li>
                <li>4. {isRTL ? 'احفظ الإعدادات' : 'Save settings'}</li>
              </ol>
            </div>
            <a
              href="https://platform.openai.com/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-amber-600 text-white px-6 py-3 rounded-lg hover:bg-amber-700 transition font-medium"
            >
              {isRTL ? 'احصل على مفتاح OpenAI API' : 'Get OpenAI API Key'}
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
              <Brain className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">
              {isRTL ? 'التحليل الذكي بالذكاء الاصطناعي' : 'AI-Powered Analysis'}
            </h2>
          </div>
          <p className="text-gray-500">
            {isRTL
              ? 'توقعات ذكية، تصنيف تلقائي، وتحليلات متقدمة'
              : 'Smart forecasting, auto-categorization, and advanced insights'}
          </p>
        </div>
        {tokensUsed > 0 && (
          <div className="text-right">
            <p className="text-sm text-gray-500">{isRTL ? 'الرموز المستخدمة' : 'Tokens Used'}</p>
            <p className="text-2xl font-bold text-purple-600">{tokensUsed.toLocaleString()}</p>
          </div>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        <button
          onClick={() => setActiveTab('query')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium whitespace-nowrap transition ${
            activeTab === 'query'
              ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg'
              : 'bg-white text-gray-700 border border-gray-200 hover:border-purple-300'
          }`}
        >
          <Search className="w-4 h-4" />
          {isRTL ? 'استعلام ذكي' : 'Smart Query'}
        </button>
        <button
          onClick={() => setActiveTab('forecast')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium whitespace-nowrap transition ${
            activeTab === 'forecast'
              ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg'
              : 'bg-white text-gray-700 border border-gray-200 hover:border-purple-300'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          {isRTL ? 'توقعات المبيعات' : 'Sales Forecast'}
        </button>
        <button
          onClick={() => setActiveTab('insights')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium whitespace-nowrap transition ${
            activeTab === 'insights'
              ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg'
              : 'bg-white text-gray-700 border border-gray-200 hover:border-purple-300'
          }`}
        >
          <Users className="w-4 h-4" />
          {isRTL ? 'رؤى العملاء' : 'Customer Insights'}
        </button>
        <button
          onClick={() => setActiveTab('expense')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium whitespace-nowrap transition ${
            activeTab === 'expense'
              ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg'
              : 'bg-white text-gray-700 border border-gray-200 hover:border-purple-300'
          }`}
        >
          <FileText className="w-4 h-4" />
          {isRTL ? 'تصنيف المصروفات' : 'Expense Categorization'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-300 rounded-lg p-4 flex items-start gap-3">
          <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-900">{isRTL ? 'خطأ' : 'Error'}</p>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {activeTab === 'query' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">
                {isRTL ? 'اسأل عن بياناتك المالية' : 'Ask About Your Financial Data'}
              </h3>
              <p className="text-sm text-gray-500">
                {isRTL ? 'اطرح أي سؤال عن مبيعاتك، عملائك، أو مصروفاتك' : 'Ask any question about your sales, customers, or expenses'}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <textarea
                value={naturalQuery}
                onChange={(e) => setNaturalQuery(e.target.value)}
                placeholder={isRTL
                  ? 'مثال: ما هو الفرع الأكثر ربحية هذا الشهر؟'
                  : 'e.g., Which branch has the highest ROI this month?'}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                rows={3}
                dir={isRTL ? 'rtl' : 'ltr'}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setNaturalQuery(isRTL ? 'ما هي أكثر 5 منتجات مبيعاً؟' : 'What are my top 5 selling products?')}
                className="px-3 py-1.5 text-sm bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition"
              >
                {isRTL ? 'أكثر المنتجات مبيعاً' : 'Top Products'}
              </button>
              <button
                onClick={() => setNaturalQuery(isRTL ? 'كم إجمالي الأرباح هذا الشهر؟' : 'What is my total profit this month?')}
                className="px-3 py-1.5 text-sm bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition"
              >
                {isRTL ? 'الأرباح الشهرية' : 'Monthly Profit'}
              </button>
              <button
                onClick={() => setNaturalQuery(isRTL ? 'من هم العملاء الأكثر إنفاقاً؟' : 'Who are my highest spending customers?')}
                className="px-3 py-1.5 text-sm bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition"
              >
                {isRTL ? 'كبار العملاء' : 'Top Customers'}
              </button>
            </div>

            <button
              onClick={analyzeQuery}
              disabled={loading || !naturalQuery.trim()}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white px-6 py-3 rounded-lg hover:from-purple-700 hover:to-pink-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {isRTL ? 'جاري التحليل...' : 'Analyzing...'}
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  {isRTL ? 'احصل على الإجابة' : 'Get Answer'}
                </>
              )}
            </button>
          </div>

          {queryResponse && (
            <div className="mt-6 space-y-4">
              <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-5 border border-purple-200">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-6 h-6 text-purple-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-bold text-gray-900 mb-2">{isRTL ? 'الإجابة:' : 'Answer:'}</h4>
                    <p className="text-gray-700 leading-relaxed">{queryResponse.answer}</p>
                  </div>
                </div>
              </div>

              {queryResponse.data && Object.keys(queryResponse.data).length > 0 && (
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" />
                    {isRTL ? 'البيانات الداعمة:' : 'Supporting Data:'}
                  </h4>
                  <pre className="text-sm text-gray-700 bg-gray-50 p-3 rounded overflow-x-auto">
                    {JSON.stringify(queryResponse.data, null, 2)}
                  </pre>
                </div>
              )}

              {queryResponse.recommendations && queryResponse.recommendations.length > 0 && (
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <h4 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    {isRTL ? 'التوصيات:' : 'Recommendations:'}
                  </h4>
                  <ul className="space-y-2">
                    {queryResponse.recommendations.map((rec, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-blue-800">
                        <Zap className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'forecast' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-teal-500 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">
                {isRTL ? 'توقعات المبيعات والمخزون' : 'Sales & Inventory Forecast'}
              </h3>
              <p className="text-sm text-gray-500">
                {isRTL ? 'تحليل البيانات التاريخية للتنبؤ بالاحتياجات المستقبلية' : 'Analyze historical data to predict future needs'}
              </p>
            </div>
          </div>

          <button
            onClick={generateForecast}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-green-600 to-teal-600 text-white px-6 py-3 rounded-lg hover:from-green-700 hover:to-teal-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed mb-6"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {isRTL ? 'جاري التحليل...' : 'Analyzing...'}
              </>
            ) : (
              <>
                <Calendar className="w-5 h-5" />
                {isRTL ? 'توليد التوقعات' : 'Generate Forecast'}
              </>
            )}
          </button>

          {forecastData && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-4 border border-green-200">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="w-5 h-5 text-green-600" />
                    <h4 className="font-semibold text-gray-900">{isRTL ? 'الإيرادات المتوقعة' : 'Predicted Revenue'}</h4>
                  </div>
                  <p className="text-2xl font-bold text-green-700">
                    {forecastData.next30Days.totalRevenue.toLocaleString()} {isRTL ? 'ر.س' : 'SAR'}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">{isRTL ? 'خلال 30 يوم' : 'Next 30 days'}</p>
                </div>

                <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg p-4 border border-blue-200">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="w-5 h-5 text-blue-600" />
                    <h4 className="font-semibold text-gray-900">{isRTL ? 'متوسط يومي' : 'Daily Average'}</h4>
                  </div>
                  <p className="text-2xl font-bold text-blue-700">
                    {forecastData.next30Days.averageDailyRevenue.toLocaleString()} {isRTL ? 'ر.س' : 'SAR'}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">{isRTL ? 'مبيعات يومية متوقعة' : 'Expected daily sales'}</p>
                </div>

                <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg p-4 border border-purple-200">
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="w-5 h-5 text-purple-600" />
                    <h4 className="font-semibold text-gray-900">{isRTL ? 'مستوى الثقة' : 'Confidence'}</h4>
                  </div>
                  <p className="text-2xl font-bold text-purple-700">
                    {(forecastData.next30Days.confidence * 100).toFixed(0)}%
                  </p>
                  <p className="text-sm text-gray-600 mt-1">{isRTL ? 'دقة التوقعات' : 'Forecast accuracy'}</p>
                </div>
              </div>

              <div className="bg-amber-50 rounded-lg p-5 border border-amber-200">
                <h4 className="font-semibold text-amber-900 mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  {isRTL ? 'التوجهات الموسمية:' : 'Seasonal Insights:'}
                </h4>
                <p className="text-gray-700 leading-relaxed">{forecastData.seasonalInsights}</p>
              </div>

              {forecastData.keyTrends && forecastData.keyTrends.length > 0 && (
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    {isRTL ? 'الاتجاهات الرئيسية:' : 'Key Trends:'}
                  </h4>
                  <ul className="space-y-2">
                    {forecastData.keyTrends.map((trend, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                        <Sparkles className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                        <span>{trend}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {forecastData.topProductsInventory && forecastData.topProductsInventory.length > 0 && (
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4" />
                    {isRTL ? 'توصيات المخزون:' : 'Inventory Recommendations:'}
                  </h4>
                  <div className="space-y-3">
                    {forecastData.topProductsInventory.map((item, idx) => (
                      <div key={idx} className="bg-gray-50 rounded-lg p-3">
                        <div className="flex items-start justify-between mb-2">
                          <h5 className="font-semibold text-gray-900">{item.productName}</h5>
                          <span className="px-2 py-1 bg-teal-100 text-teal-800 text-xs font-bold rounded">
                            {item.recommendedStock} {isRTL ? 'وحدة' : 'units'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">{item.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'insights' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-pink-500 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">
                {isRTL ? 'رؤى العملاء المعرضين للخطر' : 'At-Risk Customer Insights'}
              </h3>
              <p className="text-sm text-gray-500">
                {isRTL ? 'تحديد العملاء VIP الذين لم يشتروا مؤخراً واقتراح خصومات' : 'Identify VIP customers who haven\'t purchased recently and suggest discounts'}
              </p>
            </div>
          </div>

          <button
            onClick={generateInsights}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-red-600 to-pink-600 text-white px-6 py-3 rounded-lg hover:from-red-700 hover:to-pink-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed mb-6"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {isRTL ? 'جاري التحليل...' : 'Analyzing...'}
              </>
            ) : (
              <>
                <Users className="w-5 h-5" />
                {isRTL ? 'تحليل العملاء' : 'Analyze Customers'}
              </>
            )}
          </button>

          {customerInsights && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                  <h4 className="text-sm text-red-700 font-medium mb-1">{isRTL ? 'عملاء معرضون للخطر' : 'At-Risk Customers'}</h4>
                  <p className="text-3xl font-bold text-red-700">{customerInsights.summary.totalAtRisk}</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
                  <h4 className="text-sm text-amber-700 font-medium mb-1">{isRTL ? 'خسارة محتملة' : 'Potential Loss'}</h4>
                  <p className="text-3xl font-bold text-amber-700">
                    {customerInsights.summary.potentialRevenueLoss.toLocaleString()} {isRTL ? 'ر.س' : 'SAR'}
                  </p>
                </div>
                <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                  <h4 className="text-sm text-green-700 font-medium mb-1">{isRTL ? 'إجراءات مقترحة' : 'Actions Suggested'}</h4>
                  <p className="text-3xl font-bold text-green-700">{customerInsights.summary.recommendedActions.length}</p>
                </div>
              </div>

              {customerInsights.summary.recommendedActions && customerInsights.summary.recommendedActions.length > 0 && (
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200 mb-4">
                  <h4 className="font-semibold text-blue-900 mb-2">{isRTL ? 'الإجراءات الموصى بها:' : 'Recommended Actions:'}</h4>
                  <ul className="space-y-1">
                    {customerInsights.summary.recommendedActions.map((action, idx) => (
                      <li key={idx} className="text-sm text-blue-800 flex items-start gap-2">
                        <span className="text-blue-600">•</span>
                        <span>{action}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="space-y-3">
                {customerInsights.insights.map((insight, idx) => (
                  <div key={idx} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className="font-bold text-gray-900 mb-1">{insight.customerName}</h4>
                        <p className="text-sm text-gray-600">
                          {isRTL ? 'لم يشتري منذ' : 'Last purchase'}: {insight.daysSinceLastPurchase} {isRTL ? 'يوم' : 'days ago'}
                        </p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getRiskColor(insight.riskLevel)}`}>
                        {insight.riskLevel.toUpperCase()}
                      </span>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-3 mb-3">
                      <p className="text-sm text-gray-700 italic">{insight.reasoning}</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                      <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                        <h5 className="text-xs font-semibold text-green-900 mb-1">
                          {isRTL ? 'الخصم المقترح' : 'Suggested Discount'}
                        </h5>
                        <p className="text-xl font-bold text-green-700">{insight.suggestedDiscount}% OFF</p>
                      </div>
                      <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
                        <h5 className="text-xs font-semibold text-purple-900 mb-1">
                          {isRTL ? 'منتجات موصى بها' : 'Recommended Products'}
                        </h5>
                        <p className="text-sm text-purple-700">{insight.recommendedProducts.join(', ')}</p>
                      </div>
                    </div>

                    <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                      <h5 className="text-xs font-semibold text-blue-900 mb-2 flex items-center gap-1">
                        <Send className="w-3 h-3" />
                        {isRTL ? 'قالب الرسالة المقترح:' : 'Suggested Message Template:'}
                      </h5>
                      <p className="text-sm text-blue-800 italic">{insight.messageTemplate}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'expense' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-500 rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">
                {isRTL ? 'تصنيف المصروفات التلقائي' : 'Automatic Expense Categorization'}
              </h3>
              <p className="text-sm text-gray-500">
                {isRTL ? 'استخدام الذكاء الاصطناعي لتصنيف الفواتير تلقائياً' : 'Use AI to automatically categorize invoices'}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {isRTL ? 'وصف المصروف' : 'Expense Description'}
              </label>
              <input
                type="text"
                value={expenseDescription}
                onChange={(e) => setExpenseDescription(e.target.value)}
                placeholder={isRTL ? 'مثال: شراء زهور من المورد' : 'e.g., Purchased flowers from supplier'}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                dir={isRTL ? 'rtl' : 'ltr'}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {isRTL ? 'المبلغ (ريال)' : 'Amount (SAR)'}
              </label>
              <input
                type="number"
                value={expenseAmount}
                onChange={(e) => setExpenseAmount(e.target.value)}
                placeholder="1000"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>

            <button
              onClick={categorizeExpense}
              disabled={loading || !expenseDescription.trim() || !expenseAmount}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-orange-600 to-red-600 text-white px-6 py-3 rounded-lg hover:from-orange-700 hover:to-red-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {isRTL ? 'جاري التصنيف...' : 'Categorizing...'}
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  {isRTL ? 'تصنيف تلقائي' : 'Auto-Categorize'}
                </>
              )}
            </button>
          </div>

          {expenseCategory && (
            <div className="mt-6 space-y-3">
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-5 border border-green-200">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-bold text-gray-900 mb-2">{isRTL ? 'الفئة المقترحة:' : 'Suggested Category:'}</h4>
                    <p className="text-xl font-bold text-green-700 mb-3">{expenseCategory.category}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">{isRTL ? 'مستوى الثقة:' : 'Confidence:'}</span>
                      <div className="flex-1 bg-white rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-green-500 h-full transition-all"
                          style={{ width: `${expenseCategory.confidence * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-bold text-green-700">
                        {(expenseCategory.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  {isRTL ? 'التفسير:' : 'Reasoning:'}
                </h4>
                <p className="text-sm text-blue-800">{expenseCategory.reasoning}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
