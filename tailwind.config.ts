/**
 * Design tokens.
 *
 * Read src/design/tokens.md before touching this file — the palette and
 * type choices here are deliberate, not defaults. In particular:
 *   - `signal` (fight-poster red) is for live/urgent states ONLY, never
 *     decoration. If you reach for it to make something "pop", stop.
 *   - `prestige` (gold) is reserved for titles, championships, and money
 *     going up. It should feel earned, not used as a generic accent.
 *   - A promotion's own brand color (from promotion.branding) tints
 *     specific elements within that promotion's pages via the
 *     --promotion-accent CSS variable — it never replaces `ink`/`surface`,
 *     which are the app's own identity, not the promotion's.
 */
import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0E1116",
        surface: "#171B22",
        "surface-raised": "#1F242D",
        hairline: "#2A303B",
        signal: "#E4362A",
        "signal-dim": "#5C2420",
        prestige: "#C9A227",
        "prestige-dim": "#4A3D14",
        text: "#F2F0EA",
        "text-muted": "#8B92A0",
        "text-faint": "#565D6B",
        win: "#3FA66A",
        loss: "#8B92A0",
      },
      fontFamily: {
        display: ["Barlow Condensed", "sans-serif"],
        body: ["IBM Plex Sans", "sans-serif"],
      },
      fontSize: {
        // Tuned type scale — not Tailwind defaults. Display sizes carry
        // tight tracking; set letter-spacing utilities alongside these.
        "stat-xl": ["4.5rem", { lineHeight: "0.95", fontWeight: "700" }],
        "stat-lg": ["2.75rem", { lineHeight: "1", fontWeight: "700" }],
        "stat-md": ["1.75rem", { lineHeight: "1.1", fontWeight: "600" }],
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
