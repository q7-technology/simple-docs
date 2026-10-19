import type { Config } from "tailwindcss";
import tokens from "./src/design/tokens.json";
import { themeFromTokens, type Tokens } from "./src/design/theme";

// One dark theme: there is no light palette, so no darkMode and no dark: variants.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: themeFromTokens(tokens as Tokens) },
} satisfies Config;
