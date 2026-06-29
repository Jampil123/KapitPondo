/**
 * features/cycles/cycles.hooks.ts
 * ----------------------------------------------------------------------------
 * Hooks for the cycle lifecycle (M4). `useActiveCycle` is the one the
 * contribution submit screen needs — it resolves the cycle_id to attach to.
 *
 *   const { cycle: activeCycle, loading } = useActiveCycle(groupId);
 *   // then: submit({ cycle_id: activeCycle.id, amount, ... })
 *
 *   const { run: activate, error } = useActivateCycle(groupId);
 *   const ok = await activate(cycle.id);   // error if a cycle is already active
 */
import { useCallback } from 'react';
import { useQuery, useAction } from '../../hooks/useApi';
import {
  listCycles,
  createCycle,
  activateCycle,
  closeCycle,
  selectActiveCycle,
  type CreateCycleInput,
} from '../../api/cycles';

/** All cycles for a group, newest first. */
export function useCycles(groupId: string) {
  const fn = useCallback(() => listCycles(groupId), [groupId]);
  return useQuery(fn, [groupId]);
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

export function useCreateCycle(groupId: string) {
  return useAction((input: CreateCycleInput) => createCycle(groupId, input));
}

export function useActivateCycle(groupId: string) {
  return useAction((cycleId: string) => activateCycle(groupId, cycleId));
}

export function useCloseCycle(groupId: string) {
  return useAction((cycleId: string) => closeCycle(groupId, cycleId));
}