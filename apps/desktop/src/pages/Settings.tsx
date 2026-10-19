import { NavLink, Outlet } from "react-router-dom";
import { SectionHeading } from "../ui/SectionHeading";
import { navLink } from "../ui/Layout";

const TABS = [{ to: "/settings/users", label: "Users" }];

/** Settings, for admins: who signs in, and the organisation. Later steps add
 * models, budget and caps, ignore and redaction patterns, and connectors. */
export function SettingsLayout() {
  return (
    <div className="flex flex-col gap-8">
      <SectionHeading accentText="Settings" description="Who signs in, and the organisation your documents speak for." />
      <nav aria-label="Settings">
        <ul className="flex gap-1">
          {TABS.map((t) => (
            <li key={t.to}>
              <NavLink to={t.to} className={navLink}>{t.label}</NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet />
    </div>
  );
}
