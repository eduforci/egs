import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FAF7F0",
        chalk: "#16302A",
        "chalk-soft": "#22453B",
        gold: "#C89B3C",
        role: {
          admin: "#6B4E9A",
          chef: "#1D5B79",
          prof: "#1F7A6B",
          parent: "#C1621B",
          eleve: "#B23A55",
        },
      },
      fontFamily: {
        display: ["Fraunces", "serif"],
        body: ["'Plus Jakarta Sans'", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
      },
      keyframes: {
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in-up": "fadeInUp 0.5s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
