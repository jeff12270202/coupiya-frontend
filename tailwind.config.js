/** @type {import('tailwindcss').Config} */
module.exports = {
  // 启用暗色模式（class 策略，通过 .dark 类切换）
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',  // 兼容 Pages Router
  ],
  theme: {
    extend: {
      // ========== 色彩系统 ==========
      colors: {
        // 品牌主色（东方陶瓷灵感）
        ceramic: {
          50: '#fff5f7',
          100: '#ffe4ec',
          200: '#fbc4d4',
          300: '#f9a8d4',   // 主品牌色
          400: '#f472b6',
          500: '#ec4899',
          600: '#db2777',
          700: '#be185d',
          800: '#9d174d',
          900: '#831843',
        },
        // 辅助色：翡翠绿（东方元素）
        jade: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
        // 中性色（更柔和的灰度，适合 AI 生成内容）
        stone: {
          50: '#fafaf9',
          100: '#f5f5f4',
          200: '#e7e5e4',
          300: '#d6d3d1',
          400: '#a8a29e',
          500: '#78716c',
          600: '#57534e',
          700: '#44403c',
          800: '#292524',
          900: '#1c1917',
        },
        // 功能性语义色
        success: '#10b981',
        warning: '#f59e0b',
        error: '#ef4444',
        info: '#3b82f6',
      },

      // ========== 字体系统 ==========
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Nunito', 'Quicksand', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        '10xl': ['5rem', { lineHeight: '1.1' }],
      },

      // ========== 间距与容器 ==========
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '120': '30rem',
        '128': '32rem',
      },
      maxWidth: {
        '8xl': '88rem',
        '9xl': '96rem',
      },
      container: {
        center: true,
        padding: {
          DEFAULT: '1rem',
          sm: '2rem',
          lg: '4rem',
          xl: '5rem',
        },
      },

      // ========== 动画与过渡（适配 AI 交互） ==========
      animation: {
        'spin-slow': 'spin 3s linear infinite',
        'pulse-fast': 'pulse 0.8s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'bounce-slow': 'bounce 2s infinite',
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'scale-pulse': 'scalePulse 2s infinite',
        'glow': 'glow 2s ease-in-out infinite',
        'shimmer': 'shimmer 2s infinite linear',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scalePulse: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.05)' },
        },
        glow: {
          '0%, 100%': { boxShadow: '0 0 5px rgba(236, 72, 153, 0.3)' },
          '50%': { boxShadow: '0 0 20px rgba(236, 72, 153, 0.6)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
          '0%': { transform: 'translateX(-100%)' },
        },
      },
      transitionProperty: {
        'height': 'height',
        'spacing': 'margin, padding',
      },
      transitionDuration: {
        '2000': '2000ms',
      },

      // ========== 背景图与渐变 ==========
      backgroundImage: {
        'ceramic-pattern': "url('/ceramic-pattern.svg')",
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
      backgroundSize: {
        'auto-200': 'auto 200%',
      },

      // ========== 模糊与阴影 ==========
      blur: {
        xs: '2px',
      },
      boxShadow: {
        'soft': '0 2px 15px -3px rgba(0, 0, 0, 0.07), 0 10px 20px -2px rgba(0, 0, 0, 0.04)',
        'glow-sm': '0 0 8px rgba(236, 72, 153, 0.4)',
        'glow-md': '0 0 16px rgba(236, 72, 153, 0.5)',
      },

      // ========== 特殊效果 ==========
      backdropBlur: {
        xs: '2px',
      },
      zIndex: {
        '60': '60',
        '70': '70',
        '80': '80',
        '90': '90',
        '100': '100',
      },
    },
  },
  plugins: [
    // 自定义插件：添加更多实用工具类
    function ({ addUtilities, addComponents }) {
      const newUtilities = {
        '.text-gradient': {
          background: 'linear-gradient(135deg, #f9a8d4 0%, #f472b6 100%)',
          backgroundClip: 'text',
          WebkitBackgroundClip: 'text',
          color: 'transparent',
        },
        '.text-gradient-dark': {
          background: 'linear-gradient(135deg, #fbc4d4 0%, #ec4899 100%)',
          backgroundClip: 'text',
          WebkitBackgroundClip: 'text',
          color: 'transparent',
        },
        '.line-clamp-3': {
          display: '-webkit-box',
          WebkitLineClamp: '3',
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        },
        '.line-clamp-5': {
          display: '-webkit-box',
          WebkitLineClamp: '5',
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        },
        '.no-scrollbar': {
          '-ms-overflow-style': 'none',
          'scrollbar-width': 'none',
          '&::-webkit-scrollbar': {
            display: 'none',
          },
        },
      };
      addUtilities(newUtilities, ['responsive']);

      const components = {
        '.ai-glow': {
          animation: 'glow 2s ease-in-out infinite',
          transition: 'all 0.3s ease',
        },
        '.loading-shimmer': {
          position: 'relative',
          overflow: 'hidden',
          '&::after': {
            content: '""',
            position: 'absolute',
            top: '0',
            right: '0',
            bottom: '0',
            left: '0',
            transform: 'translateX(-100%)',
            backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.4) 50%, rgba(255,255,255,0) 100%)',
            animation: 'shimmer 2s infinite',
          },
        },
      };
      addComponents(components);
    },
  ],
};