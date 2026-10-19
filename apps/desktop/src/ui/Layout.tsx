import { useEffect, useRef, useState } from "react";
import { LogOut, Settings } from "lucide-react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { messageOf } from "../api/client";
import type { Role } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { Badge } from "./Badge";
import { Button, EASE } from "./Button";
import { cn } from "./cn";
import { Notice } from "./Notice";
import { OrgMark } from "./OrgMark";
import { RouteFocus } from "./RouteFocus";

export const ROLE_NAMES: Record<Role, string> = { admin: "Admin", editor: "Editor", reviewer: "Reviewer" };

export const navLink = ({ isActive }: { isActive: boolean }) =>
  cn(
    `inline-flex h-10 items-center gap-2 rounded-md px-3 text-label ${EASE}`,
    isActive ? "bg-space-blue/10 text-space-lightGray" : "text-space-gray hover:text-space-lightGray",
  );

/** The app's frame: a skip link first (the design system keeps it there),
 * then the design's navbar: Simple Docs · Documents · Clients · Templates ·
 * Spend, with you on the right. Templates and Spend are admins' screens.
 * On a narrow window the navbar wraps onto more rows rather than overflow,
 * and scrolls away rather than stick over the page (sticky from sm up).
 * Following a link moves focus to the new page's heading (RouteFocus), and
 * asks again who is signed in, so a session ended elsewhere (signed out,
 * deactivated, a new password) goes to sign in rather than lingering. The
 * page you open on doesn't ask: the app has only just asked.
 * The skip link's padding is focus: only, because not-sr-only sets padding: 0
 * and would otherwise win over a plain px-4 py-2. */
export function Layout() {
  const { me, branding, can, signOut, refreshMe } = useAuth();
  const [stuck, setStuck] = useState<string | null>(null);
  const { pathname } = useLocation();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    // signed out clears who you are, and RequireAuth sends you to sign in;
    // not reaching Simple Docs leaves you where you are
    refreshMe().catch(() => {});
  }, [pathname, refreshMe]);

  async function leave() {
    setStuck(null);
    try {
      await signOut();
    } catch (e) {
      // the API never answered, so the session may still be good: say so, and stay
      setStuck(`Couldn't sign out: ${messageOf(e)}`);
    }
  }

  const links = [
    { to: "/documents", label: "Documents", show: true },
    { to: "/clients", label: "Clients", show: true },
    { to: "/templates", label: "Templates", show: can("templates:write") },
    { to: "/spend", label: "Spend", show: can("spend:read") },
  ];
  return (
    <>
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-space-blue text-label text-space-darkBlue focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:px-4 focus:py-2"
      >
        Skip to main content
      </a>
      <header className="top-0 sm:sticky z-40 border-b border-space-blue/20 bg-space-darkBlue/80 backdrop-blur-sm">
        <div className="mx-auto flex min-h-navbar max-w-shell flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2">
          <Link to="/documents" className="flex items-center gap-2.5 text-subhead text-space-lightGray">
            <OrgMark logoId={branding?.logo_id ?? null} size={32} />
            Simple Docs
          </Link>
          <nav aria-label="Main">
            <ul className="flex flex-wrap items-center gap-1">
              {links.filter((l) => l.show).map((l) => (
                <li key={l.to}>
                  <NavLink to={l.to} className={navLink}>{l.label}</NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {me && (
              <NavLink to="/account" className={navLink}
                       aria-label={`${me.display_name}, ${ROLE_NAMES[me.role]}: your account`}>
                {me.display_name}
                <Badge tone="gray">{ROLE_NAMES[me.role]}</Badge>
              </NavLink>
            )}
            {can("settings:write") && (
              <NavLink to="/settings" className={navLink} aria-label="Settings">
                <Settings aria-hidden="true" className="h-5 w-5" />
              </NavLink>
            )}
            <Button variant="ghost" onClick={() => void leave()}>
              <LogOut aria-hidden="true" />
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="relative z-10 mx-auto max-w-shell px-4 py-10">
        {stuck && <Notice className="mb-8">{stuck}</Notice>}
        <RouteFocus />
        <Outlet />
      </main>
    </>
  );
}
