import type { ComponentProps } from "react";
import { cn } from "./cn";

export type BadgeTone = "blue" | "gold" | "gray" | "green";

const tones: Record<BadgeTone, string> = {
  blue: "border-space-blue/30 text-space-blue",
  gold: "border-space-gold/30 text-space-gold",
  gray: "border-space-gray/30 text-space-gray",
  green: "border-space-lightGreen/30 text-space-lightGreen",
};

/** The design system's outline Badge, re-tinted. Its word keeps its own
 * casing and says the state: the colour is never the only sign. */
export function Badge({ tone = "blue", className, ...props }: ComponentProps<"span"> & { tone?: BadgeTone }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-badge", tones[tone], className)} {...props} />
  );
}
