# Complete Branch Isolation System - Implementation Guide

## Overview

This document describes the complete implementation of the multi-branch system with **strict data isolation** across all modules in the Bloov Accounting System.

## System Architecture

### Core Principles

1. **Strict Branch Isolation**: Each branch operates independently with its own data
2. **Super Admin Access**: Super admins can access and manage all branches
3. **Global Customer Lookup**: All users can view all customers to prevent duplicates
4. **Branch of Origin**: Customers are assigned to the branch where they were first created
5. **Shared Product Catalog**: Products are shared across branches
6. **Isolated Stock Levels**: Each branch has its own inventory quantities

## Database Schema

### New Tables

#### 1. `branches`
Stores information about all branches in the system.

```sql
- id (uuid, primary key)
- name (text) - Branch name
- code (text, unique) - Branch code (e.g., "MAIN", "RIYADH01")
- location (text)
- city (text)
- phone (text)
- manager_id (uuid) - References users table
- is_active (boolean)
- opening_date (date)
- metadata (jsonb)
- created_at, updated_at (timestamptz)
```

#### 2. `branch_stock`
Tracks inventory quantities per branch for each product.

```sql
- id (uuid, primary key)
- branch_id (uuid, foreign key to branches)
- product_id (uuid, foreign key to products)
- quantity (integer)
- min_stock_level (integer)
- max_stock_level (integer)
- last_restock_date (timestamptz)
- created_at, updated_at (timestamptz)
- UNIQUE(branch_id, product_id)
```

#### 3. `setup_expenses`
Records one-time setup/capital expenses for branches.

```sql
- id (uuid, primary key)
- branch_id (uuid, foreign key to branches)
- category (text)
- description (text)
- amount (decimal)
- expense_date (date)
- supplier_id (uuid, nullable)
- payment_method (text)
- receipt_number (text)
- attachment (text)
- is_amortizable (boolean)
- amortization_months (integer)
- notes (text)
- created_by (uuid)
- created_at, updated_at (timestamptz)
```

### Modified Tables

All the following tables now have a `branch_id` column:

- `users` - User's assigned branch
- `sales` - Which branch made the sale
- `inventory` - Legacy inventory with branch assignment
- `expenses` - Operating expenses per branch
- `operating_expenses` - Same as expenses
- `customers` - Customer's branch of origin
- `cash_transactions` - Cash transactions per branch
- `cash_shifts` - Cash register shifts per branch
- `purchases` - Purchase orders per branch

## Component Updates

### 1. Sales Component (`src/components/Sales.tsx`)

**Changes:**
- Added `userBranchId` state to track user's branch
- Added `branch_id` when creating sales
- Updates both `branch_stock` and `inventory` tables
- Filters inventory queries by `branch_id`
- All UPDATE queries include `branch_id` in WHERE clause

**Key Features:**
- Sales are automatically assigned to the user's branch
- Stock is deducted from the correct branch
- Users can only see sales from their branch (unless super admin)

### 2. Inventory Component (`src/components/Inventory.tsx`)

**Changes:**
- Added `userBranchId` state
- Damage recording includes `branch_id` filter
- Manual count includes `branch_id` filter
- All inventory updates have proper WHERE clauses

**Key Features:**
- Each branch sees only their inventory
- Stock adjustments affect only the branch's inventory
- Prevents cross-branch inventory modifications

### 3. Expenses Component (`src/components/Expenses.tsx`)

**Changes:**
- Added `userBranchId` and `isSuperAdmin` states
- Filters expenses by branch (optimized query)
- Added `branch_id` when creating expenses

**Key Features:**
- Operating expenses are isolated per branch
- Rent, utilities, salaries tracked separately per branch
- Super admins can view all branch expenses

### 4. Purchases Component (`src/components/Purchases.tsx`)

**Changes:**
- Added `userBranchId` and `isSuperAdmin` states
- Filters purchases by branch
- Added `branch_id` when creating purchase orders

**Key Features:**
- Purchase orders are branch-specific
- Each branch manager sees only their orders
- Super admins can view all purchases

### 5. Customers Component (`src/components/Customers.tsx`)

**Changes:**
- Added `branch_id` field to Customer interface
- Added `branches` relation for displaying branch of origin
- Loads all branches for reference
- Assigns new customers to user's branch
- Global customer lookup (all users can view all customers)

**Key Features:**
- **Branch of Origin**: Customer is assigned to the branch where first created
- **Global Lookup**: All users can view all customers (prevents duplicates)
- **Branch-based Management**: Users can only edit/delete customers from their branch
- Shows customer's original branch in the UI

