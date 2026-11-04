/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Softer, eye-friendly blue palette
        // primary-500 is the main brand colour (links, primary buttons)
        // primary-50/100 used for tints; very pale to reduce eye strain
        primary: {   // cobalt blue
          50:  '#eef4ff',
          100: '#dbe7ff',
          200: '#bcd1ff',
          300: '#8fb0ff',
          400: '#5b86fb',
          500: '#2f5fe8',
          600: '#2349c4',
          700: '#1c3a9c',
          800: '#182f7a',
          900: '#142560',
        },
        navy: { 700: '#1b2a4a', 800: '#12203d', 900: '#0b1530', 950: '#070e22' },
        // the one data hue: today's series, the main bar, the current period
        data: { 500: '#1d5fbf', 100: '#dce8f8' },
        accent: {   // warm amber highlight
          50:  '#fff8eb',
          100: '#ffecc7',
          200: '#ffd88a',
          300: '#ffc04d',
          400: '#ffa71f',
          500: '#f58a07',
          600: '#d96a02',
          700: '#b34e06',
          800: '#903d0c',
          900: '#76340d',
        },
        // AI / assistant accent — Campus One Neo's purple, used only for the
        // AI Assistant panel and its badges, never as a general-purpose color.
        ai: {   // assistant panel: graphite, not violet
          50:  '#f4f5f6',
          100: '#e8eaec',
          200: '#d3d7db',
          300: '#b3bac1',
          400: '#8a939d',
          500: '#5f6b77',
          600: '#47525d',
          700: '#35404a',
          800: '#252d35',
          900: '#171d23',
        },
        // Soft page background — never pure white (reduces strain), and
        // deliberately deep enough that white cards visibly "float" above it.
        canvas: {
          DEFAULT: '#eaeffa',
          warm:    '#f3f6fd',
        },
        // Violet/indigo/purple are remapped to one steel scale so legacy class names stay valid
        purple: {
          50:  '#f1f5f9', 100: '#e1e9f0', 200: '#c4d3e0', 300: '#9bb3c8', 400: '#6f8fac',
          500: '#4d6f8f', 600: '#3d5a76', 700: '#314a61', 800: '#263b4d', 900: '#1b2a38',
        },
        violet: {
          50:  '#f1f5f9', 100: '#e1e9f0', 200: '#c4d3e0', 300: '#9bb3c8', 400: '#6f8fac',
          500: '#4d6f8f', 600: '#3d5a76', 700: '#314a61', 800: '#263b4d', 900: '#1b2a38',
        },
        indigo: {
          50:  '#f1f5f9', 100: '#e1e9f0', 200: '#c4d3e0', 300: '#9bb3c8', 400: '#6f8fac',
          500: '#4d6f8f', 600: '#3d5a76', 700: '#314a61', 800: '#263b4d', 900: '#1b2a38',
        },
        // Semantic colors — the single vocabulary Badge/StatCard/alerts build
        // on, replacing the 17+ ad-hoc per-page color-map objects over time.
        success: { 50: '#f0fdf4', 100: '#dcfce7', 500: '#22c55e', 700: '#15803d' },
        warning: { 50: '#fffbeb', 100: '#fef3c7', 500: '#f59e0b', 700: '#b45309' },
        danger:  { 50: '#fef2f2', 100: '#fee2e2', 500: '#ef4444', 700: '#b91c1c' },
        info:    { 50: '#eff6ff', 100: '#dbeafe', 500: '#3b82f6', 700: '#1d4ed8' },
      },
      fontFamily: {
        sans: ['Geist', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        DEFAULT: 'none',
        sm: 'none',
        md: 'none',
        soft: 'none',
        card: 'none',
        cardHover: 'none',
        dropdown: '0 8px 16px -4px rgb(15 23 42 / 0.10), 0 20px 40px -8px rgb(15 23 42 / 0.18)',
      },
    },
  },
  plugins: [],
}
