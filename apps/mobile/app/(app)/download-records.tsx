import { useEffect, useState } from 'react';
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, intent } from '@/theme/colors';
import { getMyRecords, type MemberRecordResponse } from '@/api/records';
import { buildMemberRecordMarkdown } from '@/lib/memberRecordDocument';
import { shareText } from '@/lib/shareText';

const BAND_TOP = '#4C7C90';

export default function DownloadRecords() {
  const [data, setData] = useState<MemberRecordResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | undefined>(undefined);

  useEffect(() => {
    (async () => {
      try {
        setData(await getMyRecords());
      } catch (e) {
        setLoadError((e as Error).message || "Couldn't load your records.");
      }
    })();
  }, []);

  async function onDownload() {
    if (!data) return;
    setDownloading(true);
    setDownloadError(undefined);
    try {
      const doc = buildMemberRecordMarkdown(data);
      const filename = `KapitPondo-Records-${new Date().toISOString().slice(0, 10)}.md`;
      await shareText(filename, doc, 'text/markdown');
    } catch (e) {
      setDownloadError((e as Error).message || 'Could not generate your records. Please try again.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BAND_TOP }} edges={['top']}>
      <AppBar title="Download My Records" backgroundColor={BAND_TOP} tintColor="#fff" />
      <ScrollView style={{ flex: 1, backgroundColor: semantic.background }} contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 20, paddingBottom: 40 }}>
        {loadError ? (
          <Text variant="caption" style={{ color: intent.danger.text, textAlign: 'center' }}>{loadError}</Text>
        ) : data === null ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator color={semantic.brand} />
          </View>
        ) : data.groups.length === 0 ? (
          <Text variant="body" color="secondary" style={{ textAlign: 'center', marginTop: 8 }}>
            No group records yet.
          </Text>
        ) : (
          <View style={{ marginBottom: 8 }}>
            <Text variant="overline" color="muted" style={{ marginBottom: 4 }}>Included in this download</Text>
            {data.groups.map((g, i) => (
              <View key={g.group.fund_code} style={{ paddingVertical: 12, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: semantic.border }}>
                <Text variant="label" style={{ fontSize: 13.5 }}>{g.group.name}</Text>
                <Text variant="caption" color="secondary" style={{ marginTop: 2 }}>
                  {g.cycle ? g.cycle.name : 'No active cycle'} · {g.contributions.length} contribution{g.contributions.length === 1 ? '' : 's'} · {g.loans.length} loan{g.loans.length === 1 ? '' : 's'}
                </Text>
              </View>
            ))}
          </View>
        )}

        {downloadError ? (
          <Text variant="caption" style={{ color: intent.danger.text, marginBottom: 12 }}>{downloadError}</Text>
        ) : null}

        {data && data.groups.length > 0 ? (
          <View style={{ marginTop: 12 }}>
            <Button label="Download Records" onPress={onDownload} loading={downloading} />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
