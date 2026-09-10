/**
 * app/(app)/identity-capture.tsx — dedicated front-of-ID capture flow,
 * reached from identity.tsx step 1's "ID Photo" tile.
 *
 * Uses a live camera preview (expo-camera) rather than the system camera app
 * (expo-image-picker's launchCameraAsync) so a card-shaped guide overlay can
 * be drawn on top of it. Front only — back-of-ID capture and QR scanning
 * were tried in an earlier revision and dropped in favor of a simpler,
 * single-photo flow.
 *
 * The shot (camera or gallery) is scanned on-device for blur
 * (lib/blurDetection.ts) before being accepted — advisory, not a hard gate.
 *
 * The accepted shot is written straight into identity.tsx's own AsyncStorage
 * draft (DRAFT_KEY) as soon as it's taken, rather than carried back as a
 * route param — the camera hand-off can get the process killed and
 * relaunched on some devices, which would lose an in-flight param but not an
 * already-persisted draft. identity.tsx picks it up via useFocusEffect when
 * this screen is popped.
 */
import { useEffect, useRef, useState } from 'react';
import { View, ScrollView, Pressable, Image, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Camera, Info, Check } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { VerificationStepHeader } from '@/components/shared/VerificationStepHeader';
import { semantic } from '@/theme/colors';
import { scanForBlur } from '@/lib/blurDetection';

const DRAFT_KEY = 'identity_draft_v1';
const CARD_ASPECT_RATIO = 1.586; // standard ID card ratio (CR80), width:height

const GUIDES = [
  'ID must be fully visible inside the frame',
  'Free from glare, blur or shadows',
  'All text and numbers are readable',
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

function CornerBracket({ position }: { position: 'tl' | 'tr' | 'bl' | 'br' }) {
  const size = 26;
  const base = { position: 'absolute' as const, width: size, height: size, borderColor: semantic.brand };
  const styles = {
    tl: { top: 14, left: 14, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 10 },
    tr: { top: 14, right: 14, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 10 },
    bl: { bottom: 14, left: 14, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 10 },
    br: { bottom: 14, right: 14, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 10 },
  } as const;
  return <View style={[base, styles[position]]} />;
}

export default function IdentityCapture() {
  const router = useRouter();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const [uri, setUri] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [scanning, setScanning] = useState(false);

  // Prefill from a photo already captured in a prior visit to this screen.
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(DRAFT_KEY);
        if (!raw) return;
        const d = JSON.parse(raw);
        if (d.idImageUri) setUri(d.idImageUri);
      } catch {
        // Start fresh.
      }
    })();
  }, []);

  const showCamera = !uri;

  function acceptShot(pickedUri: string) {
    setUri(pickedUri);
    mergeIntoDraft({ idImageUri: pickedUri });
  }

  async function checkBlurThenAccept(pickedUri: string) {
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

  async function takeShot() {
    if (!cameraRef.current || !cameraReady || scanning) return;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
    if (!photo?.uri) return;
    checkBlurThenAccept(photo.uri);
  }

  async function pickFromLibrary() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access to choose an ID photo.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (res.canceled) return;
    checkBlurThenAccept(res.assets[0].uri);
  }

  function retake() {
    setUri(null);
    setCameraReady(false);
  }

  function done() {
    router.back();
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }}>
      <VerificationStepHeader title="Capture your ID" step={1} totalSteps={4} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 8, paddingBottom: 32 }}>
        <View style={{ marginBottom: 18 }}>
          <Text variant="body" color="secondary">
            Align the front of your ID inside the frame, in good lighting.
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
              KapitPondo needs camera access to capture your ID.
            </Text>
            <Button label="Grant Camera Access" onPress={requestPermission} />
            <Pressable onPress={pickFromLibrary}>
              <Text variant="label" color="brand">Choose from Gallery instead</Text>
            </Pressable>
          </View>
        ) : showCamera ? (
          <View style={{ marginBottom: 12 }}>
            <View style={{ height: 420, borderRadius: 20, overflow: 'hidden', backgroundColor: '#000' }}>
              <CameraView
                ref={cameraRef}
                style={{ flex: 1 }}
                facing="back"
                onCameraReady={() => setCameraReady(true)}
              />
              <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{
                  width: '82%', aspectRatio: CARD_ASPECT_RATIO,
                  borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.6)',
                  borderRadius: 14,
                }} />
              </View>
              <CornerBracket position="tl" />
              <CornerBracket position="tr" />
              <CornerBracket position="bl" />
              <CornerBracket position="br" />
              <View style={{
                position: 'absolute', bottom: 16, alignSelf: 'center',
                flexDirection: 'row', alignItems: 'center', gap: 6,
                backgroundColor: 'rgba(20,24,26,0.55)', borderRadius: 20, paddingVertical: 7, paddingHorizontal: 13,
              }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: semantic.brand }} />
                <Text variant="caption" color="inherit" style={{ color: '#fff', fontWeight: '600' }}>Hold steady</Text>
              </View>
              {scanning && (
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
                  <ActivityIndicator color="#fff" />
                  <Text variant="caption" color="inherit" style={{ color: '#fff', marginTop: 8 }}>Checking photo quality…</Text>
                </View>
              )}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28, marginTop: 16 }}>
              <View style={{ width: 46, alignItems: 'flex-start' }}>
                <Pressable onPress={pickFromLibrary}>
                  <Text variant="label" color="brand">Gallery</Text>
                </Pressable>
              </View>
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
              <View style={{ width: 46 }} />
            </View>
          </View>
        ) : (
          <View style={{ marginBottom: 12 }}>
            <Image source={{ uri: uri! }} style={{ width: '100%', height: 220, borderRadius: 16 }} resizeMode="cover" />
            <Pressable onPress={retake} style={{ alignSelf: 'center', marginTop: 12 }}>
              <Text variant="label" color="brand">Retake</Text>
            </Pressable>
          </View>
        )}

        <View style={{ marginTop: 18, marginBottom: 18 }}>
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

        <Button label="Done" onPress={done} disabled={!uri || scanning} />
      </ScrollView>
    </SafeAreaView>
  );
}
