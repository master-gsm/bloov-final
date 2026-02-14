# Multi-Branch Management System Guide

## Overview
BLOOV now supports a comprehensive multi-branch management system that enables you to operate multiple store locations with strict data isolation while maintaining centralized oversight for administrators.

## Key Features

### 1. Branch Management
- **Create and manage multiple branches**: Add unlimited branches with unique codes, locations, and managers
- **Branch details**: Track branch name, code, location, city, phone, manager, opening date, and operational status
- **Active/Inactive status**: Control which branches are operational

### 2. Strict Data Isolation
All business data is now branch-specific to ensure complete separation:
- **Sales & Invoices**: Each branch can only see and manage its own sales
- **Inventory**: Global product catalog with branch-specific stock levels
- **Expenses**: Operating expenses are isolated per branch
- **Cash Management**: Cash registers and transactions are branch-specific
- **Purchases**: Purchase records are separated by branch

### 3. Global vs. Branch-Specific Data
- **Global Product Catalog**: Products are shared across all branches
- **Branch-Specific Stock**: Each branch maintains its own inventory quantities
- **Global Customers**: Customer database is shared, but tracks the branch of origin
- **Shared Suppliers**: Supplier database is accessible to all branches

### 4. User Roles and Branch Assignment
- **Branch Assignment**: Each user is assigned to a specific branch
- **Role-Based Access**: Users can only access data from their assigned branch
- **Super Admin Role**: New role with access to all branches for centralized oversight

### 5. Setup Expenses (CapEx)
A dedicated module for tracking founding and capital expenditures:
- **Separate from Operating Expenses**: Setup expenses are tracked independently
- **Branch-Specific or General**: Can be assigned to a specific branch or marked as general (company-wide)
- **Amortization Support**: Option to amortize expenses over multiple months
- **Categories**: Furniture, Equipment, Renovation, Licenses, Technology, etc.
- **ROI Calculation**: Helps calculate break-even point and return on investment

### 6. Branch-Specific Stock Management
The new `branch_stock` table provides:
- Branch-specific inventory quantities
- Min/max stock levels per branch
- Last restock date tracking
- Low stock alerts per branch
- Stock valuation by branch

## Database Schema Changes

### New Tables

#### 1. `branches`
Stores all branch information:
- `id`: Unique branch identifier
- `name`: Branch name (e.g., "Main Store")
- `code`: Short unique code (e.g., "MAIN")
- `location`: Physical address
- `city`: City name
- `phone`: Branch contact number
- `manager_id`: User assigned as branch manager
- `is_active`: Whether branch is operational
- `opening_date`: Date branch opened
- `metadata`: Additional branch settings (JSON)

#### 2. `branch_stock`
Tracks inventory per branch:
- `branch_id`: Reference to branch
- `product_id`: Reference to product
- `quantity`: Current stock quantity at this branch
- `min_stock_level`: Reorder point for this branch
- `max_stock_level`: Maximum stock capacity
- `last_restock_date`: Last time stock was replenished

#### 3. `setup_expenses`
Capital and founding expenses:
- `branch_id`: Branch reference (nullable for company-wide expenses)
- `category`: Expense category
- `description`: Detailed description
- `amount`: Expense amount
- `expense_date`: Date expense occurred
- `supplier_id`: Supplier reference (if applicable)
- `payment_method`: How it was paid
- `receipt_number`: Receipt/invoice number
- `attachment`: File attachment URL
- `is_amortizable`: Whether expense can be amortized
- `amortization_months`: Number of months to amortize
- `notes`: Additional notes

### Modified Tables
The following tables now include a `branch_id` column:
- `users`: User's assigned branch
- `sales`: Sales transactions per branch
- `inventory`: Legacy inventory (deprecated in favor of branch_stock)
- `expenses`: Operating expenses per branch
- `customers`: Customer's branch of origin
- `cash_transactions`: Cash transactions per branch
- `purchases`: Purchase records per branch
- `operating_expenses`: Operating expenses per branch
- `cash_shifts`: Cash shift records per branch

## User Roles

### New Role: Super Admin
- Full access to all branches
- Can view consolidated reports across all branches
- Can switch between branch views for detailed analysis
- Manages branch creation and configuration

### Existing Roles (Now Branch-Restricted)
- **Admin**: Full access to their assigned branch only
- **Manager**: Manages operations in their assigned branch
- **Employee**: Limited access to their branch
- **Accountant**: Financial access to their branch
- **Observer**: Read-only access to their branch

## How to Use

### For Super Admins

