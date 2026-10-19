import type { ComponentProps } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "./cn";

export type Accent = "blue" | "gold" | "mint" | "violet";

const text: Record<Accent, string> = {
  blue: "text-space-blue",
  gold: "text-space-gold",
  mint: "text-space-lightBlue",
  violet: "text-space-purple",
};

const tint: Record<Accent, string> = {
  blue: "border-space-blue/30 bg-space-blue/10",
  gold: "border-space-gold/30 bg-space-gold/10",
  mint: "border-space-lightBlue/30 bg-space-lightBlue/10",
  violet: "border-space-purple/30 bg-space-purple/10",
};

export interface ChipProps extends ComponentProps<"span"> {
  /** A lucide-react icon: the component, not an element. Decorative. */
  icon?: LucideIcon;
  accent?: Accent;
  /** eyebrow: uppercase, over a heading · feature: a capability · meta: a quiet counter */
  tone?: "eyebrow" | "feature" | "meta";
}

/** The design system's Chip. Never interactive; its words stand alone. */
export function Chip({ icon: Icon, accent = "blue", tone = "feature", className, children, ...props }: ChipProps) {
  const look =
    tone === "eyebrow"
      ? cn("border px-3 py-1 text-eyebrow uppercase", tint[accent], text[accent])
      : tone === "meta"
        ? "border border-space-blue/20 px-3 py-1 text-caption text-space-gray"
        : "border border-space-blue/20 bg-space-darkBlue/60 px-3 py-1.5 text-body-sm text-space-lightGray backdrop-blur-sm";
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full", look, className)} {...props}>
      {Icon && tone !== "meta" && <Icon aria-hidden="true" className={cn("h-4 w-4", text[accent])} />}
      {children}
    </span>
  );
}
