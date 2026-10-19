import tokens from "../design/tokens.json";
import { themeFromTokens, type Tokens } from "../design/theme";

const theme = themeFromTokens(tokens as Tokens);

describe("the Q7 tokens as a Tailwind theme", () => {
  it("puts the brand colours under space-, by their token names", () => {
    expect(theme.colors.space).toMatchObject({
      darkBlue: "#0d1117", lightGray: "#ccd6f6", gray: "#8892b0", blue: "#29abe2", gold: "#f7941d",
      lightGreen: "#4ade80",
    });
  });

  it("keeps the shadcn colours by name", () => {
    expect(theme.colors.ring).toBe("hsl(212.7, 26.8%, 83.9%)");
    expect(theme.colors.input).toBe("hsl(220, 13%, 15%)");
    expect(theme.colors.destructive).toBe("hsl(0, 62.8%, 30.6%)");
  });

  it("gives each text role its size, line height and weight", () => {
    expect(theme.fontSize["section-title-sm"]).toEqual(["30px", { lineHeight: "36px", fontWeight: "700" }]);
    expect(theme.fontSize.label).toEqual(["14px", { lineHeight: "20px", fontWeight: "500" }]);
    expect(theme.fontSize.eyebrow).toEqual(["12px", { lineHeight: "16px", fontWeight: "600", letterSpacing: "0.05em" }]);
  });

  it("names radii, shadows and widths as the tokens do", () => {
    expect(theme.borderRadius).toMatchObject({ md: "6px", lg: "8px", xl: "12px", full: "9999px" });
    expect(theme.boxShadow["glow-blue"]).toBe("0 0 24px rgba(41, 171, 226, 0.3)");
    expect(theme.maxWidth).toMatchObject({ shell: "1280px", panel: "896px", measure: "768px" });
    expect(theme.spacing.navbar).toBe("80px");
  });

  it("names the reading width measure, so Tailwind's own max-w-prose (65ch) can't win", () => {
    expect(theme.maxWidth.measure).toBe("768px");
    expect(Object.keys(theme.maxWidth).filter((k) => k.includes("prose"))).toEqual([]);
  });

  it("sets the system sans, as the site does", () => {
    expect(theme.fontFamily.sans).toMatch(/^ui-sans-serif, system-ui/);
  });
});
