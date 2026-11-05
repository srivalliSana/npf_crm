/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontSize: {
        xs: ['0.8125rem', '1.15rem'],
        sm: ['0.9375rem', '1.4rem'],
        base: ['1.0625rem', '1.6rem'],
        lg: ['1.1875rem', '1.75rem'],
      },
      colors: {
        // Softer, eye-friendly blue palette
        // primary-500 is the main brand colour (links, primary buttons)
        // primary-50/100 used for tints; very pale to reduce eye strain
        primary: {   // Lagoon Gold: primary #02677f (accent teal #03a2bc)
          50:  '#eef5f6',
          100: '#d9ebee',
          200: '#b3d6dd',
          300: '#7fbbc8',
          400: '#03a2bc',
          500: '#02677f',
          600: '#025970',
          700: '#014a5d',
          800: '#013c4a',
          900: '#012e39',
        },
        // the one data hue: today's series, the main bar, the current period
        data: { 500: '#1d5fbf', 100: '#dce8f8' },
        accent: {   // Lagoon Gold: gold #ffb500
          50:  '#fff9e6',
          100: '#fff0bf',
          200: '#ffe28a',
          300: '#ffd04d',
          400: '#ffc21f',
          500: '#ffb500',
          600: '#d99700',
          700: '#a87400',
          800: '#785300',
          900: '#4d3500',
        },
        // Cobalt Mono neutrals: foreground #0d0d12, muted text #62627a, border #e2e2ee, muted #f1f1f8
        gray: {   // Lagoon Gold neutrals: text #081e24, muted #5a6569, border #d4e1e4, muted fill #e4eef0
          50:  '#f5fafb',
          100: '#e4eef0',
          200: '#d4e1e4',
          300: '#b3c0c4',
          400: '#8a9498',
          500: '#5a6569',
          600: '#465155',
          700: '#2f3a3e',
          800: '#162a30',
          900: '#081e24',
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
          DEFAULT: '#f5fafb',
          warm:    '#fcffff',
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
        sans: ['Google Sans Flex', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: { DEFAULT: '0', sm: '0', md: '0', lg: '0', xl: '0', '2xl': '0', '3xl': '0' },
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
