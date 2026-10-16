/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          bg: '#0f1115',
          panel: '#171a21',
          panel2: '#1e222b',
          line: '#2a2f3a',
          txt: '#e8eaf0',
          muted: '#9aa3b2',
          faint: '#6b7280',
        },
        // 与 WorkBuddy 阅读工作台参考页 :root 变量一致
        brand: {
          blue: '#6aa6e8',
          teal: '#4fc4a0',
          amber: '#e0a64e',
          purple: '#a78be0',
          coral: '#e07a5f',
        },
      },
    },
  },
  plugins: [],
}
