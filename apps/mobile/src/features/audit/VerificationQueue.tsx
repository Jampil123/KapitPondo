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
  approve: 'verified',
};

// Non-money steps get a plain pill instead of a proof match.
const STEP_PILL: Partial<Record<SignoffItem['action'], string>> = {
  review: 'Review before release',
  release: 'Ready to release',
};

export function itemMatch(i: SignoffItem) {
  return compareToProof({ amount: i.amount, reference: i.reference, recordedAt: i.recordedAt, payer: i.name }, i.reading, !!i.proofUrl);
}

export type PillTone = 'good' | 'bad' | 'muted';

function Pill({ text, tone }: { text: string; tone: PillTone }) {
  const t = tone === 'good' ? intent.success : tone === 'bad' ? intent.danger : { soft: semantic.surfaceAlt, text: semantic.textSecondary };
  return (
    <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: t.soft, paddingVertical: 3, paddingHorizontal: 9, borderRadius: 20, marginTop: 6 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.text }} />
      <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: t.text }}>{text}</Text>
    </View>
  );
}

export function signoffIcon(i: SignoffItem) {
  if (i.kind === 'reversal') return { Icon: Undo2, tone: intent.warning };
  if (i.kind === 'loan') return { Icon: ArrowUp, tone: intent.danger };
  return { Icon: ArrowDown, tone: intent.success };
}

export function signoffPill(i: SignoffItem): { text: string; tone: PillTone } | null {
  if (i.kind === 'contribution' || i.kind === 'repayment') return matchLabel(itemMatch(i));
  return STEP_PILL[i.action] ? { text: STEP_PILL[i.action]!, tone: 'muted' } : null;
}

export const signoffSub = (i: SignoffItem) => `${i.label}, ${VERB[i.action]}`;

/** One queue row — icon tile, who, what, when, a status pill and the amount. Shared with the Organizer's Pending actions. */
export function QueueRow({ Icon, tone, tag, title, lines, pill, amount, last, compact, dense, onPress }: {
  Icon: any;
  tone: { soft: string; text: string };
  /** Small type label above the title, e.g. "Loan request". */
  tag?: string;
  title: string;
  lines: string[];
  pill?: { text: string; tone: PillTone } | null;
  amount?: string | null;
  last: boolean;
  /** Dashboard size: type, name, amount and time only — the details are one tap away. */
  compact?: boolean;
  /** Compact sizing (icon, padding) with the full details — so a full row lines up in a list of compact ones. */
  dense?: boolean;
  onPress: () => void;
}) {
  const shown = lines.filter(Boolean);
  const small = compact || dense;
  const icon = small ? 34 : 40;
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: small ? 10 : 14, paddingHorizontal: 14, borderBottomWidth: last ? 0 : 1, borderColor: semantic.border }}>
      <View style={{ width: icon, height: icon, borderRadius: small ? 10 : 12, backgroundColor: tone.soft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={small ? 16 : 18} color={tone.text} />
      </View>
      {compact ? (
        // The name gets the full width and wraps rather than truncating; amount and time sit underneath.
        <View style={{ flex: 1, minWidth: 0 }}>
          {tag ? <Text variant="overline" color="muted">{tag}</Text> : null}
          <Text style={{ fontSize: 13.5, lineHeight: 18, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>{title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 1 }}>
            {amount ? <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{amount}</Text> : null}
            {amount && shown.length ? <Text style={{ fontSize: 11.5, color: semantic.textMuted }}>·</Text> : null}
            {shown.length ? <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 11.5, lineHeight: 16, color: semantic.textSecondary }}>{shown[shown.length - 1]}</Text> : null}
          </View>
        </View>
      ) : (
        // The name gets the row's full width (the amount no longer sits beside it), so it stays on one line.
        <View style={{ flex: 1, minWidth: 0 }}>
          {tag ? <Text variant="overline" color="muted">{tag}</Text> : null}
          <Text style={{ fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>{title}</Text>
          {shown.map((l, idx) => (
            <View key={idx} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 11.5, lineHeight: 16, color: semantic.textSecondary }}>{l}</Text>
              {idx === 0 && amount ? <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{amount}</Text> : null}
            </View>
          ))}
          {!shown.length && amount ? <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{amount}</Text> : null}
          {pill ? <Pill text={pill.text} tone={pill.tone} /> : null}
        </View>
      )}
    </Pressable>
  );
}

/** The sign-off queue's row — also used as-is for sign-offs in the Organizer's Pending actions. */
export function SignoffRow({ i, last, dense, onPress }: { i: SignoffItem; last: boolean; dense?: boolean; onPress: () => void }) {
  const { Icon, tone } = signoffIcon(i);
  return (
    <QueueRow
      Icon={Icon}
      tone={tone}
      title={i.name}
      lines={[signoffSub(i), whenLabel(i.since)]}
      pill={signoffPill(i)}
      amount={i.amount !== null ? formatPeso(i.amount) : null}
      last={last}
      dense={dense}
      onPress={onPress}
    />
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
  const verifiedByMe = queue.verifiedByMe;
  const othersWaiting = queue.items.filter((i) => !i.mine && !i.own && !i.verifiedByMe).length;

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
            {mine.map((i, idx) => <SignoffRow key={i.key} i={i} last={idx === mine.length - 1 && own.length === 0} onPress={() => open(i)} />)}
            {own.map((i, idx) => <OwnRow key={i.key} i={i} last={idx === own.length - 1} />)}
          </>
        )}
      </View>
      {verifiedByMe.length > 0 ? (
        <>
          <Text variant="overline" color="muted" style={{ marginTop: 18, marginBottom: 2, paddingHorizontal: 4 }}>Verified by you · waiting for the Organizer</Text>
          <View style={[{ backgroundColor: semantic.card, borderRadius: 20, marginTop: 8, overflow: 'hidden' }, shadowToken.soft]}>
            {verifiedByMe.map((i, idx) => (
              <QueueRow
                key={i.key}
                Icon={Undo2}
                tone={intent.info}
                title={i.name}
                lines={['Tap to review or undo your verification', whenLabel(i.since)]}
                amount={i.amount !== null ? formatPeso(i.amount) : null}
                last={idx === verifiedByMe.length - 1}
                onPress={() => router.push({ pathname: '/(app)/[groupId]/ledger/[entryId]' as any, params: { groupId, entryId: i.entryId! } })}
              />
            ))}
          </View>
        </>
      ) : null}
      {othersWaiting > 0 ? (
        <Text variant="caption" color="secondary" style={{ marginTop: 10, paddingHorizontal: 4 }}>
          {othersWaiting} more waiting on other officers.
        </Text>
      ) : null}
    </>
  );
}
