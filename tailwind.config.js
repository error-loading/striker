/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#050B18',
          900: '#0A1428',
          800: '#0F1D38',
          700: '#16294B',
          600: '#1E3663',
        },
        cyan: { DEFAULT: '#00D9FF', glow: '#66E9FF' },
        gold: { DEFAULT: '#FFD700', deep: '#E0B400' },
        danger: '#FF4444',
      },
      fontFamily: {
        display: ['Poppins', 'Inter', 'system-ui', 'sans-serif'],
        body: ['Inter', 'Open Sans', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 24px rgba(0,217,255,0.35)',
        'glow-gold': '0 0 24px rgba(255,215,0,0.3)',
      },
      keyframes: {
        fadeUp: { '0%': { opacity: '0', transform: 'translateY(16px)' }, '100%': { opacity: '1', transform: 'none' } },
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideIn: { '0%': { opacity: '0', transform: 'translateX(-24px)' }, '100%': { opacity: '1', transform: 'none' } },
        pulseGlow: {
          '0%,100%': { boxShadow: '0 0 12px rgba(0,217,255,0.25)' },
          '50%': { boxShadow: '0 0 28px rgba(0,217,255,0.6)' },
        },
        scanline: { '0%': { transform: 'translateY(-100%)' }, '100%': { transform: 'translateY(400%)' } },
      },
      animation: {
        fadeUp: 'fadeUp .5s cubic-bezier(.16,1,.3,1) both',
        fadeIn: 'fadeIn .4s ease both',
        slideIn: 'slideIn .45s cubic-bezier(.16,1,.3,1) both',
        pulseGlow: 'pulseGlow 2.4s ease-in-out infinite',
        scanline: 'scanline 6s linear infinite',
      },
    },
  },
  plugins: [],
};
