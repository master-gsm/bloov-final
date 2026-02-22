import { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Users, Plus, Edit2, Trash2, DollarSign, TrendingUp, Calendar,
  Search, X, Save, Loader2, AlertCircle, CheckCircle, Clock,
  CalendarDays, FileText, UserX,
} from 'lucide-react';
import { LeavesTab } from './hr/LeavesTab';
import { SettlementsTab } from './hr/SettlementsTab';
import type { Employee, SalaryPayment, Commission, EmployeeLeave, EmployeeSettlement, Tab } from './hr/types';

export function Employees() {
  const { language } = useLanguage();
  const { profile: userProfile, isAdmin } = useAuth();
  const isRTL = language === 'ar';

  const [activeTab, setActiveTab] = useState<Tab>('employees');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [salaries, setSalaries] = useState<SalaryPayment[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [leaves, setLeaves] = useState<EmployeeLeave[]>([]);
  const [settlements, setSettlements] = useState<EmployeeSettlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showSalaryModal, setShowSalaryModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [branches, setBranches] = useState<any[]>([]);

  const defaultForm = {
    full_name: '',
    phone: '',
    email: '',
    national_id: '',
    position: '',
    department: '',
    branch_id: (userProfile as any)?.branch_id || '',
    hire_date: new Date().toISOString().split('T')[0],
    basic_salary: 0,
    commission_rate: 0,
    commission_rate_external: 0,
    is_active: true,
    employment_type: 'full_time' as const,
    contract_type: 'permanent' as const,
    vacation_balance_days: 21,
    termination_date: '',
    termination_reason: '',
    notes: '',
  };

  const [formData, setFormData] = useState(defaultForm);

  const [salaryForm, setSalaryForm] = useState({
    employee_id: '',
    payment_date: new Date().toISOString().split('T')[0],
    period_start: '',
    period_end: '',
    basic_amount: 0,
    commission_amount: 0,
    bonus: 0,
    deductions: 0,
    payment_method: 'cash' as const,
    notes: '',
  });

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'employees') {
        let empQuery = supabase
          .from('employees')
          .select('*, branches(name)')
          .order('created_at', { ascending: false });
        if (!isAdmin && (userProfile as any)?.branch_id) {
          empQuery = (empQuery as any).eq('branch_id', (userProfile as any).branch_id);
        }
        const { data: empData } = await empQuery;
        setEmployees((empData || []) as any[]);

        const { data: branchData } = await supabase.from('branches').select('*').order('name');
        setBranches(branchData || []);
      } else if (activeTab === 'salaries') {
        const { data } = await supabase
          .from('salary_payments')
          .select('*, employees(full_name)')
          .order('payment_date', { ascending: false });
        setSalaries((data || []) as any[]);
      } else if (activeTab === 'commissions') {
        const { data } = await supabase
          .from('employee_commissions')
          .select('*, employees(full_name)')
          .order('created_at', { ascending: false });
        setCommissions((data || []) as any[]);
      } else if (activeTab === 'leaves') {
        if (employees.length === 0) {
          const { data: empData } = await supabase.from('employees').select('*, branches(name)').order('created_at', { ascending: false });
          setEmployees((empData || []) as any[]);
        }
        const { data } = await supabase
          .from('employee_leaves')
          .select('*, employees(full_name, basic_salary)')
          .order('created_at', { ascending: false });
        setLeaves((data || []) as any[]);
      } else if (activeTab === 'settlements') {
        if (employees.length === 0) {
          const { data: empData } = await supabase.from('employees').select('*, branches(name)').order('created_at', { ascending: false });
          setEmployees((empData || []) as any[]);
        }
        const { data } = await supabase
          .from('employee_settlements')
          .select('*, employees(full_name)')
          .order('created_at', { ascending: false });
        setSettlements((data || []) as any[]);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEmployee = async () => {
    try {
      const payload: any = {
        full_name: formData.full_name,
        phone: formData.phone,
        email: formData.email,
        national_id: formData.national_id,
        position: formData.position,
        department: formData.department,
        branch_id: formData.branch_id || null,
        hire_date: formData.hire_date,
        basic_salary: formData.basic_salary,
        commission_rate: formData.commission_rate,
        commission_rate_external: formData.commission_rate_external,
        is_active: formData.is_active,
        employment_type: formData.employment_type,
        contract_type: formData.contract_type,
        vacation_balance_days: formData.vacation_balance_days,
        notes: formData.notes,
      };
      if (formData.termination_date) {
        payload.termination_date = formData.termination_date;
        payload.termination_reason = formData.termination_reason;
      }
      if (editingEmployee) {
        await supabase.from('employees').update(payload).eq('id', editingEmployee.id);
      } else {
        await supabase.from('employees').insert([payload] as any);
      }
      setShowModal(false);
      setEditingEmployee(null);
      setFormData(defaultForm);
      loadData();
    } catch (error) {
      console.error('Error saving employee:', error);
    }
  };

  const handleDeleteEmployee = async (id: string) => {
    if (!confirm(isRTL ? 'هل تريد حذف هذا الموظف؟' : 'Delete this employee?')) return;
    await supabase.from('employees').delete().eq('id', id);
    loadData();
  };

  const handlePaySalary = async () => {
    try {
      const totalAmount =
        (salaryForm.basic_amount || 0) +
        (salaryForm.commission_amount || 0) +
        (salaryForm.bonus || 0) -
        (salaryForm.deductions || 0);

      await supabase.from('salary_payments').insert([{
        ...salaryForm,
        total_amount: totalAmount,
        branch_id: (userProfile as any)?.branch_id,
        created_by: (userProfile as any)?.id,
      }]);
      setShowSalaryModal(false);
      setSalaryForm({
        employee_id: '', payment_date: new Date().toISOString().split('T')[0],
        period_start: '', period_end: '', basic_amount: 0, commission_amount: 0,
        bonus: 0, deductions: 0, payment_method: 'cash', notes: '',
      });
      loadData();
    } catch (error: any) {
      alert(error?.message || 'Error saving salary');
    }
  };

  const openEditModal = (employee: Employee) => {
    setEditingEmployee(employee);
    setFormData({
      full_name: employee.full_name,
      phone: employee.phone || '',
      email: employee.email || '',
      national_id: employee.national_id || '',
      position: employee.position || '',
      department: employee.department || '',
      branch_id: employee.branch_id,
      hire_date: employee.hire_date,
      basic_salary: employee.basic_salary,
      commission_rate: employee.commission_rate,
      commission_rate_external: employee.commission_rate_external || 0,
      is_active: employee.is_active,
      employment_type: employee.employment_type || 'full_time',
      contract_type: (employee as any).contract_type || 'permanent',
      vacation_balance_days: (employee as any).vacation_balance_days ?? 21,
      termination_date: employee.termination_date || '',
      termination_reason: employee.termination_reason || '',
      notes: employee.notes || '',
    });
    setShowModal(true);
  };

  const filteredEmployees = employees.filter(emp =>
    emp.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.position?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isAdmin) {
    return (
      <div className="p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <AlertCircle className="w-5 h-5 text-yellow-600 inline mr-2" />
          <span className="text-yellow-800">
            {isRTL ? 'هذا القسم متاح للمسؤولين فقط' : 'This section is available for admins only'}
          </span>
        </div>
      </div>
    );
  }

  const tabs: { key: Tab; labelAr: string; labelEn: string; icon: React.ReactNode }[] = [
    { key: 'employees',   labelAr: 'الموظفين',    labelEn: 'Employees',    icon: <Users className="w-4 h-4" /> },
    { key: 'salaries',    labelAr: 'الرواتب',     labelEn: 'Salaries',     icon: <DollarSign className="w-4 h-4" /> },
    { key: 'commissions', labelAr: 'العمولات',    labelEn: 'Commissions',  icon: <TrendingUp className="w-4 h-4" /> },
    { key: 'leaves',      labelAr: 'الإجازات',    labelEn: 'Leaves',       icon: <CalendarDays className="w-4 h-4" /> },
    { key: 'settlements', labelAr: 'نهاية الخدمة', labelEn: 'Settlements', icon: <FileText className="w-4 h-4" /> },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-7 h-7 text-teal-600" />
            {isRTL ? 'الموارد البشرية والرواتب' : 'HR & Payroll'}
          </h2>
          <p className="text-gray-500 mt-1">
            {isRTL ? 'إدارة الموظفين والرواتب والإجازات ونهاية الخدمة' : 'Manage employees, salaries, leaves & settlements'}
          </p>
        </div>
        {activeTab === 'employees' && (
          <button
            onClick={() => { setFormData(defaultForm); setEditingEmployee(null); setShowModal(true); }}
            className="flex items-center gap-2 bg-teal-600 text-white px-6 py-3 rounded-lg hover:bg-teal-700 transition"
          >
            <Plus className="w-5 h-5" />
            {isRTL ? 'إضافة موظف' : 'Add Employee'}
          </button>
        )}
        {activeTab === 'salaries' && (
          <button
            onClick={() => setShowSalaryModal(true)}
            className="flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition"
          >
            <DollarSign className="w-5 h-5" />
            {isRTL ? 'دفع راتب' : 'Pay Salary'}
          </button>
        )}
      </div>

      <div className="flex gap-1 border-b overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition whitespace-nowrap ${
              activeTab === tab.key
                ? 'border-teal-600 text-teal-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.icon}
            {isRTL ? tab.labelAr : tab.labelEn}
          </button>
        ))}
      </div>

      {activeTab === 'employees' && (
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder={isRTL ? 'بحث عن موظف...' : 'Search employee...'}
              className="w-full pr-10 pl-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {[
                      isRTL ? 'الاسم' : 'Name',
                      isRTL ? 'المنصب' : 'Position',
                      isRTL ? 'القسم' : 'Department',
                      isRTL ? 'الفرع' : 'Branch',
                      isRTL ? 'الراتب' : 'Salary',
                      isRTL ? 'رصيد الإجازة' : 'Leave Balance',
                      isRTL ? 'العمولة %' : 'Commission %',
                      isRTL ? 'الحالة' : 'Status',
                      isRTL ? 'الإجراءات' : 'Actions',
                    ].map((h, i) => (
                      <th key={i} className="px-4 py-3 text-right text-sm font-medium text-gray-700">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {loading ? (
                    <tr><td colSpan={9} className="px-4 py-8 text-center">
                      <Loader2 className="w-8 h-8 animate-spin mx-auto text-teal-600" />
                    </td></tr>
                  ) : filteredEmployees.length === 0 ? (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                      {isRTL ? 'لا يوجد موظفين' : 'No employees'}
                    </td></tr>
                  ) : filteredEmployees.map(emp => (
                    <tr key={emp.id} className={`hover:bg-gray-50 ${emp.termination_date ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        <div className="flex items-center gap-2">
                          {emp.termination_date && <UserX className="w-3.5 h-3.5 text-red-500" />}
                          <span className="font-medium">{emp.full_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{emp.position}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{emp.department}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{emp.branches?.name}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {(emp.basic_salary ?? 0).toLocaleString()} {isRTL ? 'ر.س' : 'SAR'}
                      </td>
                      <td className="px-4 py-3 text-sm text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${
                          (emp as any).vacation_balance_days > 5
                            ? 'bg-green-100 text-green-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}>
                          <Calendar className="w-3 h-3" />
                          {(emp as any).vacation_balance_days ?? 0} {isRTL ? 'يوم' : 'd'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        <div className="space-y-0.5">
                          <div className="text-xs text-gray-500">{isRTL ? 'داخلي' : 'Int'}: {emp.commission_rate ?? 0}%</div>
                          <div className="text-xs text-gray-500">{isRTL ? 'خارجي' : 'Ext'}: {emp.commission_rate_external ?? 0}%</div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                          emp.termination_date
                            ? 'bg-red-100 text-red-700'
                            : emp.is_active
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-700'
                        }`}>
                          {emp.termination_date
                            ? (isRTL ? 'منتهي الخدمة' : 'Terminated')
                            : emp.is_active
                              ? (isRTL ? 'نشط' : 'Active')
                              : (isRTL ? 'غير نشط' : 'Inactive')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => openEditModal(emp)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDeleteEmployee(emp.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'salaries' && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {[
                    isRTL ? 'الموظف' : 'Employee',
                    isRTL ? 'الفترة' : 'Period',
                    isRTL ? 'الراتب الأساسي' : 'Basic Salary',
                    isRTL ? 'العمولات' : 'Commissions',
                    isRTL ? 'المكافآت' : 'Bonus',
                    isRTL ? 'الخصومات' : 'Deductions',
                    isRTL ? 'الإجمالي' : 'Total',
                    isRTL ? 'التاريخ' : 'Date',
                  ].map((h, i) => (
                    <th key={i} className="px-4 py-3 text-right text-sm font-medium text-gray-700">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-teal-600" />
                  </td></tr>
                ) : salaries.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    {isRTL ? 'لا يوجد رواتب مدفوعة' : 'No salary payments'}
                  </td></tr>
                ) : salaries.map(salary => (
                  <tr key={salary.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{salary.employees?.full_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {new Date(salary.period_start).toLocaleDateString()} — {new Date(salary.period_end).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">{(salary.basic_amount ?? 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-green-600">+{(salary.commission_amount ?? 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-green-600">+{(salary.bonus ?? 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-red-600">-{(salary.deductions ?? 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm font-bold text-gray-900">
                      {(salary.total_amount ?? 0).toLocaleString()} {isRTL ? 'ر.س' : 'SAR'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{new Date(salary.payment_date).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'commissions' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                label: isRTL ? 'إجمالي العمولات المستحقة' : 'Total Pending',
                value: commissions.filter(c => (c as any).status === 'pending' || (!(c as any).status && !c.is_paid)).reduce((s, c) => s + (c.commission_amount ?? 0), 0),
                color: 'text-amber-600',
              },
              {
                label: isRTL ? 'إجمالي العمولات المعتمدة' : 'Total Approved',
                value: commissions.filter(c => (c as any).status === 'approved' || c.is_paid).reduce((s, c) => s + (c.commission_amount ?? 0), 0),
                color: 'text-green-600',
              },
              {
                label: isRTL ? 'إجمالي جميع العمولات' : 'Total All',
                value: commissions.filter(c => (c as any).status !== 'void').reduce((s, c) => s + (c.commission_amount ?? 0), 0),
                color: 'text-teal-600',
              },
            ].map((card, i) => (
              <div key={i} className="bg-white rounded-xl shadow-sm border p-5">
                <p className="text-sm text-gray-500 mb-1">{card.label}</p>
                <p className={`text-2xl font-bold ${card.color}`}>
                  {card.value.toLocaleString('ar-SA', { minimumFractionDigits: 2 })} {isRTL ? 'ر.س' : 'SAR'}
                </p>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {[
                      isRTL ? 'الموظف' : 'Employee',
                      isRTL ? 'مبلغ البيع' : 'Sale Amount',
                      isRTL ? 'نسبة العمولة' : 'Rate',
                      isRTL ? 'مبلغ العمولة' : 'Commission',
                      isRTL ? 'الحالة' : 'Status',
                      isRTL ? 'التاريخ' : 'Date',
                    ].map((h, i) => (
                      <th key={i} className="px-4 py-3 text-right text-sm font-medium text-gray-700">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {loading ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center">
                      <Loader2 className="w-8 h-8 animate-spin mx-auto text-teal-600" />
                    </td></tr>
                  ) : commissions.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      {isRTL ? 'لا يوجد عمولات' : 'No commissions'}
                    </td></tr>
                  ) : commissions.map(comm => (
                    <tr key={comm.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{comm.employees?.full_name}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{(comm.sale_amount ?? 0).toLocaleString()} {isRTL ? 'ر.س' : 'SAR'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{comm.commission_rate}%</td>
                      <td className="px-4 py-3 text-sm font-bold text-green-600">{(comm.commission_amount ?? 0).toLocaleString()} {isRTL ? 'ر.س' : 'SAR'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                          (comm as any).status === 'approved' || comm.is_paid ? 'bg-green-100 text-green-700' :
                          (comm as any).status === 'void'                     ? 'bg-red-100 text-red-700'   :
                                                                                'bg-amber-100 text-amber-700'
                        }`}>
                          {(comm as any).status === 'approved' || comm.is_paid
                            ? <><CheckCircle className="w-3 h-3" /> {isRTL ? 'مؤكدة' : 'Approved'}</>
                            : (comm as any).status === 'void'
                              ? <><X className="w-3 h-3" /> {isRTL ? 'ملغاة' : 'Void'}</>
                              : <><Clock className="w-3 h-3" /> {isRTL ? 'معلقة' : 'Pending'}</>}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{new Date(comm.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'leaves' && (
        <LeavesTab
          isRTL={isRTL}
          leaves={leaves}
          employees={employees}
          userProfile={userProfile}
          loading={loading}
          onRefresh={loadData}
        />
      )}

      {activeTab === 'settlements' && (
        <SettlementsTab
          isRTL={isRTL}
          settlements={settlements}
          employees={employees}
          userProfile={userProfile}
          loading={loading}
          onRefresh={loadData}
        />
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full p-6 space-y-6 my-8">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900">
                {editingEmployee ? (isRTL ? 'تعديل موظف' : 'Edit Employee') : (isRTL ? 'إضافة موظف جديد' : 'Add New Employee')}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'الاسم الكامل *' : 'Full Name *'}</label>
                <input type="text" value={formData.full_name} onChange={e => setFormData({ ...formData, full_name: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'رقم الهاتف' : 'Phone'}</label>
                <input type="text" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500" dir="ltr" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'البريد الإلكتروني' : 'Email'}</label>
                <input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500" dir="ltr" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'رقم الهوية' : 'National ID'}</label>
                <input type="text" value={formData.national_id} onChange={e => setFormData({ ...formData, national_id: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500" dir="ltr" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'المنصب' : 'Position'}</label>
                <input type="text" value={formData.position} onChange={e => setFormData({ ...formData, position: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'القسم' : 'Department'}</label>
                <input type="text" value={formData.department} onChange={e => setFormData({ ...formData, department: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'الفرع' : 'Branch'}</label>
                <select value={formData.branch_id} onChange={e => setFormData({ ...formData, branch_id: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500">
                  <option value="">{isRTL ? 'اختر الفرع' : 'Select Branch'}</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'تاريخ التوظيف' : 'Hire Date'}</label>
                <input type="date" value={formData.hire_date} onChange={e => setFormData({ ...formData, hire_date: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'الراتب الأساسي' : 'Basic Salary'}</label>
                <input type="number" value={formData.basic_salary} onChange={e => setFormData({ ...formData, basic_salary: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500" min="0" step="0.01" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'رصيد الإجازة السنوية (أيام)' : 'Annual Leave Balance (days)'}</label>
                <input type="number" value={formData.vacation_balance_days} onChange={e => setFormData({ ...formData, vacation_balance_days: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500" min="0" step="0.5" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'نوع التوظيف' : 'Employment Type'}</label>
                <select value={formData.employment_type} onChange={e => setFormData({ ...formData, employment_type: e.target.value as any })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500">
                  <option value="full_time">{isRTL ? 'دوام كامل' : 'Full Time'}</option>
                  <option value="part_time">{isRTL ? 'دوام جزئي' : 'Part Time'}</option>
                  <option value="contract">{isRTL ? 'عقد مؤقت' : 'Contract'}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'نوع العقد' : 'Contract Type'}</label>
                <select value={formData.contract_type} onChange={e => setFormData({ ...formData, contract_type: e.target.value as any })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500">
                  <option value="permanent">{isRTL ? 'دائم' : 'Permanent'}</option>
                  <option value="fixed_term">{isRTL ? 'محدد المدة' : 'Fixed Term'}</option>
                  <option value="project">{isRTL ? 'مشروع' : 'Project-based'}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'نسبة عمولة المبيعات الداخلية %' : 'Internal Commission %'}</label>
                <input type="number" value={formData.commission_rate} onChange={e => setFormData({ ...formData, commission_rate: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500" min="0" max="100" step="0.1" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'نسبة عمولة المبيعات الخارجية %' : 'External Commission %'}</label>
                <input type="number" value={formData.commission_rate_external} onChange={e => setFormData({ ...formData, commission_rate_external: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500" min="0" max="100" step="0.1" />
              </div>

              {editingEmployee && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'تاريخ إنهاء الخدمة' : 'Termination Date'}</label>
                    <input type="date" value={formData.termination_date} onChange={e => setFormData({ ...formData, termination_date: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'سبب الإنهاء' : 'Termination Reason'}</label>
                    <input type="text" value={formData.termination_reason} onChange={e => setFormData({ ...formData, termination_reason: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500" />
                  </div>
                </>
              )}

              <div>
                <label className="flex items-center gap-2 cursor-pointer mt-2">
                  <input type="checkbox" checked={formData.is_active} onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                    className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500" />
                  <span className="text-sm font-medium text-gray-700">{isRTL ? 'موظف نشط' : 'Active Employee'}</span>
                </label>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'ملاحظات' : 'Notes'}</label>
                <textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500" rows={3} />
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowModal(false)}
                className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium">
                {isRTL ? 'إلغاء' : 'Cancel'}
              </button>
              <button onClick={handleSaveEmployee}
                className="flex-1 px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition font-medium flex items-center justify-center gap-2">
                <Save className="w-5 h-5" />
                {isRTL ? 'حفظ' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSalaryModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900">{isRTL ? 'دفع راتب' : 'Pay Salary'}</h3>
              <button onClick={() => setShowSalaryModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'الموظف *' : 'Employee *'}</label>
                <select value={salaryForm.employee_id}
                  onChange={e => {
                    const emp = employees.find(em => em.id === e.target.value);
                    setSalaryForm({ ...salaryForm, employee_id: e.target.value, basic_amount: emp?.basic_salary || 0 });
                  }}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500" required>
                  <option value="">{isRTL ? 'اختر موظف' : 'Select Employee'}</option>
                  {employees.filter(e => e.is_active && !e.termination_date).map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                  ))}
                </select>
              </div>
              {[
                { key: 'period_start',       label: isRTL ? 'من تاريخ' : 'Period Start', type: 'date' },
                { key: 'period_end',         label: isRTL ? 'إلى تاريخ' : 'Period End', type: 'date' },
                { key: 'basic_amount',       label: isRTL ? 'الراتب الأساسي' : 'Basic Amount', type: 'number' },
                { key: 'commission_amount',  label: isRTL ? 'العمولات' : 'Commissions', type: 'number' },
                { key: 'bonus',              label: isRTL ? 'المكافآت' : 'Bonus', type: 'number' },
                { key: 'deductions',         label: isRTL ? 'الخصومات' : 'Deductions', type: 'number' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                  <input type={f.type} value={(salaryForm as any)[f.key]}
                    onChange={e => setSalaryForm({ ...salaryForm, [f.key]: f.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                    min={f.type === 'number' ? '0' : undefined} step={f.type === 'number' ? '0.01' : undefined} />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'طريقة الدفع' : 'Payment Method'}</label>
                <select value={salaryForm.payment_method} onChange={e => setSalaryForm({ ...salaryForm, payment_method: e.target.value as any })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500">
                  <option value="cash">{isRTL ? 'نقدي' : 'Cash'}</option>
                  <option value="bank_transfer">{isRTL ? 'تحويل بنكي' : 'Bank Transfer'}</option>
                  <option value="check">{isRTL ? 'شيك' : 'Check'}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'تاريخ الدفع' : 'Payment Date'}</label>
                <input type="date" value={salaryForm.payment_date} onChange={e => setSalaryForm({ ...salaryForm, payment_date: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500" />
              </div>
              <div className="md:col-span-2 bg-teal-50 border border-teal-200 rounded-lg p-4 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">{isRTL ? 'الإجمالي:' : 'Total:'}</span>
                <span className="text-2xl font-bold text-teal-600">
                  {((salaryForm.basic_amount || 0) + (salaryForm.commission_amount || 0) + (salaryForm.bonus || 0) - (salaryForm.deductions || 0)).toLocaleString()} {isRTL ? 'ر.س' : 'SAR'}
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowSalaryModal(false)}
                className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium">
                {isRTL ? 'إلغاء' : 'Cancel'}
              </button>
              <button onClick={handlePaySalary} disabled={!salaryForm.employee_id || !salaryForm.period_start || !salaryForm.period_end}
                className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium flex items-center justify-center gap-2 disabled:opacity-50">
                <DollarSign className="w-5 h-5" />
                {isRTL ? 'دفع الراتب' : 'Pay Salary'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
