/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: "#c0392b",
        "background-dark": "#080809",
        "surface-dark": "#0f0f11",
        "border-dark": "#1e1e1e",
        "text-main": "#e2e2e2",
        "text-dim": "#888888",
      },
      fontFamily: {
        display: ["Public Sans", "sans-serif"],
      },
    },
  },
  plugins: [],
};
