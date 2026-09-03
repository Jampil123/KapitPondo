/**
 * app/(app)/[groupId]/audit/log.tsx — the Auditor's audit trail.
 * Redesigned per the "audit-log" reference. Before building this, checked
 * whether audit_log (declared in migration 0001) was actually populated —
 * it wasn't; no code path anywhere wrote to it, and no endpoint read it for
 * the group Auditor role. Migration 0047 + services/api/src/lib/auditLog.js
 * wire it up for real: every approve/reject/verify/finalize/waive/role-
 * change/heads-change/cycle-lifecycle/reversal-workflow action across the
 * app now writes one row here, with the actor's role AT THE TIME (not their
 * current role, which can change later).
 *
 * Every entry, delta, and reason shown here comes directly from a real
 * audit_log row — nothing is synthesized client-side.
 */
import { useMemo, useState } from 'react';
import { View, ScrollView, Pressable, TextInput, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Search, Download, Lock, ArrowRight } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { PillTabs } from '@/components/ui/PillTabs';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { useActiveGroup } from '@/context/GroupContext';
import { useAuditLog } from '@/features/auditlog/auditlog.hooks';
import type { AuditCategory, AuditLogEntry } from '@/api/auditLog';
import { formatPeso } from '@/lib/money';

type FilterKey = 'all' | AuditCategory;

const ROLE_LABEL: Record<string, string> = { owner: 'Owner', treasurer: 'Treasurer', auditor: 'Auditor', member: 'Member' };
const CATEGORY_ICON: Record<AuditCategory, { bg: string; fg: string; glyph: string }> = {
  money: { bg: intent.success.soft, fg: intent.success.text, glyph: '₱' },
  governance: { bg: semantic.surfaceAlt, fg: semantic.brandDark, glyph: '◆' },
  reversals: { bg: intent.warning.soft, fg: intent.warning.text, glyph: '↩' },
  settings: { bg: intent.info.soft, fg: intent.info.text, glyph: '⚙' },
};

function shortDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { weekday: undefined, month: 'long', day: 'numeric' });
}
function shortTime(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}
function dayKey(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toDateString();
}

function fmtValue(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') {
    // money-shaped decimal strings ("1500.00") read better as pesos
    if (/^\d+(\.\d{1,2})?$/.test(v)) return formatPeso(v);
    return v;
  }
  return String(v);
}

/** Turns one raw audit_log row into what the card actually shows — the one
 * place that knows what before_data/after_data mean for each entity_type. */
