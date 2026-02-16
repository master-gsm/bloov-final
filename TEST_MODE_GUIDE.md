# Test Mode System Guide

## Overview
Test Mode is a development feature that prevents data from being saved to the database. It's perfect for testing features without affecting real data.

## Features

### 1. Test Mode Toggle
- Located in **Settings** → **Backup & Restore** tab
- Shows prominent orange alert when enabled
- Alert bar appears at the top of all pages

### 2. Data Protection
When Test Mode is enabled:
- No data is saved to the database
- All INSERT, UPDATE, DELETE, and UPSERT operations are blocked
- Operations appear to succeed but don't actually write to database
- Console shows warnings for blocked operations

### 3. Database Reset Function
The reset function now only deletes:
- All sales and invoices
- All purchases
- All cash register transactions
- All expenses

It will NOT delete:
- Products
- Customers
- Suppliers
- Inventory
- Partners
- Categories

## How to Use

### Enable Test Mode
1. Go to **Settings** (الإعدادات)
2. Click on **Backup & Restore** tab
3. Find **Test Mode** section (وضع التجربة)
4. Toggle the switch to ON

### Disable Test Mode
1. Go to **Settings**
2. Click on **Backup & Restore** tab
3. Find **Test Mode** section
4. Toggle the switch to OFF

### Clean Test Data
1. Make sure you're logged in as Admin
2. Go to **Settings** → **Backup & Restore**
3. Scroll to **Reset Test Database** section (تنظيف بيانات التجربة)
4. Click the red button
5. Type **RESET** in capital letters
6. Confirm

## Technical Implementation

### For Developers
If you want to add Test Mode protection to new features:

```typescript
import { guardedInsert, guardedUpdate, guardedDelete, guardedUpsert } from '../lib/supabaseGuarded';

// Instead of:
// await supabase.from('sales').insert(data);

// Use:
await guardedInsert('sales', data);

// Instead of:
// await supabase.from('sales').update(data).eq('id', id);

// Use (requires manual implementation):
if (!isTestModeActive()) {
  await supabase.from('sales').update(data).eq('id', id);
}
```

### Context Usage
```typescript
import { useTestMode } from '../contexts/TestModeContext';

function MyComponent() {
  const { isTestMode, setTestMode } = useTestMode();

  if (isTestMode) {
    console.log('Test mode is active');
  }
}
```

## Visual Indicators

When Test Mode is active:
- Orange alert bar at the top: "🧪 وضع التجربة مفعّل - لن يتم حفظ أي بيانات!"
- Pulsing animation on the alert
- Test Mode section in Settings shows active state

## Edge Function
The `reset-test-database` Edge Function:
- Requires Admin authentication
- Uses SQL to bypass RLS for deletion
- Logs all operations in audit_logs
- Returns detailed deletion statistics

## Best Practices
1. Always enable Test Mode when testing new features
2. Regularly clean test data using the reset function
3. Disable Test Mode when done testing
4. Never use Test Mode in production environment
