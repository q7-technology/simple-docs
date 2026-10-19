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

/** The frame, the icon and the words, with no role of its own. */
function Box({ tone, className, children }: { tone: Tone; className?: string; children: ReactNode }) {
  const Icon = icons[tone];
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border p-4 text-body-sm text-space-lightGray", looks[tone], className)}>
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

/** A message in the SimulatedNotice's frame. A warning is an alert, read out
 * at once; a success or a note is a status. Icon and words, never colour alone. */
export function Notice({ tone = "warning", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <div role={tone === "warning" ? "alert" : "status"} className={className}>
      <Box tone={tone}>{children}</Box>
    </div>
  );
}

/** What a page says after you do something. The status is always in the page,
 * so a screen reader is listening before its words change (one added with
 * its words already in it is often missed); out of the flow while it is
 * empty. Trouble is an alert, added when there is some. Clear `said` before
 * saying something new, so the same words twice are read twice. */
export function LiveNotices({ said, problem, tone = "success" }: {
  said: string | null;
  problem: string | null;
  tone?: "success" | "info";
}) {
  return (
    <>
      <div role="status" aria-live="polite" aria-atomic="true" className={said ? undefined : "sr-only"}>
        {said && <Box tone={tone}>{said}</Box>}
      </div>
      {problem && <Notice>{problem}</Notice>}
    </>
  );
}
