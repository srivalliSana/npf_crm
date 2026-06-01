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
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
