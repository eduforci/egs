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
    },
  },
  plugins: [],
};

export default config;
