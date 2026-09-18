import { useCallback } from 'react';
import { useQuery, useAction } from '../../hooks/useApi';
import {
  listCycles,
  createCycle,
  activateCycle,
  closeCycle,
  selectActiveCycle,
  getCycleProgress,
  type CreateCycleInput,
} from '../../api/cycles';

/** All cycles for a group, newest first. */
export function useCycles(groupId: string) {
  const fn = useCallback(() => listCycles(groupId), [groupId]);
  return useQuery(fn, [groupId], { table: 'cycles', filter: `group_id=eq.${groupId}` });
}

/** The group's single active cycle (or null). Wraps useCycles. */
export function useActiveCycle(groupId: string) {
  const { data, loading, error, refetch } = useCycles(groupId);
  return {
    cycle: data ? selectActiveCycle(data) : null,
    loading,
    error,
    refetch,
  };
}

/** Expected vs collected contributions for a cycle. Safe to call with no cycleId yet. */
export function useCycleProgress(groupId: string, cycleId?: string) {
  const fn = useCallback(
    () => (cycleId ? getCycleProgress(groupId, cycleId) : Promise.resolve(null)),
    [groupId, cycleId],
  );
  return useQuery(
    fn,
    [groupId, cycleId],
    cycleId ? { table: 'contributions', filter: `cycle_id=eq.${cycleId}` } : null,
  );
}

export function useCreateCycle(groupId: string) {
  return useAction((input: CreateCycleInput) => createCycle(groupId, input));
}

export function useActivateCycle(groupId: string) {
  return useAction((cycleId: string) => activateCycle(groupId, cycleId));
}

export function useCloseCycle(groupId: string) {
  return useAction((cycleId: string) => closeCycle(groupId, cycleId));
}