import type { Config } from "tailwindcss";

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: v("paper"),
        surface: v("surface"),
        ink: v("ink"),
        forest: v("forest"),
        sage: v("sage"),
        line: v("line"),
        muted: v("muted"),
        marigold: v("marigold"),
        limit: v("limit"),
        limitbg: v("limitbg"),
        fitbg: v("fitbg"),
        compbg: v("compbg"),
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      maxWidth: { read: "42.5rem" },
    },
  },
  plugins: [],
};
export default config;
