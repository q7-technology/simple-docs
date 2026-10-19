import { Navigate, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { SectionHeading } from "../ui/SectionHeading";
import { navLink } from "../ui/Layout";

// each tab shows only to those whose role carries its scope, as its route asks
const TABS = [
  { to: "/settings/users", label: "Users", scope: "users:write" },
  { to: "/settings/org", label: "Organisation", scope: "settings:write" },
];

/** Settings, for admins: who signs in, and the organisation. Later steps add
 * models, budget and caps, ignore and redaction patterns, and connectors. */
export function SettingsLayout() {
  const { can } = useAuth();
  return (
    <div className="flex flex-col gap-8">
      <SectionHeading accentText="Settings" description="Who signs in, and the organisation your documents speak for." />
      <nav aria-label="Settings">
        <ul className="flex gap-1">
          {TABS.filter((t) => can(t.scope)).map((t) => (
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

/** /settings opens on the first tab you can use. */
export function SettingsHome() {
  const { can } = useAuth();
  const first = TABS.find((t) => can(t.scope));
  return <Navigate to={first?.to ?? "/"} replace />;
}
