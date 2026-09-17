/**
 * app/(app)/identity-capture.tsx — screen 1 of the verification flow: pick
 * an ID type and capture its front, on one screen (matches the prototype's
 * combined "ID capture" screen — a separate "which ID, then a placeholder
 * tile that pushes into a second camera screen" used to require an extra
 * page and an extra confirm tap; this is now the entry point of the flow
 * itself, reached directly from verify-landing.tsx / groups/create.tsx /
 * ProfileBody.tsx's "Verify now" actions, and from identity.tsx's own
 * mount-time redirect gate for anyone who lands there without a captured
 * ID yet).
 *
 * Uses a live camera preview (expo-camera) rather than the system camera app
 * (expo-image-picker's launchCameraAsync) so a card-shaped guide overlay can
 * be drawn on top of it. Front only — back-of-ID capture and QR scanning
 * were tried in an earlier revision and dropped in favor of a simpler,
 * single-photo flow.
 *
 * The shot is auto-cropped to the on-screen guide frame (expo-image-manipulator)
 * before being scanned on-device for blur (lib/blurDetection.ts) — advisory,
 * not a hard gate.
 * Accepting it immediately advances to selfie-capture.tsx — no separate
 * "Continue"/"Done" tap, matching the prototype's shutter → next screen.
 * The "Continue" button below only matters when arriving here with a photo
 * already in the draft (e.g. Review's "Retake ID" link) and deciding it's
 * fine as-is — it isn't shown mid-fresh-capture since that path navigates
 * away on its own.
 *
 * The accepted shot is written straight into identity.tsx's own AsyncStorage
 * draft (DRAFT_KEY) as soon as it's taken, rather than carried back as a
 * route param — the camera hand-off can get the process killed and
 * relaunched on some devices, which would lose an in-flight param but not an
 * already-persisted draft.
 */
import { useEffect, useRef, useState } from 'react';
import { View, ScrollView, Pressable, Image, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ImageManipulator } from 'expo-image-manipulator';
import { Camera, Info, Check, ChevronDown } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { VerificationStepHeader } from '@/components/shared/VerificationStepHeader';
import { PickerSheet } from '@/components/shared/PickerSheet';
import { semantic } from '@/theme/colors';
import { scanForBlur } from '@/lib/blurDetection';
import { ID_TYPES, idTypeLabel } from '@/constants/idTypes';

const DRAFT_KEY = 'identity_draft_v1';
const CARD_ASPECT_RATIO = 1.586; // standard ID card ratio (CR80), width:height
const FRAME_WIDTH_RATIO = 0.82; // frame's width as a fraction of the preview box
const DEFAULT_ID_TYPE = 'philsys'; // PhilSys National ID — recommended default, matches the prototype
const ALIGN_SETTLE_MS = 1200; // how long the camera must be ready before we call the shot "ready"

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

