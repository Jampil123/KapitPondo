/**
 * theme/index.ts — barrel. Import from '@/theme' everywhere:
 *   import { colors, typography, spacing, getStatusMeta } from '@/theme';
 */
export * from './colors';
export * from './typography';
export * from './spacing';
export * from './radius';
export * from './status';

import { colors } from './colors';
import { typography, fontFamily, fontWeight } from './typography';
import { spacing } from './spacing';
import { radius, elevation } from './radius';

export const theme = {
  colors,
  typography,
  fontFamily,
  fontWeight,
  spacing,
  radius,
  elevation,
} as const;

export type Theme = typeof theme;