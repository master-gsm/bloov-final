/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        lux: {
          bg: '#F6F3FB',
          surface: '#FFFFFF',
          hover: '#F0ECF7',
          border: '#E6E0F5',
          muted: '#D8D1EA',
        },
        primary: {
          DEFAULT: '#3C2E5E',
          light: '#4E3D78',
        },
        secondary: '#6E5F8D',
        accent: {
          DEFAULT: '#7C3AED',
          hover: '#9F67FF',
          light: '#EDE5FF',
          subtle: '#F5F1FF',
        },
        muted: '#8A7BA5',
        gold: '#C9A962',
      },
      backgroundImage: {
        'floral-pattern': "url('/00_(6).png')",
      },
      boxShadow: {
        'soft-sm': '0 1px 3px rgba(60, 46, 94, 0.04), 0 1px 2px rgba(60, 46, 94, 0.03)',
        'soft-md': '0 4px 16px rgba(60, 46, 94, 0.06), 0 2px 4px rgba(60, 46, 94, 0.03)',
        'soft-lg': '0 8px 32px rgba(60, 46, 94, 0.08), 0 4px 8px rgba(60, 46, 94, 0.03)',
        'soft-xl': '0 16px 48px rgba(60, 46, 94, 0.10), 0 6px 12px rgba(60, 46, 94, 0.04)',
      },
    },
  },
  plugins: [],
};
