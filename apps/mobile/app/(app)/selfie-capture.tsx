/**
 * app/(app)/selfie-capture.tsx — screen 2 of the verification flow, reached
 * from identity-capture.tsx once the ID photo is accepted.
 *
 * Uses a live front-camera preview (expo-camera) rather than the system
 * camera app, with an oval face-guide overlay, mirroring the card-guide
 * pattern in identity-capture.tsx. Camera only — deliberately no "choose
 * from gallery" fallback, same as the system-camera flow this replaces: a
 * selfie picked from an existing photo would defeat the point of comparing
 * it against the ID photo.
 *
 * The shot is scanned on-device for blur (lib/blurDetection.ts) before being
 * accepted, same as the ID capture flow — advisory, not a hard gate.
 * Accepting it immediately advances to identity.tsx's personal-info step —
 * no separate confirm tap, matching the prototype's shutter → next screen.
 *
 * The accepted shot is written straight into identity.tsx's own AsyncStorage
 * draft (DRAFT_KEY) as soon as it's taken, rather than carried back as a
 * route param — the camera hand-off can get the process killed and
 * relaunched on some devices, which would lose an in-flight param but not an
 * already-persisted draft. `step` is only bumped up to 3 (personal info),
 * never down — so re-capturing a selfie from Review's "Retake" link (where
 * step is already 4) lands back on Review, not personal info.
 */
import { useEffect, useRef, useState } from 'react';
import { View, ScrollView, Pressable, Image, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Camera, Info, Check } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { VerificationStepHeader } from '@/components/shared/VerificationStepHeader';
import { semantic } from '@/theme/colors';
import { scanForBlur } from '@/lib/blurDetection';

const DRAFT_KEY = 'identity_draft_v1';

const GUIDES = [
  'Face the camera directly, in good lighting',
  'Remove sunglasses, masks, or hats',
  'Keep a neutral expression',
];

async function mergeIntoDraft(patch: Record<string, unknown>) {
  try {
    const raw = await AsyncStorage.getItem(DRAFT_KEY);
    const draft = raw ? JSON.parse(raw) : {};
    await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, ...patch }));
  } catch {
    // Best-effort — identity.tsx's own draft-persist effect will catch up once it's back in focus.
  }
}

// Raises the draft's step to at least `min`, never lowers it — so this only
// pushes a fresh selfie capture forward to personal info (step 3); a retake
// triggered from Review (already step 4) is left exactly where it was.
async function bumpStepAtLeast(min: number) {
  try {
    const raw = await AsyncStorage.getItem(DRAFT_KEY);
    const draft = raw ? JSON.parse(raw) : {};
    const current = typeof draft.step === 'number' ? draft.step : 1;
    if (current < min) {
      await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, step: min }));
    }
  } catch {
    // Best-effort — identity.tsx's own draft-persist effect will catch up once it's back in focus.
  }
}

export default function SelfieCapture() {
  const router = useRouter();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [scanning, setScanning] = useState(false);

  // Prefill from a selfie already captured in a prior visit to this screen.
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(DRAFT_KEY);
        if (!raw) return;
        const d = JSON.parse(raw);
        if (d.selfieUri) setSelfieUri(d.selfieUri);
      } catch {
        // Start fresh.
      }
    })();
  }, []);

  const showCamera = !selfieUri;

  async function goNext() {
    await bumpStepAtLeast(3);
    router.replace('/(app)/identity' as any);
  }

  async function acceptShot(pickedUri: string) {
    setSelfieUri(pickedUri);
    // Awaited before goNext's own read-modify-write (bumpStepAtLeast) starts
    // — otherwise the two race on the same AsyncStorage key: bumpStepAtLeast
    // could read the draft before this write lands and then overwrite it
    // with a copy that's missing the selfieUri we just merged in.
    await mergeIntoDraft({ selfieUri: pickedUri });
    goNext();
  }

  async function checkBlurThenAccept(pickedUri: string) {
    setScanning(true);
    const { blurry } = await scanForBlur(pickedUri);
    setScanning(false);

    if (blurry) {
      Alert.alert(
        'Photo looks blurry',
        'This shot may be too blurry to compare against your ID clearly. Retake for a sharper scan?',
        [
          { text: 'Retake', style: 'cancel' },
          { text: 'Use Anyway', onPress: () => acceptShot(pickedUri) },
        ],
      );
      return;
    }
    acceptShot(pickedUri);
  }

  async function takeShot() {
    if (!cameraRef.current || !cameraReady || scanning) return;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
    if (!photo?.uri) return;
    checkBlurThenAccept(photo.uri);
  }

  function retake() {
    setSelfieUri(null);
    setCameraReady(false);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }}>
      <VerificationStepHeader title="Take a Selfie" step={2} totalSteps={4} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 8, paddingBottom: 32 }}>
        <View style={{ marginBottom: 18 }}>
          <Text variant="body" color="secondary">
            We'll match this selfie against your ID photo to confirm it's really you.
          </Text>
        </View>

        {!permission ? (
          <View style={{ height: 320, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={semantic.brand} />
          </View>
        ) : !permission.granted && showCamera ? (
          <View style={{
            height: 320, borderRadius: 20, backgroundColor: semantic.surfaceAlt,
            alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 24, marginBottom: 18,
          }}>
            <Camera size={32} color={semantic.brandDark} />
            <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>
              KapitPondo needs camera access to take your selfie.
            </Text>
            <Button label="Grant Camera Access" onPress={requestPermission} />
          </View>
        ) : showCamera ? (
          <View style={{ marginBottom: 12 }}>
            <View style={{ height: 420, borderRadius: 20, overflow: 'hidden', backgroundColor: '#000' }}>
              <CameraView
                ref={cameraRef}
                style={{ flex: 1 }}
                facing="front"
                onCameraReady={() => setCameraReady(true)}
              />
              <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{
                  width: '62%', aspectRatio: 0.76, borderRadius: 500,
                  borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)',
                }} />
              </View>
              {scanning && (
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
                  <ActivityIndicator color="#fff" />
                  <Text variant="caption" color="inherit" style={{ color: '#fff', marginTop: 8 }}>Checking photo quality…</Text>
                </View>
              )}
            </View>

            <View style={{ alignItems: 'center', marginTop: 16 }}>
              <Pressable
                onPress={takeShot}
                disabled={!cameraReady || scanning}
                style={{
                  width: 68, height: 68, borderRadius: 34, backgroundColor: '#fff',
                  borderWidth: 4, borderColor: semantic.brand, alignItems: 'center', justifyContent: 'center',
                  opacity: cameraReady && !scanning ? 1 : 0.5,
                }}
              >
                <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: semantic.brand }} />
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={{ alignItems: 'center', marginBottom: 12 }}>
            <Image source={{ uri: selfieUri! }} style={{ width: 220, height: 220, borderRadius: 110 }} resizeMode="cover" />
            <Pressable onPress={retake} style={{ marginTop: 14 }}>
              <Text variant="label" color="brand">Retake</Text>
            </Pressable>
          </View>
        )}

        <View style={{ marginTop: 18, marginBottom: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Info size={17} color={semantic.brandDark} />
            <Text variant="label">Selfie guidelines</Text>
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

        <Button label="Continue" onPress={goNext} disabled={!selfieUri || scanning} />
      </ScrollView>
    </SafeAreaView>
  );
}
