import { useEffect, useState, useCallback } from 'react';
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

export function useAlerts() {
  const { profile } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAlerts = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('fn_get_alerts' as any, {
        p_role: profile.role,
      } as any);
      if (!error && data) {
        const sorted = (data as Alert[]).sort(
          (a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3)
        );
        setAlerts(sorted);
      }
    } catch (err) {
      console.error('[useAlerts] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  const criticalCount = alerts.filter(a => a.severity === 'urgent' || a.severity === 'critical').length;
  const totalCount = alerts.length;

  return { alerts, loading, criticalCount, totalCount, refresh: fetchAlerts };
}
