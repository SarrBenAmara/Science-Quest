/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Lilita One"', 'Fredoka', 'system-ui', 'sans-serif'],
        game: ['Fredoka', 'system-ui', 'sans-serif'],
        body: ['Nunito', 'system-ui', 'sans-serif'],
      },
      colors: {
        night: { 950: '#050a24', 900: '#0a1440', 800: '#101d5c', 700: '#17287a', 600: '#1f3596' },
        neon: { cyan: '#38e1ff', blue: '#2f7bff', purple: '#a24bff', pink: '#ff4fd8', green: '#3dff7a', yellow: '#ffd23f', orange: '#ff9b1f' },
        ans: { a: '#e8164f', b: '#1f6bff', c: '#f5b301', d: '#18b43c' },
        lab: { bio: '#35d64a', phy: '#2f9bff', chem: '#a64dff', final: '#f5b301' },
      },
    },
  },
  plugins: [],
};
