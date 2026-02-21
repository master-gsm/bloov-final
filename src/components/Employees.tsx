import { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Users, Plus, Edit2, Trash2, DollarSign, TrendingUp, Calendar,
  Search, Filter, X, Save, Loader2, AlertCircle, Briefcase,
  CreditCard, Percent, CheckCircle, Clock
} from 'lucide-react';

interface Employee {
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
  is_active: boolean;
  employment_type: 'full_time' | 'part_time' | 'contract';
  notes: string;
  branches?: { name: string };
}

interface SalaryPayment {
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

interface Commission {
  id: string;
  employee_id: string;
  sale_id: string;
  commission_rate: number;
  sale_amount: number;
  commission_amount: number;
  is_paid: boolean;
  created_at: string;
  employees?: { full_name: string };
}

type Tab = 'employees' | 'salaries' | 'commissions';

export function Employees() {
  const { language } = useLanguage();
  const { profile: userProfile, isAdmin } = useAuth();
  const isRTL = language === 'ar';

  const [activeTab, setActiveTab] = useState<Tab>('employees');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [salaries, setSalaries] = useState<SalaryPayment[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showSalaryModal, setShowSalaryModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [branches, setBranches] = useState<any[]>([]);

  const [formData, setFormData] = useState({
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
    is_active: true,
    employment_type: 'full_time' as const,
    notes: '',
  });

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
        const { data: empData } = await supabase
          .from('employees')
          .select('*, branches(name)')
          .order('created_at', { ascending: false });
        setEmployees((empData || []) as any[]);

        const { data: branchData } = await supabase
          .from('branches')
          .select('*')
          .order('name');
        setBranches(branchData || []);
      } else if (activeTab === 'salaries') {
        const { data: salData } = await supabase
          .from('salary_payments')
          .select('*, employees(full_name)')
          .order('payment_date', { ascending: false });
        setSalaries((salData || []) as any[]);
      } else if (activeTab === 'commissions') {
        const { data: commData } = await supabase
          .from('employee_commissions')
          .select('*, employees(full_name)')
          .order('created_at', { ascending: false });
        setCommissions((commData || []) as any[]);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEmployee = async () => {
    try {
      if (editingEmployee) {
        await supabase
          .from('employees')
          .update(formData)
          .eq('id', editingEmployee.id);
      } else {
        await supabase.from('employees').insert([formData] as any);
      }
      setShowModal(false);
      setEditingEmployee(null);
      resetForm();
      loadData();
    } catch (error) {
      console.error('Error saving employee:', error);
    }
  };

  const handleDeleteEmployee = async (id: string) => {
    if (!confirm(isRTL ? 'هل تريد حذف هذا الموظف؟' : 'Delete this employee?')) return;
    try {
      await supabase.from('employees').delete().eq('id', id);
      loadData();
    } catch (error) {
      console.error('Error deleting employee:', error);
    }
  };

  const handlePaySalary = async () => {
    try {
      const totalAmount =
        parseFloat(salaryForm.basic_amount.toString()) +
        parseFloat(salaryForm.commission_amount.toString()) +
        parseFloat(salaryForm.bonus.toString()) -
        parseFloat(salaryForm.deductions.toString());

      await supabase.from('salary_payments').insert([{
        ...salaryForm,
        total_amount: totalAmount,
        branch_id: (userProfile as any)?.branch_id,
        created_by: (userProfile as any)?.id,
      }]);

      setShowSalaryModal(false);
      resetSalaryForm();
      loadData();
    } catch (error) {
      console.error('Error paying salary:', error);
    }
  };

  const resetForm = () => {
    setFormData({
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
      is_active: true,
      employment_type: 'full_time' as const,
      notes: '',
    });
  };

  const resetSalaryForm = () => {
    setSalaryForm({
      employee_id: '',
      payment_date: new Date().toISOString().split('T')[0],
      period_start: '',
      period_end: '',
      basic_amount: 0,
      commission_amount: 0,
      bonus: 0,
      deductions: 0,
      payment_method: 'cash',
      notes: '',
    });
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
      is_active: employee.is_active,
      employment_type: (employee.employment_type || 'full_time') as 'full_time',
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-7 h-7 text-teal-600" />
            {isRTL ? 'الموظفين والرواتب' : 'Employees & Salaries'}
          </h2>
          <p className="text-gray-500 mt-1">
            {isRTL ? 'إدارة الموظفين والرواتب والعمولات' : 'Manage employees, salaries, and commissions'}
          </p>
        </div>
        {activeTab === 'employees' && (
          <button
            onClick={() => {
              resetForm();
              setEditingEmployee(null);
              setShowModal(true);
            }}
            className="flex items-center gap-2 bg-teal-600 text-white px-6 py-3 rounded-lg hover:bg-teal-700 transition"
          >
            <Plus className="w-5 h-5" />
            {isRTL ? 'إضافة موظف' : 'Add Employee'}
          </button>
        )}
        {activeTab === 'salaries' && (
          <button
            onClick={() => {
              resetSalaryForm();
              setShowSalaryModal(true);
            }}
            className="flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition"
          >
            <DollarSign className="w-5 h-5" />
            {isRTL ? 'دفع راتب' : 'Pay Salary'}
          </button>
        )}
      </div>

      <div className="flex gap-2 border-b overflow-x-auto">
        {(['employees', 'salaries', 'commissions'] as Tab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition whitespace-nowrap ${
              activeTab === tab
                ? 'border-teal-600 text-teal-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'employees' && <Users className="w-4 h-4" />}
            {tab === 'salaries' && <DollarSign className="w-4 h-4" />}
            {tab === 'commissions' && <TrendingUp className="w-4 h-4" />}
            {tab === 'employees' && (isRTL ? 'الموظفين' : 'Employees')}
            {tab === 'salaries' && (isRTL ? 'الرواتب' : 'Salaries')}
            {tab === 'commissions' && (isRTL ? 'العمولات' : 'Commissions')}
          </button>
        ))}
      </div>

      {activeTab === 'employees' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={isRTL ? 'بحث عن موظف...' : 'Search employee...'}
                className="w-full pr-10 pl-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">
                      {isRTL ? 'الاسم' : 'Name'}
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">
                      {isRTL ? 'المنصب' : 'Position'}
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">
                      {isRTL ? 'القسم' : 'Department'}
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">
                      {isRTL ? 'الفرع' : 'Branch'}
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">
                      {isRTL ? 'الراتب' : 'Salary'}
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">
                      {isRTL ? 'العمولة %' : 'Commission %'}
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">
                      {isRTL ? 'الحالة' : 'Status'}
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">
                      {isRTL ? 'الإجراءات' : 'Actions'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto text-teal-600" />
                      </td>
                    </tr>
                  ) : filteredEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                        {isRTL ? 'لا يوجد موظفين' : 'No employees'}
                      </td>
                    </tr>
                  ) : (
                    filteredEmployees.map(emp => (
                      <tr key={emp.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">{emp.full_name}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{emp.position}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{emp.department}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{emp.branches?.name}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                          {emp.basic_salary.toLocaleString()} {isRTL ? 'ر.س' : 'SAR'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{emp.commission_rate}%</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                            emp.is_active
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}>
                            {emp.is_active ? (isRTL ? 'نشط' : 'Active') : (isRTL ? 'غير نشط' : 'Inactive')}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => openEditModal(emp)}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteEmployee(emp.id)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
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
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">
                    {isRTL ? 'الموظف' : 'Employee'}
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">
                    {isRTL ? 'الفترة' : 'Period'}
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">
                    {isRTL ? 'الراتب الأساسي' : 'Basic Salary'}
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">
                    {isRTL ? 'العمولات' : 'Commissions'}
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">
                    {isRTL ? 'المكافآت' : 'Bonus'}
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">
                    {isRTL ? 'الخصومات' : 'Deductions'}
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">
                    {isRTL ? 'الإجمالي' : 'Total'}
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">
                    {isRTL ? 'التاريخ' : 'Date'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center">
                      <Loader2 className="w-8 h-8 animate-spin mx-auto text-teal-600" />
                    </td>
                  </tr>
                ) : salaries.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                      {isRTL ? 'لا يوجد رواتب مدفوعة' : 'No salary payments'}
                    </td>
                  </tr>
                ) : (
                  salaries.map(salary => (
                    <tr key={salary.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {salary.employees?.full_name}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {new Date(salary.period_start).toLocaleDateString()} - {new Date(salary.period_end).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {salary.basic_amount.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-green-600">
                        +{salary.commission_amount.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-green-600">
                        +{salary.bonus.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-red-600">
                        -{salary.deductions.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-sm font-bold text-gray-900">
                        {salary.total_amount.toLocaleString()} {isRTL ? 'ر.س' : 'SAR'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {new Date(salary.payment_date).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'commissions' && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">
                    {isRTL ? 'الموظف' : 'Employee'}
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">
                    {isRTL ? 'مبلغ البيع' : 'Sale Amount'}
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">
                    {isRTL ? 'نسبة العمولة' : 'Commission Rate'}
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">
                    {isRTL ? 'مبلغ العمولة' : 'Commission Amount'}
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">
                    {isRTL ? 'الحالة' : 'Status'}
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">
                    {isRTL ? 'التاريخ' : 'Date'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center">
                      <Loader2 className="w-8 h-8 animate-spin mx-auto text-teal-600" />
                    </td>
                  </tr>
                ) : commissions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      {isRTL ? 'لا يوجد عمولات' : 'No commissions'}
                    </td>
                  </tr>
                ) : (
                  commissions.map(comm => (
                    <tr key={comm.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {comm.employees?.full_name}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {comm.sale_amount.toLocaleString()} {isRTL ? 'ر.س' : 'SAR'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {comm.commission_rate}%
                      </td>
                      <td className="px-4 py-3 text-sm font-bold text-green-600">
                        {comm.commission_amount.toLocaleString()} {isRTL ? 'ر.س' : 'SAR'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                          comm.is_paid
                            ? 'bg-green-100 text-green-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {comm.is_paid ? (
                            <><CheckCircle className="w-3 h-3" /> {isRTL ? 'مدفوعة' : 'Paid'}</>
                          ) : (
                            <><Clock className="w-3 h-3" /> {isRTL ? 'معلقة' : 'Pending'}</>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {new Date(comm.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full p-6 space-y-6 my-8">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900">
                {editingEmployee
                  ? (isRTL ? 'تعديل موظف' : 'Edit Employee')
                  : (isRTL ? 'إضافة موظف جديد' : 'Add New Employee')}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isRTL ? 'الاسم الكامل *' : 'Full Name *'}
                </label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isRTL ? 'رقم الهاتف' : 'Phone'}
                </label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isRTL ? 'البريد الإلكتروني' : 'Email'}
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isRTL ? 'رقم الهوية' : 'National ID'}
                </label>
                <input
                  type="text"
                  value={formData.national_id}
                  onChange={(e) => setFormData({ ...formData, national_id: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isRTL ? 'المنصب' : 'Position'}
                </label>
                <input
                  type="text"
                  value={formData.position}
                  onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isRTL ? 'القسم' : 'Department'}
                </label>
                <input
                  type="text"
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isRTL ? 'الفرع' : 'Branch'}
                </label>
                <select
                  value={formData.branch_id}
                  onChange={(e) => setFormData({ ...formData, branch_id: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">{isRTL ? 'اختر الفرع' : 'Select Branch'}</option>
                  {branches.map(branch => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isRTL ? 'تاريخ التوظيف' : 'Hire Date'}
                </label>
                <input
                  type="date"
                  value={formData.hire_date}
                  onChange={(e) => setFormData({ ...formData, hire_date: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isRTL ? 'الراتب الأساسي' : 'Basic Salary'}
                </label>
                <input
                  type="number"
                  value={formData.basic_salary}
                  onChange={(e) => setFormData({ ...formData, basic_salary: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  min="0"
                  step="0.01"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isRTL ? 'نسبة العمولة %' : 'Commission Rate %'}
                </label>
                <input
                  type="number"
                  value={formData.commission_rate}
                  onChange={(e) => setFormData({ ...formData, commission_rate: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  min="0"
                  max="100"
                  step="0.1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isRTL ? 'نوع العقد' : 'Employment Type'}
                </label>
                <select
                  value={formData.employment_type}
                  onChange={(e) => setFormData({ ...formData, employment_type: e.target.value as any })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                >
                  <option value="full_time">{isRTL ? 'دوام كامل' : 'Full Time'}</option>
                  <option value="part_time">{isRTL ? 'دوام جزئي' : 'Part Time'}</option>
                  <option value="contract">{isRTL ? 'عقد' : 'Contract'}</option>
                </select>
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    {isRTL ? 'موظف نشط' : 'Active Employee'}
                  </span>
                </label>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isRTL ? 'ملاحظات' : 'Notes'}
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  rows={3}
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium"
              >
                {isRTL ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={handleSaveEmployee}
                className="flex-1 px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition font-medium flex items-center justify-center gap-2"
              >
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
              <h3 className="text-xl font-bold text-gray-900">
                {isRTL ? 'دفع راتب' : 'Pay Salary'}
              </h3>
              <button onClick={() => setShowSalaryModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isRTL ? 'الموظف *' : 'Employee *'}
                </label>
                <select
                  value={salaryForm.employee_id}
                  onChange={(e) => {
                    const empId = e.target.value;
                    const emp = employees.find(e => e.id === empId);
                    setSalaryForm({
                      ...salaryForm,
                      employee_id: empId,
                      basic_amount: emp?.basic_salary || 0,
                    });
                  }}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  required
                >
                  <option value="">{isRTL ? 'اختر موظف' : 'Select Employee'}</option>
                  {employees.filter(e => e.is_active).map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isRTL ? 'من تاريخ' : 'Period Start'}
                </label>
                <input
                  type="date"
                  value={salaryForm.period_start}
                  onChange={(e) => setSalaryForm({ ...salaryForm, period_start: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isRTL ? 'إلى تاريخ' : 'Period End'}
                </label>
                <input
                  type="date"
                  value={salaryForm.period_end}
                  onChange={(e) => setSalaryForm({ ...salaryForm, period_end: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isRTL ? 'الراتب الأساسي' : 'Basic Amount'}
                </label>
                <input
                  type="number"
                  value={salaryForm.basic_amount}
                  onChange={(e) => setSalaryForm({ ...salaryForm, basic_amount: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  min="0"
                  step="0.01"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isRTL ? 'العمولات' : 'Commissions'}
                </label>
                <input
                  type="number"
                  value={salaryForm.commission_amount}
                  onChange={(e) => setSalaryForm({ ...salaryForm, commission_amount: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  min="0"
                  step="0.01"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isRTL ? 'المكافآت' : 'Bonus'}
                </label>
                <input
                  type="number"
                  value={salaryForm.bonus}
                  onChange={(e) => setSalaryForm({ ...salaryForm, bonus: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  min="0"
                  step="0.01"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isRTL ? 'الخصومات' : 'Deductions'}
                </label>
                <input
                  type="number"
                  value={salaryForm.deductions}
                  onChange={(e) => setSalaryForm({ ...salaryForm, deductions: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  min="0"
                  step="0.01"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isRTL ? 'طريقة الدفع' : 'Payment Method'}
                </label>
                <select
                  value={salaryForm.payment_method}
                  onChange={(e) => setSalaryForm({ ...salaryForm, payment_method: e.target.value as any })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                >
                  <option value="cash">{isRTL ? 'نقدي' : 'Cash'}</option>
                  <option value="bank_transfer">{isRTL ? 'تحويل بنكي' : 'Bank Transfer'}</option>
                  <option value="check">{isRTL ? 'شيك' : 'Check'}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isRTL ? 'تاريخ الدفع' : 'Payment Date'}
                </label>
                <input
                  type="date"
                  value={salaryForm.payment_date}
                  onChange={(e) => setSalaryForm({ ...salaryForm, payment_date: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isRTL ? 'ملاحظات' : 'Notes'}
                </label>
                <textarea
                  value={salaryForm.notes}
                  onChange={(e) => setSalaryForm({ ...salaryForm, notes: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  rows={2}
                />
              </div>

              <div className="md:col-span-2 bg-teal-50 border border-teal-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">
                    {isRTL ? 'الإجمالي:' : 'Total:'}
                  </span>
                  <span className="text-2xl font-bold text-teal-600">
                    {(
                      salaryForm.basic_amount +
                      salaryForm.commission_amount +
                      salaryForm.bonus -
                      salaryForm.deductions
                    ).toLocaleString()} {isRTL ? 'ر.س' : 'SAR'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowSalaryModal(false)}
                className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium"
              >
                {isRTL ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={handlePaySalary}
                disabled={!salaryForm.employee_id || !salaryForm.period_start || !salaryForm.period_end}
                className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium flex items-center justify-center gap-2 disabled:opacity-50"
              >
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
