import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { KeyRound, UserPlus } from "lucide-react";
import { api, fieldErrorsOf, messageOf } from "../api/client";
import type { Role, User } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/Card";
import { Select, SelectField, TextField, useFocusFirstInvalid } from "../ui/Field";
import { ROLE_NAMES } from "../ui/Layout";
import { LiveNotices, Notice } from "../ui/Notice";

const ROLES: Role[] = ["admin", "editor", "reviewer"];
const EMPTY = { display_name: "", username: "", role: "editor" as Role, password: "" };
const FIELDS = ["display_name", "username", "role", "password"] as const;

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

/** The role, shown as `shown` while a change saves. Giving up admin yourself
 * asks first, with its answer focused; Escape or Keep admin puts focus back on
 * the role. The select is never disabled while it saves, so focus stays put;
 * a pick made then is ignored. */
function RoleControl({ user, shown, busy, self, onPick }: {
  user: User;
  shown: Role;
  busy: boolean;
  self: boolean;
  onPick: (role: Role) => void;
}) {
  const [asking, setAsking] = useState<Role | null>(null);
  const select = useRef<HTMLSelectElement>(null);
  const returning = useRef(false);

  useEffect(() => {
    if (!asking && returning.current) {
      returning.current = false;
      select.current?.focus();
    }
  }, [asking]);

  function close() {
    returning.current = true;
    setAsking(null);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="w-36">
        <Select
          ref={select}
          aria-label={`Role for ${user.display_name}`}
          value={shown}
          disabled={!user.active}
          onChange={(e) => {
            if (busy || asking) return;
            const role = e.target.value as Role;
            if (self && user.role === "admin" && role !== "admin") setAsking(role);
            else onPick(role);
          }}
        >
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_NAMES[r]}</option>)}
        </Select>
      </div>
      {asking && (
        <div role="group" aria-label="You'll lose Settings. Change your role?" className="flex flex-wrap items-center gap-2"
             onKeyDown={(e: KeyboardEvent) => { if (e.key === "Escape") close(); }}>
          <span className="text-body-sm text-space-lightGray">You'll lose Settings. Change your role?</span>
          <Button variant="destructive" size="sm" autoFocus onClick={() => { const role = asking; close(); onPick(role); }}>
            Yes, change my role
          </Button>
          <Button variant="ghost" size="sm" onClick={close}>Keep admin</Button>
        </div>
      )}
    </div>
  );
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
      <Button ref={back} data-active-for={user.id} variant="ghost" size="sm" onClick={() => onChange(true)}>
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
    <Button ref={back} data-active-for={user.id} variant="ghost" size="sm" onClick={() => setAsking(true)}>
      Deactivate<span className="sr-only"> {user.display_name}</span>
    </Button>
  );
}

