const config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#f0effe', 100: '#e4e1fd', 200: '#ccc8fb', 300: '#a89ff7', 400: '#8a7ff3', 500: '#7B6EF6', 600: '#5a4ce0', 700: '#4a3cc5', 800: '#3d31a3', 900: '#332d82' },
      },
      fontFamily: { sans: ['var(--font-outfit)', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
}
export default config;