function CornerBracket({ position, active }: { position: 'tl' | 'tr' | 'bl' | 'br'; active?: boolean }) {
  const size = 26;
  const base = {
    position: 'absolute' as const,
    width: size,
    height: size,
    borderColor: active ? '#4ADE80' : semantic.brand,
  };
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
  const insets = useSafeAreaInsets();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const [uri, setUri] = useState<string | null>(null);
  const [idType, setIdType] = useState<string>(DEFAULT_ID_TYPE);
  const [idPickerOpen, setIdPickerOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [aligned, setAligned] = useState(false);
  const [previewSize, setPreviewSize] = useState<{ width: number; height: number } | null>(null);

  // Once the camera reports ready, treat the frame as settled/aligned after a
  // short beat — flips the "Hold steady" pill to "Ready to capture".
  useEffect(() => {
    if (!cameraReady) {
      setAligned(false);
      return;
    }
    const t = setTimeout(() => setAligned(true), ALIGN_SETTLE_MS);
    return () => clearTimeout(t);
  }, [cameraReady]);

  // Prefill from a photo/ID type already picked in a prior visit to this screen.
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(DRAFT_KEY);
        if (!raw) return;
        const d = JSON.parse(raw);
        if (d.idImageUri) setUri(d.idImageUri);
        if (d.idType) setIdType(d.idType);
      } catch {
        // Start fresh.
      }
    })();
  }, []);

  const showCamera = !uri;

  function pickIdType(value: string) {
    setIdType(value);
    setIdPickerOpen(false);
    mergeIntoDraft({ idType: value });
  }

  function goNext() {
    router.replace('/(app)/selfie-capture' as any);
  }

  // Reached via Review's "Retake ID" link (?from=review) → back returns to
  // Review, not past it to whatever launched the flow. Otherwise this is a
  // genuine exit — discard the draft so the next attempt starts clean at
  // step 1 instead of silently resuming with a stale ID/selfie. Deciding this
  // from the route param (not the draft's own persisted `step`) matters:
  // `step` gets bumped to 3 permanently the moment both ID and selfie are
  // captured once, so it can't tell "came from Review" apart from "just an
  // ordinary user who progressed past step 2 and is now backing out for real".
  function goBack() {
    if (from === 'review') {
      router.replace('/(app)/identity' as any);
    } else {
      AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
      router.back();
    }
  }

  function acceptShot(pickedUri: string) {
    setUri(pickedUri);
    mergeIntoDraft({ idImageUri: pickedUri, idType });
    goNext();
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

  // Maps the on-screen guide frame onto the full-resolution photo and crops
  // to it. The preview fills its box the same way a `cover`-fit image does
  // (scaled up, centered, edges clipped), so the frame's screen rect is
  // translated into source-pixel coordinates using that same scale factor.
  async function cropToFrame(photo: { uri: string; width: number; height: number }): Promise<string> {
    if (!previewSize) return photo.uri;
    try {
      const { width: boxW, height: boxH } = previewSize;
      const scale = Math.max(boxW / photo.width, boxH / photo.height);
      const visibleW = boxW / scale;
      const visibleH = boxH / scale;
      const visibleX = (photo.width - visibleW) / 2;
      const visibleY = (photo.height - visibleH) / 2;

      const frameW = boxW * FRAME_WIDTH_RATIO;
      const frameH = frameW / CARD_ASPECT_RATIO;
      const frameX = (boxW - frameW) / 2;
      const frameY = (boxH - frameH) / 2;

      const originX = Math.max(0, Math.round(visibleX + frameX / scale));
      const originY = Math.max(0, Math.round(visibleY + frameY / scale));
      const width = Math.min(Math.round(frameW / scale), photo.width - originX);
      const height = Math.min(Math.round(frameH / scale), photo.height - originY);
      if (width <= 0 || height <= 0) return photo.uri;

      const rendered = await ImageManipulator.manipulate(photo.uri)
        .crop({ originX, originY, width, height })
        .renderAsync();
      const result = await rendered.saveAsync({ compress: 0.9 });
      return result.uri;
    } catch {
      return photo.uri;
    }
  }

  async function takeShot() {
    if (!cameraRef.current || !cameraReady || scanning) return;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
    if (!photo?.uri) return;
    const croppedUri = await cropToFrame(photo);
    checkBlurThenAccept(croppedUri);
  }

  function retake() {
    setUri(null);
    setCameraReady(false);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }}>
      <VerificationStepHeader title="Capture your ID" step={1} totalSteps={4} onBack={goBack} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 8, paddingBottom: 32 }}>
        <View style={{ marginBottom: 18 }}>
          <Text variant="body" color="secondary">
            Choose an ID to submit, then align its front inside the frame in good lighting.
          </Text>
        </View>

        <Text variant="label" color="secondary" style={{ fontSize: 12.5, marginBottom: 8 }}>Selected ID</Text>
        <Pressable
          onPress={() => setIdPickerOpen(true)}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 10,
            backgroundColor: semantic.surfaceAlt, borderRadius: 12,
            paddingVertical: 14, paddingHorizontal: 14, marginBottom: 18,
          }}
        >
          <Text variant="body" style={{ flex: 1, color: semantic.textPrimary }}>
            {idTypeLabel(idType)}
          </Text>
          <ChevronDown size={18} color={semantic.textMuted} />
        </Pressable>

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
          </View>
        ) : showCamera ? (
          <View style={{ marginBottom: 12 }}>
            <View
              style={{ height: 420, borderRadius: 20, overflow: 'hidden', backgroundColor: '#000' }}
              onLayout={(e) => setPreviewSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
            >
              <CameraView
                ref={cameraRef}
                style={{ flex: 1 }}
                facing="back"
                onCameraReady={() => setCameraReady(true)}
                // The app is portrait-locked (app.json's orientation setting),
                // but iOS can still capture a landscape shot if the phone is
                // physically tilted sideways unless this is explicitly off —
                // the crop math in cropToFrame() assumes a portrait photo.
                responsiveOrientationWhenOrientationLocked={false}
              />
              <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{
                  width: `${FRAME_WIDTH_RATIO * 100}%`, aspectRatio: CARD_ASPECT_RATIO,
                  borderWidth: 2, borderStyle: aligned ? 'solid' : 'dashed',
                  borderColor: aligned ? '#4ADE80' : 'rgba(255,255,255,0.6)',
                  borderRadius: 14,
                }} />
              </View>
              <CornerBracket position="tl" active={aligned} />
              <CornerBracket position="tr" active={aligned} />
              <CornerBracket position="bl" active={aligned} />
              <CornerBracket position="br" active={aligned} />
              <View style={{
                position: 'absolute', bottom: 16, alignSelf: 'center',
                flexDirection: 'row', alignItems: 'center', gap: 6,
                backgroundColor: aligned ? 'rgba(62,142,102,0.85)' : 'rgba(20,24,26,0.55)',
                borderRadius: 20, paddingVertical: 7, paddingHorizontal: 13,
              }}>
                {aligned ? (
                  <Check size={12} color="#fff" strokeWidth={3} />
                ) : (
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: semantic.brand }} />
                )}
                <Text variant="caption" color="inherit" style={{ color: '#fff', fontWeight: '600' }}>
                  {aligned ? 'Ready to capture' : 'Hold steady'}
                </Text>
              </View>
              {scanning && (
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
                  <ActivityIndicator color="#fff" />
                  <Text variant="caption" color="inherit" style={{ color: '#fff', marginTop: 8 }}>Checking photo quality…</Text>
                </View>
              )}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 16 }}>
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

        <Button label="Continue" onPress={goNext} disabled={!uri || scanning} />
      </ScrollView>

      <PickerSheet
        visible={idPickerOpen}
        title="Select ID type"
        options={ID_TYPES}
        selected={idType}
        onSelect={pickIdType}
        onClose={() => setIdPickerOpen(false)}
        insets={insets}
      />
    </SafeAreaView>
  );
}
