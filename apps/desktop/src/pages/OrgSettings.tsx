import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Upload } from "lucide-react";
import { api, ApiError, messageOf } from "../api/client";
import type { Org } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/Card";
import { TextAreaField, TextField } from "../ui/Field";
import { Notice } from "../ui/Notice";
import { OrgMark } from "../ui/OrgMark";

interface OrgForm {
  name: string;
  abn: string;
  phone: string;
  email: string;
  address: string;
}

const MAX_LOGO = 512 * 1024;
const KINDS = ["image/png", "image/jpeg"];

function toForm(o: Org): OrgForm {
  return { name: o.name ?? "", abn: o.abn ?? "", phone: o.phone ?? "", email: o.email ?? "", address: o.address ?? "" };
}

// the outline Button's look, on the label that opens the file picker
const PICK =
  "inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-space-blue/30 px-4 text-label " +
  "text-space-lightGray hover:border-space-blue/50 hover:bg-space-blue/10 " +
  "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring [&_svg]:size-4";

export function OrgSettings() {
  const { branding, reloadBranding } = useAuth();
  const [form, setForm] = useState<OrgForm | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  // what is wrong is read out with the first field it is wrong in
  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [fields]);

  useEffect(() => {
    let live = true;
    api.get<Org>("/v1/settings/org").then(
      (o) => { if (live) setForm(toForm(o)); },
      (e) => { if (live) setProblem(messageOf(e)); },
    );
    return () => {
      live = false;
    };
  }, []);

  function say(message: string | null, trouble: string | null = null) {
    setDone(message);
    setProblem(trouble);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setFields({});
    say(null);
    try {
      setForm(toForm(await api.put<Org>("/v1/settings/org", form)));
      await reloadBranding();
      say("Saved. Documents use these details from now on.");
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length > 0) setFields(err.fields);
      else say(null, messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    say(null);
    // the API checks both too; this saves sending a file it would refuse
    if (!KINDS.includes(file.type)) return say(null, "Use a PNG or JPEG for the logo.");
    if (file.size > MAX_LOGO) return say(null, "The logo can be 512 KB at most.");
    try {
      await api.put("/v1/settings/org/logo", file);
      await reloadBranding();
      say("Logo updated.");
    } catch (err) {
      say(null, messageOf(err));
    }
  }

  async function removeLogo() {
    say(null);
    try {
      await api.delete("/v1/settings/org/logo");
      await reloadBranding();
      say("Logo removed. Simple Docs shows its own mark instead.");
      // the Remove button is gone; the way to add one again takes focus
      picker.current?.focus();
    } catch (err) {
      say(null, messageOf(err));
    }
  }

  const edit = (key: keyof OrgForm) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    form && setForm({ ...form, [key]: e.target.value });

  return (
    <div className="flex flex-col gap-8">
      {problem && <Notice>{problem}</Notice>}
      {done && <Notice tone="success">{done}</Notice>}

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
            {branding?.logo_id ? "Replace logo" : "Upload logo"}
            <input ref={picker} type="file" accept="image/png,image/jpeg" className="sr-only" onChange={(e) => void upload(e)} />
          </label>
          {branding?.logo_id && <Button variant="ghost" onClick={() => void removeLogo()}>Remove logo</Button>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>What your documents say about you: covers, footers and any {"{{org.*}}"} in a template.</CardDescription>
        </CardHeader>
        <CardContent>
          {form === null ? (
            <p className="text-body-sm text-space-gray">Loading…</p>
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
