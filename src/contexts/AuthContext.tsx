import React, { createContext, useContext, useEffect, useState, useRef, useMemo } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface UserProfile {
  role: 'admin' | 'accountant' | 'viewer' | 'salesperson' | 'observer' | 'cashier' | 'manager' | 'employee';
  permissions: Record<string, boolean>;
  branch_id: string | null;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  hasPermission: (key: string) => boolean;
  isAdmin: boolean;
  isViewer: boolean;
  branchId: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const loadingProfileRef = useRef<string | null>(null);

  const loadProfile = async (userId: string) => {
    if (loadingProfileRef.current === userId) return;
    loadingProfileRef.current = userId;

    try {
      const { data } = await supabase
        .from('users')
        .select('role, permissions, branch_id')
        .eq('id', userId)
        .maybeSingle();

      if (data) {
        setProfile({
          role: data.role as UserProfile['role'],
          permissions: (data.permissions || {}) as unknown as Record<string, boolean>,
          branch_id: data.branch_id || null,
        });
      }
    } finally {
      loadingProfileRef.current = null;
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user.id).then(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        const newUser = session?.user ?? null;
        setUser(newUser);
        if (newUser) {
          await loadProfile(newUser.id);
        } else {
          setProfile(null);
        }
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const isAdmin = profile?.role === 'admin';
  const isViewer = profile?.role === 'viewer';
  const branchId = profile?.branch_id ?? null;

  const hasPermission = (key: string): boolean => {
    if (profile?.role === 'admin') return true;
    return profile?.permissions?.[key] === true;
  };

  const value = useMemo(() => ({
    user,
    profile,
    loading,
    signIn,
    signUp,
    signOut,
    hasPermission,
    isAdmin,
    isViewer,
    branchId,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [user, profile, loading]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
