/*
  # Create AI Analysis System

  1. New Tables
    - `ai_analysis_logs` - Track all AI queries and responses
      - `id` (uuid, primary key)
      - `query_type` (text) - Type: forecast, categorization, insight, natural_query
      - `input_data` (jsonb) - Input data sent to AI
      - `ai_response` (jsonb) - AI response
      - `user_query` (text) - Original user question (for natural queries)
      - `summary` (text) - Summary of results
      - `tokens_used` (integer) - API tokens consumed
      - `processing_time_ms` (integer) - Processing duration
      - `created_by` (uuid, FK to users)
      - `created_at` (timestamp)

    - `ai_forecasts` - Store sales forecasts
      - `id` (uuid, primary key)
      - `product_id` (uuid, FK to products) - Specific product or null for general
      - `forecast_period` (text) - daily, weekly, monthly
      - `forecast_date` (date) - Date/period being forecasted
      - `predicted_quantity` (decimal) - Predicted sales quantity
      - `predicted_revenue` (decimal) - Predicted revenue
      - `confidence_score` (decimal) - AI confidence 0-1
      - `factors` (jsonb) - Contributing factors (seasonality, trends, etc.)
      - `historical_data_points` (integer) - Number of data points analyzed
      - `created_by` (uuid, FK to users)
      - `created_at` (timestamp)

    - `ai_insights` - Store customer insights and recommendations
      - `id` (uuid, primary key)
      - `insight_type` (text) - at_risk_customer, upsell_opportunity, inventory_alert
      - `subject_id` (uuid) - Customer/Product/Category ID
      - `subject_type` (text) - customer, product, category
      - `title` (text) - Insight title
      - `description` (text) - Detailed insight
      - `recommendation` (text) - AI recommendation
      - `priority` (text) - high, medium, low
      - `status` (text) - new, reviewed, actioned, dismissed
      - `metadata` (jsonb) - Additional data (discount codes, etc.)
      - `expires_at` (timestamp) - When insight becomes stale
      - `created_by` (uuid, FK to users)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Settings Updates
    - Add AI configuration fields to settings table

  3. Security
    - Enable RLS on all new tables
    - Add policies for authenticated users

  4. Indexes
    - Add indexes for efficient querying
*/

-- Create ai_analysis_logs table
CREATE TABLE IF NOT EXISTS ai_analysis_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_type text NOT NULL CHECK (query_type IN ('forecast', 'categorization', 'insight', 'natural_query', 'expense_categorization')),
  input_data jsonb,
  ai_response jsonb,
  user_query text,
  summary text,
  tokens_used integer DEFAULT 0,
  processing_time_ms integer DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Create ai_forecasts table
CREATE TABLE IF NOT EXISTS ai_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  forecast_period text NOT NULL CHECK (forecast_period IN ('daily', 'weekly', 'monthly')),
  forecast_date date NOT NULL,
  predicted_quantity decimal(12,2) NOT NULL DEFAULT 0,
  predicted_revenue decimal(12,2) NOT NULL DEFAULT 0,
  confidence_score decimal(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  factors jsonb,
  historical_data_points integer DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Create ai_insights table
CREATE TABLE IF NOT EXISTS ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insight_type text NOT NULL CHECK (insight_type IN ('at_risk_customer', 'upsell_opportunity', 'inventory_alert', 'cost_optimization', 'revenue_opportunity')),
  subject_id uuid,
  subject_type text CHECK (subject_type IN ('customer', 'product', 'category', 'supplier', 'general')),
  title text NOT NULL,
  description text,
  recommendation text,
  priority text DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  status text DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'actioned', 'dismissed')),
  metadata jsonb,
  expires_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add AI settings to settings table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'settings' AND column_name = 'ai_enabled'
  ) THEN
    ALTER TABLE settings ADD COLUMN ai_enabled boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'settings' AND column_name = 'ai_api_key'
  ) THEN
    ALTER TABLE settings ADD COLUMN ai_api_key text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'settings' AND column_name = 'ai_model'
  ) THEN
    ALTER TABLE settings ADD COLUMN ai_model text DEFAULT 'gpt-4o-mini';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'settings' AND column_name = 'ai_provider'
  ) THEN
    ALTER TABLE settings ADD COLUMN ai_provider text DEFAULT 'openai' CHECK (ai_provider IN ('openai', 'gemini'));
  END IF;
END $$;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_ai_logs_query_type ON ai_analysis_logs(query_type);
CREATE INDEX IF NOT EXISTS idx_ai_logs_created_at ON ai_analysis_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_logs_created_by ON ai_analysis_logs(created_by);

CREATE INDEX IF NOT EXISTS idx_ai_forecasts_product ON ai_forecasts(product_id);
CREATE INDEX IF NOT EXISTS idx_ai_forecasts_date ON ai_forecasts(forecast_date DESC);
CREATE INDEX IF NOT EXISTS idx_ai_forecasts_period ON ai_forecasts(forecast_period);

CREATE INDEX IF NOT EXISTS idx_ai_insights_type ON ai_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_ai_insights_status ON ai_insights(status);
CREATE INDEX IF NOT EXISTS idx_ai_insights_priority ON ai_insights(priority);
CREATE INDEX IF NOT EXISTS idx_ai_insights_subject ON ai_insights(subject_id, subject_type);
CREATE INDEX IF NOT EXISTS idx_ai_insights_created_at ON ai_insights(created_at DESC);

-- Enable RLS
ALTER TABLE ai_analysis_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ai_analysis_logs
CREATE POLICY "Users can view their own AI logs"
  ON ai_analysis_logs FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Users can create AI logs"
  ON ai_analysis_logs FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

-- RLS Policies for ai_forecasts
CREATE POLICY "Authenticated users can view forecasts"
  ON ai_forecasts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create forecasts"
  ON ai_forecasts FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update their forecasts"
  ON ai_forecasts FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- RLS Policies for ai_insights
CREATE POLICY "Authenticated users can view insights"
  ON ai_insights FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create insights"
  ON ai_insights FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update insights"
  ON ai_insights FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete insights"
  ON ai_insights FOR DELETE
  TO authenticated
  USING (true);

-- Add helpful comments
COMMENT ON TABLE ai_analysis_logs IS 'Logs all AI API queries and responses for auditing and cost tracking';
COMMENT ON TABLE ai_forecasts IS 'Stores AI-generated sales forecasts for inventory planning';
COMMENT ON TABLE ai_insights IS 'Stores AI-generated business insights and recommendations';

COMMENT ON COLUMN ai_analysis_logs.query_type IS 'Type of AI query: forecast, categorization, insight, natural_query';
COMMENT ON COLUMN ai_analysis_logs.tokens_used IS 'Number of API tokens consumed for cost tracking';
COMMENT ON COLUMN ai_forecasts.confidence_score IS 'AI confidence level (0-1) in the forecast accuracy';
COMMENT ON COLUMN ai_insights.status IS 'Lifecycle status: new, reviewed, actioned, dismissed';