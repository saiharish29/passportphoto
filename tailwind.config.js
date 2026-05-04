/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // India-flag-adjacent but desaturated for a calm, trustworthy feel
        saffron: { 500: '#E87722', 600: '#C2410C' },
        ink: { 900: '#0F172A', 800: '#1E293B', 700: '#334155' },
        paper: '#FAFAF7',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
