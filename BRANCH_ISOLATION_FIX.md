# Branch Isolation Fix - Sales & Inventory

## Problem
After implementing the multi-branch system, users were encountering "UPDATE requires a WHERE clause" error when creating sales transactions with products. This error occurred because:

1. Sales were being created without `branch_id`
2. Inventory updates were missing `branch_id` in the WHERE clause
3. Inventory lookups weren't filtering by branch

## Root Cause
When the multi-branch system was added, the `branch_id` column was added to:
- `sales` table
- `inventory` table
- `branch_stock` table

However, the Sales and Inventory components were not updated to:
1. Load the current user's `branch_id`
2. Include `branch_id` when creating sales
3. Filter inventory queries by `branch_id`
4. Include `branch_id` in UPDATE WHERE clauses

## Solution

### 1. Sales Component (`src/components/Sales.tsx`)

**Changes Made:**

#### Added User Branch Loading
```typescript
const [userBranchId, setUserBranchId] = useState<string | null>(null);

const loadUserBranch = async () => {
  if (!user) return;
  try {
    const { data, error } = await supabase
      .from('users')
      .select('branch_id')
      .eq('id', user.id)
      .maybeSingle();

    if (error) throw error;
    if (data) setUserBranchId(data.branch_id);
  } catch (err) {
    console.error('Error loading user branch:', err);
  }
};
```

#### Updated Sale Creation
Added `branch_id` to the sales insert:
```typescript
const { data: sale, error: saleError } = await supabase
  .from('sales')
  .insert({
    // ... other fields
    branch_id: userBranchId,  // ← Added
    created_by: user?.id,
  })
```

#### Updated Inventory Management
Now checks both `branch_stock` and `inventory` with proper `branch_id` filtering:

```typescript
// Update branch_stock for multi-branch system
if (userBranchId) {
  const { data: branchStock } = await supabase
    .from('branch_stock')
    .select('id, quantity')
    .eq('product_id', item.product_id)
    .eq('branch_id', userBranchId)
    .maybeSingle();

  if (branchStock) {
    await supabase
      .from('branch_stock')
      .update({
        quantity: branchStock.quantity - item.quantity,
        updated_at: new Date().toISOString()
      })
      .eq('id', branchStock.id);
  }
}

// Update legacy inventory with branch_id filter
const { data: inv } = await supabase
  .from('inventory')
  .select('id, quantity')
  .eq('product_id', item.product_id)
  .eq('branch_id', userBranchId)
  .maybeSingle();

if (inv) {
  await supabase
    .from('inventory')
    .update({
      quantity: inv.quantity - item.quantity,
      last_updated: new Date().toISOString()
    })
    .eq('id', inv.id)
    .eq('product_id', item.product_id)
    .eq('branch_id', userBranchId);  // ← Added to WHERE clause
}
```

### 2. Inventory Component (`src/components/Inventory.tsx`)

**Changes Made:**

#### Added User Branch Loading
Same pattern as Sales component - loads the current user's `branch_id` on mount.

#### Updated Damage Recording
```typescript
const recordDamage = async () => {
  // ... validation
  if (inv && userBranchId) {
    await supabase
      .from('inventory')
      .update({
        quantity: Math.max(0, inv.quantity - qty),
        last_updated: new Date().toISOString()
      })
      .eq('id', inv.id)
      .eq('product_id', damageProductId)
      .eq('branch_id', userBranchId);  // ← Added to WHERE clause
  }
  // ... rest of code
};
```

#### Updated Manual Count
```typescript
const manualCount = async () => {
  // ... validation
  if (inv && userBranchId) {
    await supabase
      .from('inventory')
      .update({
        quantity: newQty,
        last_updated: new Date().toISOString()
      })
      .eq('id', inv.id)
      .eq('product_id', countProductId)
      .eq('branch_id', userBranchId);  // ← Added to WHERE clause
    // ... rest of code
  }
};
```

## Impact

### Before Fix
- ❌ Sales creation would fail with "UPDATE requires a WHERE clause"
- ❌ Cross-branch inventory updates could occur
- ❌ Data isolation was not enforced at the application level

### After Fix
- ✅ Sales creation works correctly with branch assignment
- ✅ Inventory updates are properly isolated by branch
- ✅ Users can only modify inventory in their assigned branch
- ✅ `branch_stock` system is now utilized alongside legacy `inventory` table

## Testing Recommendations

1. **Test Sales Creation:**
   - Create a sale with products
   - Verify `branch_id` is set correctly in the `sales` table
   - Confirm inventory is deducted from the correct branch

2. **Test Inventory Updates:**
   - Record damage for products
   - Perform manual counts
   - Verify all updates include `branch_id` in WHERE clauses

3. **Test Branch Isolation:**
   - Create users assigned to different branches
   - Verify they can only see and modify their branch's data
   - Confirm super admins can access all branches

## Migration Notes

All existing data was automatically assigned to the "Main Branch" (code: MAIN) during the initial multi-branch migration. Users should:

1. Verify their `branch_id` assignment in the `users` table
2. Check that all historical `sales` and `inventory` records have `branch_id` set
3. Create `branch_stock` entries for new branches

## Related Files

- `src/components/Sales.tsx` - Sales transaction management
- `src/components/Inventory.tsx` - Inventory and stock management
- `supabase/migrations/20260214011240_create_multi_branch_system_v3.sql` - Multi-branch schema
- `supabase/migrations/20260214011306_assign_existing_data_to_default_branch.sql` - Data migration

## Date
2026-02-14
