/*
  # Add Sales Source and Salla Integration Fields

  ## Changes Made
  
  1. Add 'source' column to sales table
    - Type: text with constraint for 'store' or 'salla'
    - Default: 'store'
    - Purpose: Distinguish between local store sales and Salla online sales
  
  2. Add Salla-specific fields
    - salla_order_id: External order ID from Salla
    - salla_shipping_cost: Shipping fees for online orders
    - salla_payment_gateway_fee: Payment processing fees
    - These help track additional costs for profit calculations
  
  ## Purpose
  This migration enables:
  - Separate tracking of store vs online sales
  - Accurate profit calculations including Salla-specific costs
  - Better reporting with source-based breakdowns
*/

-- Add source column to sales table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'source'
  ) THEN
    ALTER TABLE sales ADD COLUMN source text DEFAULT 'store' NOT NULL;
  END IF;
END $$;

-- Add constraint to ensure source is either 'store' or 'salla'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'sales_source_check'
  ) THEN
    ALTER TABLE sales ADD CONSTRAINT sales_source_check 
    CHECK (source IN ('store', 'salla'));
  END IF;
END $$;

-- Add Salla-specific fields for online orders
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'salla_order_id'
  ) THEN
    ALTER TABLE sales ADD COLUMN salla_order_id text;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'salla_shipping_cost'
  ) THEN
    ALTER TABLE sales ADD COLUMN salla_shipping_cost decimal(10,2) DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'salla_payment_gateway_fee'
  ) THEN
    ALTER TABLE sales ADD COLUMN salla_payment_gateway_fee decimal(10,2) DEFAULT 0;
  END IF;
END $$;

-- Create index on source for better query performance
CREATE INDEX IF NOT EXISTS idx_sales_source ON sales(source);

-- Create index on salla_order_id for webhook lookups
CREATE INDEX IF NOT EXISTS idx_sales_salla_order_id ON sales(salla_order_id) WHERE salla_order_id IS NOT NULL;

-- Add comment explaining the fields
COMMENT ON COLUMN sales.source IS 'Sales source: store (local) or salla (online)';
COMMENT ON COLUMN sales.salla_order_id IS 'Salla platform order ID for online sales';
COMMENT ON COLUMN sales.salla_shipping_cost IS 'Shipping cost for Salla orders';
COMMENT ON COLUMN sales.salla_payment_gateway_fee IS 'Payment gateway processing fee for Salla orders';
