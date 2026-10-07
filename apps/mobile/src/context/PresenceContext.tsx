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
    // No group or member: nothing to track (the previous run's cleanup has
    // already cleared the list).
    if (!groupId || !member) return;

    // Every member must join the same topic for presence to work, so it can't
    // be made unique. Removing a channel is async, though: if this effect
    // re-runs (navigating away and back, a role change) before the previous
    // channel is gone, supabase.channel() hands back that still-subscribed
    // channel and adding the presence listener throws "cannot add presence
    // callbacks ... after subscribe()". So clear any leftover channel on this
    // topic first, then create a fresh one.
    const name = `presence:group:${groupId}`;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const stale = supabase.getChannels().filter((c) => c.topic === `realtime:${name}`);
      await Promise.all(stale.map((c) => supabase.removeChannel(c)));
      if (cancelled) return;

      const ch = supabase.channel(name, { config: { presence: { key: member.id } } });
      channel = ch;

      ch.on('presence', { event: 'sync' }, () => {
        const state = ch.presenceState<PresentMember>();
        // presenceState groups by key -> array of tracked payloads (one per
        // device); collapse to one row per member so two tabs/devices for the
        // same person don't double-count as "2 active now".
        const seen = new Map<string, PresentMember>();
        Object.values(state).forEach((entries) => {
          entries.forEach((e) => seen.set(e.member_id, e));
        });
        setPresent(Array.from(seen.values()));
      });
      ch.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await ch.track({ member_id: member.id, full_name: member.full_name, role });
        }
      });
    })();

    return () => {
      cancelled = true;
      setPresent([]);
      if (channel) supabase.removeChannel(channel);
    };
  }, [groupId, member?.id, role]);

  return <PresenceContext.Provider value={present}>{children}</PresenceContext.Provider>;
}

/** Everyone (including you) currently present somewhere in this group. */
export function usePresentMembers(): PresentMember[] {
  return useContext(PresenceContext);
}
