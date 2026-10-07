import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DynamicFormRenderer } from "@/components/public-form/dynamic-form-renderer";
import { getPublishedForm, toClientForm } from "@/services/forms/public";
import { getAppSettings } from "@/services/settings";
import { resolveFormPresentation } from "@/lib/forms/appearance";
import { createAdminClient } from "@/lib/supabase/admin";
import { env, isCaptchaConfigured } from "@/lib/env";
import type { FormSubmissionSettings } from "@/types/forms";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/forms/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const form = await getPublishedForm(slug);
  if (!form) return { title: "Form not found", robots: { index: false } };
  const settings = await getAppSettings();
  const title = form.settings.seo?.title || `${form.name} — ${settings.organization.name}`;
  const description = form.settings.seo?.description || form.description || `Share your feedback with ${settings.organization.name}.`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `/forms/${form.slug}` },
    openGraph: { title, description, type: "website", url: `/forms/${form.slug}`, siteName: settings.organization.name },
    twitter: { card: "summary", title, description },
  };
}

function closedMessageFor(sub: FormSubmissionSettings): string | null {
  const pastClose = sub.closeAt ? new Date(sub.closeAt).getTime() <= Date.now() : false;
  if (sub.allowSubmissions !== false && !pastClose) return null;
  return sub.closedMessage || "This form is no longer accepting responses. Thank you for your interest.";
}

export default async function PublicFormPage(props: PageProps<"/forms/[slug]">) {
  const { slug } = await props.params;
  const sp = await props.searchParams;
  const form = await getPublishedForm(slug);
  if (!form) notFound();

  const [settings, { data: priv }] = await Promise.all([
    getAppSettings(),
    createAdminClient().from("form_settings").select("submission").eq("form_id", form.id).maybeSingle<{ submission: FormSubmissionSettings }>(),
  ]);
  const closed = closedMessageFor(priv?.submission ?? {});

  const prefill: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string") prefill[k] = v.slice(0, 200);

  const captcha = settings.security.captchaEnabled && isCaptchaConfigured() ? env.turnstileSiteKey() : null;

  const look = resolveFormPresentation(form, settings.branding.formDefaults);
  const clientForm = toClientForm(form);

  return (
    <DynamicFormRenderer
      form={{
        ...clientForm,
        name: look.title,
        description: look.description,
        settings: { ...clientForm.settings, appearance: look.appearance },
      }}
      prefill={prefill}
      captchaSiteKey={captcha}
      closedMessage={closed}
      orgName={settings.organization.name}
      logoUrl={(look.appearance.useGlobal ? "" : form.settings.appearance?.logoUrl) || settings.branding.logoUrl || settings.organization.logoUrl || null}
    />
  );
}
