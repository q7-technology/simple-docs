import type { ComponentProps } from "react";
import { cn } from "./cn";

/** The brand surface, not the bare one: space-blue at 20% for the edge and
 * space-darkBlue at 60% with a blur, so the stars read through. */
export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-lg border border-space-blue/20 bg-space-darkBlue/60 shadow-sm backdrop-blur-sm", className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1.5 p-6", className)} {...props} />;
}

/** card-title in space-lightGray: an h2 unless `level` says otherwise. */
export function CardTitle({ level = 2, className, ...props }: ComponentProps<"h2"> & { level?: 1 | 2 | 3 }) {
  const Tag = `h${level}` as "h1" | "h2" | "h3";
  return <Tag className={cn("text-card-title text-space-lightGray", className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("text-body-sm text-space-gray", className)} {...props} />;
}

export function CardContent({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("p-6 pt-0", className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex items-center gap-3 p-6 pt-0", className)} {...props} />;
}
