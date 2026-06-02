import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        mp: {
          navy: "#061D3A",
          navy2: "#0B2F5B",
          cyan: "#1DB7E8",
          blue: "#2563EB",
          soft: "#EEF6FB"
        }
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "Segoe UI", "Arial", "sans-serif"]
      },
      borderRadius: {
        mp: "8px"
      },
      boxShadow: {
        panel: "0 12px 36px rgba(6,29,58,0.08)"
      }
    }
  },
  plugins: []
} satisfies Config;
