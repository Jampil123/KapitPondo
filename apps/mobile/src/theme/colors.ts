/**
 * theme/colors.ts  — REGENERATED to match the real UI prototype.
 * ----------------------------------------------------------------------------
 * Palette extracted from KapitPondo_Auth.html. Direction: calm steel-blue /
 * slate — trustworthy, soft, financial. Export NAMES/SHAPES are unchanged, so
 * Text.tsx and StatusBadge.tsx keep working without edits.
 *
 * Source tokens from the prototype:
 *   bg #F7FBFD · card #FFF · chip #D6E6EF · accent #7FA6B8 · accentDk #5E8497
 *   soft #EAF2F6 · ink #2A3E4B · muted #6F8A99 · faint #9DB2BE · line #E4EDF2
 *   ok #3E8E66 / okBg #E2F0E8 · dang #C25C5E / dangBg #F7E5E5 · warn #A87C2C / warnBg #F8EFDA
 */

// --- Brand ramp (steel blue) -------------------------------------------------
export const steel = {
  50: '#F7FBFD',
  100: '#EAF2F6',
  200: '#D6E6EF',
  300: '#9DB2BE',
  400: '#7FA6B8', // accent (primary)
  500: '#6A93A6',
  600: '#5E8497', // accentDk
  700: '#4A6A7A',
  800: '#37505D',
  900: '#2A3E4B', // ink
} as const;

// --- Neutral ramp ------------------------------------------------------------
export const slate = {
  0: '#FFFFFF',
  50: '#F7FBFD',
  100: '#EAF2F6',
  200: '#E4EDF2',
  300: '#D6E6EF',
  400: '#9DB2BE',
  500: '#6F8A99',
  600: '#5E8497',
  700: '#37505D',
  800: '#2A3E4B',
  900: '#1B2832',
  950: '#10161B',
} as const;

// --- Gold (warning only) -----------------------------------------------------
export const gold = { 100: '#F8EFDA', 500: '#A87C2C', 700: '#7E5C1F' } as const;

// --- Functional ramps --------------------------------------------------------
const green = { 50: '#E2F0E8', 500: '#3E8E66', 700: '#2C6B4B' };
const amber = { 50: '#F8EFDA', 500: '#A87C2C', 700: '#7E5C1F' };
const red   = { 50: '#F7E5E5', 500: '#C25C5E', 700: '#963E40' };

// --- Semantic intents (consume these; map to the prototype's pill colors) ----
export const intent = {
  primary:  { base: '#7FA6B8', strong: '#5E8497', soft: '#EAF2F6', on: '#FFFFFF', text: '#5E8497' },
  accent:   { base: '#5E8497', strong: '#2A3E4B', soft: '#EAF2F6', on: '#FFFFFF', text: '#5E8497' },
  success:  { base: green[500], strong: green[700], soft: green[50], on: '#FFFFFF', text: green[500] },
  warning:  { base: amber[500], strong: amber[700], soft: amber[50], on: '#2A3E4B', text: amber[500] },
  danger:   { base: red[500],   strong: red[700],   soft: red[50],   on: '#FFFFFF', text: red[500] },
  info:     { base: '#5E8497',  strong: '#2A3E4B',  soft: '#EAF2F6', on: '#FFFFFF', text: '#5E8497' },
  neutral:  { base: '#9DB2BE',  strong: '#6F8A99',  soft: '#D6E6EF', on: '#2A3E4B', text: '#2A3E4B' },
} as const;

export type IntentName = keyof typeof intent;

// --- Surface / text roles ----------------------------------------------------
export const semantic = {
  background: '#F7FBFD',
  surface: '#FFFFFF',
  surfaceAlt: '#EAF2F6',
  border: '#E4EDF2',
  borderStrong: '#D6E6EF',

  textPrimary: '#2A3E4B',
  textSecondary: '#6F8A99',
  textMuted: '#9DB2BE',
  textOnBrand: '#FFFFFF',

  brand: '#7FA6B8',
  brandDark: '#5E8497',
  accent: '#5E8497',
} as const;

// Shared card/button shadow from the prototype (use in StyleSheet).
// shadow* + elevation = iOS/Android; boxShadow = web.
export const shadowToken = {
  card: { shadowColor: '#2A3E4B', shadowOpacity: 0.07, shadowRadius: 20, shadowOffset: { width: 0, height: 6 }, elevation: 4, boxShadow: '0px 6px 20px rgba(42,62,75,0.07)' },
  button: { shadowColor: '#7FA6B8', shadowOpacity: 0.32, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6, boxShadow: '0px 8px 18px rgba(127,166,184,0.32)' },
} as const;

export const colors = { steel, slate, gold, green, amber, red, intent, semantic, shadowToken } as const;