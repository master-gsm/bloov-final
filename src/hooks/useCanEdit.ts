import { useAuth } from '../contexts/AuthContext';
import type { Section, Action } from '../lib/permissions';

export function useCanEdit() {
  const { can, isAdmin } = useAuth();
  return isAdmin || false;
}

export function useCan(section: Section, action: Action): boolean {
  const { can } = useAuth();
  return can(section, action);
}
