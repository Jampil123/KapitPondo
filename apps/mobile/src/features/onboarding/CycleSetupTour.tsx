import { useEffect, useState } from 'react';
import type { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useCycles } from '@/features/cycles/cycles.hooks';
import { CoachMark, type TargetRect } from './CoachMark';
import { useOnboardingFlag } from './useOnboardingFlag';

/**
 * Organizer onboarding, after a group is created: dashboard → Configure Cycle
 * → each form section → Create cycle → Activate. Step 1 lives on the
 * dashboard; the rest run on cycles/configure (opened with `tour=1`).
 */
export const CYCLE_TOUR_TOTAL = 7;

export function measureRef(ref: React.RefObject<View | null>, cb: (r: TargetRect) => void) {
  ref.current?.measureInWindow((x, y, width, height) => cb({ x, y, width, height }));
}

/** Step 1 — spotlight the "Configure Cycle" tile while the group has no cycle. */
export function CycleSetupDashboardTour({ groupId, targetRef }: { groupId: string; targetRef: React.RefObject<View | null> }) {
  const router = useRouter();
  const { seen, markSeen } = useOnboardingFlag('cycle-setup');
  const cycles = useCycles(groupId);
  const [target, setTarget] = useState<TargetRect | null>(null);
  // Latched on start: the flag is marked seen right away (one-shot), which
  // would otherwise hide the tour the moment it appears.
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (active || seen !== false || cycles.loading || !cycles.data || cycles.data.length > 0) return;
    setActive(true);
    markSeen();
  }, [active, seen, cycles.loading, cycles.data]);

  useEffect(() => {
    if (!active) return;
    // Let the dashboard band/tiles settle before measuring.
    const t = setTimeout(() => measureRef(targetRef, setTarget), 500);
    return () => clearTimeout(t);
  }, [active]);

  if (!active) return null;

  return (
    <CoachMark
      visible={!!target}
      target={target}
      radius={18}
      step={1}
      total={CYCLE_TOUR_TOTAL}
      title="Set up your first cycle"
      body="Members can't pay until a cycle is active."
      onTargetPress={() => {
        setActive(false);
        router.push({ pathname: '/(app)/[groupId]/cycles/configure' as any, params: { groupId, tour: '1' } });
      }}
      onSkip={() => setActive(false)}
    />
  );
}
