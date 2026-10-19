import { render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { AppRoutes } from "../App";
import { AuthProvider } from "../auth/AuthContext";
import type { Branding, Me } from "../api/types";

export function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** An answer in the API's error shape. */
export function apiError(status: number, code: string, message: string, fields?: Record<string, string>) {
  return json(status, { error: { code, message, ...(fields ? { fields } : {}) } });
}

export const ADA: Me = { id: "u-ada", username: "ada", display_name: "Ada Admin", role: "admin", scopes: ["*"] };

export const MEL: Me = {
  id: "u-mel", username: "mel", display_name: "Mel Grant", role: "editor",
  scopes: ["documents:read", "documents:write", "clients:read", "clients:write", "reviews:write"],
};

export const ACME: Branding = { setup_needed: false, org_name: "Acme Pty Ltd", logo_id: null };
export const FRESH: Branding = { setup_needed: true, org_name: null, logo_id: null };

export interface Call {
  method: string;
  url: string;
  body: unknown;
  headers: Headers;
}

export type Handler = (method: string, url: string, body: unknown) =>
  Response | null | undefined | Promise<Response | null | undefined>;

/** The API, stubbed. `more` answers first; then the branding (Acme), who is
 * signed in (Ada, an admin, unless `me` says otherwise; null is nobody) and
 * sign-out; anything else is a 404 in the API's shape. */
export function stubApi(more: Handler = () => null,
                        { me = ADA, branding = ACME }: { me?: Me | null; branding?: Branding } = {}) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    // JSON is read back; a file is kept as it was sent
    const body = typeof init.body === "string" ? JSON.parse(init.body) : init.body ?? undefined;
    calls.push({ method, url, body, headers: new Headers(init.headers) });
    const answer = await more(method, url, body);
    if (answer) return answer;
    if (url === "/api/v1/branding") return json(200, branding);
    if (url === "/api/v1/auth/me") {
      return me ? json(200, me) : apiError(401, "signed_out", "You're signed out. Sign in again.");
    }
    if (url === "/api/v1/auth/sign-out") return new Response(null, { status: 204 });
    return apiError(404, "not_found", `no stub for ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

/** Every path the app has been at since renderApp, redirects included. */
export const visited: string[] = [];

function Where() {
  const { pathname } = useLocation();
  useEffect(() => {
    visited.push(pathname);
  }, [pathname]);
  // a div, not an output: an output is a status, and the pages under test have their own
  return <div data-testid="where">{pathname}</div>;
}

export function renderApp(path: string) {
  visited.length = 0;
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <AppRoutes />
        <Where />
      </AuthProvider>
    </MemoryRouter>,
  );
}

/** The page's status says `text`. The live region is always there, so a
 * screen reader hears it change: wait for its words, not for it. */
export async function said(text: string) {
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(text));
}
