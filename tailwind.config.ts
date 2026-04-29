import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "media",
  theme: {
    extend: {
      fontFamily: {
        sans: ["IBM Plex Sans Thai", "Noto Sans Thai", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
