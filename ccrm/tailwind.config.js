/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#e6edf7',
          100: '#ccdaef',
          200: '#99b5df',
          300: '#6690cf',
          400: '#336bbf',
          500: '#003087',
          600: '#002876',
          700: '#002065',
          800: '#001854',
          900: '#001043',
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
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
