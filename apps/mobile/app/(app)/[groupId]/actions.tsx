import { useState } from 'react';
import { View, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { BandHeader } from '@/components/shared/DashboardBand';
import { PillFilters } from '@/components/shared/PillFilters';
import { semantic, shadowToken } from '@/theme/colors';
import { useOfficerActions, ActionList, EmptyActions, FILTER_LABEL, EMPTY_LABEL, type ActionFilter } from '@/features/dashboard/OrganizerActions';

type Filter = 'all' | ActionFilter;

/** Everything waiting on the Organizer or Treasurer, on one page — opened from the dashboard's Pending actions card. */
export default function PendingActions() {
  const { groupId, filter: initial } = useLocalSearchParams<{ groupId: string; filter?: string }>();
  const [filter, setFilter] = useState<Filter>(initial && initial in FILTER_LABEL ? (initial as Filter) : 'all');
  const [refreshing, setRefreshing] = useState(false);
  const { items, counts, total, loading, refetch, decidedCount, filters } = useOfficerActions(groupId!);

  // The role's everyday kinds always show; the rest only when something's waiting (or selected).
  const options: { key: Filter; label: string; count: number; hot: boolean }[] = [
    { key: 'all', label: 'All', count: total, hot: false },
    ...filters.order
      .filter((k) => filters.always.includes(k) || counts[k] > 0 || k === filter)
      .map((k) => ({ key: k as Filter, label: FILTER_LABEL[k], count: counts[k], hot: true })),
  ];

  const shown = filter === 'all' ? items : items.filter((i) => i.filter === filter);

  async function onRefresh() {
    setRefreshing(true);
    refetch();
    setRefreshing(false);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={[]}>
      <BandHeader title="Pending actions" />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={semantic.brand} />}
      >
        <PillFilters<Filter> options={options} value={filter} onChange={setFilter} />

        {loading && items.length === 0 ? (
          <View style={[{ backgroundColor: semantic.card, borderRadius: 20, padding: 24, alignItems: 'center' }, shadowToken.soft]}>
            <ActivityIndicator color={semantic.brand} />
          </View>
        ) : shown.length === 0 ? (
          <EmptyActions decidedCount={filter === 'all' ? decidedCount : 0} label={filter === 'all' ? 'Nothing waiting on you' : EMPTY_LABEL[filter]} />
        ) : (
          <ActionList compact groupId={groupId!} items={shown} onChanged={refetch} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
