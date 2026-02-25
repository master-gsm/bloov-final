import React, { createContext, useContext, useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { PermissionsMap, emptyPermissions, ROLE_TEMPLATES, Section, Action } from '../lib/permissions';

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
  can: (section: Section, action: Action) => boolean;
  sectionPermissions: PermissionsMap;
  isAdmin: boolean;
  isViewer: boolean;
  branchId: string | null;
  reloadPermissions: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [sectionPermissions, setSectionPermissions] = useState<PermissionsMap>(emptyPermissions());
  const [loading, setLoading] = useState(true);
  const loadingProfileRef = useRef<string | null>(null);

  const loadGranularPermissions = async (userId: string, role: string) => {
    const { data, error } = await supabase
      .from('user_permissions')
      .select('section, can_view, can_create, can_edit, can_delete')
      .eq('user_id', userId);

    if (error || !data || data.length === 0) {
      setSectionPermissions(ROLE_TEMPLATES[role] || emptyPermissions());
      return;
    }

    const perms = emptyPermissions();
    for (const row of data) {
      const s = row.section as Section;
      if (perms[s]) {
        perms[s] = {
          view: row.can_view ?? false,
          create: row.can_create ?? false,
          edit: row.can_edit ?? false,
          delete: row.can_delete ?? false,
        };
      }
    }
    setSectionPermissions(perms);
  };

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
        const role = data.role as UserProfile['role'];
        setProfile({
          role,
          permissions: (data.permissions || {}) as unknown as Record<string, boolean>,
          branch_id: data.branch_id || null,
        });
        await loadGranularPermissions(userId, role);
      }
    } finally {
      loadingProfileRef.current = null;
    }
  };

  const reloadPermissions = useCallback(async () => {
    if (user && profile) {
      await loadGranularPermissions(user.id, profile.role);
    }
  }, [user, profile]);

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
          setSectionPermissions(emptyPermissions());
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
    return profile?.permissions?.[key] === true;
  };

  const can = useCallback((section: Section, action: Action): boolean => {
    const sp = sectionPermissions[section];
    if (!sp) return false;
    return sp[action] ?? false;
  }, [sectionPermissions]);

  const value = useMemo(() => ({
    user,
    profile,
    loading,
    signIn,
    signUp,
    signOut,
    hasPermission,
    can,
    sectionPermissions,
    isAdmin,
    isViewer,
    branchId,
    reloadPermissions,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [user, profile, loading, sectionPermissions, can, reloadPermissions]);

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
