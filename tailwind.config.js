/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: 'var(--brand-primary)',
          hover:   'var(--brand-primary-hover)',
          active:  'var(--brand-primary-active)',
          soft:    'var(--brand-primary-soft)',
        },
        surface: {
          bg:     'var(--surface-bg)',
          card:   'var(--surface-card)',
          sunken: 'var(--surface-sunken)',
        },
        ink: {
          primary:   'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          tertiary:  'var(--text-tertiary)',
        },
        success: { DEFAULT: 'var(--success)', soft: 'var(--success-soft)' },
        warning: { DEFAULT: 'var(--warning)', soft: 'var(--warning-soft)' },
        danger:  { DEFAULT: 'var(--danger)',  soft: 'var(--danger-soft)'  },
        info:    { DEFAULT: 'var(--info)',    soft: 'var(--info-soft)'    },
      },
      borderColor: {
        DEFAULT: 'var(--border-default)',
      },
      borderRadius: {
        sm: '4px',
        md: '6px',
        lg: '8px',
      },
      boxShadow: {
        sm:    'var(--shadow-sm)',
        md:    'var(--shadow-md)',
        lg:    'var(--shadow-lg)',
        focus: 'var(--focus-ring)',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SF Mono', 'Menlo', 'Consolas', 'monospace'],
      },
      zIndex: {
        dropdown: '100',
        sticky:   '200',
        modal:    '300',
        toast:    '400',
      },
    },
  },
  plugins: [],
}
