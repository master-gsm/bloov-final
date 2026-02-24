import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export interface Alert {
  alert_id: string;
  type: string;
  severity: 'info' | 'warning' | 'critical' | 'urgent';
  title: string;
  title_ar: string;
  message: string;
  message_ar: string;
  reference_type: string;
  reference_id: string;
  created_at: string;
}

const SEVERITY_ORDER: Record<string, number> = { urgent: 0, critical: 1, warning: 2, info: 3 };
const MAX_CONSECUTIVE_ERRORS = 3;
const POLL_INTERVAL_MS = 5 * 60 * 1000;

export function useAlerts() {
  const { profile } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);
  const consecutiveErrorsRef = useRef(0);
  const pollingStoppedRef = useRef(false);
  const lastRoleRef = useRef<string | null>(null);

  const fetchAlerts = useCallback(async () => {
    if (!profile) return;
    if (pollingStoppedRef.current) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('fn_get_alerts' as any, {
        p_role: profile.role,
      } as any);

      if (error) {
        consecutiveErrorsRef.current += 1;
        if (consecutiveErrorsRef.current >= MAX_CONSECUTIVE_ERRORS) {
          pollingStoppedRef.current = true;
          console.warn('[useAlerts] Polling stopped after', MAX_CONSECUTIVE_ERRORS, 'consecutive errors:', error.message);
        }
        return;
      }

      consecutiveErrorsRef.current = 0;

      if (data) {
        const sorted = (data as Alert[]).sort(
          (a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3)
        );
        setAlerts(sorted);
      }
    } catch (err) {
      consecutiveErrorsRef.current += 1;
      if (consecutiveErrorsRef.current >= MAX_CONSECUTIVE_ERRORS) {
        pollingStoppedRef.current = true;
        console.warn('[useAlerts] Polling stopped after repeated failures');
      }
    } finally {
      setLoading(false);
    }
  }, [profile?.role]);

  useEffect(() => {
    if (profile?.role !== lastRoleRef.current) {
      lastRoleRef.current = profile?.role ?? null;
      consecutiveErrorsRef.current = 0;
      pollingStoppedRef.current = false;
    }

    if (!profile) return;

    fetchAlerts();

    const interval = setInterval(() => {
      if (!pollingStoppedRef.current) {
        fetchAlerts();
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [fetchAlerts]);

  const criticalCount = alerts.filter(a => a.severity === 'urgent' || a.severity === 'critical').length;
  const totalCount = alerts.length;

  return { alerts, loading, criticalCount, totalCount, refresh: fetchAlerts };
}
