import type { ReactNode } from "react";
import { cn } from "./cn";

interface SectionHeadingProps {
  /** The leading phrase, in the accent colour. */
  accentText: string;
  /** The rest of the heading, in space-lightGray. */
  children?: ReactNode;
  /** The lead under it: two sentences at most. */
  description?: ReactNode;
  /** Gold only for talking to someone; blue for everything else. */
  accent?: "blue" | "gold";
  /** An app page's title is its h1; the design system's default is a site section's h2. */
  level?: 1 | 2;
  className?: string;
}

/** The design system's heading pattern, left-aligned for an app page. */
export function SectionHeading({ accentText, children, description, accent = "blue", level = 1, className }: SectionHeadingProps) {
  const Tag = `h${level}` as "h1" | "h2";
  return (
    <div className={cn("flex max-w-measure flex-col gap-3", className)}>
      <Tag className="text-section-title-sm text-space-lightGray">
        <span className={accent === "gold" ? "text-space-gold" : "text-space-blue"}>{accentText}</span>
        {children ? <> {children}</> : null}
      </Tag>
      {description && <p className="text-lead text-space-gray">{description}</p>}
    </div>
  );
}
