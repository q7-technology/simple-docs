import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { KeyRound, UserPlus } from "lucide-react";
import { api, ApiError, messageOf } from "../api/client";
import type { Role, User } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/Card";
import { Select, SelectField, TextField } from "../ui/Field";
import { ROLE_NAMES } from "../ui/Layout";
import { Notice } from "../ui/Notice";

const ROLES: Role[] = ["admin", "editor", "reviewer"];
const EMPTY = { display_name: "", username: "", role: "editor" as Role, password: "" };

function asA(role: Role): string {
  return role === "admin" ? "an admin" : `a ${role}`;
}

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" }) : "Never";
}

function State({ user }: { user: User }) {
  if (!user.active) return <Badge tone="gray">Deactivated</Badge>;
  if (user.locked) return <Badge tone="gold">Locked</Badge>;
  return <Badge tone="green">Active</Badge>;
}

/** Deactivate asks first, in the row, with its answer focused; Escape or
 * Keep puts focus back on Deactivate. Reactivating needs no question. */
function ActiveControl({ user, onChange }: { user: User; onChange: (active: boolean) => void }) {
  const [asking, setAsking] = useState(false);
  const back = useRef<HTMLButtonElement>(null);
  const returning = useRef(false);

  useEffect(() => {
    if (!asking && returning.current) {
      returning.current = false;
      back.current?.focus();
    }
  }, [asking]);

  function close() {
    returning.current = true;
    setAsking(false);
  }

  if (!user.active) {
    return (
      <Button ref={back} variant="ghost" size="sm" onClick={() => onChange(true)}>
        Reactivate<span className="sr-only"> {user.display_name}</span>
      </Button>
    );
  }
  if (asking) {
    return (
      <div role="group" aria-label={`Deactivate ${user.display_name}?`} className="flex items-center gap-2"
           onKeyDown={(e: KeyboardEvent) => { if (e.key === "Escape") close(); }}>
        <span className="text-body-sm text-space-lightGray">Deactivate and sign out?</span>
        <Button variant="destructive" size="sm" autoFocus onClick={() => { close(); onChange(false); }}>
          Yes, deactivate<span className="sr-only"> {user.display_name}</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={close}>
          Keep<span className="sr-only"> {user.display_name}</span>
        </Button>
      </div>
    );
  }
  return (
    <Button ref={back} variant="ghost" size="sm" onClick={() => setAsking(true)}>
      Deactivate<span className="sr-only"> {user.display_name}</span>
    </Button>
  );
}

