/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── 中性色：从深到浅分层，bg → surface → surface2 形成卡片层次 ──
        ink: {
          bg: '#0b0d12',
          surface: '#141822',
          panel: '#141822', // 兼容旧类名
          surface2: '#1b2029',
          panel2: '#1b2029', // 兼容旧类名
          line: '#262c38',
          line2: '#333a47',
          txt: '#edf0f6',
          muted: '#9ba5b7',
          faint: '#6b7486',
        },
        // ── 品牌色：500 为主色（按钮/强调块），blue/teal/… 为数据可视化用色 ──
        brand: {
          400: '#6fa9fa',
          500: '#4c8df6',
          600: '#3b78e0',
          blue: '#6fa9fa',
          teal: '#2dd4bf',
          amber: '#f0b45f',
          purple: '#b69bff',
          coral: '#fb7185',
        },
      },
      borderRadius: {
        card: '16px',
        tile: '12px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,.28), 0 10px 28px -18px rgba(0,0,0,.7)',
        pop: '0 16px 40px -16px rgba(0,0,0,.75)',
        glow: '0 0 0 1px rgba(76,141,246,.35), 0 8px 24px -12px rgba(76,141,246,.55)',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          'system-ui',
          'sans-serif',
        ],
      },
      transitionTimingFunction: {
        app: 'cubic-bezier(.22,.61,.36,1)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-up': 'fade-up .24s cubic-bezier(.22,.61,.36,1) both',
      },
    },
  },
  plugins: [],
}
