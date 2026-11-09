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
        primary: {   // Ultramarine & Ember
          50: '#eef2ff',
          100: '#dfe6ff',
          200: '#bccaff',
          300: '#8da4ff',
          400: '#5a78ff',
          500: '#2f52f0',
          600: '#2442d1',
          700: '#1c35a8',
          800: '#172c85',
          900: '#0b1330',
        },
        // the one data hue: today's series, the main bar, the current period
        data: { 500: '#2f52f0', 100: '#e0e7ff' },
        accent: {   // Ultramarine & Ember
          50: '#fff3ed',
          100: '#ffe2d3',
          200: '#ffc4a6',
          300: '#ff9e72',
          400: '#ff7a45',
          500: '#f9591f',
          600: '#d84611',
          700: '#ad360d',
          800: '#7d2709',
          900: '#4f1906',
        },
        // Cobalt Mono neutrals: foreground #0d0d12, muted text #62627a, border #e2e2ee, muted #f1f1f8
        gray: {   // Ultramarine & Ember
          50: '#f6f7fb',
          100: '#eceef5',
          200: '#dde1ec',
          300: '#bcc3d4',
          400: '#8b94ab',
          500: '#5d667d',
          600: '#464e63',
          700: '#313850',
          800: '#1c2238',
          900: '#0b1228',
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
          DEFAULT: '#f4f6fb',
          warm:    '#fafbff',
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
      borderRadius: { DEFAULT: '8px', sm: '6px', md: '8px', lg: '12px', xl: '16px', '2xl': '20px', '3xl': '24px' },
      boxShadow: {
        DEFAULT: '0 1px 2px rgb(11 18 48 / 0.06)',
        sm: '0 1px 2px rgb(11 18 48 / 0.06)',
        md: '0 4px 12px -2px rgb(11 18 48 / 0.08)',
        soft: '0 2px 8px rgb(11 18 48 / 0.06)',
        card: '0 1px 3px rgb(11 18 48 / 0.06), 0 1px 2px rgb(11 18 48 / 0.04)',
        cardHover: '0 8px 24px -4px rgb(11 18 48 / 0.12)',
        dropdown: '0 8px 16px -4px rgb(11 18 48 / 0.10), 0 20px 40px -8px rgb(11 18 48 / 0.18)',
      },
    },
  },
  plugins: [],
}