export function Users() {
  const { me } = useAuth();
  const [users, setUsers] = useState<User[] | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [passwordFor, setPasswordFor] = useState<User | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // the Set password button that opened the form, given focus back when it closes
  const opener = useRef<HTMLButtonElement | null>(null);

  // what is wrong is read out with the first field it is wrong in
  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [fields]);

  useEffect(() => {
    if (!passwordFor && opener.current) {
      opener.current.focus();
      opener.current = null;
    }
  }, [passwordFor]);

  const load = useCallback(async () => {
    try {
      setUsers((await api.get<{ items: User[] }>("/v1/users")).items);
    } catch (e) {
      setProblem(messageOf(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function say(message: string | null, trouble: string | null = null) {
    setDone(message);
    setProblem(trouble);
  }

  async function change(user: User, patch: { role?: Role; active?: boolean }, said: string) {
    say(null);
    try {
      await api.patch(`/v1/users/${user.id}`, patch);
      say(said);
    } catch (e) {
      say(null, messageOf(e));
    }
    await load();
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    setFields({});
    say(null);
    try {
      await api.post("/v1/users", form);
      say(`${form.display_name.trim()} can sign in now.`);
      setForm(EMPTY);
      await load();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length > 0) setFields(err.fields);
      else say(null, messageOf(err));
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {problem && <Notice>{problem}</Notice>}
      {done && <Notice tone="success">{done}</Notice>}

      <Card>
        <CardHeader>
          <CardTitle>People who sign in</CardTitle>
          <CardDescription>
            Deactivate someone who leaves: they can't sign in, and their name stays on what they wrote.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {users === null ? (
            <p className="text-body-sm text-space-gray">Loading…</p>
          ) : (
            <table className="w-full text-left text-body-sm">
              <thead className="text-caption text-space-gray">
                <tr>
                  <th scope="col" className="py-2 pr-4 font-medium">Name</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Username</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Role</th>
                  <th scope="col" className="py-2 pr-4 font-medium">State</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Last signed in</th>
                  <th scope="col" className="py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t border-space-blue/10">
                    <th scope="row" className="py-3 pr-4 font-medium text-space-lightGray">{u.display_name}</th>
                    <td className="py-3 pr-4 text-space-gray">{u.username}</td>
                    <td className="py-3 pr-4">
                      <div className="w-36">
                        <Select
                          aria-label={`Role for ${u.display_name}`}
                          value={u.role}
                          disabled={!u.active}
                          onChange={(e) => {
                            const role = e.target.value as Role;
                            void change(u, { role }, `${u.display_name} is ${asA(role)} now.`);
                          }}
                        >
                          {ROLES.map((r) => <option key={r} value={r}>{ROLE_NAMES[r]}</option>)}
                        </Select>
                      </div>
                    </td>
                    <td className="py-3 pr-4"><State user={u} /></td>
                    <td className="py-3 pr-4 text-space-gray">{when(u.last_sign_in_at)}</td>
                    <td className="py-3">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm"
                                onClick={(e) => { opener.current = e.currentTarget; setPasswordFor(u); }}>
                          <KeyRound aria-hidden="true" />
                          Set password<span className="sr-only"> for {u.display_name}</span>
                        </Button>
                        {u.id !== me?.id && (
                          <ActiveControl
                            user={u}
                            onChange={(active) => void change(u, { active }, active
                              ? `${u.display_name} can sign in again.`
                              : `${u.display_name} is deactivated and signed out.`)}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {passwordFor && (
        <SetPassword
          key={passwordFor.id}
          user={passwordFor}
          onCancel={() => setPasswordFor(null)}
          onDone={(said) => {
            setPasswordFor(null);
            say(said);
            void load();
          }}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Add someone</CardTitle>
          <CardDescription>
            Editors write documents, reviewers approve them, admins look after Settings, templates and spend.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form ref={formRef} onSubmit={add} noValidate aria-label="Add someone" className="grid max-w-panel gap-4 md:grid-cols-2">
            <TextField label="Name" autoComplete="off" value={form.display_name}
                       onChange={(e) => setForm({ ...form, display_name: e.target.value })} error={fields.display_name} />
            <TextField label="Username" autoComplete="off" autoCapitalize="none" spellCheck={false} value={form.username}
                       onChange={(e) => setForm({ ...form, username: e.target.value })} error={fields.username} />
            <SelectField label="Role" value={form.role} error={fields.role}
                         onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_NAMES[r]}</option>)}
            </SelectField>
            <TextField label="Password" type="password" autoComplete="new-password" hint="At least 12 characters. Tell them yourself."
                       value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} error={fields.password} />
            <div className="md:col-span-2">
              <Button type="submit"><UserPlus aria-hidden="true" />Add</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function SetPassword({ user, onDone, onCancel }: { user: User; onDone: (said: string) => void; onCancel: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const title = `New password for ${user.display_name}`;

  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post(`/v1/users/${user.id}/password`, { password });
      onDone(`${user.display_name}'s password is set. They're signed out everywhere until they use it.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.fields.password ?? err.message : messageOf(err));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>It also clears a lock after too many wrong passwords.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} noValidate aria-label={title} className="flex flex-wrap items-start gap-3"
              onKeyDown={(e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); }}>
          <TextField label="New password" type="password" autoComplete="new-password" hint="At least 12 characters." autoFocus
                     value={password} onChange={(e) => setPassword(e.target.value)} error={error} className="min-w-64 flex-1" />
          <div className="flex gap-2 pt-7">
            <Button type="submit">Save password</Button>
            <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
