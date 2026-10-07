import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, QrCode, Sheet, ShieldCheck } from "lucide-react";
import { SiteShell } from "@/components/legal/site-shell";
import { getLegalContext } from "@/lib/legal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Synergy Feedback — Synergy Wellness" },
  description: "Synergy Feedback is the patient feedback and forms platform of Synergy Wellness, a physiotherapy and wellness provider.",
  alternates: { canonical: "/" },
};

const FEATURES = [
  { icon: ClipboardList, title: "Feedback forms", text: "Clinic staff build forms for patient feedback, treatment satisfaction and visit details." },
  { icon: QrCode, title: "Links & QR codes", text: "Patients open a form from a link or a QR code at reception — no account needed." },
  { icon: Sheet, title: "Google Sheets", text: "Each form can copy new responses to a Google Sheet owned by the clinic's own Google account." },
  { icon: ShieldCheck, title: "Private by design", text: "Responses are visible only to authorised staff. Google access tokens are encrypted and stay on our servers." },
];

/** Public home page: describes the app (also used as the Google OAuth app home page). */
export default async function Home() {
  const { orgName } = await getLegalContext();
  return (
    <SiteShell orgName={orgName}>
      <section className="bg-gradient-to-b from-teal-50 to-white">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 sm:py-24">
          <h1 className="text-4xl font-semibold tracking-tight text-balance text-slate-900 sm:text-5xl">Synergy Feedback</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-balance text-slate-600">
            The patient feedback and forms platform of {orgName}, a physiotherapy and wellness provider. It helps our clinics
            listen to patients and improve care.
          </p>
          <p className="mx-auto mt-6 max-w-xl text-sm text-slate-500">
            Patients: please use the link or QR code provided by your clinic to open a feedback form.
          </p>
          <div className="mt-8">
            <Link href="/admin/login" className="inline-flex min-h-11 items-center rounded-lg bg-primary px-6 font-semibold text-primary-foreground shadow-sm hover:bg-primary/90">
              Staff login
            </Link>
          </div>
        </div>
      </section>
      <section className="mx-auto grid max-w-4xl gap-4 px-4 pb-16 sm:grid-cols-2 sm:px-6">
        {FEATURES.map((f) => (
          <div key={f.title} className="rounded-xl border p-5">
            <span className="mb-3 flex size-10 items-center justify-center rounded-lg bg-accent text-primary">
              <f.icon className="size-5" aria-hidden />
            </span>
            <h2 className="font-semibold text-slate-900">{f.title}</h2>
            <p className="mt-1 text-sm text-slate-600">{f.text}</p>
          </div>
        ))}
      </section>
      <section className="mx-auto max-w-4xl px-4 pb-16 text-sm text-slate-600 sm:px-6">
        <p>
          Read how we handle information in our <Link href="/privacy" className="font-medium text-primary hover:underline">Privacy Policy</Link>{" "}
          and the <Link href="/terms" className="font-medium text-primary hover:underline">Terms of Service</Link>.
        </p>
      </section>
    </SiteShell>
  );
}
