import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "var(--brand-50, #eff6ff)",
          100: "var(--brand-100, #dbeafe)",
          200: "var(--brand-200, #bfdbfe)",
          300: "var(--brand-300, #93c5fd)",
          400: "var(--brand-400, #60a5fa)",
          500: "var(--brand-500, #3b82f6)",
          600: "var(--brand-600, #2563eb)",
          700: "var(--brand-700, #1d4ed8)",
          800: "var(--brand-800, #1e40af)",
          900: "var(--brand-900, #1e3a8a)",
          950: "var(--brand-950, #172554)",
        },
      },
    },
  },
  plugins: [],
};
export default config;
