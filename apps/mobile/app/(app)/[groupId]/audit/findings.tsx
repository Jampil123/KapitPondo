import { useState } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Plus, Check, X } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { ReasonPrompt } from '@/components/ui/ReasonPrompt';
import { BandHeader } from '@/components/shared/DashboardBand';
import { PillFilters } from '@/components/shared/PillFilters';
import { Alert } from '@/lib/alert';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { useActiveGroup } from '@/context/GroupContext';
import { useFindings, useCloseFinding } from '@/features/findings/findings.hooks';
import type { AuditFinding, FindingSeverity } from '@/api/findings';

const SEVERITY: Record<FindingSeverity, { label: string; soft: string; text: string }> = {
  high: { label: 'High', soft: intent.danger.soft, text: intent.danger.text },
  medium: { label: 'Medium', soft: intent.warning.soft, text: intent.warning.text },
  low: { label: 'Low', soft: semantic.surfaceAlt, text: semantic.textSecondary },
};

type Tab = 'open' | 'closed';

function shortDate(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function Chip({ soft, text, children }: { soft: string; text: string; children: string }) {
  return (
    <View style={{ backgroundColor: soft, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 }}>
      <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: text }}>{children}</Text>
    </View>
  );
}

function SmallButton({ label, tone, Icon, onPress, disabled }: { label: string; tone: 'ok' | 'danger'; Icon: any; onPress: () => void; disabled?: boolean }) {
  const t = tone === 'ok' ? { bg: semantic.brandDark, fg: '#fff' } : { bg: intent.danger.soft, fg: intent.danger.text };
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: t.bg, borderRadius: 9, paddingVertical: 6, paddingHorizontal: 11, opacity: disabled ? 0.5 : 1 }}>
      <Icon size={12} color={t.fg} strokeWidth={2.6} />
      <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: t.fg }}>{label}</Text>
    </Pressable>
  );
}

function FindingCard({ f, canClose, busy, onClose }: { f: AuditFinding; canClose: boolean; busy: boolean; onClose: (status: 'resolved' | 'dismissed') => void }) {
  const sev = SEVERITY[f.severity];
  const closed = f.status !== 'open';
  return (
    <View style={[{ backgroundColor: semantic.card, borderRadius: 20, padding: 16, gap: 12, marginBottom: 10 }, shadowToken.soft]}>
      <View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Chip soft={sev.soft} text={sev.text}>{sev.label}</Chip>
          {closed ? (
            <Chip soft={f.status === 'resolved' ? intent.success.soft : semantic.surfaceAlt} text={f.status === 'resolved' ? intent.success.text : semantic.textSecondary}>
              {f.status === 'resolved' ? 'Resolved' : 'Dismissed'}
            </Chip>
          ) : null}
        </View>
        <Text style={{ fontSize: 14, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary, marginTop: 8 }}>{f.title}</Text>
        {f.details ? <Text style={{ fontSize: 12.5, lineHeight: 18, color: semantic.textSecondary, marginTop: 4 }}>{f.details}</Text> : null}
        <Text variant="caption" color="secondary" style={{ marginTop: 6 }}>
          {f.raiser?.full_name ?? 'Auditor'} · {shortDate(f.created_at)}
        </Text>
      </View>

      {closed ? (
        <View style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 12, padding: 12 }}>
          <Text variant="overline" color="muted" style={{ marginBottom: 3 }}>
            {f.resolver?.full_name ?? 'Organizer'} · {shortDate(f.resolved_at)}
          </Text>
          <Text style={{ fontSize: 12, lineHeight: 17, color: semantic.textSecondary }}>{f.resolution_note ?? 'No note'}</Text>
        </View>
      ) : canClose ? (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
          <SmallButton label="Dismiss" tone="danger" Icon={X} onPress={() => onClose('dismissed')} disabled={busy} />
          <SmallButton label="Resolve" tone="ok" Icon={Check} onPress={() => onClose('resolved')} disabled={busy} />
        </View>
      ) : null}
    </View>
  );
}

export default function AuditFindings() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const { role } = useActiveGroup();
  const [tab, setTab] = useState<Tab>('open');
  const [closing, setClosing] = useState<{ finding: AuditFinding; status: 'resolved' | 'dismissed' } | null>(null);

  const open = useFindings(groupId!, 'open');
  const closed = useFindings(groupId!, 'closed');
  const close = useCloseFinding(groupId!);

  const isAuditor = role === 'auditor';
  const isOwner = role === 'owner';
  const list = tab === 'open' ? open : closed;
  const rows = list.data ?? [];

  async function onCloseConfirm(note: string) {
    if (!closing) return;
    const { finding, status } = closing;
    setClosing(null);
    const ok = await close.run(finding.id, status, note || undefined);
    if (ok === undefined) Alert.alert('Could not update', close.error?.message ?? 'Try again.');
    else { open.refetch(); closed.refetch(); }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={[]}>
      <BandHeader
        title="Audit findings"
        right={isAuditor ? (
          <Pressable onPress={() => router.push({ pathname: '/(app)/[groupId]/audit/new-finding' as any, params: { groupId } })} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: semantic.brandDark, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 11 }}>
            <Plus size={14} color="#fff" strokeWidth={2.6} />
            <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: '#fff' }}>New</Text>
          </Pressable>
        ) : undefined}
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <PillFilters<Tab>
          options={[
            { key: 'open', label: 'Open', count: open.data?.length, hot: (open.data?.length ?? 0) > 0 },
            { key: 'closed', label: 'Closed', count: closed.data?.length },
          ]}
          value={tab}
          onChange={setTab}
        />

        <View style={{ marginTop: 16 }}>
          {list.loading && rows.length === 0 ? (
            <ActivityIndicator color={semantic.brand} style={{ marginTop: 30 }} />
          ) : rows.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 40, gap: 6 }}>
              <Text variant="h3" style={{ fontSize: 16 }}>{tab === 'open' ? 'No open findings' : 'Nothing closed yet'}</Text>
              {tab === 'open' && isAuditor ? <Text variant="body" color="secondary">Tap New to record one.</Text> : null}
            </View>
          ) : (
            rows.map((f) => (
              <FindingCard
                key={f.id}
                f={f}
                canClose={isOwner}
                busy={close.loading}
                onClose={(status) => setClosing({ finding: f, status })}
              />
            ))
          )}
        </View>
      </ScrollView>


      <ReasonPrompt
        visible={!!closing}
        title={closing?.status === 'dismissed' ? 'Dismiss this finding?' : 'Resolve this finding?'}
        placeholder={closing?.status === 'dismissed' ? 'Why it isn’t an issue (required)' : 'What was done (optional)'}
        confirmLabel={closing?.status === 'dismissed' ? 'Dismiss' : 'Resolve'}
        destructive={closing?.status === 'dismissed'}
        onCancel={() => setClosing(null)}
        onConfirm={onCloseConfirm}
      />
    </SafeAreaView>
  );
}
