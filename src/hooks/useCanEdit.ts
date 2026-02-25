import { useAuth } from '../contexts/AuthContext';
import type { Section, Action } from '../lib/permissions';

export function useCanEdit(section?: Section) {
  const { can } = useAuth();
  if (!section) return can('sales', 'edit');
  return can(section, 'edit');
}

export function useCan(section: Section, action: Action): boolean {
  const { can } = useAuth();
  return can(section, action);
}
