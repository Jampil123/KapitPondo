/**
 * theme/typography.ts
 * ----------------------------------------------------------------------------
 * The type system for KapitPondo. Poppins is the single family (already loaded
 * via @expo-google-fonts/poppins); personality comes from a disciplined scale
 * and weight choices, not from mixing faces.
 *
 * Usage:
 *   - In RN code:      <Text variant="h2">…</Text>   (see components/ui/Text.tsx)
 *   - Raw style:       style={typography.h2}
 *   - NativeWind:      className="font-poppins-semibold text-[20px]"  (tokens
 *                      are also wired into tailwind.config.js)
 */

// --- Font families -----------------------------------------------------------
// These string keys must match what you register in app/_layout.tsx via
// useFonts({ Poppins_400Regular, ... }). Keep names identical to the package.
export const fontFamily = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
} as const;

// --- Weights (semantic aliases) ---------------------------------------------
export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

// --- Type scale --------------------------------------------------------------
// Mobile-first scale. Line heights are absolute (px) for predictable layout.
// `tracking` = letterSpacing. Money/figures use tabular nums (see `numeric`).
export type TextVariant =
  | 'displayLarge'
  | 'displaySmall'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'bodyLarge'
  | 'body'
  | 'bodySmall'
  | 'label'
  | 'caption'
  | 'overline' // used for status pills + eyebrows
  | 'numeric'; // money / ledger amounts — tabular figures

import { type TextStyle } from 'react-native';

type TypeStyle = {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing?: number;
  textTransform?: 'none' | 'uppercase';
  fontVariant?: TextStyle['fontVariant'];
};

export const typography: Record<TextVariant, TypeStyle> = {
  displayLarge: { fontFamily: fontFamily.bold, fontSize: 32, lineHeight: 40, letterSpacing: -0.5 },
  displaySmall: { fontFamily: fontFamily.bold, fontSize: 28, lineHeight: 36, letterSpacing: -0.3 },

  h1: { fontFamily: fontFamily.semibold, fontSize: 24, lineHeight: 32, letterSpacing: -0.2 },
  h2: { fontFamily: fontFamily.semibold, fontSize: 20, lineHeight: 28 },
  h3: { fontFamily: fontFamily.semibold, fontSize: 18, lineHeight: 26 },

  bodyLarge: { fontFamily: fontFamily.regular, fontSize: 16, lineHeight: 24 },
  body: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 22 },
  bodySmall: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 20 },

  label: { fontFamily: fontFamily.medium, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 16 },

  // Eyebrows + status pills: small, tracked-out, uppercase.
  overline: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },

  // Amounts. Tabular figures keep digits aligned in tables/ledgers.
  numeric: {
    fontFamily: fontFamily.semibold,
    fontSize: 16,
    lineHeight: 24,
    fontVariant: ['tabular-nums'],
  },
};

// Flat map for tailwind.config.js (fontSize entries: [size, { lineHeight }]).
export const fontSizeScale = {
  'display-lg': [32, { lineHeight: '40px', letterSpacing: '-0.5px' }],
  'display-sm': [28, { lineHeight: '36px', letterSpacing: '-0.3px' }],
  h1: [24, { lineHeight: '32px' }],
  h2: [20, { lineHeight: '28px' }],
  h3: [18, { lineHeight: '26px' }],
  'body-lg': [16, { lineHeight: '24px' }],
  body: [14, { lineHeight: '22px' }],
  'body-sm': [13, { lineHeight: '20px' }],
  label: [14, { lineHeight: '20px' }],
  caption: [12, { lineHeight: '16px' }],
  overline: [11, { lineHeight: '16px', letterSpacing: '0.6px' }],
} as const;