/**
 * tailwind.config.js  (NativeWind 4)
 * ----------------------------------------------------------------------------
 * Mirrors the design tokens so className utilities match theme/* exactly.
 *   className="bg-brand text-on-brand"   ==  semantic.brand / textOnBrand
 *   className="text-h2 font-poppins-semibold"
 *
 * Keep this in sync with src/theme. The tokens below are duplicated as plain
 * literals because tailwind.config can't import .ts ESM in all setups; if your
 * toolchain allows it, import fontSizeScale from './src/theme/typography'.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        'poppins': ['Poppins_400Regular'],
        'poppins-medium': ['Poppins_500Medium'],
        'poppins-semibold': ['Poppins_600SemiBold'],
        'poppins-bold': ['Poppins_700Bold'],
      },
      fontSize: {
        'display-lg': ['32px', { lineHeight: '40px', letterSpacing: '-0.5px' }],
        'display-sm': ['28px', { lineHeight: '36px', letterSpacing: '-0.3px' }],
        h1: ['24px', { lineHeight: '32px' }],
        h2: ['20px', { lineHeight: '28px' }],
        h3: ['18px', { lineHeight: '26px' }],
        'body-lg': ['16px', { lineHeight: '24px' }],
        body: ['14px', { lineHeight: '22px' }],
        'body-sm': ['13px', { lineHeight: '20px' }],
        label: ['14px', { lineHeight: '20px' }],
        caption: ['12px', { lineHeight: '16px' }],
        overline: ['11px', { lineHeight: '16px', letterSpacing: '0.6px' }],
      },
      colors: {
        brand: { DEFAULT: '#0B6E4F', dark: '#095C42', soft: '#E8F5EF' },
        accent: { DEFAULT: '#E0A92E', dark: '#A9781A', soft: '#FBEFCF' },
        // semantic surfaces
        background: '#F7F8F8',
        surface: '#FFFFFF',
        'surface-alt': '#EEF0F1',
        border: '#DEE2E4',
        // text roles
        'text-primary': '#14181A',
        'text-secondary': '#4F575C',
        'text-muted': '#9AA3A9',
        'on-brand': '#FFFFFF',
        // status intents
        success: { DEFAULT: '#1E9E4F', soft: '#E7F6EC', text: '#0F5F2E' },
        warning: { DEFAULT: '#D98A04', soft: '#FFF6E5', text: '#8A5402' },
        danger: { DEFAULT: '#D23B3B', soft: '#FDECEC', text: '#8C2020' },
        info: { DEFAULT: '#2C6CD6', soft: '#E9F1FD', text: '#193F80' },
      },
      borderRadius: {
        sm: '6px', md: '10px', lg: '14px', xl: '20px', pill: '999px',
      },
      spacing: {
        xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '20px',
        '2xl': '24px', '3xl': '32px', '4xl': '40px', '5xl': '56px',
      },
    },
  },
  plugins: [],
};