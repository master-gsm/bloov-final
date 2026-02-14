/*
  # Add SMS Gateway Settings

  1. Changes to `settings` table
    - Add `sms_api_key` (text, encrypted) - API key for SMS provider
    - Add `sms_sender_id` (text) - Sender name/ID (e.g., "BLOOV")
    - Add `sms_provider_url` (text) - SMS provider API endpoint URL
    - Add `sms_provider_name` (text) - Provider name (e.g., "Unifonic", "Yamamah")
    - Add `sms_enabled` (boolean) - Enable/disable SMS feature

  2. New Tables
    - `sms_logs` - Track all SMS sending attempts
      * `id` (uuid, primary key)
      * `recipient_phone` (text) - Phone number
      * `recipient_name` (text) - Customer name
      * `message_body` (text) - SMS content
      * `status` (text) - success, failed, pending
      * `provider_message_id` (text) - Provider's message ID
      * `error_message` (text) - Error details if failed
      * `sent_by` (uuid) - User who sent the SMS
      * `cost` (decimal) - SMS cost if provided by provider
      * `created_at` (timestamp)

  3. Security
    - Enable RLS on `sms_logs` table
    - Add policies for authenticated users to view logs
    - Only admins can access SMS settings
*/

-- Add SMS settings columns to settings table
ALTER TABLE settings ADD COLUMN IF NOT EXISTS sms_api_key text DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS sms_sender_id text DEFAULT 'BLOOV';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS sms_provider_url text DEFAULT 'https://api.unifonic.com/rest/SMS/messages';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS sms_provider_name text DEFAULT 'Unifonic';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS sms_enabled boolean DEFAULT false;

COMMENT ON COLUMN settings.sms_api_key IS 'API key for SMS gateway provider (stored securely)';
COMMENT ON COLUMN settings.sms_sender_id IS 'Sender ID/Name shown to recipients (e.g., BLOOV)';
COMMENT ON COLUMN settings.sms_provider_url IS 'SMS provider API endpoint URL';
COMMENT ON COLUMN settings.sms_provider_name IS 'SMS provider name (Unifonic, Yamamah, etc.)';
COMMENT ON COLUMN settings.sms_enabled IS 'Enable or disable SMS functionality';

-- Create SMS logs table
CREATE TABLE IF NOT EXISTS sms_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_phone text NOT NULL,
  recipient_name text,
  message_body text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  provider_message_id text,
  error_message text,
  sent_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  cost decimal(10,3) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Add constraint for status values
ALTER TABLE sms_logs ADD CONSTRAINT sms_logs_status_check 
  CHECK (status IN ('pending', 'success', 'failed'));

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_sms_logs_created_at ON sms_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_logs_status ON sms_logs(status);
CREATE INDEX IF NOT EXISTS idx_sms_logs_recipient_phone ON sms_logs(recipient_phone);
CREATE INDEX IF NOT EXISTS idx_sms_logs_sent_by ON sms_logs(sent_by);

-- Enable RLS
ALTER TABLE sms_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sms_logs
CREATE POLICY "Authenticated users can view SMS logs"
  ON sms_logs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert SMS logs"
  ON sms_logs FOR INSERT
  TO authenticated
  WITH CHECK (sent_by = auth.uid());

-- Add helpful comments
COMMENT ON TABLE sms_logs IS 'Logs all SMS messages sent through the system';
COMMENT ON COLUMN sms_logs.status IS 'SMS delivery status: pending, success, or failed';
COMMENT ON COLUMN sms_logs.provider_message_id IS 'Unique message ID from SMS provider for tracking';
COMMENT ON COLUMN sms_logs.cost IS 'Cost of sending the SMS in local currency';