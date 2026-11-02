/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      /*
       * 颜色全部走 OKLCH（定义在 index.css 的 :root 变量里）：
       * 感知均匀，深浅阶梯的明度差更可控，且在支持 P3 的屏幕上更准。
       * 变量只存 "L C H" 三个分量，配合 /<alpha-value> 才能支持 bg-x/60 这类透明度写法。
       */
      colors: {
        ink: {
          bg: 'oklch(var(--ink-bg) / <alpha-value>)',
          surface: 'oklch(var(--ink-surface) / <alpha-value>)',
          panel: 'oklch(var(--ink-surface) / <alpha-value>)', // 兼容旧类名
          surface2: 'oklch(var(--ink-surface2) / <alpha-value>)',
          panel2: 'oklch(var(--ink-surface2) / <alpha-value>)', // 兼容旧类名
          line: 'oklch(var(--ink-line) / <alpha-value>)',
          line2: 'oklch(var(--ink-line2) / <alpha-value>)',
          txt: 'oklch(var(--ink-txt) / <alpha-value>)',
          hi: 'oklch(var(--ink-hi) / <alpha-value>)',
          muted: 'oklch(var(--ink-muted) / <alpha-value>)',
          faint: 'oklch(var(--ink-faint) / <alpha-value>)',
          white: 'oklch(var(--ink-white) / <alpha-value>)',
        },
        brand: {
          400: 'oklch(var(--brand-400) / <alpha-value>)',
          500: 'oklch(var(--brand-500) / <alpha-value>)',
          600: 'oklch(var(--brand-600) / <alpha-value>)',
          blue: 'oklch(var(--brand-600) / <alpha-value>)',
          teal: 'oklch(var(--brand-teal) / <alpha-value>)',
          amber: 'oklch(var(--brand-amber) / <alpha-value>)',
          purple: 'oklch(var(--brand-purple) / <alpha-value>)',
          coral: 'oklch(var(--brand-coral) / <alpha-value>)',
        },
      },
      /*
       * 字体：不引入外部 Web Font（国内网络不可靠且会带来 CLS）。
       * 用系统 UI 字体做正文，等宽字体只服务数字，靠字重与字距拉开层级。
       */
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Text"',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          'system-ui',
          'sans-serif',
        ],
        display: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Display"',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          'system-ui',
          'sans-serif',
        ],
        mono: ['"SF Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      /* 字阶：display → title → body → meta，全部 ≥12px */
      fontSize: {
        '2xs': ['12px', { lineHeight: '1.5' }],
        xs: ['12.5px', { lineHeight: '1.55' }],
        sm: ['13.5px', { lineHeight: '1.6' }],
        base: ['15px', { lineHeight: '1.65' }],
        lg: ['16px', { lineHeight: '1.6' }],
        xl: ['18px', { lineHeight: '1.45' }],
        '2xl': ['20px', { lineHeight: '1.35', letterSpacing: '-0.01em' }],
        '3xl': ['24px', { lineHeight: '1.25', letterSpacing: '-0.015em' }],
        '4xl': ['30px', { lineHeight: '1.15', letterSpacing: '-0.02em' }],
        metric: ['28px', { lineHeight: '1', letterSpacing: '-0.02em' }],
        'metric-lg': ['34px', { lineHeight: '1', letterSpacing: '-0.025em' }],
      },
      borderRadius: {
        card: '16px',
        tile: '12px',
      },
      /* 浅色下的阴影要「薄而散」：小偏移 + 大模糊 + 低透明度，避免脏灰边 */
      boxShadow: {
        card: '0 1px 2px oklch(0.55 0.02 200 / .06), 0 10px 26px -18px oklch(0.48 0.03 200 / .28)',
        pop: '0 18px 40px -20px oklch(0.45 0.03 200 / .35)',
        glow: '0 0 0 1px oklch(var(--brand-500) / .28), 0 8px 22px -12px oklch(var(--brand-500) / .35)',
      },
      transitionTimingFunction: {
        app: 'cubic-bezier(.22,.61,.36,1)',
        'out-expo': 'cubic-bezier(.16,1,.3,1)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up .38s cubic-bezier(.16,1,.3,1) both',
      },
    },
  },
  plugins: [],
}
