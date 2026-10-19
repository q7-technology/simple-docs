import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { messageOf } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Loading } from "../auth/guards";
import { AuthFrame } from "../ui/AuthFrame";
import { Button } from "../ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/Card";
import { TextField } from "../ui/Field";
import { Notice } from "../ui/Notice";
import { OrgMark } from "../ui/OrgMark";

export function SignIn() {
  const { ready, branding, me, signIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!ready) return <Loading />;
  if (branding?.setup_needed) return <Navigate to="/setup" replace />;
  if (me) return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await signIn(username, password);
    } catch (err) {
      setProblem(messageOf(err));
      setBusy(false);
    }
  }

  return (
    <AuthFrame>
      <Card>
        <CardHeader className="items-center text-center">
          <OrgMark logoId={branding?.logo_id ?? null} size={48} />
          <CardTitle level={1}>Sign in</CardTitle>
          <CardDescription>{branding?.org_name ? `${branding.org_name} on Simple Docs` : "Simple Docs"}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            {problem && <Notice>{problem}</Notice>}
            <TextField label="Username" name="username" autoComplete="username" autoCapitalize="none"
                       spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} required />
            <TextField label="Password" name="password" type="password" autoComplete="current-password"
                       value={password} onChange={(e) => setPassword(e.target.value)} required />
            <Button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
          </form>
        </CardContent>
      </Card>
    </AuthFrame>
  );
}
