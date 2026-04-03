/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    // Major fourths type scale (ratio 1.333, base 16px)
    fontSize: {
      "xs":   ["0.75rem",  { lineHeight: "1rem" }],       // 12px
      "sm":   ["0.875rem", { lineHeight: "1.25rem" }],     // 14px
      "base": ["1rem",     { lineHeight: "1.5rem" }],      // 16px
      "lg":   ["1.333rem", { lineHeight: "1.75rem" }],     // 21px
      "xl":   ["1.777rem", { lineHeight: "2.25rem" }],     // 28px
      "2xl":  ["2.369rem", { lineHeight: "2.75rem" }],     // 38px
      "3xl":  ["3.157rem", { lineHeight: "3.5rem" }],      // 51px
      "4xl":  ["4.209rem", { lineHeight: "4.5rem" }],      // 67px
    },
    extend: {
      colors: {
        // Wada Sanzo Combination 269 — "Occult Amber"
        primary:          "#802626",   // Pale Burnt Lake — dried-blood red
        "primary-light":  "#9a3333",   // Lighter variant for hover
        secondary:        "#bb7125",   // Raw Sienna — warm amber
        tertiary:         "#a36aa5",   // Aconite Violet — muted purple
        "background-dark":"#111314",   // Near-black
        "surface-dark":   "#1a1a1c",   // Card/panel bg
        "border-dark":    "#2a2420",   // Warm border
        "text-main":      "#e8e0d4",   // Warm parchment
        "text-mid":       "#a09080",   // Mid tone
        "text-dim":       "#6b6058",   // Dimmed

        // Status colors — warm-shifted, high-chroma for dark bg scanning
        // Hues pulled warm to harmonize with Occult Amber, contrast ≥4.5:1 vs #111314
        "status-pos":     "#5ec269",   // fern green (hue ~130) — 8.3:1 contrast
        "status-warn":    "#e8a832",   // deep gold — 8.9:1 contrast
        "status-neg":     "#e25535",   // vermilion (orange-red, hue ~15) — 5.0:1, distinct from primary #802626
        "status-info":    "#6b9ddb",   // warm blue — 6.6:1 contrast
        "status-special": "#b07db2",   // soft violet — special/rare
      },
      fontFamily: {
        display: ["Public Sans", "sans-serif"],
      },
    },
  },
  plugins: [],
};
