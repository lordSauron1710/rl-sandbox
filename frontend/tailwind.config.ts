import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Surface colors
        surface: {
          DEFAULT: '#FFFFFF',
          secondary: '#FAFAFA',
          tertiary: '#F1F3F4',
        },
        // Border colors
        border: {
          DEFAULT: '#E5E5E5',
          light: '#F3F4F6',
        },
        // Text colors
        text: {
          primary: '#000000',
          secondary: '#666666',
          muted: '#9CA3AF',
        },
        // Accent colors
        accent: {
          primary: '#000000',
          danger: '#DC2626',
          success: '#16A34A',
          warning: '#F59E0B',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'SFMono-Regular', 'Consolas', 'monospace'],
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'xs': ['0.75rem', { lineHeight: '1rem' }],
        'sm': ['0.875rem', { lineHeight: '1.25rem' }],
        'base': ['1rem', { lineHeight: '1.5rem' }],
        'lg': ['1.125rem', { lineHeight: '1.75rem' }],
        'xl': ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        'metric': ['2rem', { lineHeight: '2.5rem', fontWeight: '600' }],
      },
      spacing: {
        'sidebar': '280px',
        'sidebar-right': '320px',
      },
      borderRadius: {
        'sm': '4px',
        'DEFAULT': '8px',
        'pill': '999px',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
}

export default config
