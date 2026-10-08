"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Bell, Inbox, Loader2, Paintbrush, Plug, Save, Settings2, Sparkles, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GoogleSheetsPanel, type GoogleSheetsPanelProps } from "@/components/google-sheets/google-sheets-panel";
import type { GlobalFormDefaults } from "@/schemas/settings";
import { readableTextColor } from "@/lib/utils";
import type { FormNotificationSettings, FormPublicSettings, FormSheetSettings, FormSubmissionSettings } from "@/types/forms";
import { savePrivateSettingsAction, savePublicSettingsAction } from "../../actions";
import { uploadLogoAction } from "../../../settings/actions";

interface PrivateSettings {
  submission: FormSubmissionSettings;
  notifications: FormNotificationSettings;
  google_sheets: FormSheetSettings;
}

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Toggle({ id, label, hint, checked, onChange }: { id: string; label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
      <div>
        <Label htmlFor={id}>{label}</Label>
        {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function ColorInput({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label} htmlFor={id}>
      <div className="flex gap-2">
        <input type="color" aria-label={`${label} picker`} value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-12 cursor-pointer rounded-md border bg-card p-1" />
        <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} className="font-mono" maxLength={7} />
      </div>
    </Field>
  );
}

function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function FormSettingsTabs({
  initialTab,
  googleNotice,
  form,
  globalAppearance,
  privateSettings,
  google,
}: {
  initialTab: string;
  googleNotice: string | null;
  form: { id: string; name: string; slug: string; description: string | null; settings: FormPublicSettings };
  globalAppearance: GlobalFormDefaults;
  privateSettings: PrivateSettings;
  google: Omit<GoogleSheetsPanelProps, "formId" | "formName" | "notice">;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTab] = useState(initialTab);
  const [pending, start] = useTransition();
  const [pub, setPub] = useState<Required<FormPublicSettings>>({
    appearance: { primaryColor: "#0f766e", backgroundColor: "#f0fdfa", buttonColor: "#0f766e", headerColor: "#1e2749", font: "inter", logoUrl: "", ...form.settings.appearance },
    behavior: { showProgressBar: true, submitButtonText: "Submit", successTitle: "Thank You!", successMessage: "Your feedback has been submitted successfully.", showSubmissionNumber: true, redirectUrl: "", successButtonText: "", successButtonUrl: "", ...form.settings.behavior },
    seo: { title: "", description: "", ...form.settings.seo },
  });
  const [priv, setPriv] = useState<PrivateSettings>(privateSettings);
  const [recipientDraft, setRecipientDraft] = useState("");
  const [uploading, setUploading] = useState(false);

  const useGlobal = Boolean(pub.appearance.useGlobal);
  const preview = useGlobal
    ? {
        ...globalAppearance,
        title: globalAppearance.title || form.name,
        description: globalAppearance.description || form.description,
      }
    : { ...pub.appearance, title: form.name, description: form.description };
  const setA = (p: Partial<typeof pub.appearance>) => setPub((s) => ({ ...s, appearance: { ...s.appearance, ...p } }));
  const setB = (p: Partial<typeof pub.behavior>) => setPub((s) => ({ ...s, behavior: { ...s.behavior, ...p } }));
  const setSeo = (p: Partial<typeof pub.seo>) => setPub((s) => ({ ...s, seo: { ...s.seo, ...p } }));
  const setSub = (p: Partial<FormSubmissionSettings>) => setPriv((s) => ({ ...s, submission: { ...s.submission, ...p } }));
  const setNot = (p: Partial<FormNotificationSettings>) => setPriv((s) => ({ ...s, notifications: { ...s.notifications, ...p } }));

  const savePublic = () =>
    start(async () => {
      const res = await savePublicSettingsAction(form.id, pub);
      if (res.ok) {
        toast.success(res.message);
        router.refresh();
      } else toast.error(res.error);
    });

  const savePrivate = () =>
    start(async () => {
      const res = await savePrivateSettingsAction(form.id, {
        submission: {
          allowSubmissions: priv.submission.allowSubmissions ?? true,
          duplicateProtection: priv.submission.duplicateProtection ?? true,
          maxSubmissions: priv.submission.maxSubmissions || null,
          closeAt: priv.submission.closeAt || null,
          closedMessage: priv.submission.closedMessage ?? "",
        },
        notifications: {
          enabled: priv.notifications.enabled ?? true,
          recipients: priv.notifications.recipients ?? [],
          subject: priv.notifications.subject ?? "",
          includeAnswers: priv.notifications.includeAnswers ?? false,
        },
        google_sheets: {
          includeFormName: priv.google_sheets.includeFormName ?? true,
          includeBranch: priv.google_sheets.includeBranch ?? true,
          includeUserAgent: priv.google_sheets.includeUserAgent ?? false,
          includeIpHash: priv.google_sheets.includeIpHash ?? false,
        },
      });
      if (res.ok) {
        toast.success(res.message);
        router.refresh();
      } else toast.error(res.error);
    });

  const addRecipient = () => {
    const email = recipientDraft.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast.error("Enter a valid email address");
    const list = priv.notifications.recipients ?? [];
    if (!list.includes(email)) setNot({ recipients: [...list, email] });
    setRecipientDraft("");
  };

  const saveBar = (onSave: () => void) => (
    <div className="flex justify-end border-t pt-4">
      <Button onClick={onSave} disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Save />} Save changes
      </Button>
    </div>
  );

  return (
    <Tabs
      value={tab}
      onValueChange={(t) => {
        setTab(t);
        window.history.replaceState(null, "", `${pathname}?tab=${t}`);
      }}
    >
      <TabsList>
        <TabsTrigger value="general"><Settings2 />General</TabsTrigger>
        <TabsTrigger value="submission"><Inbox />Submission</TabsTrigger>
        <TabsTrigger value="notifications"><Bell />Notifications</TabsTrigger>
        <TabsTrigger value="integrations"><Plug />Integrations</TabsTrigger>
        <TabsTrigger value="appearance"><Paintbrush />Appearance</TabsTrigger>
        <TabsTrigger value="behavior"><Sparkles />Behavior</TabsTrigger>
      </TabsList>

      <TabsContent value="general">
        <Card>
          <CardHeader>
            <CardTitle>General</CardTitle>
            <CardDescription>Name, description, branch and slug are edited on the Overview tab. Configure logo and search/social metadata here.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Field label="Form logo" hint="PNG, JPG or WebP up to 2 MB. Falls back to the organisation logo.">
              <div className="flex flex-wrap items-center gap-3">
                {pub.appearance.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- uploaded logo preview
                  <img src={pub.appearance.logoUrl} alt="Form logo" className="h-12 w-auto rounded border bg-white p-1" />
                ) : null}
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm font-medium hover:bg-muted">
                  {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                  Upload logo
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setUploading(true);
                      const fd = new FormData();
                      fd.set("file", file);
                      const res = await uploadLogoAction(fd);
                      setUploading(false);
                      if (res.ok) {
                        setA({ logoUrl: res.data.url });
                        toast.success("Logo uploaded — remember to save");
                      } else toast.error(res.error);
                    }}
                  />
                </label>
                {pub.appearance.logoUrl && (
                  <Button variant="ghost" size="sm" onClick={() => setA({ logoUrl: "" })}>
                    <X /> Remove
                  </Button>
                )}
              </div>
            </Field>
            <Field label="SEO title" htmlFor="seo-title" hint="Shown in the browser tab and when the link is shared.">
              <Input id="seo-title" value={pub.seo.title ?? ""} placeholder={`${form.name} — Synergy Wellness`} onChange={(e) => setSeo({ title: e.target.value })} maxLength={120} />
            </Field>
            <Field label="SEO description" htmlFor="seo-desc">
              <Textarea id="seo-desc" rows={2} value={pub.seo.description ?? ""} onChange={(e) => setSeo({ description: e.target.value })} maxLength={300} />
            </Field>
            {saveBar(savePublic)}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="submission">
        <Card>
          <CardHeader>
            <CardTitle>Submission</CardTitle>
            <CardDescription>Control when and how often this form accepts responses.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Toggle id="allow" label="Allow submissions" hint="Turn off to temporarily close the form without unpublishing it." checked={priv.submission.allowSubmissions !== false} onChange={(v) => setSub({ allowSubmissions: v })} />
            <Toggle
              id="dupe"
              label="Duplicate submission protection"
              hint="Ignore identical responses from the same device within 10 minutes. Double-click protection is always on."
              checked={priv.submission.duplicateProtection !== false}
              onChange={(v) => setSub({ duplicateProtection: v })}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Submission limit" htmlFor="limit" hint="Leave empty for unlimited.">
                <Input id="limit" type="number" min={1} value={priv.submission.maxSubmissions ?? ""} onChange={(e) => setSub({ maxSubmissions: e.target.value ? Number(e.target.value) : null })} />
              </Field>
              <Field label="Close form at" htmlFor="close" hint="Optional date and time.">
                <Input id="close" type="datetime-local" value={toLocalInput(priv.submission.closeAt)} onChange={(e) => setSub({ closeAt: e.target.value ? new Date(e.target.value).toISOString() : null })} />
              </Field>
            </div>
            <Field label="Closed message" htmlFor="closedmsg">
              <Textarea id="closedmsg" rows={2} value={priv.submission.closedMessage ?? ""} placeholder="This form is no longer accepting responses." onChange={(e) => setSub({ closedMessage: e.target.value })} />
            </Field>
            {saveBar(savePrivate)}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="notifications">
        <Card>
          <CardHeader>
            <CardTitle>Email notifications</CardTitle>
            <CardDescription>Notify administrators when someone submits this form.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Toggle id="notify" label="Email notifications" checked={priv.notifications.enabled !== false} onChange={(v) => setNot({ enabled: v })} />
            <Field label="Recipients" hint="If empty, the default recipients from organisation settings are used.">
              <div className="flex gap-2">
                <Input
                  value={recipientDraft}
                  type="email"
                  placeholder="admin@synergywellness.com"
                  aria-label="Add recipient email"
                  onChange={(e) => setRecipientDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addRecipient();
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={addRecipient}>Add</Button>
              </div>
              <ul className="flex flex-wrap gap-2">
                {(priv.notifications.recipients ?? []).map((r) => (
                  <li key={r} className="inline-flex items-center gap-1 rounded-full bg-muted py-1 pr-1 pl-3 text-sm">
                    {r}
                    <button type="button" onClick={() => setNot({ recipients: (priv.notifications.recipients ?? []).filter((x) => x !== r) })} className="rounded-full p-0.5 hover:bg-slate-200" aria-label={`Remove ${r}`}>
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </Field>
            <Field label="Subject" htmlFor="subject" hint="Placeholders: {form}, {branch}, {number}">
              <Input id="subject" value={priv.notifications.subject ?? ""} placeholder="New {form} Submission – {branch}" onChange={(e) => setNot({ subject: e.target.value })} />
            </Field>
            <Toggle
              id="answers"
              label="Include answers in email"
              hint="Off by default: patient health information should stay in Synergy Feedback. Only enable if your email setup is approved for patient data."
              checked={!!priv.notifications.includeAnswers}
              onChange={(v) => setNot({ includeAnswers: v })}
            />
            {saveBar(savePrivate)}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="integrations" className="space-y-6">
        <GoogleSheetsPanel formId={form.id} formName={form.name} notice={googleNotice} {...google} />
        <Card>
          <CardHeader>
            <CardTitle>Google Sheet metadata columns</CardTitle>
            <CardDescription>Submission ID and Submitted At are always included. Optional columns are added to the end of the sheet.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Toggle id="gs-form" label="Form Name" checked={priv.google_sheets.includeFormName !== false} onChange={(v) => setPriv((s) => ({ ...s, google_sheets: { ...s.google_sheets, includeFormName: v } }))} />
            <Toggle id="gs-branch" label="Branch" checked={priv.google_sheets.includeBranch !== false} onChange={(v) => setPriv((s) => ({ ...s, google_sheets: { ...s.google_sheets, includeBranch: v } }))} />
            <Toggle id="gs-ua" label="User Agent" hint="Browser/device string. Only enable if needed." checked={!!priv.google_sheets.includeUserAgent} onChange={(v) => setPriv((s) => ({ ...s, google_sheets: { ...s.google_sheets, includeUserAgent: v } }))} />
            <Toggle id="gs-ip" label="IP Hash" hint="One-way salted hash — the raw IP address is never stored." checked={!!priv.google_sheets.includeIpHash} onChange={(v) => setPriv((s) => ({ ...s, google_sheets: { ...s.google_sheets, includeIpHash: v } }))} />
            {saveBar(savePrivate)}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="appearance">
        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Brand the public form.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Toggle
              id="use-global"
              label="Apply global settings"
              hint="Use the colours, font, title and description from Admin → Settings → Global form appearance. Turn off to customise this form separately."
              checked={useGlobal}
              onChange={(v) => setA({ useGlobal: v })}
            />
            {useGlobal ? (
              <div className="rounded-lg border bg-muted/40 p-4 text-sm">
                <p className="font-medium">Using global appearance</p>
                <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  {([
                    ["Header", globalAppearance.headerColor],
                    ["Primary", globalAppearance.primaryColor],
                    ["Background", globalAppearance.backgroundColor],
                    ["Button", globalAppearance.buttonColor],
                  ] as const).map(([label, color]) => (
                    <div key={label} className="flex items-center gap-2">
                      <span className="size-4 rounded border" style={{ background: color }} aria-hidden />
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="font-mono text-xs">{color}</dd>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground">Font</dt>
                    <dd className="capitalize">{globalAppearance.font}</dd>
                  </div>
                </dl>
                <p className="mt-3 text-muted-foreground">
                  Title: <span className="text-foreground">{globalAppearance.title || `${form.name} (this form's own name)`}</span>
                  <br />
                  Description: <span className="text-foreground">{globalAppearance.description || "this form's own description"}</span>
                </p>
                <Link href="/admin/settings" className="mt-3 inline-block font-medium text-primary hover:underline">
                  Edit global appearance →
                </Link>
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <ColorInput id="c-header" label="Header color" value={pub.appearance.headerColor ?? "#1e2749"} onChange={(v) => setA({ headerColor: v })} />
                  <ColorInput id="c-primary" label="Primary color" value={pub.appearance.primaryColor ?? "#0f766e"} onChange={(v) => setA({ primaryColor: v })} />
                  <ColorInput id="c-bg" label="Background" value={pub.appearance.backgroundColor ?? "#f0fdfa"} onChange={(v) => setA({ backgroundColor: v })} />
                  <ColorInput id="c-btn" label="Button color" value={pub.appearance.buttonColor ?? "#0f766e"} onChange={(v) => setA({ buttonColor: v })} />
                </div>
                <Field label="Font" htmlFor="font">
                  <NativeSelect id="font" value={pub.appearance.font ?? "inter"} onChange={(e) => setA({ font: e.target.value as "inter" })}>
                    <option value="inter">Inter (modern)</option>
                    <option value="rounded">Nunito (friendly)</option>
                    <option value="serif">Lora (classic)</option>
                    <option value="system">System default</option>
                  </NativeSelect>
                </Field>
                <p className="text-sm text-muted-foreground">This form shows its own name and description (edit them on the Overview tab).</p>
              </>
            )}
            <div className="rounded-xl border p-6" style={{ background: preview.backgroundColor }}>
              <div className="mx-auto max-w-sm overflow-hidden rounded-lg bg-white shadow-sm">
                <div className="p-5 text-center font-heading" style={{ background: preview.headerColor ?? "#1e2749", color: readableTextColor(preview.headerColor ?? "#1e2749") }}>
                  <p className="text-lg font-bold">{preview.title}</p>
                  {preview.description && <p className="mt-1 text-sm opacity-90">{preview.description}</p>}
                </div>
                <div className="p-5">
                  <div className="h-9 rounded-md border" />
                  <div className="mt-4 inline-block rounded-md px-4 py-2 text-sm font-semibold" style={{ background: preview.buttonColor, color: readableTextColor(preview.buttonColor ?? "#0f766e") }}>
                    {pub.behavior.submitButtonText || "Submit"}
                  </div>
                </div>
              </div>
            </div>
            {saveBar(savePublic)}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="behavior">
        <Card>
          <CardHeader>
            <CardTitle>Behavior</CardTitle>
            <CardDescription>Buttons, progress and what happens after submitting.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Toggle id="progress" label="Progress bar" hint="Shown when the form has multiple sections." checked={pub.behavior.showProgressBar !== false} onChange={(v) => setB({ showProgressBar: v })} />
            <Field label="Submit button text" htmlFor="btn">
              <Input id="btn" value={pub.behavior.submitButtonText ?? ""} onChange={(e) => setB({ submitButtonText: e.target.value })} maxLength={60} />
            </Field>
            <Field label="Success title" htmlFor="stitle">
              <Input id="stitle" value={pub.behavior.successTitle ?? ""} onChange={(e) => setB({ successTitle: e.target.value })} />
            </Field>
            <Field label="Success message" htmlFor="smsg">
              <Textarea id="smsg" rows={3} value={pub.behavior.successMessage ?? ""} onChange={(e) => setB({ successMessage: e.target.value })} />
            </Field>
            <Toggle id="snum" label="Show submission ID" hint="Display the reference number (e.g. SW-20261006-000123) on the success screen." checked={pub.behavior.showSubmissionNumber !== false} onChange={(v) => setB({ showSubmissionNumber: v })} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Success button text" htmlFor="sbt">
                <Input id="sbt" value={pub.behavior.successButtonText ?? ""} placeholder="Visit our website" onChange={(e) => setB({ successButtonText: e.target.value })} />
              </Field>
              <Field label="Success button URL" htmlFor="sbu">
                <Input id="sbu" value={pub.behavior.successButtonUrl ?? ""} placeholder="https://" onChange={(e) => setB({ successButtonUrl: e.target.value })} />
              </Field>
            </div>
            <Field label="Redirect URL" htmlFor="redir" hint="If set, respondents are redirected here instead of seeing the success screen.">
              <Input id="redir" value={pub.behavior.redirectUrl ?? ""} placeholder="https://" onChange={(e) => setB({ redirectUrl: e.target.value })} />
            </Field>
            {saveBar(savePublic)}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
