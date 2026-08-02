/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: '#17233D',
        paper: '#EDEFEF',
        paperDark: '#DFE2E1',
        brass: '#B8873B',
        brassDark: '#96692A',
        line: '#C7CCCB',
        good: '#2F6E4F',
        bad: '#A33B34',
      },
      fontFamily: {
        vazir: ['Vazirmatn', 'Tahoma', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
