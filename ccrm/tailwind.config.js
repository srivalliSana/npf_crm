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
        primary: {
          50:  '#eff6ff',   // background tints, hover bg
          100: '#dbeafe',   // soft chip backgrounds
          200: '#bfdbfe',   // borders for selected states
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#2563eb',   // brand blue — modern, easier on eyes than navy
          600: '#1d4ed8',   // hover states
          700: '#1e40af',   // active/pressed
          800: '#1e3a8a',
          900: '#172554',
        },
        accent: {
          50:  '#fff8e6',
          100: '#fef1cc',
          200: '#fde399',
          300: '#fcd566',
          400: '#fbc733',
          500: '#f5a623',
          600: '#e09520',
          700: '#c8841c',
          800: '#b07318',
          900: '#986214',
        },
        // Soft page background — never pure white (reduces strain)
        canvas: {
          DEFAULT: '#f5f8fc',   // gentle blue-tinted off-white
          warm:    '#fafbfd',
        },
        // Semantic colors — the single vocabulary Badge/StatCard/alerts build
        // on, replacing the 17+ ad-hoc per-page color-map objects over time.
        success: { 50: '#f0fdf4', 100: '#dcfce7', 500: '#22c55e', 700: '#15803d' },
        warning: { 50: '#fffbeb', 100: '#fef3c7', 500: '#f59e0b', 700: '#b45309' },
        danger:  { 50: '#fef2f2', 100: '#fee2e2', 500: '#ef4444', 700: '#b91c1c' },
        info:    { 50: '#eff6ff', 100: '#dbeafe', 500: '#3b82f6', 700: '#1d4ed8' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)',
        card: '0 1px 3px 0 rgb(15 23 42 / 0.06), 0 4px 12px -2px rgb(15 23 42 / 0.06)',
        dropdown: '0 4px 6px -2px rgb(15 23 42 / 0.05), 0 12px 24px -4px rgb(15 23 42 / 0.12)',
      },
    },
  },
  plugins: [],
}
