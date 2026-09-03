/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        cf: {
          bg: '#0A0A0A',
          panel: '#121212',
          panel2: '#161616',
          border: '#242424',
          text: '#F5F5F5',
          muted: '#8A8A8A',
          yellow: '#FFD400',
          yellowDim: 'rgba(255,212,0,0.12)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        cf: '8px',
      },
    },
  },
  plugins: [],
};
