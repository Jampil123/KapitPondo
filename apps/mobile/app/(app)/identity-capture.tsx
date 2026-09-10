/**
 * app/(app)/identity-capture.tsx — dedicated front/back ID capture flow,
 * reached from identity.tsx step 1's "ID Photos" tile.
 *
 * Each shot is scanned on-device for blur (lib/blurDetection.ts) before
 * being accepted; a blurry shot prompts a retake but can be kept anyway
 * (the scan is advisory, not a hard gate). Accepted shots are written
 * straight into identity.tsx's own AsyncStorage draft (DRAFT_KEY) as they're
 * taken, rather than carried back as route params — the camera hand-off
 * (launchCameraAsync backgrounds the app for the system camera) can get the
 * process killed and relaunched, which would lose an in-flight param but not
 * an already-persisted draft. identity.tsx picks the new URIs up via
 * useFocusEffect when this screen is popped.
 */
import { useEffect, useState } from 'react';
import { View, ScrollView, Pressable, Image, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Info, Check } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Stepper } from '@/components/ui/Stepper';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { semantic } from '@/theme/colors';
import { scanForBlur } from '@/lib/blurDetection';

const DRAFT_KEY = 'identity_draft_v1';
const CAPTURE_STEPS = ['Front', 'Back'];

const GUIDES = [
  'ID must be fully visible inside the frame',
  'Free from glare, blur or shadows',
  'All text and numbers are readable',
];

type Side = 'front' | 'back';

async function mergeIntoDraft(patch: Record<string, unknown>) {
  try {
    const raw = await AsyncStorage.getItem(DRAFT_KEY);
    const draft = raw ? JSON.parse(raw) : {};
    await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, ...patch }));
  } catch {
    // Best-effort — identity.tsx's own draft-persist effect will catch up once it's back in focus.
  }
}

export default function IdentityCapture() {
  const router = useRouter();
  const [side, setSide] = useState<Side>('front');
  const [frontUri, setFrontUri] = useState<string | null>(null);
  const [backUri, setBackUri] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  // Prefill from any photos already captured in a prior visit to this screen.
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(DRAFT_KEY);
        if (!raw) return;
        const d = JSON.parse(raw);
        if (d.idImageUri) setFrontUri(d.idImageUri);
        if (d.idBackImageUri) setBackUri(d.idBackImageUri);
      } catch {
        // Start fresh.
      }
    })();
  }, []);

  const uri = side === 'front' ? frontUri : backUri;
  const setUri = side === 'front' ? setFrontUri : setBackUri;

  function acceptShot(pickedUri: string) {
    setUri(pickedUri);
    mergeIntoDraft(side === 'front' ? { idImageUri: pickedUri } : { idBackImageUri: pickedUri });
  }

  async function capture(fromLibrary: boolean) {
    const perm = fromLibrary
      ? await ImagePicker.requestMediaLibraryPermissionsAsync()
      : await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Permission needed',
        fromLibrary ? 'Allow photo access to choose an ID photo.' : 'Allow camera access to capture your ID.',
      );
      return;
    }
    const res = fromLibrary
      ? await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 })
      : await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (res.canceled) return;
    const pickedUri = res.assets[0].uri;

    setScanning(true);
    const { blurry } = await scanForBlur(pickedUri);
    setScanning(false);

    if (blurry) {
      Alert.alert(
        'Photo looks blurry',
        'This shot may be too blurry to read clearly. Retake for a sharper scan?',
        [
          { text: 'Retake', style: 'cancel' },
          { text: 'Use Anyway', onPress: () => acceptShot(pickedUri) },
        ],
      );
      return;
    }
    acceptShot(pickedUri);
  }

  function next() {
    if (side === 'front') {
      setSide('back');
    } else {
      router.back();
    }
  }

  const canContinue = !!uri && !scanning;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }}>
      <ScreenHeader back />
      <View style={{ paddingHorizontal: 22, marginBottom: 18 }}>
        <Stepper steps={CAPTURE_STEPS} current={side === 'front' ? 1 : 2} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 32 }}>
        <View style={{ gap: 5, marginBottom: 18 }}>
          <Text variant="h1" style={{ fontSize: 21 }}>Capture the {side === 'front' ? 'Front' : 'Back'}</Text>
          <Text variant="body" color="secondary">
            Place your ID's {side === 'front' ? 'front side' : 'back side'} flat, in good lighting, and fill the frame.
          </Text>
        </View>

        <Pressable
          onPress={() => capture(false)}
          disabled={scanning}
          style={{
            alignItems: 'center', gap: 10,
            borderWidth: 1.6, borderStyle: 'dashed', borderColor: semantic.brand, borderRadius: 16,
            paddingVertical: 26, paddingHorizontal: 18, backgroundColor: semantic.surfaceAlt, marginBottom: 12,
          }}
        >
          {scanning ? (
            <>
              <ActivityIndicator color={semantic.brand} />
              <Text variant="caption" color="secondary">Checking photo quality…</Text>
            </>
          ) : uri ? (
            <Image source={{ uri }} style={{ width: '100%', height: 170, borderRadius: 12 }} resizeMode="cover" />
          ) : (
            <>
              <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                <Camera size={26} color={semantic.brandDark} />
              </View>
              <Text variant="label">Tap to open the camera</Text>
              <Text variant="caption" color="secondary" style={{ textAlign: 'center' }}>
                We'll check the shot for blur before you continue.
              </Text>
            </>
          )}
        </Pressable>

        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 20, marginBottom: 18 }}>
          {uri ? (
            <Pressable onPress={() => capture(false)}>
              <Text variant="label" color="brand">Retake</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => capture(true)}>
            <Text variant="label" color="brand">Choose from Gallery</Text>
          </Pressable>
        </View>

        <View style={{ marginBottom: 18 }}>
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

        <View style={{ flexDirection: 'row', gap: 12 }}>
          {side === 'back' ? (
            <View style={{ flex: 1 }}>
              <Button label="Back" variant="ghost" onPress={() => setSide('front')} />
            </View>
          ) : null}
          <View style={{ flex: 1 }}>
            <Button label={side === 'front' ? 'Next' : 'Done'} onPress={next} disabled={!canContinue} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
