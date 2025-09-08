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
          50: '#f3f4f6',
          100: '#e5e7eb',
          500: '#6B46C1',
          600: '#553C9A',
          700: '#4C1D95',
          800: '#3B0764',
          900: '#2D1B69'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif']
      }
    },
  },
  plugins: [],
}