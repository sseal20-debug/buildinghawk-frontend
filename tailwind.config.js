/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Building Hawk Brand Colors
        navy: {
          DEFAULT: '#1a2744',
          light: '#2d3e5c',
          dark: '#0d1522',
        },
        gold: {
          DEFAULT: '#d4a84b',
          light: '#e6c77a',
          dark: '#b8923f',
        },
        teal: {
          DEFAULT: '#2d9596',
          light: '#4ab5b6',
          dark: '#1e6b6c',
        },
        // Property status colors
        occupied: '#22c55e',    // green-500
        vacant: '#ef4444',      // red-500
        partial: '#eab308',     // yellow-500
        'in-market': '#3b82f6', // blue-500
        'no-data': '#6b7280',   // gray-500
      },
      fontFamily: {
        heading: ['"SF Pro Display"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        body: ['"SF Pro Text"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
