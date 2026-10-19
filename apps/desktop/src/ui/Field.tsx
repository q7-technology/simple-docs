import { useId, type ComponentProps, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { cn } from "./cn";

// The design system's Input and Textarea: radius-md on the background fill,
// the focus ring. The edge is space-gray/70 (about 3.5:1 on the ground, as
// WCAG 1.4.11 asks; the token's input colour is 1.2:1). A field that is
// wrong takes a gold edge.
const control =
  "w-full rounded-md border border-space-gray/70 bg-background px-3 text-space-lightGray " +
  "placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring " +
  "disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-space-gold";

/** 40px tall; 16px text on a phone (iOS zooms the page under 16) and 14px from md. */
export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-10 py-2 text-base md:text-sm", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-[80px] py-2 text-base md:text-sm", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(control, "h-10 text-base md:text-sm", className)} {...props} />;
}

interface Control {
  id: string;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
}

interface Labelled {
  label: string;
  error?: string;
  hint?: string;
  className?: string;
}

/** A label, the control, a hint and what is wrong, wired together. The
 * error is gold with an icon and words: colour is never the only sign.
 * The wiring is spread last, so nothing passed in can unhook the label. */
export function Field({ label, error, hint, className, children }: Labelled & { children: (control: Control) => ReactNode }) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : "", error ? errorId : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-label text-space-lightGray">{label}</label>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })}
      {hint && <p id={hintId} className="text-caption text-space-gray">{hint}</p>}
      {error && (
        <p id={errorId} className="flex items-center gap-1.5 text-body-sm text-space-gold">
          <TriangleAlert aria-hidden="true" className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

export function TextField({ label, error, hint, className, ...props }: Labelled & ComponentProps<"input">) {
  return (
    <Field label={label} error={error} hint={hint} className={className}>
      {(c) => <Input {...props} {...c} />}
    </Field>
  );
}

export function TextAreaField({ label, error, hint, className, ...props }: Labelled & ComponentProps<"textarea">) {
  return (
    <Field label={label} error={error} hint={hint} className={className}>
      {(c) => <Textarea {...props} {...c} />}
    </Field>
  );
}

export function SelectField({ label, error, hint, className, children, ...props }: Labelled & ComponentProps<"select">) {
  return (
    <Field label={label} error={error} hint={hint} className={className}>
      {(c) => <Select {...props} {...c}>{children}</Select>}
    </Field>
  );
}
