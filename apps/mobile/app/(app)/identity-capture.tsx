/**
 * app/(app)/identity-capture.tsx — dedicated front/back ID capture flow,
 * reached from identity.tsx step 1's "ID Photos" tile.
 *
 * Uses a live camera preview (expo-camera) rather than the system camera app
 * (expo-image-picker's launchCameraAsync) so a card-shaped guide overlay can
 * be drawn on top of it for both sides. The back step also live-scans for a
 * QR code — expo-camera's barcode scanning is built-in, no separate decode
 * library needed — since the PhilSys National ID carries one on the back.
 *
 * IMPORTANT — what the QR step is and isn't: PhilSys's QR payload is
 * cryptographically signed by PSA, and this only decodes and surfaces that
 * raw payload for the reviewer. It does NOT verify the signature (that needs
 * PSA's actual public key/spec, which isn't available here), so a
 * detected/missing QR is shown as a soft signal for manual review, never as
 * proof either way of the ID's authenticity.
 *
 * Each shot (camera or gallery) is also scanned on-device for blur
 * (lib/blurDetection.ts) before being accepted — advisory, not a hard gate.
 *
 * Accepted shots are written straight into identity.tsx's own AsyncStorage
 * draft (DRAFT_KEY) as they're taken, rather than carried back as route
 * params — the camera hand-off can get the process killed and relaunched on
 * some devices, which would lose an in-flight param but not an
 * already-persisted draft. identity.tsx picks the new data up via
 * useFocusEffect when this screen is popped.
 */
import { useEffect, useRef, useState } from 'react';
import { View, ScrollView, Pressable, Image, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions, scanFromURLAsync, type BarcodeScanningResult } from 'expo-camera';
import { Camera, Info, Check, QrCode } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Stepper } from '@/components/ui/Stepper';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { semantic } from '@/theme/colors';
import { scanForBlur } from '@/lib/blurDetection';

const DRAFT_KEY = 'identity_draft_v1';
const CAPTURE_STEPS = ['Front', 'Back'];
const CARD_ASPECT_RATIO = 1.586; // standard ID card ratio (CR80), width:height

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
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const [side, setSide] = useState<Side>('front');
  const [frontUri, setFrontUri] = useState<string | null>(null);
  const [backUri, setBackUri] = useState<string | null>(null);
  const [backQrData, setBackQrData] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [liveQr, setLiveQr] = useState<string | null>(null);
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
        if (d.idBackQrData !== undefined) setBackQrData(d.idBackQrData);
      } catch {
        // Start fresh.
      }
    })();
  }, []);

  // Reset the live-scan session state when switching sides (not on every render).
  useEffect(() => {
    setLiveQr(null);
    setCameraReady(false);
  }, [side]);

  const uri = side === 'front' ? frontUri : backUri;
  const setUri = side === 'front' ? setFrontUri : setBackUri;
  const showCamera = !uri;

  function handleBarcodeScanned(result: BarcodeScanningResult) {
    if (side === 'back' && result.data) setLiveQr(result.data);
  }

  function acceptShot(pickedUri: string, qrData: string | null) {
    setUri(pickedUri);
    if (side === 'front') {
      mergeIntoDraft({ idImageUri: pickedUri });
    } else {
      setBackQrData(qrData);
      mergeIntoDraft({ idBackImageUri: pickedUri, idBackQrData: qrData });
    }
  }

  function afterCapture(pickedUri: string, qrData: string | null) {
    if (side === 'back' && !qrData) {
      Alert.alert(
        'No QR code detected',
        "We couldn't find a QR code on this shot. A genuine PhilSys National ID has one on the back — you can continue, but this submission may need extra manual review.",
        [
          { text: 'Retake', style: 'cancel' },
          { text: 'Continue Anyway', onPress: () => acceptShot(pickedUri, null) },
        ],
      );
      return;
    }
    acceptShot(pickedUri, qrData);
  }

  async function checkBlurThenAccept(pickedUri: string, qrData: string | null) {
    setScanning(true);
    const { blurry } = await scanForBlur(pickedUri);
    setScanning(false);

    if (blurry) {
      Alert.alert(
        'Photo looks blurry',
        'This shot may be too blurry to read clearly. Retake for a sharper scan?',
        [
          { text: 'Retake', style: 'cancel' },
          { text: 'Use Anyway', onPress: () => afterCapture(pickedUri, qrData) },
        ],
      );
      return;
    }
    afterCapture(pickedUri, qrData);
  }

  async function takeShot() {
    if (!cameraRef.current || !cameraReady || scanning) return;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
    if (!photo?.uri) return;
    checkBlurThenAccept(photo.uri, side === 'back' ? liveQr : null);
  }

  async function pickFromLibrary() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access to choose an ID photo.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (res.canceled) return;
    const pickedUri = res.assets[0].uri;

    let qrData: string | null = null;
    if (side === 'back') {
      try {
        const results = await scanFromURLAsync(pickedUri, ['qr']);
        qrData = results[0]?.data ?? null;
      } catch {
        qrData = null;
      }
    }
    checkBlurThenAccept(pickedUri, qrData);
  }

  function retake() {
    setUri(null);
    if (side === 'back') setBackQrData(null);
    setLiveQr(null);
    setCameraReady(false);
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
            {side === 'front'
              ? 'Align the front of your ID inside the frame, in good lighting.'
              : "Align the back of your ID inside the frame — we'll also look for its QR code."}
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
                barcodeScannerSettings={side === 'back' ? { barcodeTypes: ['qr'] } : undefined}
                onBarcodeScanned={side === 'back' ? handleBarcodeScanned : undefined}
              />
              <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{
                  width: '84%', aspectRatio: CARD_ASPECT_RATIO,
                  borderWidth: 3, borderColor: liveQr && side === 'back' ? '#5FD68A' : 'rgba(255,255,255,0.9)',
                  borderRadius: 18,
                }} />
              </View>
              {side === 'back' && (
                <View style={{
                  position: 'absolute', top: 14, alignSelf: 'center',
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  backgroundColor: liveQr ? 'rgba(63,158,110,0.92)' : 'rgba(20,24,26,0.55)',
                  borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12,
                }}>
                  <QrCode size={14} color="#fff" />
                  <Text variant="caption" color="inherit" style={{ color: '#fff', fontWeight: '600' }}>
                    {liveQr ? 'QR code detected' : 'Looking for QR code…'}
                  </Text>
                </View>
              )}
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
            {side === 'back' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
                <QrCode size={15} color={backQrData ? '#3E8E66' : semantic.textMuted} />
                <Text variant="caption" color="secondary">
                  {backQrData ? 'QR code captured for reviewer' : 'No QR code detected on this shot'}
                </Text>
              </View>
            )}
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
