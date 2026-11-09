/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  future: {
    hoverOnlyWhenSupported: true, // Prevents sticky hover states on mobile touchscreens!
  },
  theme: {
    screens: {
      xs: '360px',
      sm: '480px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
    extend: {
      colors: {
        paper: '#F1E9DA',
        vellum: '#FAF6EC',
        kraft: '#E4D7BE',
        ink: {
          DEFAULT: '#241B14',
          soft: '#5C4F42',
          faint: '#8E7F70',
        },
        rule: {
          DEFAULT: '#D5C6A8',
          subtle: '#E2D6BE',
          strong: '#BFAF93',
        },
        red: {
          DEFAULT: '#D9441F',
          dark: '#B83515',
          light: '#F25C37',
        },
        cyan: {
          DEFAULT: '#27467A',
          tint: '#E6EDF7',
        },
        marigold: {
          DEFAULT: '#F0B429',
          light: '#FDF3D8',
        },
        moss: {
          DEFAULT: '#4A6B3A',
          tint: '#E9EFE6',
        },
        tint: {
          merge: '#F6DFA4',
          split: '#CFDDBF',
          compress: '#F0C9B4',
          convert: '#C9D7E8',
          protect: '#CBC3D6',
        },
      },
      fontFamily: {
        display: ['Gloock', 'Young Serif', 'Georgia', 'serif'],
        sans: ['"Schibsted Grotesk"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"Martian Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '6px',
        sm: '4px',
        md: '6px',
        lg: '8px',
      },
      boxShadow: {
        'ink-button': '0 2px 0 #B83515',
        'ink-lift': '0 4px 12px -2px rgba(36,27,20,0.08), 0 1px 0 #D5C6A8',
        'ink-drag': '0 12px 24px -4px rgba(36,27,20,0.18), 0 2px 0 #241B14',
        'subtle': '0 1px 3px rgba(36,27,20,0.05)',
      },
      lineHeight: {
        tightest: '1.02',
      },
      letterSpacing: {
        tighter: '-0.035em',
        tight: '-0.015em',
        normal: '0',
        mono: '0.06em',
      },
      minHeight: {
        '100dvh': '100dvh',
        '100svh': '100svh',
        touch: '44px',
      },
      minWidth: {
        touch: '44px',
      },
    },
  },
  plugins: [],
}
