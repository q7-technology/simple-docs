import type { ReactNode } from "react";
import { CircleCheck, Info, TriangleAlert } from "lucide-react";
import { cn } from "./cn";

type Tone = "warning" | "success" | "info";

const looks: Record<Tone, string> = {
  warning: "border-space-gold/30 bg-space-gold/[0.07] [&>svg]:text-space-gold",
  success: "border-space-lightGreen/30 bg-space-lightGreen/[0.07] [&>svg]:text-space-lightGreen",
  info: "border-space-blue/30 bg-space-blue/[0.07] [&>svg]:text-space-blue",
};

const icons = { warning: TriangleAlert, success: CircleCheck, info: Info };

/** A message in the SimulatedNotice's frame. A warning is an alert, read out
 * at once; a success or a note is a status. Icon and words, never colour alone. */
export function Notice({ tone = "warning", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  const Icon = icons[tone];
  return (
    <div
      role={tone === "warning" ? "alert" : "status"}
      className={cn("flex items-start gap-3 rounded-xl border p-4 text-body-sm text-space-lightGray", looks[tone], className)}
    >
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
