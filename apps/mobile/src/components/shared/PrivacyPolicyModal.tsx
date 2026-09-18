import { View, ScrollView, Modal, Pressable } from 'react-native';
import { X } from 'lucide-react-native';
import { Text } from '../ui/Text';
import { semantic } from '../../theme/colors';
import { PRIVACY_POLICY_TITLE, PRIVACY_POLICY_EFFECTIVE_DATE, PRIVACY_POLICY_INTRO, PRIVACY_POLICY_SECTIONS } from '../../content/privacyPolicy';

export function PrivacyPolicyModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(20,24,26,0.35)', justifyContent: 'flex-end' }}
        onPress={onClose}
      >
        <Pressable
          style={{
            backgroundColor: semantic.surface,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            paddingTop: 16,
            paddingHorizontal: 22,
            paddingBottom: 28,
            height: '80%',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="h3" style={{ fontSize: 17 }}>{PRIVACY_POLICY_TITLE}</Text>
              <Text variant="caption" color="secondary">
                Effective {PRIVACY_POLICY_EFFECTIVE_DATE}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                backgroundColor: semantic.surfaceAlt,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={17} color={semantic.textSecondary} />
            </Pressable>
          </View>
          <ScrollView style={{ flex: 1, marginTop: 14 }} showsVerticalScrollIndicator={false}>
            <Text variant="bodySmall" color="secondary" style={{ marginBottom: 16 }}>{PRIVACY_POLICY_INTRO}</Text>
            {PRIVACY_POLICY_SECTIONS.map((section) => (
              <View key={section.heading} style={{ marginBottom: 16 }}>
                <Text variant="label" style={{ marginBottom: 4 }}>{section.heading}</Text>
                <Text variant="bodySmall" color="secondary">{section.body}</Text>
              </View>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
