import { useEffect, useState } from 'react';
import { View, ScrollView, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Alert } from '@/lib/alert';
import { toast } from '@/components/ui/Toast';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Layers, Minus, Plus, Lock } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useActiveGroup, useGroups } from '@/context/GroupContext';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import { useSetHeads, useHeadNames, useSetHeadNames } from '@/features/distribution/distribution.hooks';
import { useContributions } from '@/features/contributions/contributions.hooks';
import { buildTimeline, isHeadsEditable } from '@/features/contributions/periods';

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}>
      <Text variant="body" color="secondary">{label}</Text>
      <Text variant="label">{value}</Text>
    </View>
  );
}

export default function Heads() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { membership } = useActiveGroup();
  const { refresh: refreshGroups } = useGroups();
  const { cycle } = useActiveCycle(groupId!);
  const setHeads = useSetHeads(groupId!);

  // GroupContext's membership list is fetch-once (not realtime-wired like
  // the dashboard hooks), so reflect a successful save locally rather than
  // waiting for the next app-level refetch to show the new value.
  const [heads, setLocalHeads] = useState(membership?.heads ?? 1);
  useEffect(() => { if (membership) setLocalHeads(membership.heads); }, [membership?.heads]);
  const [draft, setDraft] = useState(heads);
  useEffect(() => setDraft(heads), [heads]);

  // Names for heads 2..n — who each extra head is. Head 1 is the member.
  const savedNames = useHeadNames(groupId!, membership?.id);
  const saveNames = useSetHeadNames(groupId!);
  const [nameDraft, setNameDraft] = useState<Record<number, string>>({});
  useEffect(() => {
    setNameDraft(Object.fromEntries((savedNames.data ?? []).map((n) => [n.head_no, n.name])));
  }, [savedNames.data]);
  const extraHeads = Array.from({ length: Math.max(0, heads - 1) }, (_, i) => i + 2);
  const namesDirty = extraHeads.some((h) => (nameDraft[h] ?? '').trim() !== ((savedNames.data ?? []).find((n) => n.head_no === h)?.name ?? ''));

  async function onSaveNames() {
    if (!membership) return;
    const payload = Object.fromEntries(extraHeads.map((h) => [h, (nameDraft[h] ?? '').trim()]));
    const ok = await saveNames.run(membership.id, payload);
    if (ok !== undefined) savedNames.refetch();
    else if (saveNames.error) Alert.alert('Could not save names', saveNames.error.message);
  }

  const dirty = draft !== heads;
  const expected = cycle ? Number(cycle.contribution_amount) * heads : null;
  const editable = isHeadsEditable(cycle);

  // Periods already paid at the current head count get re-priced on save (0068):
  // a shortfall stays owed on that month, an overpayment becomes advance credit.
  const contribs = useContributions(groupId!, cycle?.id ? { cycle_id: cycle.id } : {});
  const myRows = (contribs.data ?? []).filter((c) => c.membership_id === membership?.id);
  const paidPeriods = cycle ? buildTimeline(cycle, myRows, heads).filter((p) => p.row?.status === 'approved') : [];
  const inReview = myRows.some((r) => r.status === 'submitted' || r.status === 'confirmed');
  // Gross paid toward each period (incl. credit used and approved top-ups) against the new requirement.
  const newDue = cycle ? Number(cycle.contribution_amount) * draft : 0;
  const paidGross = paidPeriods.map((p) => Number(p.row!.amount) + Number(p.row!.credit_applied ?? 0)
    + myRows.filter((t) => t.top_up_of === p.row!.id && t.status === 'approved').reduce((s, t) => s + Number(t.amount), 0));
  const owedAfter = paidGross.reduce((s, paid) => s + Math.max(newDue - paid, 0), 0);
  const creditAfter = paidGross.reduce((s, paid) => s + Math.max(paid - newDue, 0), 0);
  const credit = Number(membership?.contribution_credit ?? 0);

  async function onSave() {
    if (!membership || !editable) return;
    const ok = await setHeads.run(membership.id, draft);
    if (ok !== undefined) {
      setLocalHeads(draft);
      refreshGroups();
      contribs.refetch();
      toast(`Heads updated to ${draft}`);
    } else if (setHeads.error) {
      Alert.alert('Could not update heads', setHeads.error.message);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Heads" subtitle="Member" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <View style={[{ backgroundColor: semantic.dashCard, borderRadius: 20, padding: 18, gap: 4 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Layers size={18} color="#fff" />
            <Text variant="caption" style={{ color: '#fff', opacity: 0.85 }}>Heads held</Text>
          </View>
          <Text style={{ fontSize: 32, fontFamily: 'Poppins_700Bold', color: '#fff', letterSpacing: -0.5 }}>{heads}</Text>
        </View>

        <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 16 }, shadowToken.card]}>
          <Text variant="h3" style={{ fontSize: 15, marginBottom: 4 }}>What this affects</Text>
          <InfoRow label="Per-head contribution" value={cycle ? formatPeso(cycle.contribution_amount) : '—'} />
          <InfoRow label="Your expected contribution" value={expected !== null ? formatPeso(expected) : '—'} />
          {credit > 0 ? <InfoRow label="Advance credit" value={formatPeso(credit)} /> : null}
        </View>

        <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 16, gap: 12 }, shadowToken.card]}>
          <Text variant="h3" style={{ fontSize: 15 }}>Change your heads</Text>
          {!editable ? (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: intent.warning.soft, borderRadius: 12, padding: 12 }}>
              <Lock size={15} color={intent.warning.text} style={{ marginTop: 1 }} />
              <Text variant="caption" style={{ flex: 1, color: intent.warning.text, lineHeight: 16 }}>
                Heads are locked after the cycle's first due date. You can change them again next cycle.
              </Text>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, opacity: editable ? 1 : 0.5 }}>
            <Pressable
              onPress={() => editable && setDraft((d) => Math.max(1, d - 1))}
              disabled={!editable}
              style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}
            >
              <Minus size={18} color={semantic.textPrimary} />
            </Pressable>
            <TextInput
              value={String(draft)}
              onChangeText={(t) => {
                const n = Number(t.replace(/[^0-9]/g, ''));
                setDraft(Number.isFinite(n) && n > 0 ? n : 1);
              }}
              keyboardType="number-pad"
              editable={editable}
              style={{
                flex: 1, textAlign: 'center', backgroundColor: semantic.surfaceAlt, borderRadius: 12,
                height: 44, fontFamily: 'Poppins_700Bold', fontSize: 18, color: semantic.textPrimary,
              }}
            />
            <Pressable
              onPress={() => editable && setDraft((d) => d + 1)}
              disabled={!editable}
              style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}
            >
              <Plus size={18} color={semantic.textPrimary} />
            </Pressable>
          </View>
          {editable && dirty && inReview ? (
            <Text variant="caption" style={{ color: intent.warning.text, lineHeight: 16 }}>
              A contribution of yours is still under review. You can change your heads once it's verified.
            </Text>
          ) : editable && dirty && (owedAfter >= 0.01 || creditAfter >= 0.01) ? (
            <Text variant="caption" color="secondary" style={{ lineHeight: 16 }}>
              {owedAfter >= 0.01
                ? `You've already paid for ${paidPeriods.length === 1 ? 'a month' : `${paidPeriods.length} months`}. At ${draft} head${draft === 1 ? '' : 's'}, ${formatPeso(owedAfter)} more is due for ${paidPeriods.length === 1 ? 'it' : 'them'}.`
                : `You've already paid for ${paidPeriods.length === 1 ? 'a month' : `${paidPeriods.length} months`}. At ${draft} head${draft === 1 ? '' : 's'}, the extra ${formatPeso(creditAfter)} becomes advance credit for your next contribution.`}
            </Text>
          ) : null}
          <Button
            label={setHeads.loading ? 'Saving…' : 'Save'}
            onPress={onSave}
            disabled={!editable || !dirty || setHeads.loading || inReview}
          />
          {setHeads.loading ? <ActivityIndicator color={semantic.brand} /> : null}
        </View>

        {extraHeads.length > 0 ? (
          <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 16, gap: 10 }, shadowToken.card]}>
            <View>
              <Text variant="h3" style={{ fontSize: 15 }}>Who you carry</Text>
              <Text variant="caption" color="secondary" style={{ marginTop: 2 }}>Each head can have its own loan.</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ width: 58, fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: semantic.textSecondary }}>Head 1</Text>
              <Text variant="body" color="muted" style={{ flex: 1 }}>You</Text>
            </View>
            {extraHeads.map((h) => (
              <View key={h} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ width: 58, fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: semantic.textSecondary }}>Head {h}</Text>
                <TextInput
                  value={nameDraft[h] ?? ''}
                  onChangeText={(t) => setNameDraft((d) => ({ ...d, [h]: t }))}
                  placeholder="Name"
                  placeholderTextColor={semantic.textMuted}
                  maxLength={80}
                  style={{
                    flex: 1, backgroundColor: semantic.surfaceAlt, borderRadius: 12, height: 42, paddingHorizontal: 12,
                    fontFamily: 'Poppins_500Medium', fontSize: 13.5, color: semantic.textPrimary,
                  }}
                />
              </View>
            ))}
            <Button
              label={saveNames.loading ? 'Saving…' : 'Save names'}
              onPress={onSaveNames}
              disabled={!namesDirty || saveNames.loading}
            />
          </View>
        ) : null}
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
