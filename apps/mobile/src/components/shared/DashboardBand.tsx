import { createContext, useContext, type ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Stop, Rect, Path, G } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { steel, semantic } from '../../theme/colors';
import { AppBar } from './AppBar';

const BAND_PADDING = 20;

// dashboard_bg.svg is a 1170x2532 full-screen artwork; the band shows a crop that starts above its wave crests.
const ART_WIDTH = 1170;
const ART_HEIGHT = 2532;
const CROP_Y = 420;
const CROP_HEIGHT = 1500;

// Secondary text drawn directly on the band — the band reaches steel[400] toward the bottom right, so it needs full ink.
export const onBandText = steel[900];

// Diameter of the round toggle a dashboard can straddle across the bottom-right edge of the band.
export const BAND_TAB_SIZE = 30;

// Frosted surface for dense detail (lists, stage strips) that sits on the band.
export const glassPanel = {
  backgroundColor: 'rgba(255,255,255,0.6)',
  borderRadius: 16,
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.75)',
} as const;

export const DashboardHeaderContext = createContext<ReactNode>(null);

const FINE_WAVES = Array.from({ length: 15 }, (_, i) =>
  `M -70 ${1575 + 25 * i} C ${190 + 5 * i} ${1455 + 25 * i}, ${320 + 5 * i} ${1250 + 25 * i}, ${540 + 5 * i} ${1030 + 25 * i} C ${750 + 5 * i} ${820 + 25 * i}, ${905 + 5 * i} ${705 + 25 * i}, ${1145 + 5 * i} ${800 + 25 * i}`);

const CROSSING_WAVES = Array.from({ length: 9 }, (_, i) =>
  `M ${560 - 20 * i} ${1180 + 30 * i} C ${760 - 10 * i} ${1090 + 25 * i}, 900 ${1010 + 25 * i}, ${1210 + 5 * i} ${820 + 25 * i}`);

function Backdrop() {
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox={`0 ${CROP_Y} ${ART_WIDTH} ${CROP_HEIGHT}`}
      preserveAspectRatio="xMinYMin slice"
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      <Defs>
        <LinearGradient id="bg" x1="0" y1="0" x2="1" y2="0.95">
          <Stop offset="0%" stopColor={steel[100]} />
          <Stop offset="48%" stopColor={steel[400]} />
          <Stop offset="100%" stopColor={steel[200]} />
        </LinearGradient>
        <RadialGradient id="glow" cx="62%" cy="42%" r="62%">
          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.22} />
          <Stop offset="58%" stopColor="#FFFFFF" stopOpacity={0.06} />
          <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
        </RadialGradient>
        <LinearGradient id="waveFade" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.68} />
          <Stop offset="55%" stopColor="#FFFFFF" stopOpacity={0.35} />
          <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={0.18} />
        </LinearGradient>
      </Defs>

      <Rect width={ART_WIDTH} height={ART_HEIGHT} fill="url(#bg)" />
      <Rect width={ART_WIDTH} height={ART_HEIGHT} fill="url(#glow)" />

      <Path
        d="M -80 1580 C 180 1460, 310 1260, 525 1040 C 735 825, 895 700, 1135 790 C 1260 838, 1300 930, 1370 1030 L 1370 2532 L -80 2532 Z"
        fill="#FFFFFF"
        fillOpacity={0.09}
      />

      <G fill="none" stroke="url(#waveFade)" strokeWidth={2.2}>
        {FINE_WAVES.map((d) => <Path key={d} d={d} />)}
      </G>

      <G fill="none" stroke="#FFFFFF" strokeOpacity={0.22} strokeWidth={2}>
        {CROSSING_WAVES.map((d) => <Path key={d} d={d} />)}
      </G>

      <Path
        d="M 60 2140 C 260 1880, 480 1750, 710 1780 C 930 1810, 1015 1990, 1010 2210 C 1005 2350, 965 2470, 900 2580"
        fill="none" stroke="#FFFFFF" strokeOpacity={0.24} strokeWidth={4}
      />
      <Path
        d="M 35 2180 C 250 1910, 475 1780, 720 1810 C 950 1840, 1035 2020, 1025 2240 C 1020 2380, 980 2490, 915 2600"
        fill="none" stroke="#FFFFFF" strokeOpacity={0.12} strokeWidth={12}
      />
    </Svg>
  );
}

export function DashboardBand({ children, tab }: { children: ReactNode; tab?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const header = useContext(DashboardHeaderContext);

  return (
    <View style={{ zIndex: 2, marginBottom: tab ? BAND_TAB_SIZE / 2 + 6 : 10 }}>
      <View style={{ borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden' }}>
        <Backdrop />
        <View style={{ paddingTop: insets.top, paddingHorizontal: BAND_PADDING, paddingBottom: 20, gap: 8 }}>
          {header}
          {children}
        </View>
      </View>
      {tab ? (
        <View pointerEvents="box-none" style={{ position: 'absolute', right: BAND_PADDING, bottom: -BAND_TAB_SIZE / 2 }}>
          {tab}
        </View>
      ) : null}
    </View>
  );
}

/** The dashboard band's steel-blue backdrop behind a page's back/title bar, so sub-pages share the dashboard header's colour; square-cornered, unlike the dashboard band. */
export function BandHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ overflow: 'hidden' }}>
      <Backdrop />
      <View style={{ paddingTop: insets.top, paddingBottom: 6 }}>
        <AppBar title={title} subtitle={subtitle} right={right} backgroundColor="transparent" tintColor={semantic.textPrimary} />
      </View>
    </View>
  );
}
