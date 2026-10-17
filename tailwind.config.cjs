/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './public_html/**/*.html',
    './public_html/js/**/*.js'
  ],
  safelist: [
    'opacity-55',
    'opacity-60',
    'animate-pulse',
    'animate-spin',
    'animate-bounce',
    'hidden',
    'flex',
    'grid',
    {
      pattern: /^(bg|text|border|ring)-(emerald|green|amber|yellow|red|rose|sky|cyan|blue|indigo|purple|slate)-(50|100|200|300|400|500|600|700|800|900|950)$/
    }
  ],
  theme: {
    extend: {
      colors: {
        marine: '#0f172a',
        water: '#0ea5e9',
        premium: '#1e293b'
      },
      boxShadow: {
        'glow': '0 0 15px rgba(14, 165, 233, 0.4)',
        'glow-pro': '0 0 20px rgba(16, 185, 129, 0.4)'
      }
    }
  },
  plugins: []
};

