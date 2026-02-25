export interface Partner {
  id: string;
  name: string;
  name_ar: string;
  ownership_percentage: number;
  profit_share_percentage: number;
  capital_contribution: number;
  share_percentage: number;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PartnerAccount {
  partner_id: string;
  name: string;
  name_ar: string;
  ownership_percentage: number;
  profit_share_percentage: number;
  capital_contribution: number;
  is_active: boolean;
  total_profit_distributed: number;
  total_withdrawals: number;
  total_settlements_paid: number;
  total_settlements_received: number;
  current_account_balance: number;
}

export interface PartnerWithdrawal {
  id: string;
  partner_id: string;
  amount: number;
  method: 'cash' | 'bank';
  description: string;
  description_ar: string | null;
  withdrawal_date: string;
  is_voided: boolean;
  created_at: string;
  partner?: { name: string; name_ar: string };
}

export interface ProfitDistribution {
  id: string;
  partner_id: string;
  period_month: number;
  period_year: number;
  net_profit_base: number;
  share_percentage: number;
  amount_distributed: number;
  status: 'pending' | 'posted' | 'voided';
  notes: string | null;
  created_at: string;
  partner?: { name: string; name_ar: string };
}

export interface PartnerSettlement {
  id: string;
  from_partner_id: string;
  to_partner_id: string;
  amount: number;
  description: string;
  description_ar: string | null;
  settlement_date: string;
  attachment_url: string | null;
  status: string;
  created_at: string;
  from_partner?: { name: string; name_ar: string };
  to_partner?: { name: string; name_ar: string };
}

export interface SetupExpense {
  id: string;
  partner_id: string | null;
  category: string;
  description: string;
  description_ar: string | null;
  amount: number;
  expense_date: string | null;
  attachment: string | null;
  expense_type: string;
  notes: string | null;
  created_at: string;
  partner?: { name: string; name_ar: string };
}

export const EXPENSE_TYPES = {
  capital: { ar: 'رأس مال نقدي', en: 'Cash Capital' },
  inventory: { ar: 'مخزون', en: 'Inventory' },
  asset: { ar: 'أصول ثابتة', en: 'Fixed Assets' },
  operational: { ar: 'مصروف تشغيلي', en: 'Operational Expense' },
} as const;

export const MONTH_NAMES_AR = [
  '', 'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

export const MONTH_NAMES_EN = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
