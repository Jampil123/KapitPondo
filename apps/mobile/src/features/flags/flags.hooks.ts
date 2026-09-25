import { useCallback } from 'react';
import { useQuery, useAction } from '../../hooks/useApi';
import { listFlags, getFlag, closeFlag } from '../../api/flags';

export function useFlags(groupId: string, status?: 'open' | 'closed') {
  const fn = useCallback(() => listFlags(groupId, status), [groupId, status]);
  return useQuery(fn, [groupId, status], { table: 'audit_flags', filter: `group_id=eq.${groupId}` });
}

export function useFlag(groupId: string, flagId: string) {
  const fn = useCallback(() => getFlag(groupId, flagId), [groupId, flagId]);
  return useQuery(fn, [groupId, flagId], { table: 'audit_flags', filter: `id=eq.${flagId}` });
}

export function useCloseFlag(groupId: string) {
  return useAction((flagId: string, status: 'resolved' | 'dismissed', note?: string) => closeFlag(groupId, flagId, status, note));
}
