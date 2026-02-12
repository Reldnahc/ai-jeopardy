/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      textShadow: {
        jeopardy: "0.07em 0.07em 0 rgba(0,0,0,0.9), 0.14em 0.14em 0 rgba(0,0,0,0.6)",
      },
      fontFamily: {
        swiss911: ['"swiss911"', 'sans-serif'],
      },
      keyframes: {
        jump: {
          '0%, 15%': { transform: 'translateY(0)' },
          '25%': { transform: 'translateY(-10px)' },
          '35%': { transform: 'translateY(0)' },
          '100%': { transform: 'translateY(0)' },
        },
      },
      animation: {
        // 2.5s total duration ensures that after the jump, there’s a pause before the wave repeats.
        jump: 'jump 2s ease-in-out infinite',
      },
    },
  },
  plugins: [
    function ({ addUtilities, theme }) {
      const shadows = theme("textShadow");
      const utilities = Object.entries(shadows).map(([key, value]) => ({
        [`.text-shadow-${key}`]: { textShadow: value },
      }));
      addUtilities(utilities);
    },
  ],
};
