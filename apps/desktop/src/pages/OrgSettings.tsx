import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Upload } from "lucide-react";
import { api, fieldErrorsOf, messageOf } from "../api/client";
import type { Org } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/Card";
import { TextAreaField, TextField, useFocusFirstInvalid } from "../ui/Field";
import { LiveNotices, Notice } from "../ui/Notice";
import { OrgMark } from "../ui/OrgMark";

interface OrgForm {
  name: string;
  abn: string;
  phone: string;
  email: string;
  address: string;
}

const FIELDS = ["name", "abn", "phone", "email", "address"] as const;
const MAX_LOGO = 512 * 1024;
const KINDS = ["image/png", "image/jpeg"];

function toForm(o: Org): OrgForm {
  return { name: o.name ?? "", abn: o.abn ?? "", phone: o.phone ?? "", email: o.email ?? "", address: o.address ?? "" };
}

// the outline Button's look, on the label that opens the file picker; the
// ring shows when the hidden input has keyboard focus, as a button's would
const PICK =
  "inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-space-blue/30 px-4 text-label " +
  "text-space-lightGray hover:border-space-blue/50 hover:bg-space-blue/10 " +
  "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring " +
  "has-[[aria-disabled=true]]:cursor-not-allowed has-[[aria-disabled=true]]:opacity-50 [&_svg]:size-4";

type LogoWork = "uploading" | "removing" | null;

export function OrgSettings() {
  const { branding, reloadBranding } = useAuth();
  const [form, setForm] = useState<OrgForm | null>(null);
  const [loadTrouble, setLoadTrouble] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [logoWork, setLogoWork] = useState<LogoWork>(null);
  // read at once: a second pick can land before React renders again
  const logoBusy = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  useFocusFirstInvalid(formRef, fields);

  useEffect(() => {
    let live = true;
    api.get<Org>("/v1/settings/org").then(
      (o) => { if (live) setForm(toForm(o)); },
      (e) => { if (live) setLoadTrouble(messageOf(e)); },
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  function retry() {
    setLoadTrouble(null);
    setAttempt((n) => n + 1);
  }

  function say(message: string | null, trouble: string | null = null) {
    setDone(message);
    setProblem(trouble);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form || busy) return;
    setBusy(true);
    setFields({});
    say(null);
    try {
      setForm(toForm(await api.put<Org>("/v1/settings/org", form)));
      await reloadBranding();
      say("Saved. Documents use these details from now on.");
    } catch (err) {
      const wrong = fieldErrorsOf(err, FIELDS);
      if (Object.keys(wrong).length > 0) setFields(wrong);
      else say(null, messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  /** One change to the logo at a time; the picker and Remove stay focusable. */
  async function logo(work: Exclude<LogoWork, null>, run: () => Promise<string>) {
    logoBusy.current = true;
    setLogoWork(work);
    say(null);
    try {
      const said = await run();
      await reloadBranding();
      say(said);
    } catch (err) {
      say(null, messageOf(err));
    } finally {
      logoBusy.current = false;
      setLogoWork(null);
    }
  }

  function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || logoBusy.current) return;
    say(null);
    // the API checks both too; this saves sending a file it would refuse
    if (!KINDS.includes(file.type)) return say(null, "Use a PNG or JPEG for the logo.");
    if (file.size > MAX_LOGO) return say(null, "The logo can be 512 KB at most.");
    void logo("uploading", async () => {
      await api.put("/v1/settings/org/logo", file);
      return "Logo updated.";
    });
  }

  function removeLogo() {
    if (logoBusy.current) return;
    void logo("removing", async () => {
      await api.delete("/v1/settings/org/logo");
      // the Remove button is going; the way to add one again takes focus
      picker.current?.focus();
      return "Logo removed. Simple Docs shows its own mark instead.";
    });
  }

  const edit = (key: keyof OrgForm) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    form && setForm({ ...form, [key]: e.target.value });

  return (
    <div className="flex flex-col gap-8">
      <LiveNotices said={done} problem={problem} />

      <Card>
        <CardHeader>
          <CardTitle>Logo</CardTitle>
          <CardDescription>
            Shown beside Simple Docs here and on the sign-in page, and on your documents' covers from step 5. PNG or
            JPEG, 512 KB at most.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          <OrgMark logoId={branding?.logo_id ?? null} size={64} />
          <label className={PICK}>
            <Upload aria-hidden="true" />
            {logoWork === "uploading" ? "Uploading…" : branding?.logo_id ? "Replace logo" : "Upload logo"}
            <input ref={picker} type="file" accept="image/png,image/jpeg" className="sr-only"
                   aria-disabled={logoWork ? true : undefined}
                   onClick={(e) => { if (logoBusy.current) e.preventDefault(); }}
                   onChange={upload} />
          </label>
          {branding?.logo_id && (
            <Button variant="ghost" aria-disabled={logoWork ? true : undefined}
                    className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50" onClick={removeLogo}>
              {logoWork === "removing" ? "Removing…" : "Remove logo"}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>What your documents say about you: covers, footers and any {"{{org.*}}"} in a template.</CardDescription>
        </CardHeader>
        <CardContent>
          {form === null ? (
            loadTrouble ? (
              <div className="flex flex-col items-start gap-4">
                <Notice>Couldn't load your organisation's details. {loadTrouble}</Notice>
                <Button variant="outline" onClick={retry}>Try again</Button>
              </div>
            ) : (
              <p role="status" className="text-body-sm text-space-gray">Loading…</p>
            )
          ) : (
            <form ref={formRef} onSubmit={save} noValidate aria-label="Organisation details" className="grid max-w-panel gap-4 md:grid-cols-2">
              <TextField label="Name" className="md:col-span-2" autoComplete="organization" value={form.name}
                         onChange={edit("name")} error={fields.name} required />
              <TextField label="ABN" inputMode="numeric" hint="11 digits, e.g. 51 824 753 556." value={form.abn}
                         onChange={edit("abn")} error={fields.abn} />
              <TextField label="Phone" type="tel" autoComplete="tel" value={form.phone} onChange={edit("phone")}
                         error={fields.phone} />
              <TextField label="Email" type="email" autoComplete="email" className="md:col-span-2" value={form.email}
                         onChange={edit("email")} error={fields.email} />
              <TextAreaField label="Address" rows={3} autoComplete="street-address" className="md:col-span-2"
                             value={form.address} onChange={edit("address")} error={fields.address} />
              <div className="md:col-span-2">
                <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save details"}</Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
