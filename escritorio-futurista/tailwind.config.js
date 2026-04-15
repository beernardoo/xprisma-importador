/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        cyan: { neon: '#00f5ff' },
        purple: { neon: '#bb00ff' },
        green: { neon: '#00ff88' },
        orange: { neon: '#ff6b00' },
        bg: { dark: '#04080f', panel: '#0d2847' },
      },
      fontFamily: {
        mono: ['"Share Tech Mono"', 'monospace'],
        orbitron: ['Orbitron', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
