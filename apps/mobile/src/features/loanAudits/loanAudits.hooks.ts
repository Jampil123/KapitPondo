import { useCallback } from 'react';
import { useQuery } from '../../hooks/useApi';
import { listLoanAudits, getLoanAudit } from '../../api/loanAudits';

export function useLoanAudits(groupId: string) {
  const fn = useCallback(() => listLoanAudits(groupId), [groupId]);
  return useQuery(fn, [groupId], { table: 'loans', filter: `group_id=eq.${groupId}` });
}

export function useLoanAudit(groupId: string, loanId: string) {
  const fn = useCallback(() => getLoanAudit(groupId, loanId), [groupId, loanId]);
  return useQuery(fn, [groupId, loanId], { table: 'loans', filter: `id=eq.${loanId}` });
}
