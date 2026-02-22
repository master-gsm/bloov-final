import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { AlertTriangle } from 'lucide-react';

interface Branch {
  id: string;
  name: string;
  name_ar?: string;
  code: string;
  location?: string;
  city?: string;
  is_active: boolean;
}

interface BranchContextType {
  currentBranch: Branch | null;
  currentBranchId: string;
  isAdmin: boolean;
  allBranches: Branch[];
  selectedBranchFilter: string | null;
  setSelectedBranchFilter: (id: string | null) => void;
  loading: boolean;
  refetch: () => Promise<void>;
}

const BranchContext = createContext<BranchContextType | undefined>(undefined);

export function BranchProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [currentBranch, setCurrentBranch] = useState<Branch | null>(null);
  const [currentBranchId, setCurrentBranchId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [allBranches, setAllBranches] = useState<Branch[]>([]);
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [branchError, setBranchError] = useState<string | null>(null);

  const loadBranchData = async () => {
    if (!user) {
      console.log('[BranchContext] No user — resetting state');
      setCurrentBranch(null);
      setCurrentBranchId(null);
      setIsAdmin(false);
      setAllBranches([]);
      setBranchError(null);
      setLoading(false);
      return;
    }
    setBranchError(null);

    console.log('[BranchContext] Loading branch data for user.id:', user.id);

    try {
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('branch_id, role')
        .eq('id', user.id)
        .maybeSingle();

      if (userError) {
        console.error('[BranchContext] ERROR reading users table:', userError);
      }

      console.log('[BranchContext] userData from DB:', userData);
      console.log('[BranchContext] user.role:', userData?.role ?? 'NULL — users table returned nothing');
      console.log('[BranchContext] user.branch_id:', userData?.branch_id ?? 'NULL');

      if (!userData) {
        console.warn('[BranchContext] userData is null — RLS may be blocking access or user not in users table.');
        setBranchError('لا يمكن تحديد بيانات المستخدم. يرجى التواصل مع المسؤول.');
        setLoading(false);
        return;
      }

      const admin = userData.role === 'admin';
      setIsAdmin(admin);

      if (admin) {
        const { data: branches, error: branchError } = await supabase
          .from('branches')
          .select('id, name, name_ar, code, location, city, is_active')
          .eq('is_active', true)
          .order('name');

        if (branchError) {
          console.error('[BranchContext] ERROR reading branches table:', branchError);
        }

        const branchList = (branches as Branch[]) || [];
        console.log('[BranchContext] branches fetched for admin:', branchList.length, 'rows');
        setAllBranches(branchList);

        const adminBranchId = userData.branch_id || (branchList[0]?.id ?? null);
        if (!adminBranchId) {
          setBranchError('لا يوجد فرع نشط في النظام. يرجى إنشاء فرع أولاً قبل الدخول.');
          setLoading(false);
          return;
        }
        setCurrentBranchId(adminBranchId);
        setCurrentBranch(null);
        console.log('[BranchContext] admin → currentBranchId set to:', adminBranchId);
      } else if (userData.branch_id) {
        setCurrentBranchId(userData.branch_id);
        console.log('[BranchContext] non-admin → currentBranchId set to:', userData.branch_id);

        const { data: branch, error: bErr } = await supabase
          .from('branches')
          .select('id, name, code, location, city, is_active')
          .eq('id', userData.branch_id)
          .maybeSingle();

        if (bErr) console.error('[BranchContext] ERROR reading single branch:', bErr);

        setCurrentBranch(branch as Branch);
        setAllBranches(branch ? [branch as Branch] : []);
        setSelectedBranchFilter(userData.branch_id);
      } else {
        console.warn('[BranchContext] Non-admin user has NO branch_id.');
        setBranchError('لم يتم تعيين فرع لهذا المستخدم. يرجى التواصل مع المسؤول لتعيين الفرع.');
        setLoading(false);
        return;
      }
    } catch (err) {
      console.error('[BranchContext] Unexpected error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBranchData();
  }, [user]);

  const handleSetSelectedBranchFilter = (id: string | null) => {
    setSelectedBranchFilter(id);
    if (isAdmin && id !== null) {
      setCurrentBranchId(id);
    }
  };

  if (!loading && branchError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-red-100 rounded-full p-4">
              <AlertTriangle className="w-10 h-10 text-red-600" />
            </div>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">تعذّر تحديد الفرع</h2>
          <p className="text-gray-600 mb-6">{branchError}</p>
          <button
            onClick={() => { setBranchError(null); loadBranchData(); }}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
          >
            إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  return (
    <BranchContext.Provider value={{
      currentBranch,
      currentBranchId: currentBranchId as string,
      isAdmin,
      allBranches,
      selectedBranchFilter,
      setSelectedBranchFilter: handleSetSelectedBranchFilter,
      loading,
      refetch: loadBranchData,
    }}>
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch() {
  const context = useContext(BranchContext);
  if (context === undefined) {
    throw new Error('useBranch must be used within a BranchProvider');
  }
  return context;
}
