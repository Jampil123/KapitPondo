/**
 * features/audit/VerificationQueue.tsx
 * ----------------------------------------------------------------------------
 * Everything waiting on the signed-in officer's sign-off (features/signoff),
 * oldest first: who, what, when, how much, and whether the record matches its
 * proof. Tap a row for the full comparison and the Approve / Reject step
 * (app/(app)/[groupId]/verify/[key].tsx). The officer's own records show
 * locked at the bottom, with who they're routed to.
 */
import { View, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowDown, ArrowUp, Undo2, Lock } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { whenLabel } from '@/features/auditlog/AuditTimeline';
import { useSignoffQueue, ROLE_NAME, type SignoffItem } from '@/features/signoff/signoff';
import { compareToProof, matchLabel } from '@/features/signoff/proofMatch';

// "Contribution, recorded" — the verb for where the record is in its life.
const VERB: Record<SignoffItem['action'], string> = {
  confirm: 'submitted',
  verify: 'recorded',
  review: 'approved',
  release: 'approved',
  verify_release: 'recorded',
};

// Non-money steps get a plain pill instead of a proof match.
const STEP_PILL: Partial<Record<SignoffItem['action'], string>> = {
  review: 'Review before release',
  release: 'Ready to release',
};

export function itemMatch(i: SignoffItem) {
  return compareToProof({ amount: i.amount, reference: i.reference, recordedAt: i.recordedAt, payer: i.name }, i.reading, !!i.proofUrl);
}

function Pill({ text, tone }: { text: string; tone: 'good' | 'bad' | 'muted' }) {
  const t = tone === 'good' ? intent.success : tone === 'bad' ? intent.danger : { soft: semantic.surfaceAlt, text: semantic.textSecondary };
  return (
    <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: t.soft, paddingVertical: 3, paddingHorizontal: 9, borderRadius: 20, marginTop: 6 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.text }} />
      <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: t.text }}>{text}</Text>
    </View>
  );
}

function rowIcon(i: SignoffItem) {
  if (i.kind === 'reversal') return { Icon: Undo2, tone: intent.warning };
  if (i.kind === 'loan') return { Icon: ArrowUp, tone: intent.danger };
  return { Icon: ArrowDown, tone: intent.success };
}

function Row({ i, last, onPress }: { i: SignoffItem; last: boolean; onPress: () => void }) {
  const { Icon, tone } = rowIcon(i);
  const pill = i.kind === 'contribution' || i.kind === 'repayment' ? matchLabel(itemMatch(i)) : STEP_PILL[i.action] ? { text: STEP_PILL[i.action]!, tone: 'muted' as const } : null;
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14, borderBottomWidth: last ? 0 : 1, borderColor: semantic.border }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: tone.soft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={18} color={tone.text} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>{i.name}</Text>
        <Text style={{ fontSize: 11.5, lineHeight: 16, color: semantic.textSecondary }}>{i.label}, {VERB[i.action]}</Text>
        <Text style={{ fontSize: 11.5, lineHeight: 16, color: semantic.textSecondary }}>{whenLabel(i.since)}</Text>
        {pill ? <Pill text={pill.text} tone={pill.tone} /> : null}
      </View>
      {i.amount !== null ? <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{formatPeso(i.amount)}</Text> : null}
    </Pressable>
  );
}

function OwnRow({ i, last }: { i: SignoffItem; last: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14, borderTopWidth: 1, borderBottomWidth: last ? 0 : 1, borderColor: semantic.border }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
        <Lock size={17} color={semantic.textSecondary} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>Your own {i.label.toLowerCase()}</Text>
        <Text style={{ fontSize: 11.5, lineHeight: 16, color: semantic.textSecondary }}>
          Routed to {i.holder ? `${i.holder} (${ROLE_NAME[i.role]})` : `the ${ROLE_NAME[i.role]}`}
        </Text>
      </View>
      {i.amount !== null ? <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: semantic.textSecondary }}>{formatPeso(i.amount)}</Text> : null}
    </View>
  );
}

export function VerificationQueue({ groupId }: { groupId: string }) {
  const router = useRouter();
  const queue = useSignoffQueue(groupId);
  const mine = queue.mine;
  const own = queue.own;
  const othersWaiting = queue.items.filter((i) => !i.mine && !i.own).length;

  const open = (i: SignoffItem) => router.push({ pathname: '/(app)/[groupId]/verify/[key]' as any, params: { groupId, key: i.key } });

  return (
    <>
      <View style={[{ backgroundColor: semantic.card, borderRadius: 20, marginTop: 14, overflow: 'hidden' }, shadowToken.soft]}>
        {queue.loading && queue.items.length === 0 ? (
          <ActivityIndicator color={semantic.brand} style={{ margin: 24 }} />
        ) : mine.length === 0 && own.length === 0 ? (
          <Text variant="body" color="muted" style={{ padding: 18, textAlign: 'center' }}>Nothing is waiting on you.</Text>
        ) : (
          <>
            {mine.map((i, idx) => <Row key={i.key} i={i} last={idx === mine.length - 1 && own.length === 0} onPress={() => open(i)} />)}
            {own.map((i, idx) => <OwnRow key={i.key} i={i} last={idx === own.length - 1} />)}
          </>
        )}
      </View>
      {othersWaiting > 0 ? (
        <Text variant="caption" color="secondary" style={{ marginTop: 10, paddingHorizontal: 4 }}>
          {othersWaiting} more waiting on other officers.
        </Text>
      ) : null}
    </>
  );
}
