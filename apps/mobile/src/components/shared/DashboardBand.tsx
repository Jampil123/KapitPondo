import { createContext, useContext, type ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { steel } from '../../theme/colors';

const BAND_TOP = '#C9DDE8';
const BAND_COLORS = [BAND_TOP, steel[200], steel[100]] as const;
const SHELL_PADDING = 20; // DashboardShell's ScrollView padding — the band cancels it to run edge to edge

// Frosted surface for dense detail (lists, stage strips) that sits on the band.
export const glassPanel = {
  backgroundColor: 'rgba(255,255,255,0.6)',
  borderRadius: 16,
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.75)',
} as const;

export const DashboardHeaderContext = createContext<ReactNode>(null);

function Waves() {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 400 300" preserveAspectRatio="none" style={StyleSheet.absoluteFill} pointerEvents="none">
      <Path d="M-10 220 C 70 150, 150 270, 240 200 S 380 110, 420 160" stroke="#fff" strokeOpacity={0.5} strokeWidth={1.2} fill="none" />
      <Path d="M-10 250 C 90 180, 160 290, 260 225 S 390 150, 420 190" stroke="#fff" strokeOpacity={0.4} strokeWidth={1} fill="none" />
      <Path d="M-10 190 C 60 120, 170 240, 250 170 S 370 80, 420 120" stroke="#fff" strokeOpacity={0.3} strokeWidth={1} fill="none" />
    </Svg>
  );
}

export function DashboardBand({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const header = useContext(DashboardHeaderContext);

  return (
    <View style={{ marginHorizontal: -SHELL_PADDING, marginBottom: 10 }}>
      {/* Covers the iOS overscroll gap above the band. */}
      <View pointerEvents="none" style={{ position: 'absolute', top: -800, left: 0, right: 0, height: 800, backgroundColor: BAND_TOP }} />
      <View style={{ borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden' }}>
        <LinearGradient colors={BAND_COLORS} style={StyleSheet.absoluteFill} />
        <Waves />
        <View style={{ paddingTop: insets.top, paddingHorizontal: SHELL_PADDING, paddingBottom: 20, gap: 8 }}>
          {header}
          {children}
        </View>
      </View>
    </View>
  );
}
