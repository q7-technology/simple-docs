import type { ReactNode } from "react";

/** Sign in, first run and trouble: one card in the middle of the star field. */
export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="relative z-10 grid min-h-screen place-items-center px-4 py-12">
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
