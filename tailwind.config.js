module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // 扩展自定义粉色系，也可使用内置 rose/pink
        ceramic: {
          50: '#fff5f7',
          100: '#ffe4ec',
          200: '#fbc4d4',
          300: '#f9a8d4',  // 主色调
          400: '#f472b6',
          500: '#ec4899',
        },
      },
      fontFamily: {
        serif: ['Nunito', 'Quicksand', 'serif'],
      },
      backgroundImage: {
        'ceramic-pattern': "url('/ceramic-pattern.svg')",
      }
    },
  },
  plugins: [],
}