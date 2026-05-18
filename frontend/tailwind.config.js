/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1.25rem", screens: { "2xl": "1280px" } },
    extend: {
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        elev: "rgb(var(--elev) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        ring: "rgb(var(--ring) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        fg: "rgb(var(--fg) / <alpha-value>)",
        subtle: "rgb(var(--subtle) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        "accent-fg": "rgb(var(--accent-fg) / <alpha-value>)",
        success: "rgb(var(--success) / <alpha-value>)",
        warn: "rgb(var(--warn) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)"
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        display: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"]
      },
      fontSize: {
        "display-xl": ["3rem", { lineHeight: "1.05", letterSpacing: "0" }],
        "display-lg": ["2.25rem", { lineHeight: "1.08", letterSpacing: "0" }],
        "display-md": ["1.75rem", { lineHeight: "1.15", letterSpacing: "0" }]
      },
      borderRadius: {
        xl2: "1rem",
        "3xl": "1.5rem"
      },
      boxShadow: {
        soft: "0 1px 2px rgb(0 0 0 / 0.04), 0 1px 1px rgb(0 0 0 / 0.02)",
        elev: "0 4px 14px -2px rgb(0 0 0 / 0.06), 0 2px 4px -1px rgb(0 0 0 / 0.04)",
        pop: "0 12px 32px -8px rgb(0 0 0 / 0.18), 0 2px 6px -1px rgb(0 0 0 / 0.06)",
        ring: "0 0 0 4px rgb(var(--ring) / 0.18)"
      },
      keyframes: {
        "fade-in": { "0%": { opacity: 0, transform: "translateY(4px)" }, "100%": { opacity: 1, transform: "translateY(0)" } },
        shimmer: { "0%": { backgroundPosition: "-400px 0" }, "100%": { backgroundPosition: "400px 0" } },
        "pulse-soft": { "0%, 100%": { opacity: 1 }, "50%": { opacity: 0.55 } },
        "agent-pulse": { "0%, 100%": { transform: "scale(1)", opacity: 0.7 }, "50%": { transform: "scale(1.15)", opacity: 1 } }
      },
      animation: {
        "fade-in": "fade-in 0.32s ease-out both",
        shimmer: "shimmer 1.6s linear infinite",
        "pulse-soft": "pulse-soft 1.8s ease-in-out infinite",
        "agent-pulse": "agent-pulse 1.4s ease-in-out infinite"
      }
    }
  },
  plugins: []
};
