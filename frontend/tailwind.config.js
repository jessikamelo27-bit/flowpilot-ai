/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        enterprise: {
          bg: '#F4F5F7',
          surface: '#FFFFFF',
          text: '#20242B',
          muted: '#707783',
          cobalt: '#2457C5',
          cobaltLight: '#EAF0FC',
          border: '#E1E5EA',
          success: '#24845A',
          warning: '#B98220',
          danger: '#C44F4F',
        }
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      }
    },
  },
  plugins: [],
}
