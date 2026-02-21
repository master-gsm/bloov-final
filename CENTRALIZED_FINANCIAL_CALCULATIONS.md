# Centralized Financial Calculations - Single Source of Truth

## Overview

All financial calculations (profit, expenses, margins) have been moved from React components into a centralized SQL function in the database. This ensures:

✅ **One Source of Truth** - All calculations happen in one place
✅ **Data Consistency** - No discrepancies between different reports
✅ **Security** - Calculations are DEFINER-protected functions
✅ **Performance** - Aggregations happen at database level
✅ **Auditability** - Single point to audit financial logic

---

## Architecture

### Old Approach (Removed)
- Dashboard.tsx: Calculated profit manually
- Reports.tsx: Calculated profit manually
- Excel export: Calculated profit manually
- Result: Multiple copies of logic, prone to errors

### New Approach (Current)
```
Database Layer (PostgreSQL)
    ↓
get_financial_summary() RPC Function
    ↓
React Components (Dashboard, Reports)
    ↓
Display Only
```

---

## The Central Function: `get_financial_summary()`

### Location
```sql
Database Function: public.get_financial_summary(
  p_date_from date,
  p_date_to date,
  p_branch_id uuid
)
```

### Parameters
- `p_date_from`: Start date for sales period (NULL = no filter)
- `p_date_to`: End date for sales period (NULL = no filter)
- `p_branch_id`: Filter by specific branch (NULL = all branches)

### Returns
```typescript
{
  total_sales: numeric              // Sum of confirmed sales
  total_tax: numeric                // Sum of sales tax
  total_cogs: numeric               // Cost of goods sold
  gross_profit: numeric             // total_sales - total_cogs
  total_operating_expenses: numeric // Sum of operating expenses
  total_setup_expenses: numeric     // Sum of setup/asset expenses
  total_employee_salaries: numeric  // Sum of employee salaries
  net_profit: numeric               // gross_profit - all_expenses
  gross_profit_margin_percent: numeric   // (gross_profit / total_sales) * 100
  net_profit_margin_percent: numeric     // (net_profit / total_sales) * 100
}
```

---

## Calculations Breakdown

### Total Sales
```sql
SUM(sales.total) WHERE status = 'confirmed'
```
- Only confirmed sales are included
- Includes both store and Salla sources

### Total COGS (Cost of Goods Sold)
```sql
SUM(sales.total_cost)
```
- Calculated from sale_items cost × quantity
- Already computed at sale creation time

### Gross Profit
```sql
total_sales - total_cogs
```

### Total Expenses
```sql
operating_expenses.amount (not deleted)
+ setup_expenses.amount (not deleted)
+ employees.basic_salary
```

### Net Profit
```sql
gross_profit - total_expenses
```

### Margins
```sql
Gross Profit Margin % = (gross_profit / total_sales) * 100
Net Profit Margin % = (net_profit / total_sales) * 100
```

---

## Component Changes

### Dashboard.tsx
**Before:**
```typescript
// Calculated manually
const totalGrossProfit = salesRes.data?.reduce((sum, s) => sum + (s.gross_profit || 0), 0) || 0;
const totalOperatingExpenses = expensesRes.data?.reduce((sum, e) => sum + (e.amount || 0), 0) || 0;
const totalEmployeeExpenses = employeesRes.data?.reduce((sum, emp) => sum + (emp.basic_salary || 0), 0) || 0;
const netProfit = totalGrossProfit - totalOperatingExpenses - totalEmployeeExpenses;
```

**After:**
```typescript
// Query database function
const financialRes = await supabase.rpc('get_financial_summary', {
  p_date_from: null,
  p_date_to: null,
  p_branch_id: null
});

// Use result directly
const netProfit = financialRes.data?.[0]?.net_profit || 0;
```

### Reports.tsx
**Before:**
- 9 separate database queries
- 15+ manual calculations
- Complex expense aggregations