function describe(e: AuditLogEntry): { title: string; from?: string; to?: string; toGood?: boolean; toBad?: boolean; reason?: string; ref?: string } {
  const before = e.before_data ?? {};
  const after = e.after_data ?? {};
  const b = before as Record<string, any>;
  const a = after as Record<string, any>;

  switch (e.entity_type) {
    case 'contribution':
      return e.action === 'approved'
        ? { title: 'Verified a contribution', from: 'Submitted', to: `Posted · ${fmtValue(a.amount)}`, toGood: true, ref: a.recorded_by ? 'Recorded by another officer' : undefined }
        : { title: 'Returned a contribution', from: 'Submitted', to: 'Returned', toBad: true, reason: a.reason };
    case 'expense':
      return e.action === 'approved'
        ? { title: 'Verified an expense', from: 'Recorded', to: `Posted · ${fmtValue(a.amount)}`, toGood: true }
        : { title: 'Returned an expense', from: 'Recorded', to: 'Returned', toBad: true, reason: a.reason };
    case 'loan_decision':
      return e.action === 'approved'
        ? { title: 'Approved a loan request', from: 'Requested', to: `Approved · ${fmtValue(a.approved_principal)}`, toGood: true }
        : { title: 'Rejected a loan request', from: 'Requested', to: 'Rejected', toBad: true, reason: a.reason };
    case 'loan_disbursement':
      return { title: 'Released a loan', from: 'Approved', to: `Active · ${fmtValue(a.principal)}`, toGood: true };
    case 'loan_payment':
      return e.action === 'confirmed'
        ? { title: 'Verified a repayment', from: 'Submitted', to: `Posted · ${fmtValue(a.amount)}`, toGood: true }
        : { title: 'Returned a repayment', from: 'Submitted', to: 'Returned', toBad: true, reason: a.reason };
    case 'membership_role':
      return { title: 'Changed a member’s role', from: ROLE_LABEL[b.role] ?? b.role ?? 'Member', to: ROLE_LABEL[a.role] ?? a.role };
    case 'membership_heads':
      return { title: 'Changed heads', from: `${b.heads ?? '—'} head${b.heads === 1 ? '' : 's'}`, to: `${a.heads ?? '—'} head${a.heads === 1 ? '' : 's'}` };
    case 'membership_approval':
      return e.action === 'approved'
        ? { title: 'Approved a membership request', from: 'Pending', to: 'Active', toGood: true }
        : { title: 'Rejected a membership request', from: 'Pending', to: 'Rejected', toBad: true, reason: a.reason };
    case 'distribution':
      return e.action === 'verified'
        ? { title: 'Verified the year-end distribution', from: 'Preview', to: `Verified · ${fmtValue(a.total_amount)}`, toGood: true }
        : { title: 'Finalized the year-end distribution', from: 'Verified', to: `Finalized · ${fmtValue(a.total_amount)}`, toGood: true };
    case 'penalty':
      return { title: 'Waived a penalty', from: 'Pending', to: `Waived · ${fmtValue(a.amount)}`, toGood: true, reason: a.reason };
    case 'reversal_request': {
      const titles: Record<string, string> = { initiated: 'Requested a reversal', verified: 'Verified a reversal request', rejected: 'Rejected a reversal request', finalized: 'Approved a reversing entry' };
      return {
        title: titles[e.action] ?? 'Updated a reversal request',
        from: b.entry_stands ? 'Entry stands' : (b.status ?? 'Pending'),
        to: a.status ? (a.status === 'finalized' ? 'Reversed' : a.status) : 'Updated',
        toGood: e.action === 'verified' || e.action === 'finalized',
        toBad: e.action === 'rejected',
        reason: a.reason ?? a.notes,
      };
    }
    case 'cycle': {
      const titles: Record<string, string> = { created: 'Created a cycle', activated: 'Activated a cycle', closed: 'Closed a cycle' };
      return { title: titles[e.action] ?? 'Updated a cycle', from: b?.status ?? undefined, to: a.status ?? undefined, toGood: e.action !== 'closed' };
    }
    case 'ledger_adjustment':
      return { title: 'Posted a manual adjustment', to: `${a.direction === 'credit' ? '+' : '-'}${fmtValue(a.amount)}`, reason: a.reason };
    default:
      return { title: e.action };
  }
}

