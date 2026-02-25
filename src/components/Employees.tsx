import { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Users, Plus, Edit2, Trash2, DollarSign, TrendingUp, Calendar,
  Search, X, Save, Loader2, AlertCircle, CheckCircle, Clock,
  CalendarDays, FileText, UserX, ShieldAlert,
} from 'lucide-react';
import { LeavesTab } from './hr/LeavesTab';
import { SettlementsTab } from './hr/SettlementsTab';
import { PayrollTab } from './hr/PayrollTab';
import { LoansTab } from './hr/LoansTab';
import { CommissionsPanel } from './hr/CommissionsPanel';
import type { Employee, Commission, EmployeeLeave, EmployeeSettlement, Loan, Tab } from './hr/types';

export function Employees() {
  const { language } = useLanguage();
  const { profile: userProfile, isAdmin } = useAuth();
  const isRTL = language === 'ar';

  const [activeTab, setActiveTab] = useState<Tab>('employees');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [leaves, setLeaves] = useState<EmployeeLeave[]>([]);
  const [settlements, setSettlements] = useState<EmployeeSettlement[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [residenceFilter, setResidenceFilter] = useState<'all' | 'valid' | 'expiring_soon' | 'expired'>('all');
  const [residenceStatuses, setResidenceStatuses] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
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
    iqama_number: '',
    iqama_issue_date: '',
    iqama_expiry_date: '',
    iqama_notes: '',
    termination_date: '',
    termination_reason: '',
    notes: '',
  };

  const [formData, setFormData] = useState(defaultForm);

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

        let statusQuery = supabase.from('v_employee_residence_status').select('*');
        if (!isAdmin && (userProfile as any)?.branch_id) {
          statusQuery = statusQuery.eq('branch_id', (userProfile as any).branch_id);
        }
        const { data: statusData } = await statusQuery;
        setResidenceStatuses((statusData || []) as any[]);

        const { data: branchData } = await supabase.from('branches').select('*').order('name');
        setBranches(branchData || []);
      } else if (activeTab === 'payroll') {
        if (branches.length === 0) {
          const { data: branchData } = await supabase.from('branches').select('*').order('name');
          setBranches(branchData || []);
        }
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
      } else if (activeTab === 'loans') {
        if (employees.length === 0) {
          const { data: empData } = await supabase.from('employees').select('*, branches(name)').order('created_at', { ascending: false });
          setEmployees((empData || []) as any[]);
        }
        const { data } = await supabase
          .from('employee_loans')
          .select('*, employees(full_name)')
          .order('created_at', { ascending: false });
        setLoans((data || []) as any[]);
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
        iqama_number: formData.iqama_number || null,
        iqama_issue_date: formData.iqama_issue_date || null,
        iqama_expiry_date: formData.iqama_expiry_date || null,
        iqama_notes: formData.iqama_notes || null,
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
      iqama_number: (employee as any).iqama_number || '',
      iqama_issue_date: (employee as any).iqama_issue_date || '',
      iqama_expiry_date: (employee as any).iqama_expiry_date || '',
      iqama_notes: (employee as any).iqama_notes || '',
      termination_date: employee.termination_date || '',
      termination_reason: employee.termination_reason || '',
      notes: employee.notes || '',
    });
    setShowModal(true);
  };

  const getResidenceStatus = (empId: string) => {
    return residenceStatuses.find(s => s.employee_id === empId);
  };

  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = emp.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.position?.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;
    if (residenceFilter === 'all') return true;

    const status = getResidenceStatus(emp.id);
    return status?.residence_status === residenceFilter;
  });

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
    { key: 'payroll',     labelAr: 'مسير الرواتب', labelEn: 'Payroll',     icon: <DollarSign className="w-4 h-4" /> },
    { key: 'commissions', labelAr: 'العمولات',    labelEn: 'Commissions',  icon: <TrendingUp className="w-4 h-4" /> },
    { key: 'loans',       labelAr: 'السلف',       labelEn: 'Loans',        icon: <FileText className="w-4 h-4" /> },
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
          <div className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder={isRTL ? 'بحث عن موظف...' : 'Search employee...'}
                className="w-full pr-10 pl-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div className="flex gap-2">
              {[
                { key: 'all', labelAr: 'الكل', labelEn: 'All' },
                { key: 'valid', labelAr: 'سارية', labelEn: 'Valid' },
                { key: 'expiring_soon', labelAr: 'تنتهي قريباً', labelEn: 'Expiring Soon' },
                { key: 'expired', labelAr: 'منتهية', labelEn: 'Expired' },
              ].map(filter => (
                <button
                  key={filter.key}
                  onClick={() => setResidenceFilter(filter.key as any)}
                  className={`px-4 py-2.5 text-sm font-medium rounded-lg transition whitespace-nowrap ${
                    residenceFilter === filter.key
                      ? 'bg-teal-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {isRTL ? filter.labelAr : filter.labelEn}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {[
                      isRTL ? 'الاسم' : 'Name',
                      isRTL ? 'المنصب' : 'Position',
                      isRTL ? 'الفرع' : 'Branch',
                      isRTL ? 'رقم الإقامة' : 'Iqama #',
                      isRTL ? 'انتهاء الإقامة' : 'Iqama Expiry',
                      isRTL ? 'الأيام المتبقية' : 'Days Left',
                      isRTL ? 'حالة الإقامة' : 'Status',
                      isRTL ? 'الراتب' : 'Salary',
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
                  ) : filteredEmployees.map(emp => {
                    const resStatus = getResidenceStatus(emp.id);
                    return (
                    <tr key={emp.id} className={`hover:bg-gray-50 ${emp.termination_date ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        <div className="flex items-center gap-2">
                          {emp.termination_date && <UserX className="w-3.5 h-3.5 text-red-500" />}
                          <span className="font-medium">{emp.full_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{emp.position}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{emp.branches?.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600" dir="ltr">
                        {resStatus?.iqama_number || <span className="text-gray-400">-</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {resStatus?.iqama_expiry_date
                          ? new Date(resStatus.iqama_expiry_date).toLocaleDateString(isRTL ? 'ar-SA' : 'en-US')
                          : <span className="text-gray-400">-</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {resStatus?.days_to_expiry !== null && resStatus?.days_to_expiry !== undefined ? (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${
                            resStatus.residence_status === 'expired'
                              ? 'bg-red-100 text-red-700'
                              : resStatus.residence_status === 'expiring_soon'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-green-100 text-green-700'
                          }`}>
                            {resStatus.residence_status === 'expired' && <ShieldAlert className="w-3 h-3" />}
                            {resStatus.residence_status === 'expired'
                              ? (isRTL ? `منتهية منذ ${Math.abs(resStatus.days_to_expiry)} يوم` : `Expired ${Math.abs(resStatus.days_to_expiry)}d ago`)
                              : (isRTL ? `${resStatus.days_to_expiry} يوم` : `${resStatus.days_to_expiry}d`)
                            }
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {resStatus?.residence_status && resStatus.residence_status !== 'no_data' ? (
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                            resStatus.residence_status === 'expired'
                              ? 'bg-red-100 text-red-700'
                              : resStatus.residence_status === 'expiring_soon'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-green-100 text-green-700'
                          }`}>
                            {resStatus.residence_status === 'expired'
                              ? (isRTL ? 'منتهية' : 'Expired')
                              : resStatus.residence_status === 'expiring_soon'
                                ? (isRTL ? 'تنتهي قريباً' : 'Expiring')
                                : (isRTL ? 'سارية' : 'Valid')
                            }
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {(emp.basic_salary ?? 0).toLocaleString()} {isRTL ? 'ر.س' : 'SAR'}
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
                  );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'payroll' && (
        <PayrollTab
          isRTL={isRTL}
          userProfile={userProfile}
          branches={branches}
        />
      )}

      {activeTab === 'commissions' && (
        <CommissionsPanel isRTL={isRTL} commissions={commissions} loading={loading} />
      )}

      {activeTab === 'loans' && (
        <LoansTab
          isRTL={isRTL}
          loans={loans}
          employees={employees}
          userProfile={userProfile}
          loading={loading}
          onRefresh={loadData}
        />
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
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'رقم الإقامة' : 'Residence Number (Iqama)'}</label>
                <input type="text" value={formData.iqama_number} onChange={e => setFormData({ ...formData, iqama_number: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500" dir="ltr" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'تاريخ إصدار الإقامة' : 'Iqama Issue Date'}</label>
                <input type="date" value={formData.iqama_issue_date} onChange={e => setFormData({ ...formData, iqama_issue_date: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'تاريخ انتهاء الإقامة' : 'Iqama Expiry Date'}</label>
                <input type="date" value={formData.iqama_expiry_date} onChange={e => setFormData({ ...formData, iqama_expiry_date: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isRTL ? 'ملاحظات الإقامة' : 'Iqama Notes'}</label>
                <input type="text" value={formData.iqama_notes} onChange={e => setFormData({ ...formData, iqama_notes: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500" />
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

    </div>
  );
}