**After:**
- 1 RPC call for all financial metrics
- Queries only what's needed (sales source breakdown, inventory, etc.)
- All profit calculations from database

```typescript
const financialRes = await supabase.rpc('get_financial_summary', {
  p_date_from: startDateObj.toISOString().split('T')[0],
  p_date_to: endDateObj.toISOString().split('T')[0],
  p_branch_id: null
});

// Extract from database
const financial = financialRes.data?.[0] || {};
const salesGrossProfit = financial.gross_profit || 0;
const netProfit = financial.net_profit || 0;
```

### Excel Export
**Before:**
```typescript
[isRTL ? 'صافي الربح' : 'Net Profit',
 formatCurrency(reportData.sales.grossProfit - reportData.expenses.operating)]
```

**After:**
```typescript
[isRTL ? 'صافي الربح' : 'Net Profit',
 formatCurrency(reportData.sales.grossProfit - reportData.expenses.total)]
// expenses.total now comes from database calculation
```

---

## Usage Examples

### Get All-Time Summary
```typescript
const { data } = await supabase.rpc('get_financial_summary', {
  p_date_from: null,
  p_date_to: null,
  p_branch_id: null
});
```

### Get This Month's Summary
```typescript
const today = new Date();
const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);

const { data } = await supabase.rpc('get_financial_summary', {
  p_date_from: firstDay.toISOString().split('T')[0],
  p_date_to: today.toISOString().split('T')[0],
  p_branch_id: null
});
```

### Get Branch-Specific Summary
```typescript
const { data } = await supabase.rpc('get_financial_summary', {
  p_date_from: '2026-01-01',
  p_date_to: '2026-02-21',
  p_branch_id: 'branch-uuid-here'
});
```

---

## Benefits

### 1. **Consistency**
- Same calculation logic used everywhere
- No more discrepancies between Dashboard and Reports

### 2. **Maintainability**
- Change calculation logic once in database
- All components automatically use updated logic
- No need to update multiple React files

### 3. **Performance**
- Aggregations happen at database level
- Reduces data transfer
- Better for large datasets

### 4. **Security**
- SECURITY DEFINER protects against tampering
- Controlled access via function grants
- Audit trail in database logs

### 5. **Accuracy**
- Financial calculations are critical
- Centralization reduces human error
- Easier to verify correctness

---

## Migration Impact

### Files Modified
- ✅ `src/components/Dashboard.tsx` - Now uses RPC
- ✅ `src/components/Reports.tsx` - Now uses RPC
- ✅ `src/components/Excel export` - Uses database-calculated expenses

### Files Deleted
- ❌ No files deleted, only logic removed

### Database Changes
- ✅ New function: `get_financial_summary()`
- ✅ New function: `get_financial_summary_secure()`
- No schema changes needed (uses existing tables)

---

## Testing Checklist

- [ ] Dashboard shows correct net profit
- [ ] Reports show same net profit as Dashboard
- [ ] Excel export shows same values as Reports
- [ ] Date range filtering works correctly
- [ ] Branch filtering works correctly
- [ ] Historical data matches previous calculations
- [ ] Performance is acceptable with large datasets

---

## Future Enhancements

1. **Parametric Reports**
   - Add more filters (product, customer, source)

2. **Forecasting**
   - Use historical data for projections

3. **Drill-Down Analytics**
   - Click on expense category to see details

4. **Real-Time Dashboard**
   - WebSocket updates for live metrics

5. **API Endpoint**
   - Expose financial summary via REST API

---

## Troubleshooting

### Function not found
```
Error: "get_financial_summary" does not exist
```
- Run migrations: `npm run migrate`
- Check that function exists in database

### Wrong results
- Verify filter parameters are correct
- Check that dates are in YYYY-MM-DD format
- Ensure p_branch_id is a valid UUID or NULL

### Performance issues
- Add indexes on `sales.sale_date`, `sales.branch_id`
- Filter by date range to reduce scan
- Use branch_id filter when possible
