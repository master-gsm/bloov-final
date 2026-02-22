import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

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
  currentBranchId: string | null;
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

  const loadBranchData = async () => {
    if (!user) {
      console.log('[BranchContext] No user — resetting state');
      setCurrentBranch(null);
      setCurrentBranchId(null);
      setIsAdmin(false);
      setAllBranches([]);
      setLoading(false);
      return;
    }

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
        console.warn('[BranchContext] userData is null — RLS may be blocking access or user not in users table. Falling back to no-branch mode.');
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

        console.log('[BranchContext] branches fetched for admin:', branches?.length ?? 0, 'rows');
        setAllBranches((branches as Branch[]) || []);

        const adminBranchId = userData.branch_id || null;
        setCurrentBranchId(adminBranchId);
        setCurrentBranch(null);
        console.log('[BranchContext] admin → currentBranchId set to:', adminBranchId);

        if (!adminBranchId) {
          console.warn('[BranchContext] Admin has NO branch_id in users table! RLS on branch-isolated tables will block all data.');
        }
      } else if (userData.branch_id) {
        setCurrentBranchId(userData.branch_id);
        console.log('[BranchContext] non-admin → currentBranchId set to:', userData.branch_id);

        const { data: branch, error: bErr } = await supabase
          .from('branches')
          .select('id, name, name_ar, code, location, city, is_active')
          .eq('id', userData.branch_id)
          .maybeSingle();

        if (bErr) console.error('[BranchContext] ERROR reading single branch:', bErr);

        setCurrentBranch(branch as Branch);
        setAllBranches(branch ? [branch as Branch] : []);
        setSelectedBranchFilter(userData.branch_id);
      } else {
        console.warn('[BranchContext] Non-admin user has NO branch_id — all branch-filtered queries will return empty!');
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

  return (
    <BranchContext.Provider value={{
      currentBranch,
      currentBranchId,
      isAdmin,
      allBranches,
      selectedBranchFilter,
      setSelectedBranchFilter,
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
