import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useAuth } from './AuthContext';
import { listMyGroups, type MyGroup, type Group } from '../api/groups';
import { isOfficer, type GroupRole } from '../constants/roles';

interface GroupContextValue {
  groups: MyGroup[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  getById: (groupId: string | undefined) => MyGroup | null;
}

const GroupContext = createContext<GroupContextValue | undefined>(undefined);

export function GroupProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const [groups, setGroups] = useState<MyGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (status !== 'signedIn') {
      setGroups([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setGroups(await listMyGroups());
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    if (status === 'signedIn') refresh();
    else setGroups([]);
  }, [status, refresh]);

  const getById = useCallback(
    (groupId: string | undefined) => groups.find((g) => g.groups.id === groupId) ?? null,
    [groups],
  );

  return (
    <GroupContext.Provider value={{ groups, loading, error, refresh, getById }}>
      {children}
    </GroupContext.Provider>
  );
}

export function useGroups(): GroupContextValue {
  const ctx = useContext(GroupContext);
  if (!ctx) throw new Error('useGroups must be used within <GroupProvider>');
  return ctx;
}

interface ActiveGroup {
  groupId: string | undefined;
  membership: MyGroup | null;
  group: Group | null;
  role: GroupRole | null;
  isMyOfficerRole: boolean;
}

/** Active group derived from the [groupId] route param. */
export function useActiveGroup(): ActiveGroup {
  const { getById } = useGroups();
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  const membership = getById(groupId);
  const role = membership?.role ?? null;
  return {
    groupId,
    membership,
    group: membership?.groups ?? null,
    role,
    isMyOfficerRole: isOfficer(role),
  };
}
