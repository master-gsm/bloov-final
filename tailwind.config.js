/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        dark: {
          bg: '#0F0C14',
          surface: '#1A1423',
          hover: '#241B33',
          border: '#2A213A',
          elevated: '#2E2440',
        },
        mauve: {
          50: '#F3F2F7',
          100: '#E8E5F0',
          200: '#C9C3DB',
          300: '#A59FBF',
          400: '#8B84A8',
          500: '#7C3AED',
          600: '#6D32D1',
          700: '#5B28B0',
          800: '#4A2090',
          900: '#3A1870',
        },
        accent: {
          DEFAULT: '#7C3AED',
          hover: '#9F67FF',
          light: '#9F67FF',
          glow: 'rgba(124, 58, 237, 0.15)',
        },
        muted: '#6E6887',
        gold: '#C9A962',
      },
      backgroundImage: {
        'floral-pattern': "url('/00_(6).png')",
      },
      boxShadow: {
        'glow-sm': '0 0 15px rgba(124, 58, 237, 0.08)',
        'glow-md': '0 0 25px rgba(124, 58, 237, 0.12)',
        'glow-lg': '0 0 40px rgba(124, 58, 237, 0.16)',
        'dark-sm': '0 1px 3px rgba(0, 0, 0, 0.3)',
        'dark-md': '0 4px 12px rgba(0, 0, 0, 0.4)',
        'dark-lg': '0 8px 30px rgba(0, 0, 0, 0.5)',
        'dark-xl': '0 16px 50px rgba(0, 0, 0, 0.6)',
      },
    },
  },
  plugins: [],
};
