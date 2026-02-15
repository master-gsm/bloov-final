import { useAuth } from '../contexts/AuthContext';

export function useCanEdit() {
  const { profile } = useAuth();

  return profile?.role !== 'viewer' && profile?.role !== 'observer';
}
