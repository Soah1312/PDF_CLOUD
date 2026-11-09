/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        specimen: {
          void: '#09090b',       // Deepest obsidian ground
          subtle: '#121215',     // Recessed container ground
          surface: '#18181b',    // Surface card / panel
          raised: '#222226',     // Elevated panel / hover state
          border: '#27272a',     // Hairline border
          'border-strong': '#3f3f46',
          ink: '#fafafa',        // Primary high-contrast text
          muted: '#a1a1aa',      // Secondary metadata text
          faint: '#71717a',      // Subdued / disabled text
          accent: '#e11d48',     // Signal Vermillion (Rose 600)
          'accent-hover': '#f43f5e',
          'accent-faint': 'rgba(225, 29, 72, 0.12)',
        },
      },
      fontFamily: {
        sans: [
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          '"Liberation Mono"',
          '"Courier New"',
          'monospace',
        ],
      },
      letterSpacing: {
        tighter: '-0.035em',
        tight: '-0.02em',
        normal: '0',
        wide: '0.04em',
        widest: '0.1em',
      },
    },
  },
  plugins: [],
}
