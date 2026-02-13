# Salla E-commerce Integration - Quick Guide

## Overview
Full integration of Salla platform with BLOOV Accounting System, enabling separate tracking of online and physical store sales.

---

## Key Features

✅ **Separate Tracking**: Store sales vs. Online sales (Salla)
✅ **Cost Management**: Tracks shipping costs and payment gateway fees
✅ **Accurate Profits**: Deducts all Salla-specific costs from partner profits
✅ **Unified Reports**: Total Revenue = Store Sales + Salla Sales
✅ **Automatic Updates**: Inventory updates automatically from Salla orders
✅ **Customer Management**: Unified customer database across channels

---

## Database Changes

### New Sales Table Fields
- `source`: `'store'` or `'salla'`
- `salla_order_id`: Salla platform order ID
- `salla_shipping_cost`: Shipping cost for online orders
- `salla_payment_gateway_fee`: Payment processing fees

---

## Webhook Endpoint

### URL
```
POST https://YOUR_SUPABASE_URL/functions/v1/salla-webhook
```

### Headers
```
Authorization: Bearer YOUR_SUPABASE_ANON_KEY
Content-Type: application/json
```

### Supported Events
- `order.created` - New order from Salla
- `order.updated` - Order update from Salla

### What it does
1. Receives order from Salla
2. Creates/updates customer
3. Creates sale record with `source = 'salla'`
4. Processes order items
5. Updates inventory automatically
6. Calculates loyalty points

---

## UI Updates

### Sales Component
- **Source Selection**: Choose between Store or Salla
- **Additional Fields** (for Salla):
  - Shipping Cost
  - Payment Gateway Fee

### Dashboard
Shows 6 cards instead of 4:
1. 🏪 Store Sales (Teal)
2. 🛒 Online Sales - Salla (Blue)
3. 💰 Total Revenue (Green)
4. Total Purchases (Red)
5. Net Profit (Purple)
6. Inventory Value (Orange)

### Reports
Separate breakdown:
- Store Sales
- Online Sales (Salla)
- Total Revenue

---

## Partner Profit Calculation

### Formula
```
Net Profit = Total Revenue
           - Total Purchases
           - Operating Expenses
           - Salla Shipping Costs
           - Salla Payment Fees
```

All Salla-specific costs are deducted before distributing profits to partners.

---

## Setup in Salla Dashboard

1. Login to Salla Dashboard
2. Go to **Developer Apps** → **Webhooks**
3. Add New Webhook:
   - URL: `https://YOUR_SUPABASE_URL/functions/v1/salla-webhook`
   - Events: `order.created`, `order.updated`
   - Status: Active
4. Save

---

## Files Modified

### Database
- `supabase/migrations/add_sales_source_and_salla_fields.sql`

### Backend
- `supabase/functions/salla-webhook/index.ts`

### Frontend
- `src/components/Sales.tsx`
- `src/components/Dashboard.tsx`
- `src/components/Reports.tsx`
- `src/components/Partners.tsx`

---

## Testing

1. Create a test order in Salla
2. Check webhook logs in Supabase Dashboard
3. Verify sale appears in Sales section with `source = 'salla'`
4. Check Dashboard shows separate totals
5. Verify inventory was updated

---

## Important Notes

- Webhook does not require JWT verification (public endpoint for Salla)
- System checks `salla_order_id` to prevent duplicates
- Products matched by name - ensure naming consistency
- Inventory updates automatically on order receipt
- New customers added automatically from Salla data

---

## Monitoring

Check logs in Supabase Dashboard:
```
Edge Functions → salla-webhook → Logs
```

---

## Support

For detailed Arabic documentation, see `SALLA_INTEGRATION_GUIDE.md`

---

Version: 1.0.0
Date: 2026-02-13