export function Users() {
  const { me, refreshMe } = useAuth();
  const [users, setUsers] = useState<User[] | null>(null);
  const [loadTrouble, setLoadTrouble] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [passwordFor, setPasswordFor] = useState<User | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // the row whose change is saving, and the role it shows meanwhile
  const [pending, setPending] = useState<{ id: string; role: Role } | null>(null);
  const [adding, setAdding] = useState(false);
  // the same two, read at once: a second click lands before React renders again
  const changing = useRef(false);
  const addingNow = useRef(false);
  const haveUsers = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  // the Set password button that opened the form, given focus back when it closes
  const opener = useRef<HTMLButtonElement | null>(null);
  // the row whose Deactivate or Reactivate takes focus once the list is back
  const refocus = useRef<string | null>(null);
  useFocusFirstInvalid(formRef, fields);

  useEffect(() => {
    if (!passwordFor && opener.current) {
      opener.current.focus();
      opener.current = null;
    }
  }, [passwordFor]);

  useEffect(() => {
    if (!refocus.current) return;
    tableRef.current?.querySelector<HTMLElement>(`[data-active-for="${refocus.current}"]`)?.focus();
    refocus.current = null;
  }, [users]);

  const load = useCallback(async () => {
    try {
      setUsers((await api.get<{ items: User[] }>("/v1/users")).items);
      haveUsers.current = true;
      setLoadTrouble(null);
    } catch (e) {
      // the first time, in place of the list; after that, above it
      if (haveUsers.current) setProblem(messageOf(e));
      else setLoadTrouble(messageOf(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function retry() {
    setLoadTrouble(null);
    void load();
  }

  function say(message: string | null, trouble: string | null = null) {
    setDone(message);
    setProblem(trouble);
  }

  async function change(user: User, patch: { role?: Role; active?: boolean }, said: string) {
    if (changing.current) return;
    changing.current = true;
    setPending({ id: user.id, role: patch.role ?? user.role });
    say(null);
    const self = user.id === me?.id;
    let changed = false;
    try {
      await api.patch(`/v1/users/${user.id}`, patch);
      changed = true;
      say(said);
    } catch (e) {
      say(null, messageOf(e));
    }
    try {
      // your own role: who you are is asked again, and without Settings
      // RequireScope takes you home; the list isn't needed
      if (changed && self) await refreshMe();
      else {
        if (patch.active !== undefined) refocus.current = user.id;
        await load();
      }
    } catch (e) {
      say(null, messageOf(e));
      await load();
    } finally {
      changing.current = false;
      setPending(null);
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    if (addingNow.current) return;
    addingNow.current = true;
    setAdding(true);
    setFields({});
    say(null);
    try {
      await api.post("/v1/users", form);
      say(`${form.display_name.trim()} can sign in now.`);
      setForm(EMPTY);
      await load();
    } catch (err) {
      const wrong = fieldErrorsOf(err, FIELDS);
      if (Object.keys(wrong).length > 0) setFields(wrong);
      else say(null, messageOf(err));
    } finally {
      addingNow.current = false;
      setAdding(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <LiveNotices said={done} problem={problem} />

      <Card>
        <CardHeader>
          <CardTitle>People who sign in</CardTitle>
          <CardDescription>
            Deactivate someone who leaves: they can't sign in, and their name stays on what they wrote.
          </CardDescription>
        </CardHeader>
        <CardContent className="relative overflow-x-auto">
          {users === null ? (
            loadTrouble ? (
              <div className="flex flex-col items-start gap-4">
                <Notice>Couldn't load the people who sign in. {loadTrouble}</Notice>
                <Button variant="outline" onClick={retry}>Try again</Button>
              </div>
            ) : (
              <p role="status" className="text-body-sm text-space-gray">Loading…</p>
            )
          ) : (
            <table ref={tableRef} className="w-full text-left text-body-sm">
              <caption className="sr-only">People who sign in</caption>
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
                {users.map((u) => {
                  const self = u.id === me?.id;
                  const saving = pending?.id === u.id;
                  return (
                    <tr key={u.id} aria-busy={saving || undefined} className="border-t border-space-blue/10">
                      <th scope="row" className="py-3 pr-4 font-medium text-space-lightGray">{u.display_name}</th>
                      <td className="py-3 pr-4 text-space-gray">{u.username}</td>
                      <td className="py-3 pr-4">
                        <RoleControl
                          user={u}
                          self={self}
                          shown={pending && saving ? pending.role : u.role}
                          busy={pending !== null}
                          onPick={(role) => void change(u, { role }, `${u.display_name} is ${asA(role)} now.`)}
                        />
                      </td>
                      <td className="py-3 pr-4"><State user={u} /></td>
                      <td className="py-3 pr-4 text-space-gray">{when(u.last_sign_in_at)}</td>
                      <td className="py-3">
                        <div className="flex items-center justify-end gap-2">
                          {self ? (
                            <Link to="/account" className="rounded-sm text-body-sm text-space-blue underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                              <span className="sr-only">Your password: </span>Change it on your account page
                            </Link>
                          ) : (
                            <>
                              <Button variant="ghost" size="sm"
                                      onClick={(e) => { opener.current = e.currentTarget; setPasswordFor(u); }}>
                                <KeyRound aria-hidden="true" />
                                Set password<span className="sr-only"> for {u.display_name}</span>
                              </Button>
                              <ActiveControl
                                user={u}
                                onChange={(active) => void change(u, { active }, active
                                  ? `${u.display_name} can sign in again.`
                                  : `${u.display_name} is deactivated and signed out.`)}
                              />
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
          onStart={() => say(null)}
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
              <Button type="submit" disabled={adding}><UserPlus aria-hidden="true" />{adding ? "Adding…" : "Add"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function SetPassword({ user, onStart, onDone, onCancel }: {
  user: User;
  onStart: () => void;
  onDone: (said: string) => void;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const title = `New password for ${user.display_name}`;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError(undefined);
    setProblem(null);
    onStart();
    try {
      await api.post(`/v1/users/${user.id}/password`, { password });
      onDone(`${user.display_name}'s password is set. They're signed out everywhere until they use it.`);
    } catch (err) {
      // what is wrong with the password goes beside it; anything else above
      const wrong = fieldErrorsOf(err, ["password"]).password;
      if (wrong) setError(wrong);
      else setProblem(messageOf(err));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>It also clears a lock after too many wrong passwords.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} noValidate aria-label={title} className="flex flex-col gap-4"
              onKeyDown={(e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); }}>
          {problem && <Notice>{problem}</Notice>}
          <div className="flex flex-wrap items-start gap-3">
            <TextField label="New password" type="password" autoComplete="new-password" hint="At least 12 characters." autoFocus
                       value={password} onChange={(e) => setPassword(e.target.value)} error={error} className="min-w-64 flex-1" />
            <div className="flex gap-2 pt-7">
              <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save password"}</Button>
              <Button variant="ghost" onClick={onCancel}>Cancel</Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
