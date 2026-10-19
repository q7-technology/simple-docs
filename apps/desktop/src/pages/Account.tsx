import { useState, type FormEvent } from "react";
import { api, ApiError, messageOf } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/Card";
import { TextField } from "../ui/Field";
import { ROLE_NAMES } from "../ui/Layout";
import { Notice } from "../ui/Notice";
import { SectionHeading } from "../ui/SectionHeading";

const BLANK = { current_password: "", new_password: "", again: "" };

export function Account() {
  const { me } = useAuth();
  const [form, setForm] = useState(BLANK);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setDone(null);
    setProblem(null);
    if (form.new_password !== form.again) {
      setFields({ again: "The new passwords don't match." });
      return;
    }
    setFields({});
    setBusy(true);
    try {
      await api.post("/v1/auth/password", { current_password: form.current_password, new_password: form.new_password });
      setForm(BLANK);
      setDone("Password changed. You're still signed in here; anywhere else, sign in again.");
    } catch (err) {
      // a field that is wrong is shown beside it; anything else (locked after
      // five wrong tries, say: the session carries on) is a notice, and you stay here
      if (err instanceof ApiError && Object.keys(err.fields).length > 0) setFields(err.fields);
      else setProblem(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  const role = me ? ROLE_NAMES[me.role].toLowerCase() : "";
  const article = /^[aeiou]/.test(role) ? "an" : "a";

  return (
    <div className="flex flex-col gap-8">
      <SectionHeading accentText="Your" description={me ? `Signed in as ${me.username}, ${article} ${role}.` : undefined}>
        account
      </SectionHeading>
      {problem && <Notice>{problem}</Notice>}
      {done && <Notice tone="success">{done}</Notice>}
      <Card className="max-w-panel">
        <CardHeader>
          <CardTitle>Change your password</CardTitle>
          <CardDescription>Your other sessions end; this one carries on.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} noValidate aria-label="Change your password" className="flex flex-col gap-4">
            <TextField label="Current password" type="password" autoComplete="current-password"
                       value={form.current_password} onChange={(e) => setForm({ ...form, current_password: e.target.value })}
                       error={fields.current_password} />
            <TextField label="New password" type="password" autoComplete="new-password" hint="At least 12 characters."
                       value={form.new_password} onChange={(e) => setForm({ ...form, new_password: e.target.value })}
                       error={fields.new_password} />
            <TextField label="New password again" type="password" autoComplete="new-password" value={form.again}
                       onChange={(e) => setForm({ ...form, again: e.target.value })} error={fields.again} />
            <div>
              <Button type="submit" disabled={busy}>{busy ? "Changing…" : "Change password"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
