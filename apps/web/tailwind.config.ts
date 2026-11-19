import type { Config } from 'tailwindcss';

/**
 * Design tokens for Restaurant OS.
 * Colours live as CSS variables in globals.css so that the marketing site (dark),
 * the guest menu (light) and the admin (light) can share one scale.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}', '../../packages/shared/src/**/*.ts'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#0C0D10',
          2: '#15171C',
          3: '#1F2228',
          4: '#2A2E36',
        },
        paper: {
          DEFAULT: '#F7F4EE',
          2: '#EFEAE0',
          3: '#E5DED1',
        },
        ember: {
          DEFAULT: '#FF5C2A',
          2: '#E24A1B',
          3: '#B83A12',
          soft: '#FFE9E0',
        },
        saffron: {
          DEFAULT: '#F2B33D',
          soft: '#FDF1D6',
        },
        mint: {
          DEFAULT: '#2FB87A',
          soft: '#DDF5E9',
        },
        rose: {
          DEFAULT: '#E5484D',
          soft: '#FBE1E2',
        },
        sky: {
          DEFAULT: '#3B7DD8',
          soft: '#E1ECFA',
        },
        veg: '#1F8A3D',
        nonveg: '#A33A1A',
        /* semantic, driven by CSS variables (see globals.css) */
        bg: 'rgb(var(--bg) / <alpha-value>)',
        fg: 'rgb(var(--fg) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        sunk: 'rgb(var(--sunk) / <alpha-value>)',
      },
      fontFamily: {
        display: ['var(--font-display)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['var(--font-body)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
        'display-xl': ['clamp(3rem, 9vw, 8.5rem)', { lineHeight: '0.92', letterSpacing: '-0.03em' }],
        'display-lg': ['clamp(2.5rem, 6vw, 5.5rem)', { lineHeight: '0.95', letterSpacing: '-0.025em' }],
        'display-md': ['clamp(2rem, 4.2vw, 3.75rem)', { lineHeight: '1.02', letterSpacing: '-0.02em' }],
        'display-sm': ['clamp(1.5rem, 2.6vw, 2.25rem)', { lineHeight: '1.1', letterSpacing: '-0.015em' }],
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      boxShadow: {
        soft: '0 1px 2px rgb(12 13 16 / 0.04), 0 8px 24px -12px rgb(12 13 16 / 0.12)',
        lift: '0 2px 4px rgb(12 13 16 / 0.06), 0 24px 48px -24px rgb(12 13 16 / 0.25)',
        glow: '0 0 0 1px rgb(255 92 42 / 0.25), 0 12px 40px -12px rgb(255 92 42 / 0.55)',
        ring: '0 0 0 3px rgb(255 92 42 / 0.25)',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.16, 1, 0.3, 1)',
        'in-out': 'cubic-bezier(0.65, 0, 0.35, 1)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      keyframes: {
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        pulseRing: {
          '0%': { transform: 'scale(0.9)', opacity: '0.8' },
          '100%': { transform: 'scale(1.8)', opacity: '0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        marquee: 'marquee 40s linear infinite',
        shimmer: 'shimmer 1.6s linear infinite',
        'pulse-ring': 'pulseRing 1.6s cubic-bezier(0.16, 1, 0.3, 1) infinite',
        float: 'float 5s ease-in-out infinite',
        'fade-up': 'fadeUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) both',
      },
    },
  },
  plugins: [],
};

export default config;
