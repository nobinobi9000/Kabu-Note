/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        // ダークモード
        dark: {
          bg:      '#0a0f0d',
          card:    '#111816',
          border:  '#1e2d28',
        },
        // アクセント
        accent: {
          DEFAULT: '#00ff88',
          light:   '#059669',
        },
      },
    },
  },
  plugins: [],
}
