export interface Employee {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  national_id: string;
  position: string;
  department: string;
  branch_id: string;
  hire_date: string;
  basic_salary: number;
  commission_rate: number;
  commission_rate_external: number;
  is_active: boolean;
  employment_type: 'full_time' | 'part_time' | 'contract';
  contract_type: 'permanent' | 'fixed_term' | 'project';
  vacation_balance_days: number;
  termination_date: string | null;
  termination_reason: string | null;
  notes: string;
  branches?: { name: string };
}

export interface SalaryPayment {
  id: string;
  employee_id: string;
  payment_date: string;
  period_start: string;
  period_end: string;
  basic_amount: number;
  commission_amount: number;
  bonus: number;
  deductions: number;
  total_amount: number;
  payment_method: string;
  notes: string;
  employees?: { full_name: string };
}

export interface Commission {
  id: string;
  employee_id: string;
  sale_id: string;
  commission_rate: number;
  sale_amount: number;
  commission_amount: number;
  is_paid: boolean;
  status?: string;
  created_at: string;
  employees?: { full_name: string };
}

export interface EmployeeLeave {
  id: string;
  employee_id: string;
  branch_id: string;
  leave_type: 'annual' | 'sick' | 'unpaid';
  start_date: string;
  end_date: string;
  days: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  approved_at: string | null;
  payroll_deducted: boolean;
  created_at: string;
  employees?: { full_name: string; basic_salary: number };
}

export interface EmployeeSettlement {
  id: string;
  employee_id: string;
  branch_id: string;
  last_working_day: string;
  years_of_service: number;
  end_of_service: number;
  unused_vacation_days: number;
  unused_vacation_compensation: number;
  pending_commissions: number;
  deductions: number;
  final_amount: number;
  notes: string;
  status: 'draft' | 'approved' | 'paid';
  approved_at: string | null;
  paid_at: string | null;
  created_at: string;
  employees?: { full_name: string };
}

export type Tab = 'employees' | 'salaries' | 'commissions' | 'leaves' | 'settlements';
