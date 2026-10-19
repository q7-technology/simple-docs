import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { ApiError, messageOf } from "../api/client";
import { useAuth, type SetUpForm } from "../auth/AuthContext";
import { Loading } from "../auth/guards";
import { AuthFrame } from "../ui/AuthFrame";
import { Button } from "../ui/Button";
import { Card, CardContent, CardHeader } from "../ui/Card";
import { TextField } from "../ui/Field";
import { Notice } from "../ui/Notice";
import { SectionHeading } from "../ui/SectionHeading";
import { SimpleDocsMark } from "../ui/SimpleDocsMark";

const EMPTY: SetUpForm = { org_name: "", display_name: "", username: "", password: "" };

/** First run: the organisation's name and the first admin. The rest of the
 * organisation's details wait in Settings, where first run ends. */
export function SetUp() {
  const { ready, branding, me, setUp } = useAuth();
  const [form, setForm] = useState(EMPTY);
  const [again, setAgain] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // what is wrong is read out with the first field it is wrong in
  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [fields]);

  if (!ready) return <Loading />;
  if (!branding?.setup_needed) return <Navigate to={me ? "/settings/org" : "/sign-in"} replace />;

  const set = (key: keyof SetUpForm) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setProblem(null);
    if (form.password !== again) {
      setFields({ again: "The passwords don't match." });
      return;
    }
    setFields({});
    setBusy(true);
    try {
      await setUp(form);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length > 0) setFields(err.fields);
      else setProblem(messageOf(err));
      setBusy(false);
    }
  }

  return (
    <AuthFrame>
      <Card>
        <CardHeader className="gap-4">
          <SimpleDocsMark size={40} />
          <SectionHeading accentText="Set up"
                          description="Name your organisation and make the first admin. The rest can wait for Settings.">
            Simple Docs
          </SectionHeading>
        </CardHeader>
        <CardContent>
          <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-4">
            {problem && <Notice>{problem}</Notice>}
            <TextField label="Organisation" hint="As your documents should name it." autoComplete="organization"
                       value={form.org_name} onChange={set("org_name")} error={fields.org_name} required />
            <TextField label="Your name" autoComplete="name" value={form.display_name}
                       onChange={set("display_name")} error={fields.display_name} required />
            <TextField label="Username" hint="What you'll sign in with." autoComplete="username"
                       autoCapitalize="none" spellCheck={false} value={form.username}
                       onChange={set("username")} error={fields.username} required />
            <TextField label="Password" type="password" hint="At least 12 characters." autoComplete="new-password"
                       value={form.password} onChange={set("password")} error={fields.password} required />
            <TextField label="Password again" type="password" autoComplete="new-password" value={again}
                       onChange={(e) => setAgain(e.target.value)} error={fields.again} required />
            <Button type="submit" disabled={busy}>{busy ? "Setting up…" : "Set up Simple Docs"}</Button>
          </form>
        </CardContent>
      </Card>
    </AuthFrame>
  );
}
