/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#16324F", deep: "#0F2438" },
        blue: { DEFAULT: "#2C5F8A", tint: "#E4ECF2" },
        paper: "#F6F7F4",
        ink: "#16202B",
        steel: { DEFAULT: "#64748B", light: "#A6B0BC" },
        amber: { DEFAULT: "#E8871E", dark: "#C46E12" },
        green: { DEFAULT: "#2F7D5C", tint: "#E4F0EA" },
        red: { DEFAULT: "#C1443D", tint: "#F6E4E3" },
        border: "#D8DEE3",
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        body: ["'IBM Plex Sans'", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
      },
      borderRadius: {
        DEFAULT: "2px",
      },
    },
  },
  plugins: [],
};