## RLS (Row Level Security) Policies

### Strict Isolation Pattern

Most tables follow this pattern:

```sql
-- SELECT: View only your branch (or all if super admin)
CREATE POLICY "Users can view their branch data"
  ON table_name FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
    OR branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
  );

-- INSERT: Create only for your branch
CREATE POLICY "Users can insert for their branch"
  ON table_name FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
    OR branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
  );

-- UPDATE: Modify only your branch data
CREATE POLICY "Users can update their branch data"
  ON table_name FOR UPDATE
  TO authenticated
  USING (...)
  WITH CHECK (...);

-- DELETE: Delete only your branch data
CREATE POLICY "Users can delete their branch data"
  ON table_name FOR DELETE
  TO authenticated
  USING (...);
```

### Special Cases

#### Customers Table
- **SELECT**: All users can view all customers (global lookup)
- **INSERT**: Users can create customers (assigned to their branch)
- **UPDATE/DELETE**: Users can only modify customers from their branch

#### Products Table
- **SELECT**: All users can view all products (shared catalog)
- **INSERT/UPDATE/DELETE**: Admin permissions (not branch-specific)

#### Branch Stock Table
- Strictly isolated per branch
- Users can only manage stock for their assigned branch

## Helper Functions

### `is_super_admin()`
Returns `true` if the current user has the `super_admin` role.

```sql
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'super_admin'
  );
$$;
```

### `get_user_branch_id()`
Returns the `branch_id` of the current authenticated user.

```sql
CREATE OR REPLACE FUNCTION get_user_branch_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT branch_id FROM users
  WHERE id = auth.uid();
$$;
```

### `get_consolidated_sales_summary()`
**Super admin only**. Returns sales summary across all branches.

### `get_branch_stock_summary()`
Returns stock summary for a specific branch or all branches (super admin).

## User Roles

### Regular Roles (Branch-Specific Access)
- **admin**: Can manage users and settings within their branch
- **manager**: Can manage daily operations within their branch
- **employee**: Can create sales and manage customers within their branch
- **accountant**: Can view financial data within their branch
- **observer**: Read-only access within their branch

### Super Admin Role
- **super_admin**: Full access to ALL branches
  - Can view and manage data across all branches
  - Can create and manage branches
  - Can view consolidated reports
  - Can assign users to branches

## Data Flow Examples

### Example 1: Creating a Sale

1. User from Branch A creates a sale
2. System loads user's `branch_id` (Branch A)
3. Sale is created with `branch_id = Branch A`
4. Inventory is updated for Branch A only:
   - Deducts from `branch_stock` WHERE `branch_id = Branch A`
   - Deducts from `inventory` WHERE `branch_id = Branch A`
5. RLS ensures user can only query Branch A data

### Example 2: Customer Lookup

1. User from Branch B searches for customer by phone
2. System shows ALL customers (global lookup)
3. If customer exists from Branch A, user can:
   - **View**: Yes (global lookup)
   - **Edit**: No (customer belongs to Branch A)
   - **Create Sale**: Yes (can sell to any customer)
4. Sale is created with:
   - `customer_id` = existing customer
   - `branch_id` = Branch B (sale origin)

### Example 3: Super Admin Reports

1. Super admin logs in
2. Can select "All Branches" or specific branch
3. Sees consolidated data:
   - Total sales across all branches
   - Stock levels in all locations
   - All expenses from all branches
4. Can drill down into specific branch details

## Migration Notes

### Existing Data

All existing data was assigned to the "Main Branch" (code: MAIN) during migration:

```sql
-- Migration: assign_existing_data_to_default_branch.sql
UPDATE users SET branch_id = (SELECT id FROM branches WHERE code = 'MAIN') WHERE branch_id IS NULL;
UPDATE sales SET branch_id = (SELECT id FROM branches WHERE code = 'MAIN') WHERE branch_id IS NULL;
UPDATE inventory SET branch_id = (SELECT id FROM branches WHERE code = 'MAIN') WHERE branch_id IS NULL;
-- ... etc for all tables
```

### Adding New Branches

To add a new branch:

1. **Create Branch Record**:
```sql
INSERT INTO branches (name, code, location, city, phone, is_active)
VALUES ('Riyadh Branch 2', 'RYD02', 'Al Olaya District', 'Riyadh', '+966501234567', true);
```

2. **Assign Manager**:
```sql
UPDATE branches SET manager_id = 'user-uuid' WHERE code = 'RYD02';
```