export default function AuditLog() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { group } = useActiveGroup();
  const [category, setCategory] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allEntries, setAllEntries] = useState<AuditLogEntry[]>([]);

  const page = useAuditLog(groupId!, { category, search: search.trim() || undefined, before: cursor, limit: 30 });

  // Pages accumulate as "Load older" is tapped; a fresh filter/search resets.
  const entries = useMemo(() => {
    if (!cursor) return page.data ?? [];
    return [...allEntries, ...(page.data ?? [])];
  }, [page.data, cursor, allEntries]);

  function changeFilter(next: FilterKey) {
    setCategory(next);
    setCursor(undefined);
    setAllEntries([]);
  }
  function loadOlder() {
    const oldest = entries[entries.length - 1];
    if (!oldest) return;
    setAllEntries(entries);
    setCursor(oldest.created_at);
  }

  const grouped = useMemo(() => {
    const map = new Map<string, AuditLogEntry[]>();
    for (const e of entries) {
      const key = dayKey(e.created_at);
      const list = map.get(key);
      if (list) list.push(e); else map.set(key, [e]);
    }
    return Array.from(map.entries());
  }, [entries]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar
        title="Audit Log"
        subtitle="Auditor"
        right={
          <Pressable onPress={() => Alert.alert('Coming soon', 'Exporting the log to a file isn\'t available yet.')} hitSlop={8} style={{ padding: 8 }}>
            <Download size={19} color={semantic.textSecondary} />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 4 }} keyboardShouldPersistTaps="handled">

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: semantic.surface, borderRadius: 14, paddingHorizontal: 14, height: 46 }}>
          <Search size={16} color={semantic.textMuted} />
          <TextInput
            value={search}
            onChangeText={(t) => { setSearch(t); setCursor(undefined); setAllEntries([]); }}
            placeholder="Search by action"
            placeholderTextColor={semantic.textMuted}
            style={{ flex: 1, fontSize: 13.5, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary }}
          />
        </View>

        <View style={{ marginTop: 13 }}>
          <PillTabs<FilterKey>
            options={[
              { key: 'all', label: 'Everything' },
              { key: 'money', label: 'Money' },
              { key: 'governance', label: 'Governance' },
              { key: 'reversals', label: 'Reversals' },
              { key: 'settings', label: 'Settings' },
            ]}
            value={category}
            onChange={changeFilter}
          />
        </View>

        <View style={{ flexDirection: 'row', gap: 11, alignItems: 'flex-start', backgroundColor: semantic.dashCard, borderRadius: 20, padding: 15, marginTop: 16 }}>
          <View style={{ width: 24, height: 24, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.13)', alignItems: 'center', justifyContent: 'center' }}>
            <Lock size={12} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_700Bold', color: '#fff' }}>This log can&apos;t be edited by anyone</Text>
            <Text style={{ fontSize: 11.5, lineHeight: 16, color: '#9BBAC7', fontFamily: 'Poppins_500Medium', marginTop: 3 }}>
              Every approval, reversal, status change and role change is written here automatically. Not even the Owner can remove an entry.
            </Text>
          </View>
        </View>

        {page.loading && entries.length === 0 ? (
          <ActivityIndicator color={semantic.brand} style={{ marginTop: 30 }} />
        ) : entries.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 40, gap: 6 }}>
            <Text variant="h3" style={{ fontSize: 16 }}>Nothing here yet</Text>
            <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>Actions will show up here as they happen.</Text>
          </View>
        ) : (
          grouped.map(([key, dayEntries]) => (
            <View key={key}>
              <Text variant="overline" color="muted" style={{ marginTop: 22, marginBottom: 10, marginLeft: 4 }}>{shortDate(dayEntries[0].created_at)}</Text>
              <View style={[{ backgroundColor: semantic.surface, borderRadius: 20, overflow: 'hidden' }, shadowToken.card]}>
                {dayEntries.map((e, i) => {
                  const d = describe(e);
                  const cat = CATEGORY_ICON[e.category] ?? CATEGORY_ICON.governance;
                  return (
                    <View key={e.id} style={{ flexDirection: 'row', gap: 12, padding: 14, borderBottomWidth: i < dayEntries.length - 1 ? 1 : 0, borderColor: semantic.border }}>
                      <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: cat.bg, alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                        <Text style={{ fontSize: 14, color: cat.fg }}>{cat.glyph}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text variant="label" style={{ fontSize: 13.5 }}>{d.title}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                          <Text variant="caption" color="secondary">{e.actor?.full_name ?? 'Someone'}</Text>
                          {e.actor_role ? (
                            <View style={{ backgroundColor: semantic.surfaceAlt, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 }}>
                              <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: semantic.brandDark, textTransform: 'uppercase', letterSpacing: 0.4 }}>{ROLE_LABEL[e.actor_role] ?? e.actor_role}</Text>
                            </View>
                          ) : null}
                        </View>
                        {d.from || d.to ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 9, padding: 9, backgroundColor: semantic.surfaceAlt, borderRadius: 10 }}>
                            {d.from ? <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_700Bold', color: semantic.textMuted, textDecorationLine: 'line-through' }}>{d.from}</Text> : null}
                            {d.from && d.to ? <ArrowRight size={11} color={semantic.textMuted} /> : null}
                            {d.to ? <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_700Bold', color: d.toGood ? intent.success.text : d.toBad ? intent.danger.text : semantic.textPrimary }}>{d.to}</Text> : null}
                          </View>
                        ) : null}
                        {d.reason ? (
                          <View style={{ marginTop: 9, padding: 10, backgroundColor: intent.danger.soft, borderRadius: 10 }}>
                            <Text style={{ fontSize: 11.5, lineHeight: 16, color: '#8E3227', fontFamily: 'Poppins_500Medium' }}>Reason given: {d.reason}</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text variant="caption" color="muted" style={{ fontSize: 10.5 }}>{shortTime(e.created_at)}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          ))
        )}

        {entries.length > 0 && (page.data?.length ?? 0) >= 30 ? (
          <Pressable onPress={loadOlder} disabled={page.loading} style={{ marginTop: 16, alignItems: 'center', paddingVertical: 13 }}>
            {page.loading && cursor ? <ActivityIndicator color={semantic.brand} /> : <Text variant="label" style={{ color: semantic.brandDark }}>Load older entries</Text>}
          </Pressable>
        ) : null}

        <Text variant="caption" color="muted" style={{ lineHeight: 16, paddingHorizontal: 2, marginTop: 12 }}>
          Entries are written automatically when an action happens — {group?.name ?? 'this group'}&apos;s full history, not a summary.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