#### Creating a New Branch
1. Navigate to "Branches" from the sidebar
2. Click "Add Branch"
3. Fill in:
   - Branch name (e.g., "Mall Branch")
   - Branch code (unique, e.g., "MALL1")
   - Location and city
   - Phone number
   - Assign a branch manager
   - Set opening date
   - Mark as active/inactive
4. Save

#### Assigning Users to Branches
1. Go to "User Management"
2. When creating or editing a user, select their branch assignment
3. Users will automatically be restricted to their assigned branch data

#### Viewing Consolidated Reports
As a super admin, you can:
- Use the `get_consolidated_sales_summary()` function to see sales across all branches
- Use the `get_branch_stock_summary()` function to view inventory across all branches
- Switch between branch views in the dashboard (future enhancement)

#### Managing Setup Expenses
1. Navigate to "Setup Expenses" from the sidebar
2. Click "Add Expense"
3. Select:
   - Category (Furniture, Equipment, Renovation, etc.)
   - Branch (or leave blank for general expenses)
   - Description and amount
   - Date and payment details
   - Enable amortization if needed (with number of months)
4. View total setup expenses and separate them from operating expenses

### For Branch Users

#### Working in Your Branch
- After login, you'll automatically see only data from your assigned branch
- All sales, purchases, inventory, and expenses are filtered to your branch
- You cannot access data from other branches

#### Managing Branch Inventory
1. Navigate to "Inventory"
2. View and manage stock levels for your branch only
3. Set branch-specific min/max stock levels
4. Receive alerts when stock is low at your branch

#### Recording Branch Expenses
1. Navigate to "Operating Expenses"
2. All expenses are automatically tagged to your branch
3. View expense history for your branch only

## Data Migration

All existing data has been automatically assigned to a default "Main Branch":
- Branch Code: "MAIN"
- All current users assigned to Main Branch
- All sales, inventory, expenses assigned to Main Branch
- Branch-specific stock entries created from existing inventory

## Security and Isolation

### Row Level Security (RLS) Policies
The system enforces strict data isolation through PostgreSQL RLS:
- Users can only SELECT data from their assigned branch
- Users can only INSERT/UPDATE/DELETE data in their assigned branch
- Super admins bypass these restrictions
- Customers table remains globally accessible (with branch origin tracking)
- Products table remains globally accessible

### Helper Functions
- `is_super_admin()`: Check if current user is a super admin
- `get_user_branch_id()`: Get the current user's branch ID
- `get_consolidated_sales_summary()`: Get sales summary across all branches (super admin only)
- `get_branch_stock_summary()`: Get inventory summary by branch

## Reports and Analytics

### Branch Performance Comparison (Super Admin)
Super admins can compare:
- Total sales by branch
- Average order value by branch
- Inventory levels by branch
- Expense ratios by branch
- Profitability by branch

### Setup Expenses vs Operating Expenses
The system now distinguishes:
- **Setup Expenses (CapEx)**: One-time founding and capital expenses
  - Used for ROI and break-even calculations
  - Can be amortized over time
  - Tracked separately per branch or company-wide

- **Operating Expenses (OpEx)**: Recurring daily operational costs
  - Tracked per branch
  - Used for ongoing profitability analysis

## Best Practices

1. **Branch Codes**: Use short, memorable codes (e.g., MAIN, MALL1, DOWNTOWN)
2. **Manager Assignment**: Always assign a manager to each branch for accountability
3. **Regular Stock Transfers**: When moving inventory between branches, record it properly
4. **Setup Expense Classification**: Be clear about what constitutes CapEx vs OpEx
5. **Branch-Specific Settings**: Maintain accurate branch contact information
6. **Super Admin Access**: Limit super admin role to owners and top management only

## Future Enhancements

Potential additions to the multi-branch system:
- Inter-branch stock transfers
- Branch-to-branch orders
- Consolidated financial statements
- Branch performance dashboards
- Multi-branch reporting tools
- Branch-specific pricing rules
- Central warehouse management
- Branch profit sharing calculations

## Troubleshooting

### Users Can't See Data
- Verify user is assigned to the correct branch
- Check if branch is marked as active
- Confirm user has the correct role permissions

### Stock Not Showing
- Ensure branch_stock entries exist for the products
- Check if inventory was migrated from the old inventory table
- Verify branch is active

### Cannot Access Setup Expenses
- Only admin and super_admin roles can access setup expenses
- Check user role assignment

### RLS Policy Errors
- Verify user has a valid branch_id assigned
- Check if user is authenticated
- Confirm the branch exists and is active

## Support

For additional help or questions about the multi-branch system, please refer to the database migration files in `supabase/migrations/` or contact your system administrator.
