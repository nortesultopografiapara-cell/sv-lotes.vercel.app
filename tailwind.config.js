/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./utils/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f5f7fa',
          100: '#eaeef4',
          500: '#2b5a8f',
          600: '#1e3f66',
          900: '#0f2033',
        },
      },
    },
  },
  plugins: [],
}
