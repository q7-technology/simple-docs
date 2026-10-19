import { Navigate, Outlet, useLocation, type Location } from "react-router-dom";
import { AuthFrame } from "../ui/AuthFrame";
import { Button } from "../ui/Button";
import { Card, CardContent } from "../ui/Card";
import { Notice } from "../ui/Notice";
import { useAuth } from "./AuthContext";

/** What RequireAuth hands sign in: the page you were sent away from. */
export interface SignInState {
  from?: Location;
}

export function Loading() {
  return <p role="status" className="relative z-10 p-6 text-body-sm text-space-gray">Loading…</p>;
}

export function Trouble({ message, retry }: { message: string; retry: () => void }) {
  return (
    <AuthFrame>
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <Notice>{message}</Notice>
          <Button onClick={retry}>Try again</Button>
        </CardContent>
      </Card>
    </AuthFrame>
  );
}

/** Signed in, or off to first run or sign in. Sign in is told which page you
 * were on, to take you back there; opening Simple Docs at / says nothing. */
export function RequireAuth() {
  const { ready, branding, me, trouble, retry } = useAuth();
  const location = useLocation();
  if (!ready) return <Loading />;
  if (trouble) return <Trouble message={trouble} retry={retry} />;
  if (branding?.setup_needed) return <Navigate to="/setup" replace />;
  if (!me) {
    const state: SignInState | null = location.pathname === "/" ? null : { from: location };
    return <Navigate to="/sign-in" replace state={state} />;
  }
  return <Outlet />;
}

/** A page for those whose role carries `scope`; anyone else goes home. */
export function RequireScope({ scope }: { scope: string }) {
  const { can } = useAuth();
  return can(scope) ? <Outlet /> : <Navigate to="/" replace />;
}
