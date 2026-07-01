/**
 * app/(auth)/identity.tsx — ID submission (prototype screen 5).
 * Pick an ID photo → upload to private storage → submitIdentity → pending.
 *
 * Deps: expo-image-picker (npx expo install expo-image-picker)
 */
import { useState } from 'react';
import { View, ScrollView, Pressable, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Info, Check, Mail } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { semantic, shadowToken } from '@/theme/colors';
import { uploadImage } from '@/lib/upload';
import { submitIdentity } from '@/api/members';

const GUIDES = [
  'ID must be fully visible inside the frame',
  'Free from glare, blur or shadows',
  'Front side of the ID only',
  'All text and numbers are readable',
];

export default function Identity() {
  const router = useRouter();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  async function pickImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access to upload your ID.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!res.canceled) setImageUri(res.assets[0].uri);
  }

  async function onSubmit() {
    if (!imageUri) {
      Alert.alert('Add your ID', 'Please upload a photo of your ID first.');
      return;
    }
    setLoading(true);
    try {
      const path = await uploadImage('id-documents', imageUri, 'kyc');
      await submitIdentity({ id_document_url: path });
      router.replace('/(auth)/pending');
    } catch (e) {
      Alert.alert('Submission failed', (e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }}>
      <ScreenHeader back />
      <View style={{ alignItems: 'flex-end', paddingHorizontal: 22 }}>
        <StatusBadge entity="verification" value="pending" labelOverride="Step 1 of 3" />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 32 }}>
        <View style={{ gap: 5, marginTop: 6, marginBottom: 18 }}>
          <Text variant="h1" style={{ fontSize: 21 }}>Identity Verification</Text>
          <Text variant="body" color="secondary">
            To keep KapitPondo secure, upload a clear photo of a valid government-issued ID.
          </Text>
        </View>

        <Text variant="label" color="secondary" style={{ fontSize: 12.5, marginBottom: 8 }}>Upload ID Photo</Text>
        <Pressable
          onPress={pickImage}
          style={{
            alignItems: 'center',
            gap: 10,
            borderWidth: 1.6,
            borderStyle: 'dashed',
            borderColor: semantic.brand,
            borderRadius: 16,
            paddingVertical: 26,
            paddingHorizontal: 18,
            backgroundColor: semantic.surfaceAlt,
            marginBottom: 18,
          }}
        >
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={{ width: '100%', height: 170, borderRadius: 12 }} resizeMode="cover" />
          ) : (
            <>
              <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                <Camera size={26} color={semantic.brandDark} />
              </View>
              <Text variant="label">Tap to upload or take a photo</Text>
              <Text variant="caption" color="secondary" style={{ textAlign: 'center' }}>
                Supports JPG and PNG. Maximum file size: 5 MB.
              </Text>
            </>
          )}
        </Pressable>

        <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 16, marginBottom: 18 }, shadowToken.card]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Info size={17} color={semantic.brandDark} />
            <Text variant="label">Photo guidelines</Text>
          </View>
          <View style={{ gap: 9 }}>
            {GUIDES.map((g) => (
              <View key={g} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9 }}>
                <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#E2F0E8', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                  <Check size={12} color="#3E8E66" strokeWidth={2.4} />
                </View>
                <Text variant="bodySmall" style={{ flex: 1 }}>{g}</Text>
              </View>
            ))}
          </View>
        </View>

        <Field
          label="Email Address (Optional)"
          placeholder="name@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
          leading={<Mail size={18} color={semantic.textMuted} />}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: -6, marginBottom: 18 }}>
          <Mail size={14} color={semantic.textMuted} />
          <Text variant="caption" color="secondary">Verification updates are sent to this email.</Text>
        </View>

        <Button label="Submit Identity" onPress={onSubmit} loading={loading} />
        <Text variant="caption" color="muted" style={{ textAlign: 'center', marginTop: 13 }}>
          By submitting, you agree to KapitPondo's Privacy Policy on identity verification.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
