/** The Q7 design system's tokens (tokens.json beside this file, a copy of
 * Q7's design-system/tokens.json) as a Tailwind theme. To take a newer
 * version, copy the file again; nothing else changes.
 *
 * Colours keep their token names (bg-space-darkBlue, ring, input), type
 * styles become sizes by role (text-section-title-sm, text-label), radii
 * and shadows keep theirs (rounded-lg, shadow-glow-blue), and layout widths
 * lose their suffix (max-w-shell, max-w-prose; h-navbar). */

interface Named {
  name: string;
  value: string;
}

interface TypeStyle {
  name: string;
  fontSize: string;
  lineHeight: number | string;
  fontWeight: number;
  letterSpacing?: string;
}

export interface Tokens {
  color: { tokens: Named[] };
  type: { families: { sans: string; mono: string }; groups: { styles: TypeStyle[] }[] };
  radius: { tokens: Named[] };
  shadow: { tokens: Named[] };
  layout: { tokens: Named[] };
}

type FontSize = [string, { lineHeight: string; fontWeight: string; letterSpacing?: string }];

function byName(list: Named[], rename: (name: string) => string): Record<string, string> {
  return Object.fromEntries(list.map(({ name, value }) => [rename(name), value]));
}

export function themeFromTokens(t: Tokens) {
  const space: Record<string, string> = {};
  const colors: Record<string, string | Record<string, string>> = { space };
  for (const { name, value } of t.color.tokens) {
    if (name.startsWith("space-")) space[name.slice("space-".length)] = value;
    else colors[name] = value;
  }

  const fontSize: Record<string, FontSize> = {};
  for (const group of t.type.groups) {
    for (const s of group.styles) {
      fontSize[s.name] = [s.fontSize, {
        lineHeight: String(s.lineHeight),
        fontWeight: String(s.fontWeight),
        ...(s.letterSpacing ? { letterSpacing: s.letterSpacing } : {}),
      }];
    }
  }

  const layout = byName(t.layout.tokens, (n) => n.replace(/-(max|height)$/, ""));
  return {
    colors,
    fontFamily: { sans: t.type.families.sans, mono: t.type.families.mono },
    fontSize,
    borderRadius: byName(t.radius.tokens, (n) => n.replace(/^radius-/, "")),
    // shadow-sm and shadow-lg keep their step; glow-blue stays glow-blue
    boxShadow: byName(t.shadow.tokens, (n) => n.replace(/^shadow-/, "")),
    maxWidth: layout,
    spacing: { navbar: layout.navbar },
  };
}
