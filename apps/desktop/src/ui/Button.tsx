import type { ComponentProps } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "outline" | "ghost" | "destructive";
export type ButtonSize = "default" | "sm" | "lg" | "icon";

// The design system's Button: 40px, radius-md, the label style, an icon
// child at 16px and click-through, and the focus ring kept. Only the colours
// ease: Tailwind 4's transition-colors eases outline-color too, so the ring
// would fade in from dark.
export const EASE = "transition-[color,background-color,border-color]";

const base =
  `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-label ${EASE} ` +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring " +
  "disabled:pointer-events-none disabled:opacity-50 " +
  "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0";

const variants: Record<ButtonVariant, string> = {
  // space-darkBlue on space-blue: the AA-safe pairing (white would be 2.6:1)
  primary: "bg-space-blue text-space-darkBlue hover:bg-space-blue/90",
  // the second action: a blue hairline, because gold means a warning here
  outline: "border border-space-blue/30 text-space-lightGray hover:border-space-blue/50 hover:bg-space-blue/10",
  ghost: "text-space-lightGray hover:bg-space-blue/10",
  // dark enough that light text reads (7.0:1)
  destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
};

const sizes: Record<ButtonSize, string> = {
  default: "h-10 px-4 py-2",
  sm: "h-9 px-3",
  lg: "h-11 px-8",
  icon: "h-10 w-10",
};

export interface ButtonProps extends ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/** type="button" unless told otherwise, so one inside a form doesn't submit
 * it by accident. An icon-only button needs an aria-label. */
export function Button({ variant = "primary", size = "default", type = "button", className, ...props }: ButtonProps) {
  return <button type={type} className={cn(base, variants[variant], sizes[size], className)} {...props} />;
}
