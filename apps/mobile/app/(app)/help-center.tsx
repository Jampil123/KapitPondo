import { useState } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronDown } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { AppBar } from '@/components/shared/AppBar';
import { semantic } from '@/theme/colors';
import { HELP_SECTIONS } from '@/content/helpCenter';

const BAND_TOP = '#4C7C90';

export default function HelpCenter() {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BAND_TOP }} edges={['top']}>
      <AppBar title="Help Center" backgroundColor={BAND_TOP} tintColor="#fff" />
      <ScrollView style={{ flex: 1, backgroundColor: semantic.background }} contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 20, paddingBottom: 40 }}>
        {HELP_SECTIONS.map((section) => (
          <View key={section.heading} style={{ marginBottom: 22 }}>
            <Text variant="overline" color="muted" style={{ marginBottom: 4 }}>{section.heading}</Text>
            {section.items.map((item, i) => {
              const key = `${section.heading}:${item.q}`;
              const open = expanded === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setExpanded(open ? null : key)}
                  style={{ paddingVertical: 14, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: semantic.border }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text variant="label" style={{ fontSize: 13.5, flex: 1 }}>{item.q}</Text>
                    <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
                      <ChevronDown size={16} color={semantic.textMuted} />
                    </View>
                  </View>
                  {open ? (
                    <Text variant="body" color="secondary" style={{ marginTop: 8, lineHeight: 20 }}>{item.a}</Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