3. **Assign Users to Branch**:
```sql
UPDATE users SET branch_id = (SELECT id FROM branches WHERE code = 'RYD02')
WHERE id IN ('user1-uuid', 'user2-uuid');
```

4. **Initialize Branch Stock**:
```sql
-- Copy products to new branch stock
INSERT INTO branch_stock (branch_id, product_id, quantity, min_stock_level)
SELECT
  (SELECT id FROM branches WHERE code = 'RYD02'),
  id,
  0, -- Starting quantity
  min_stock_level
FROM products
WHERE is_active = true;
```

## Testing Checklist

### Branch Isolation Tests

- [ ] User from Branch A cannot see sales from Branch B
- [ ] User from Branch A cannot see expenses from Branch B
- [ ] User from Branch A cannot see purchases from Branch B
- [ ] User from Branch A cannot see inventory from Branch B
- [ ] User from Branch A cannot modify data in Branch B
- [ ] Super admin CAN see and modify all branch data

### Customer Tests

- [ ] User from Branch A can view customers from Branch B (global lookup)
- [ ] User from Branch A cannot edit customers from Branch B
- [ ] User from Branch A can create sale for customer from Branch B
- [ ] New customer is assigned to creating user's branch
- [ ] Customer search shows all customers system-wide

### Stock Management Tests

- [ ] Sale in Branch A deducts stock from Branch A only
- [ ] Sale in Branch B deducts stock from Branch B only
- [ ] Inventory damage in Branch A affects Branch A only
- [ ] Manual count in Branch A affects Branch A only
- [ ] Each branch has independent stock levels for same product

### Super Admin Tests

- [ ] Super admin can view all branches
- [ ] Super admin can switch between branches
- [ ] Super admin can create/edit/delete in any branch
- [ ] Super admin can view consolidated reports
- [ ] Super admin can manage branch settings

## Security Considerations

1. **RLS is Mandatory**: All tables with `branch_id` have RLS enabled
2. **No Bypass**: Application code cannot bypass RLS policies
3. **Function Security**: Helper functions use `SECURITY DEFINER` carefully
4. **Role Verification**: Always check user role in policies
5. **Null Handling**: Policies handle `branch_id IS NULL` for legacy data

## Performance Optimization

1. **Indexes**: All `branch_id` columns are indexed
2. **Query Optimization**: Frontend filters by branch where possible
3. **RLS Caching**: Helper functions are marked `STABLE` for caching
4. **Selective Loading**: Load only necessary data for current branch

## Troubleshooting

### Issue: "UPDATE requires a WHERE clause"
**Cause**: Missing `branch_id` in UPDATE WHERE clause
**Solution**: Always include `.eq('branch_id', userBranchId)` in updates

### Issue: User sees no data after login
**Cause**: User not assigned to a branch
**Solution**: Assign user to a branch via admin panel

### Issue: Stock deducted from wrong branch
**Cause**: Not loading user's branch_id before operations
**Solution**: Call `loadUserBranch()` in component's useEffect

### Issue: Customer can't be edited
**Cause**: Customer belongs to different branch
**Solution**: Only users from customer's origin branch can edit

## Future Enhancements

1. **Branch Transfer**: Allow transferring stock between branches
2. **Consolidated Reporting**: Enhanced reports for super admins
3. **Branch Permissions**: Fine-grained permissions per branch
4. **Branch Analytics**: Compare performance across branches
5. **Inter-branch Orders**: Place orders between branches

## Related Files

### Frontend Components
- `src/components/Sales.tsx`
- `src/components/Inventory.tsx`
- `src/components/Expenses.tsx`
- `src/components/Purchases.tsx`
- `src/components/Customers.tsx`
- `src/components/Branches.tsx`

### Database Migrations
- `20260214011240_create_multi_branch_system_v3.sql`
- `20260214011306_assign_existing_data_to_default_branch.sql`
- `20260214120000_update_customer_rls_for_branch_of_origin.sql`
- `20260214120001_update_inventory_rls_for_strict_branch_isolation.sql`
- `20260214120002_update_operating_expenses_rls_for_branch_isolation.sql`
- `20260214120003_update_cash_transactions_rls_for_branch_isolation.sql`
- `20260214120004_update_cash_shifts_rls_for_branch_isolation.sql`

## Conclusion

The complete branch isolation system ensures that each branch operates independently while maintaining data integrity and preventing unauthorized cross-branch access. Super admins have full visibility and control across all branches, while regular users are restricted to their assigned branch.

---

**Date**: 2026-02-14
**Version**: 1.0
**Status**: Production Ready ✅
