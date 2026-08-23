/**
 * features/contributions/contributions.hooks.ts
 * ----------------------------------------------------------------------------
 * The hooks screens import for the contributions flow (M5). They wrap the API
 * module with the useQuery/useAction loading+error handling so screens stay
 * declarative.
 *
 *   // List screen
 *   const { data: contributions, loading, error, refetch } = useContributions(groupId, { status });
 *
 *   // Submit screen (member or treasurer)
 *   const { run: submit, loading } = useSubmitContribution(groupId);
 *   const res = await submit({ cycle_id, amount: toAmountString(input)!, payment_method, proof_url });
 *   if (res) refetch?.();
 *
 *   // Approve / reject (officer) — call refetch after to refresh the list
 *   const { run: approve, loading, error } = useApproveContribution(groupId);
 *   const ok = await approve(contributionId);   // error.status / error.message on SoD violation
 */
import { useCallback } from 'react';
import { useQuery, useAction } from '../../hooks/useApi';
import {
  listContributions,
  submitContribution,
  approveContribution,
  rejectContribution,
  type ContributionFilters,
  type SubmitContributionInput,
} from '../../api/contributions';

/** List contributions for a group, re-fetching when group or filters change. */
export function useContributions(groupId: string, filters: ContributionFilters = {}) {
  const fn = useCallback(
    () => listContributions(groupId, filters),
    // depend on the primitive filter values, not the object identity
    [groupId, filters.status, filters.cycle_id, filters.membership_id],
  );
  return useQuery(
    fn,
    [groupId, filters.status, filters.cycle_id, filters.membership_id],
    { table: 'contributions', filter: `group_id=eq.${groupId}` },
  );
}

export function useSubmitContribution(groupId: string) {
  return useAction((input: SubmitContributionInput) => submitContribution(groupId, input));
}

export function useApproveContribution(groupId: string) {
  return useAction((contributionId: string) => approveContribution(groupId, contributionId));
}

export function useRejectContribution(groupId: string) {
  return useAction((contributionId: string, reason?: string) =>
    rejectContribution(groupId, contributionId, reason),
  );
}