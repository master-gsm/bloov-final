# Admin & Accountant Sales Management Features

## Update Date: 2026-02-14

## Overview
Added comprehensive sales management permissions for Admins and Accountants, including delete, edit, and return capabilities.

---

## Permissions by Role

### 👨‍💼 Admin (Admin / Super Admin)
Admins can perform all operations:

✅ **View** all invoices
✅ **Delete** invoices
✅ **Cancel** invoices
✅ **Return** invoices
✅ **Restore** cancelled or returned invoices
✅ **Print** invoices
✅ **Download PDF** invoices
✅ **Share via WhatsApp**

---

### 🧮 Accountant
Accountants can perform the following operations:

✅ **View** all invoices
✅ **Delete** invoices (from their branch only)
✅ **Cancel** invoices
✅ **Return** invoices
✅ **Print** invoices
✅ **Download PDF** invoices
✅ **Share via WhatsApp**

❌ **Cannot**: Restore cancelled invoices (Admin only)

---

### 👀 Other Users
Other users (Salesperson, Viewer):

✅ **View** invoices only
✅ **Print** invoices
✅ **Download PDF** invoices
✅ **Share via WhatsApp**

❌ **Cannot**: Delete, Cancel, Return, or Restore invoices

---

## New Features

### 1️⃣ Delete Invoice 🗑️
**Permission**: Admin and Accountant only

**How to use**:
1. Open invoice details
2. Click the **"Delete"** button at the bottom
3. Confirmation will appear: "Are you sure you want to delete this sale?"
4. Click **OK** to confirm

⚠️ **Warning**: Deletion is permanent and cannot be undone!

**What happens on delete?**
- Invoice is completely removed from the system
- All invoice items are deleted
- Cannot be recovered after deletion

---

### 2️⃣ Return Invoice 🔄
**Permission**: Admin and Accountant only

**How to use**:
1. Open invoice details (must be confirmed)
2. Click the **"Return"** button
3. Confirmation will appear: "Do you want to mark this sale as returned?"
4. Click **OK** to confirm

**Difference between Return and Cancel**:
- **Return**: Customer returned goods, amount refunded
- **Cancel**: Invoice cancelled before execution or due to error

**Invoice Status**: Changes to **"Returned"** with orange color 🟠

---

### 3️⃣ Cancel Invoice ❌
**Permission**: Admin and Accountant only

**How to use**:
1. Open invoice details (must be confirmed)
2. Click the **"Cancel"** button
3. Invoice will be cancelled immediately

**Invoice Status**: Changes to **"Cancelled"** with red color 🔴

---

### 4️⃣ Restore Invoice ♻️
**Permission**: Admin only (not Accountant)

**How to use**:
1. Open details of a cancelled or returned invoice
2. Click the **"Restore"** button
3. Invoice will be converted back to **"Confirmed"** status

**Restore use cases**:
- Correct cancellation mistake
- Reactivate accidentally cancelled invoice
- Convert returned invoice back to active

---

## Status Filters

You can now filter invoices by status:

📊 **Available Filters**:
- **All**: Show all invoices
- **Confirmed** 🟢: Active invoices
- **Returned** 🟠: Returned invoices
- **Cancelled** 🔴: Cancelled invoices

---

## Available Buttons in Invoice Details

### 🔵 First Row (For Everyone):
- **Print** 🖨️ - Print the invoice
- **PDF** 📄 - Download invoice as PDF
- **WhatsApp** 📱 - Share invoice via WhatsApp (if customer has phone number)

### 🔴 Second Row (Admin & Accountant Only):
When opening a **Confirmed** invoice:
- **Return** 🔄 - Mark invoice as returned
- **Cancel** ❌ - Cancel the invoice
- **Delete** 🗑️ - Permanently delete invoice

When opening a **Cancelled** or **Returned** invoice (Admin only):
- **Restore** ♻️ - Reactivate the invoice
- **Delete** 🗑️ - Permanently delete invoice

---

## Data Security 🔒

### Database Permissions (RLS Policies)
Database permissions have been updated to ensure security:

#### Delete Sales:
```sql
✅ Super Admin: Can delete any invoice from any branch
✅ Admin: Can delete invoices from their branch only
✅ Accountant: Can delete invoices from their branch only
❌ Others: Cannot delete
```

#### Delete Sale Items:
```sql
✅ Super Admin: Can delete any item
✅ Admin: Can delete items from their branch invoices only
✅ Accountant: Can delete items from their branch invoices only
❌ Others: Cannot delete
```

---

## Modified Files

### Frontend:
- `src/components/Sales.tsx`: Added new features

### Database Migrations:
- `supabase/migrations/allow_accountant_to_delete_sales.sql`: Updated permissions

---

## Testing Features

### Build ✅
```bash
npm run build
# ✅ Build successful in 19.09s
```

### Required Testing:
1. ✅ Login as Admin → Test all features
2. ✅ Login as Accountant → Test delete and return
3. ✅ Login as Salesperson → Verify management buttons are hidden
4. ✅ Test filters for different statuses
5. ✅ Test restoring cancelled invoices

---

## Important Notes ⚠️

1. **Deletion is permanent**: Cannot recover invoice after deletion
2. **Restore is Admin only**: Accountants cannot restore invoices
3. **Filtering**: Use filters to show specific invoice status
4. **Returns**: Displayed in distinctive orange color vs cancelled
5. **Confirmation message**: Always appears before deletion to prevent accidental deletion

---

## Support

If you encounter any issues:
1. Ensure you're logged in with Admin or Accountant account
2. Verify you have the correct permissions
3. Refresh the page with `Ctrl + F5`
4. Open Console (F12) to check for errors

---

**Updated**: 2026-02-14
**Version**: 1.0.0
**Status**: ✅ Complete and ready for use
