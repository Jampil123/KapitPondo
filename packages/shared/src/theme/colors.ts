/**
 * packages/shared/src/theme/colors.ts
 * ----------------------------------------------------------------------------
 * The Arctic Pearl palette as framework-agnostic hexes. Imported by both
 * apps/mobile (React Native styles) and apps/admin (Tailwind @theme / inline).
 * Keep this the single source of truth for brand colors across surfaces.
 */
export const palette = {
  bg: '#F7FBFD',
  surface: '#FFFFFF',
  surfaceAlt: '#EAF2F6',
  border: '#E4EDF2',
  borderStrong: '#D6E6EF',
  brand: '#7FA6B8',
  brandDark: '#5E8497',
  ink: '#2A3E4B',
  textSecondary: '#6F8A99',
  textMuted: '#9DB2BE',
  success: '#3E8E66',
  successBg: '#E2F0E8',
  danger: '#C25C5E',
  dangerBg: '#F7E5E5',
  warning: '#A87C2C',
  warningBg: '#F8EFDA',
} as const;

export type PaletteKey = keyof typeof palette;