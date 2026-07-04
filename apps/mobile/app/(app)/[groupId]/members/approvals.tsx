/**
 * app/(app)/[groupId]/membership-approvals.tsx
 * ----------------------------------------------------------------------------
 * Owner approves/rejects join requests. Designer's layout (search + applicant
 * cards + Approve/Reject), wired to our real API:
 *   list   → listPendingMembers(groupId)
 *   approve→ approveMember(groupId, memberId)
 *   reject → rejectMember(groupId, memberId)
 *
 * The pending-member response shape isn't nailed down, so we normalize
 * defensively — adjust `normalize()` once you see the real payload.
 */
import { useMemo, useState } from 'react';
import { View, TextInput, Pressable, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Search, Check, X } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, shadowToken } from '@/theme/colors';
import { useQuery, useAction } from '@/hooks/useApi';
import { listPendingMembers, approveMember, rejectMember } from '@/api/groups';

type PendingRow = { id: string; name: string; date: string | null; code: string | null; verification: string | null };

function normalize(item: any): PendingRow {
  return {
    // approve/reject take the MEMBER id (members/:memberId/approve), not the
    // membership row's own id — member_id must win here.
    id: item?.member_id ?? item?.members?.id ?? item?.member?.id ?? item?.id,
    name: item?.full_name ?? item?.name ?? item?.members?.full_name ?? item?.member?.full_name ?? 'Member',
    date: item?.created_at ?? item?.joined_at ?? null,
    code: item?.fund_code ?? item?.groups?.fund_code ?? null,
    verification: item?.verification_status ?? item?.members?.verification_status ?? item?.member?.verification_status ?? null,
  };
}

function shortDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

function SmallButton({ label, kind, icon: Icon, onPress, disabled }: { label: string; kind: 'ok' | 'danger'; icon: any; onPress: () => void; disabled?: boolean }) {
  const bg = kind === 'ok' ? '#E2F0E8' : '#F7E5E5';
  const fg = kind === 'ok' ? '#3E8E66' : '#C25C5E';
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: bg, borderRadius: 12, paddingVertical: 11, opacity: disabled ? 0.5 : 1 }}
    >
      <Icon size={16} color={fg} strokeWidth={2.4} />
      <Text variant="label" style={{ color: fg, fontSize: 13.5 }}>{label}</Text>
    </Pressable>
  );
}

export default function MembershipApprovals() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const [query, setQuery] = useState('');

  const { data, loading, error, refetch } = useQuery(
    () => listPendingMembers(groupId!),
    [groupId],
  );
  const approve = useAction((id: string) => approveMember(groupId!, id));
  const reject = useAction((id: string) => rejectMember(groupId!, id));

  const rows = useMemo(() => (Array.isArray(data) ? data.map(normalize) : []), [data]);
  const filtered = useMemo(
    () => rows.filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase())),
    [rows, query],
  );

  async function onApprove(r: PendingRow) {
    const ok = await approve.run(r.id);
    if (ok !== undefined) refetch();
    else if (approve.error) Alert.alert('Could not approve', approve.error.message);
  }
  async function onReject(r: PendingRow) {
    const ok = await reject.run(r.id);
    if (ok !== undefined) refetch();
    else if (reject.error) Alert.alert('Could not reject', reject.error.message);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Membership Approvals" subtitle={`${rows.length} pending`} />

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={semantic.brand} />
        </View>
      ) : error ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>Couldn't load requests. {error.message}</Text>
        </View>
      ) : rows.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 36, gap: 8 }}>
          <Text variant="h3" style={{ fontSize: 16 }}>No pending requests</Text>
          <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>New join requests will show up here.</Text>
        </View>
      ) : (
        <View style={{ flex: 1, padding: 16, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: semantic.surfaceAlt, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11 }}>
            <Search size={18} color={semantic.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search applicants"
              placeholderTextColor={semantic.textMuted}
              style={{ flex: 1, fontSize: 13.5, color: semantic.textPrimary, padding: 0 }}
            />
          </View>

          {filtered.map((r) => {
            const busy = approve.loading || reject.loading;
            return (
              <View key={r.id} style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 14 }, shadowToken.card]}>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <Avatar name={r.name} size={46} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="label" style={{ fontSize: 15 }}>{r.name}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {r.date ? <Text variant="caption" color="secondary">Joined {shortDate(r.date)}</Text> : null}
                      {r.code ? <StatusBadge entity="role" value="member" labelOverride={r.code} /> : null}
                      {r.verification ? <StatusBadge entity="verification" value={r.verification} /> : null}
                    </View>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 13 }}>
                  <SmallButton label="Approve" icon={Check} kind="ok" onPress={() => onApprove(r)} disabled={busy} />
                  <SmallButton label="Reject" icon={X} kind="danger" onPress={() => onReject(r)} disabled={busy} />
                </View>
              </View>
            );
          })}
        </View>
      )}
    </SafeAreaView>
  );
}
