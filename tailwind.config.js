/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      textShadow: {
        jeopardy: "0.04em 0.05em 0 rgba(0,0,0,0.9), 0.1em 0.1em 0 rgba(0,0,0,0.6)",
      },
      fontFamily: {
        swiss911: ['"swiss911"', 'sans-serif'],

        // Clean
        outfit: ["Outfit", "sans-serif"],
        dmsans: ["DM Sans", "sans-serif"],
        jetbrains: ["JetBrains Mono", "monospace"],
        sora: ["Sora", "sans-serif"],
        exo2: ["Exo 2", "sans-serif"],
        kanit: ["Kanit", "sans-serif"],
        rajdhani: ["Rajdhani", "sans-serif"],
        teko: ["Teko", "sans-serif"],

        // Tech / Futuristic
        orbitron: ["Orbitron", "sans-serif"],
        audiowide: ["Audiowide", "sans-serif"],
        majormono: ["Major Mono Display", "monospace"],
        pressstart: ["Press Start 2P", "monospace"],
        silkscreen: ["Silkscreen", "monospace"],
        vt323: ["VT323", "monospace"],
        monoton: ["Monoton", "cursive"],
        blackops: ["Black Ops One", "cursive"],
        codystar: ["Codystar", "cursive"],

        // Cute / Rounded
        fredoka: ["Fredoka", "sans-serif"],
        baloo: ["Baloo 2", "sans-serif"],
        comfortaa: ["Comfortaa", "sans-serif"],
        chewy: ["Chewy", "cursive"],
        freckle: ["Freckle Face", "cursive"],
        changa: ["Changa One", "cursive"],

        // Script / Handwritten
        pacifico: ["Pacifico", "cursive"],
        cherry: ["Cherry Bomb One", "cursive"],
        gloria: ["Gloria Hallelujah", "cursive"],
        permanent: ["Permanent Marker", "cursive"],
        shadows: ["Shadows Into Light", "cursive"],
        patrick: ["Patrick Hand", "cursive"],
        gochi: ["Gochi Hand", "cursive"],

        // Loud / Display
        bungee: ["Bungee", "cursive"],
        luckiest: ["Luckiest Guy", "cursive"],
        righteous: ["Righteous", "cursive"],
        bowlby: ["Bowlby One SC", "cursive"],
        russo: ["Russo One", "sans-serif"],
        bebas: ["Bebas Neue", "sans-serif"],
        titan: ["Titan One", "cursive"],
        alfa: ["Alfa Slab One", "serif"],

        // Chaos Tier
        rubikglitch: ["Rubik Glitch", "cursive"],
        creepster: ["Creepster", "cursive"],
        metalmania: ["Metal Mania", "cursive"],
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
