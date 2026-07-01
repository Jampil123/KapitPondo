/**
 * theme/radius.ts — corner radii + a small elevation set.
 */
export const radius = {
  none: 0,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
} as const;

// RN shadows differ iOS vs Android; expose both so components stay consistent.
export const elevation = {
  none: {},
  sm: {
    shadowColor: '#0B0D0E',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    boxShadow: '0px 2px 4px rgba(11,13,14,0.06)',
  },
  md: {
    shadowColor: '#0B0D0E',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
    boxShadow: '0px 6px 12px rgba(11,13,14,0.10)',
  },
} as const;

export type RadiusToken = keyof typeof radius;