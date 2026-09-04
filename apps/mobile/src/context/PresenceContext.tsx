/**
 * context/PresenceContext.tsx
 * ----------------------------------------------------------------------------
 * Real "who's active now" for the current group — a Supabase Realtime
 * Presence channel, not a DB column. Tracked for as long as the member has
 * any screen open under [groupId] (see [groupId]/_layout.tsx, which mounts
 * <PresenceProvider> once for the whole group). Presence reflects an actual
 * live socket connection, so a name shown here really does have the app open
 * right now — there's no "last_seen" timestamp anywhere to fake this from.
 *
 *   const present = usePresentMembers(); // everyone (incl. you) active now
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { useActiveGroup } from './GroupContext';
import type { GroupRole } from '../constants/roles';

export interface PresentMember {
  member_id: string;
  full_name: string | null;
  role: GroupRole | null;
}

const PresenceContext = createContext<PresentMember[]>([]);

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { member } = useAuth();
  const { groupId, role } = useActiveGroup();
  const [present, setPresent] = useState<PresentMember[]>([]);

  useEffect(() => {
    if (!groupId || !member) {
      setPresent([]);
      return;
    }

    const channel = supabase.channel(`presence:group:${groupId}`, {
      config: { presence: { key: member.id } },
    });

    function sync() {
      const state = channel.presenceState<PresentMember>();
      // presenceState groups by key -> array of tracked payloads (one per
      // device); collapse to one row per member so two tabs/devices for the
      // same person don't double-count as "2 active now".
      const seen = new Map<string, PresentMember>();
      Object.values(state).forEach((entries) => {
        entries.forEach((e) => seen.set(e.member_id, e));
      });
      setPresent(Array.from(seen.values()));
    }

    channel.on('presence', { event: 'sync' }, sync);
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ member_id: member.id, full_name: member.full_name, role });
      }
    });

    return () => {
      setPresent([]);
      supabase.removeChannel(channel);
    };
  }, [groupId, member?.id, role]);

  return <PresenceContext.Provider value={present}>{children}</PresenceContext.Provider>;
}

/** Everyone (including you) currently present somewhere in this group. */
export function usePresentMembers(): PresentMember[] {
  return useContext(PresenceContext);
}
