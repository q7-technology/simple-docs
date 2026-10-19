import { Navigate, Outlet } from "react-router-dom";
import { AuthFrame } from "../ui/AuthFrame";
import { Button } from "../ui/Button";
import { Card, CardContent } from "../ui/Card";
import { Notice } from "../ui/Notice";
import { useAuth } from "./AuthContext";

export function Loading() {
  return <p className="relative z-10 p-6 text-body-sm text-space-gray">Loading…</p>;
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

/** Signed in, or off to first run or sign in. */
export function RequireAuth() {
  const { ready, branding, me, trouble, retry } = useAuth();
  if (!ready) return <Loading />;
  if (trouble) return <Trouble message={trouble} retry={retry} />;
  if (branding?.setup_needed) return <Navigate to="/setup" replace />;
  if (!me) return <Navigate to="/sign-in" replace />;
  return <Outlet />;
}

/** A page for those whose role carries `scope`; anyone else goes home. */
export function RequireScope({ scope }: { scope: string }) {
  const { can } = useAuth();
  return can(scope) ? <Outlet /> : <Navigate to="/" replace />;
}
