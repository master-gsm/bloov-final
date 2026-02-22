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
      setCurrentBranch(null);
      setCurrentBranchId(null);
      setIsAdmin(false);
      setAllBranches([]);
      setLoading(false);
      return;
    }

    try {
      const { data: userData } = await supabase
        .from('users')
        .select('branch_id, role')
        .eq('id', user.id)
        .maybeSingle();

      const admin = userData?.role === 'admin';
      setIsAdmin(admin);

      if (admin) {
        const { data: branches } = await supabase
          .from('branches')
          .select('id, name, name_ar, code, location, city, is_active')
          .eq('is_active', true)
          .order('name');
        setAllBranches((branches as Branch[]) || []);
        setCurrentBranchId(null);
        setCurrentBranch(null);
      } else if (userData?.branch_id) {
        setCurrentBranchId(userData.branch_id);

        const { data: branch } = await supabase
          .from('branches')
          .select('id, name, name_ar, code, location, city, is_active')
          .eq('id', userData.branch_id)
          .maybeSingle();

        setCurrentBranch(branch as Branch);
        setAllBranches(branch ? [branch as Branch] : []);
        setSelectedBranchFilter(userData.branch_id);
      }
    } catch (err) {
      console.error('Error loading branch data:', err);
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
