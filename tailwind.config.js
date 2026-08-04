/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: 'var(--color-ink)',
        paper: 'var(--color-paper)',
        paperDark: 'var(--color-paperDark)',
        surface: 'var(--color-surface)',
        line: 'var(--color-line)',
        brass: '#B8873B',
        brassDark: '#96692A',
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
