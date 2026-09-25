import { View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, X } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { BandHeader } from '@/components/shared/DashboardBand';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { useActiveGroup } from '@/context/GroupContext';
import type { GroupRole } from '@/constants/roles';

/**
 * What the signed-in person's role can and can't do in this group — the
 * sign-off rules (migration 0075) in plain words, so nobody wonders why a
 * button isn't there for their own money.
 */
const GUIDE: Record<GroupRole, { title: string; can: string[]; cant: string[] }> = {
  member: {
    title: 'Member',
    can: [
      'Pay your contributions and loan repayments, with proof',
      'Request a loan for yourself or one of your heads',
      'See the group ledger and your own records',
      'Tell the Auditor when cash recorded for you isn’t right',
    ],
    cant: [
      'Approve, confirm or verify anything',
      'See other members’ proofs',
    ],
  },
  treasurer: {
    title: 'Treasurer',
    can: [
      'Confirm that members’ money arrived',
      'Record cash handed to you (the Auditor still verifies it)',
      'Release approved loans',
      'Decide the Organizer’s own loan requests',
    ],
    cant: [
      'Post anything to the ledger on your own — the Auditor verifies first',
      'Confirm your own contributions or repayments (the Organizer does)',
      'Release your own loan (the Organizer does)',
      'Decide members’ loans (the Organizer does)',
    ],
  },
  owner: {
    title: 'Organizer',
    can: [
      'Decide loans and approve new members',
      'Set up cycles, penalties and the payment channel',
      'Finalize reversals and the year-end distribution',
      'Step in when an officer can’t sign off their own records',
      'Resolve or dismiss the Auditor’s flags and findings',
    ],
    cant: [
      'Decide your own loan (the Treasurer does)',
      'Confirm or verify your own contributions',
      'Change or delete anything already in the ledger',
    ],
  },
  auditor: {
    title: 'Auditor',
    can: [
      'Verify records — your verification is what posts them to the ledger',
      'Review officers’ loans before any money moves',
      'Flag records and submit findings to the Organizer',
      'See the full audit trail and export reports',
    ],
    cant: [
      'Edit or delete any record or audit entry',
      'Verify your own money, or anything you recorded (the Organizer does)',
      'Decide loans or release money',
      'Close your own flags or findings — only the Organizer can',
    ],
  },
};

function List({ items, good }: { items: string[]; good: boolean }) {
  const tone = good ? intent.success : intent.danger;
  return (
    <View style={[{ backgroundColor: semantic.card, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 4 }, shadowToken.soft]}>
      {items.map((t, i) => (
        <View key={t} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 11, borderBottomWidth: i < items.length - 1 ? 1 : 0, borderColor: semantic.border }}>
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: tone.soft, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
            {good ? <Check size={12} color={tone.text} strokeWidth={3} /> : <X size={12} color={tone.text} strokeWidth={3} />}
          </View>
          <Text style={{ flex: 1, fontSize: 13.5, lineHeight: 19, color: semantic.textPrimary }}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

export default function RoleGuide() {
  const { role } = useActiveGroup();
  const g = GUIDE[(role ?? 'member') as GroupRole];
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={[]}>
      <BandHeader title={`As ${g.title === 'Auditor' || g.title === 'Organizer' ? 'an' : 'a'} ${g.title}`} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <Text style={{ fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary, marginBottom: 9 }}>You can</Text>
        <List items={g.can} good />
        <Text style={{ fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary, marginTop: 22, marginBottom: 9 }}>You can’t</Text>
        <List items={g.cant} good={false} />
        <Text variant="caption" color="secondary" style={{ marginTop: 14, lineHeight: 17, paddingHorizontal: 4 }}>
          Every record needs two different people before it reaches the ledger, and nobody signs off their own money.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
