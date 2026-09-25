import { useCallback } from 'react';
import { useQuery, useAction } from '../../hooks/useApi';
import { listFindings, submitFinding, closeFinding, type SubmitFindingInput } from '../../api/findings';

export function useFindings(groupId: string, status?: 'open' | 'closed') {
  const fn = useCallback(() => listFindings(groupId, status), [groupId, status]);
  return useQuery(fn, [groupId, status], { table: 'audit_findings', filter: `group_id=eq.${groupId}` });
}

export function useSubmitFinding(groupId: string) {
  return useAction((input: SubmitFindingInput) => submitFinding(groupId, input));
}

export function useCloseFinding(groupId: string) {
  return useAction((findingId: string, status: 'resolved' | 'dismissed', note?: string) => closeFinding(groupId, findingId, status, note));
}
