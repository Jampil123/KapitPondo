/**
 * theme/colors.ts
 * ----------------------------------------------------------------------------
 * KapitPondo palette. Direction: trustworthy but warm — a community fund, not a
 * cold bank. Deep emerald carries "growth + money + trust"; a warm gold accent
 * nods to "pondo" (the fund itself) and is spent sparingly on highlights.
 *
 * Semantic intents (success/warning/danger/info/neutral) are what the rest of
 * the app consumes — screens should reference `intent.*`, not raw ramp values,
 * so the status system in theme/status.ts stays the single source of truth.
 */

// --- Brand ramp (emerald) ----------------------------------------------------
export const emerald = {
  50: '#E8F5EF',
  100: '#C6E7D7',
  200: '#92D1B4',
  300: '#5DB890',
  400: '#2F9E70',
  500: '#0B6E4F', // primary
  600: '#095C42',
  700: '#074A35',
  800: '#053829',
  900: '#03261C',
} as const;

// --- Accent ramp (gold) — use sparingly --------------------------------------
export const gold = {
  100: '#FBEFCF',
  300: '#F2D27A',
  500: '#E0A92E', // accent
  700: '#A9781A',
} as const;

// --- Neutral ramp (slate) ----------------------------------------------------
export const slate = {
  0: '#FFFFFF',
  50: '#F7F8F8',
  100: '#EEF0F1',
  200: '#DEE2E4',
  300: '#C3C9CD',
  400: '#9AA3A9',
  500: '#6E777D',
  600: '#4F575C',
  700: '#3A4044',
  800: '#23282B',
  900: '#14181A',
  950: '#0B0D0E',
} as const;

// --- Functional ramps for status intents -------------------------------------
const green = { 50: '#E7F6EC', 100: '#C2E9CF', 500: '#1E9E4F', 600: '#16803F', 700: '#0F5F2E' };
const amber = { 50: '#FFF6E5', 100: '#FCE7BF', 500: '#D98A04', 600: '#B26E02', 700: '#8A5402' };
const red   = { 50: '#FDECEC', 100: '#F8CFCF', 500: '#D23B3B', 600: '#B12B2B', 700: '#8C2020' };
const blue  = { 50: '#E9F1FD', 100: '#CCDEFA', 500: '#2C6CD6', 600: '#2156AE', 700: '#193F80' };

// --- Semantic intents (consume these, not the ramps above) -------------------
export const intent = {
  primary:   { base: emerald[500], strong: emerald[600], soft: emerald[50],  on: slate[0],  text: emerald[700] },
  accent:    { base: gold[500],    strong: gold[700],    soft: gold[100],     on: slate[900], text: gold[700] },
  success:   { base: green[500],   strong: green[700],   soft: green[50],     on: slate[0],  text: green[700] },
  warning:   { base: amber[500],   strong: amber[700],   soft: amber[50],     on: slate[900], text: amber[700] },
  danger:    { base: red[500],     strong: red[700],     soft: red[50],       on: slate[0],  text: red[700] },
  info:      { base: blue[500],    strong: blue[700],    soft: blue[50],      on: slate[0],  text: blue[700] },
  neutral:   { base: slate[400],   strong: slate[600],   soft: slate[100],    on: slate[900], text: slate[600] },
} as const;

export type IntentName = keyof typeof intent;

// --- Surface / text roles ----------------------------------------------------
export const semantic = {
  background: slate[50],
  surface: slate[0],
  surfaceAlt: slate[100],
  border: slate[200],
  borderStrong: slate[300],

  textPrimary: slate[900],
  textSecondary: slate[600],
  textMuted: slate[400],
  textOnBrand: slate[0],

  brand: emerald[500],
  brandDark: emerald[600],
  accent: gold[500],
} as const;

export const colors = { emerald, gold, slate, green, amber, red, blue, intent, semantic } as const;