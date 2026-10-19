import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/** After following a link, focus goes to the new page's heading (else to
 * main), so a screen reader says where you are and Tab starts from there.
 * The first page and a redirect (a REPLACE) leave focus alone; the heading
 * gets tabindex=-1 so it can take focus without joining the tab order. */
export function RouteFocus() {
  const { pathname } = useLocation();
  const type = useNavigationType();
  // the last path seen rather than a "first render" flag, which StrictMode's
  // second effect run would clear
  const last = useRef(pathname);

  useEffect(() => {
    if (last.current === pathname) return;
    last.current = pathname;
    if (type === "REPLACE") return;
    const heading = document.querySelector<HTMLElement>("#main h1");
    if (heading) {
      if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
      heading.focus();
    } else {
      document.getElementById("main")?.focus();
    }
  }, [pathname, type]);

  return null;
}
