"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm, useWatch, type Resolver } from "react-hook-form";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { FieldInput } from "@/components/form-fields/field-input";
import { isInputType } from "@/lib/forms/field-registry";
import { computeVisibleFields } from "@/lib/forms/logic";
import { initialValues, splitIntoSteps, validateAnswers } from "@/lib/forms/validation";
import { cn, readableTextColor } from "@/lib/utils";
import type { AnswerMap, FormField, FormPublicSettings } from "@/types/forms";
import { Turnstile } from "./turnstile";

export interface RendererForm {
  slug: string;
  name: string;
  description: string | null;
  settings: FormPublicSettings;
  fields: FormField[];
}

type Phase = { kind: "form" } | { kind: "success"; submissionNumber: string | null };

const FONT_CLASS: Record<string, string> = {
  inter: "font-sans",
  serif: "font-serif",
  rounded: "font-rounded",
  system: "font-[system-ui]",
};

/**
 * Renders any form definition. Used by the public form AND the admin preview
 * (mode="preview" never submits). Validation is generated from the field
 * configuration and is repeated on the server.
 */
export function DynamicFormRenderer({
  form,
  mode = "public",
  prefill,
  captchaSiteKey,
  closedMessage,
  orgName,
  logoUrl,
}: {
  form: RendererForm;
  mode?: "public" | "preview";
  prefill?: Record<string, string | undefined>;
  captchaSiteKey?: string | null;
  closedMessage?: string | null;
  orgName?: string;
  logoUrl?: string | null;
}) {
  const appearance = form.settings.appearance ?? {};
  const behavior = form.settings.behavior ?? {};
  const accent = appearance.primaryColor ?? "#0f766e";
  const buttonColor = appearance.buttonColor ?? accent;
  const steps = useMemo(() => splitIntoSteps(form.fields), [form.fields]);
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  const [serverError, setServerError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState("");
  const [clientToken] = useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : null));
  const startedAt = useRef<number>(0);
  const honeypot = useRef<HTMLInputElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  const stepFieldIds = useCallback((i: number) => new Set(steps[i]?.fields.filter((f) => isInputType(f.type)).map((f) => f.field_id) ?? []), [steps]);

  const resolver: Resolver<AnswerMap> = useCallback(
    async (values) => {
      const result = validateAnswers(form.fields, values, { onlyFieldIds: stepFieldIds(step) });
      const errors: Record<string, { type: string; message: string }> = {};
      for (const [k, m] of Object.entries(result.errors)) errors[k] = { type: "validate", message: m };
      return Object.keys(errors).length ? { values: {}, errors } : { values, errors: {} };
    },
    [form.fields, step, stepFieldIds],
  );

  const { control, handleSubmit, setError, formState } = useForm<AnswerMap>({
    defaultValues: initialValues(form.fields, prefill),
    resolver,
    mode: "onTouched",
    reValidateMode: "onChange",
  });
  const values = useWatch({ control }) as AnswerMap;
  const visible = useMemo(() => computeVisibleFields(form.fields, values), [form.fields, values]);

  const isLast = step >= steps.length - 1;
  const current = steps[step]!;
  const showProgress = steps.length > 1 && behavior.showProgressBar !== false;

  const focusFirstError = () => {
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>("[aria-invalid='true'], fieldset[aria-invalid='true'] input, fieldset[aria-invalid='true'] button");
      el?.focus();
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  };

  const onValid = async (data: AnswerMap) => {
    setServerError(null);
    if (!isLast) {
      setStep((s) => s + 1);
      topRef.current?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    if (mode === "preview") {
      setPhase({ kind: "success", submissionNumber: "SW-PREVIEW-000000" });
      return;
    }
    // Final full validation across all steps
    const full = validateAnswers(form.fields, data);
    if (!full.success) {
      const firstStep = steps.findIndex((s) => s.fields.some((f) => full.errors[f.field_id]));
      if (firstStep >= 0) setStep(firstStep);
      for (const [k, m] of Object.entries(full.errors)) setError(k, { type: "validate", message: m });
      focusFirstError();
      return;
    }
    try {
      const res = await fetch(`/api/forms/${encodeURIComponent(form.slug)}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: full.values,
          clientToken,
          captchaToken: captchaToken || undefined,
          website: honeypot.current?.value || undefined,
          startedAt: startedAt.current,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { submissionNumber?: string | null; error?: string; fieldErrors?: Record<string, string> };
      if (!res.ok) {
        if (json.fieldErrors) {
          for (const [k, m] of Object.entries(json.fieldErrors)) setError(k, { type: "server", message: m });
          const firstStep = steps.findIndex((s) => s.fields.some((f) => json.fieldErrors![f.field_id]));
          if (firstStep >= 0) setStep(firstStep);
          focusFirstError();
        }
        setServerError(json.error ?? "We couldn't submit your response. Please try again.");
        return;
      }
      if (behavior.redirectUrl && /^https?:\/\//i.test(behavior.redirectUrl)) {
        window.location.assign(behavior.redirectUrl);
        return;
      }
      setPhase({ kind: "success", submissionNumber: json.submissionNumber ?? null });
      topRef.current?.scrollIntoView({ behavior: "smooth" });
    } catch {
      setServerError("Network error. Please check your connection and try again.");
    }
  };

  const style = {
    "--form-accent": accent,
    "--form-accent-fg": readableTextColor(accent),
    backgroundColor: appearance.backgroundColor ?? "#f0fdfa",
  } as React.CSSProperties;

  return (
    <div style={style} className={cn("min-h-dvh px-4 py-8 sm:py-12", FONT_CLASS[appearance.font ?? "inter"])}>
      <div ref={topRef} className="mx-auto w-full max-w-2xl">
        <header className="mb-6 flex flex-col items-center text-center">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- admin-configured logo
            <img src={logoUrl} alt={orgName ?? "Logo"} className="mb-4 h-12 w-auto max-w-[200px] object-contain" />
          ) : (
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold tracking-wide text-slate-700 uppercase">
              <svg viewBox="0 0 40 40" className="size-9" aria-hidden>
                <rect width="40" height="40" rx="10" fill={accent} />
                <circle cx="20" cy="11" r="3.4" fill="#fff" />
                <path d="M10.5 27.5c3.2-6.4 7.2-9.6 12-9.6 2.6 0 4.8.8 6.9 2.4" stroke="#fff" strokeWidth="3" strokeLinecap="round" fill="none" />
                <path d="M29.5 21.5c-2.6 5.8-6.4 8.7-11.3 8.7-2.3 0-4.3-.6-6.2-1.8" stroke="#ffffffaa" strokeWidth="3" strokeLinecap="round" fill="none" />
              </svg>
              {orgName ?? "Synergy Wellness"}
            </div>
          )}
        </header>

        <main className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_10px_40px_-12px_rgba(15,23,42,0.15)]">
          <div className="h-1.5" style={{ background: accent }} aria-hidden />
          {phase.kind === "success" ? (
            <div className="px-6 py-14 text-center sm:px-10" role="status" aria-live="polite">
              <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-full" style={{ background: `color-mix(in srgb, ${accent} 12%, white)` }}>
                <CheckCircle2 className="size-9" style={{ color: accent }} aria-hidden />
              </div>
              <h1 className="text-2xl font-semibold text-slate-900">{behavior.successTitle || "Thank You!"}</h1>
              <p className="mx-auto mt-2 max-w-md text-slate-600">{behavior.successMessage || "Your feedback has been submitted successfully."}</p>
              {behavior.showSubmissionNumber !== false && phase.submissionNumber && (
                <div className="mx-auto mt-6 inline-block rounded-xl bg-slate-50 px-5 py-3">
                  <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">Submission ID</p>
                  <p className="mt-0.5 font-mono text-lg font-semibold text-slate-900">{phase.submissionNumber}</p>
                </div>
              )}
              {behavior.successButtonText && behavior.successButtonUrl && (
                <div className="mt-8">
                  <a
                    href={behavior.successButtonUrl}
                    className="inline-flex min-h-12 items-center rounded-lg px-6 font-semibold shadow-sm"
                    style={{ background: buttonColor, color: readableTextColor(buttonColor) }}
                    rel="noopener noreferrer"
                  >
                    {behavior.successButtonText}
                  </a>
                </div>
              )}
              {mode === "preview" && <p className="mt-6 text-xs text-slate-400">Preview mode — nothing was submitted.</p>}
            </div>
          ) : closedMessage ? (
            <div className="px-6 py-14 text-center sm:px-10">
              <h1 className="text-2xl font-semibold text-slate-900">{form.name}</h1>
              <p className="mt-3 text-slate-600">{closedMessage}</p>
            </div>
          ) : (
            <form onSubmit={(e) => void handleSubmit(onValid, focusFirstError)(e)} noValidate className="px-5 py-7 sm:px-10 sm:py-10" aria-describedby={form.description ? "form-description" : undefined}>
              <div className="mb-8">
                <h1 className="text-2xl font-semibold tracking-tight text-balance text-slate-900 sm:text-3xl">{form.name}</h1>
                {form.description && (
                  <p id="form-description" className="mt-2 text-[15px] leading-relaxed whitespace-pre-line text-slate-600">
                    {form.description}
                  </p>
                )}
              </div>

              {showProgress && (
                <div className="mb-8">
                  <div className="mb-2 flex justify-between text-xs font-medium text-slate-500">
                    <span>{current.section?.label ?? `Step ${step + 1}`}</span>
                    <span>
                      Step {step + 1} of {steps.length}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100" role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={step + 1} aria-label="Form progress">
                    <div className="h-2 rounded-full transition-all" style={{ width: `${((step + 1) / steps.length) * 100}%`, background: accent }} />
                  </div>
                </div>
              )}

              {current.section && (
                <div className="mb-6 border-b pb-4">
                  <h2 className="text-lg font-semibold text-slate-900">{current.section.label}</h2>
                  {current.section.description && <p className="mt-1 text-sm text-slate-500">{current.section.description}</p>}
                </div>
              )}

              <div className="grid grid-cols-1 gap-x-5 gap-y-7 sm:grid-cols-2">
                {current.fields.map((field) =>
                  visible.has(field.field_id) ? (
                    <div key={field.field_id} className={cn(field.settings.width === "half" && isInputType(field.type) ? "sm:col-span-1" : "sm:col-span-2")}>
                      {isInputType(field.type) ? (
                        <Controller
                          control={control}
                          name={field.field_id}
                          render={({ field: rhf, fieldState }) => (
                            <FieldInput
                              field={field}
                              value={rhf.value}
                              onChange={rhf.onChange}
                              onBlur={rhf.onBlur}
                              error={fieldState.error?.message}
                              disabled={formState.isSubmitting}
                              uploadUrl={mode === "public" ? `/api/forms/${encodeURIComponent(form.slug)}/upload` : null}
                            />
                          )}
                        />
                      ) : (
                        <FieldInput field={field} value={undefined} onChange={() => undefined} uploadUrl={null} />
                      )}
                    </div>
                  ) : null,
                )}
              </div>

              {/* Honeypot — hidden from humans and assistive tech */}
              <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                <label>
                  Website
                  <input ref={honeypot} type="text" name="website" tabIndex={-1} autoComplete="off" />
                </label>
              </div>

              {isLast && mode === "public" && captchaSiteKey && (
                <div className="mt-6">
                  <Turnstile siteKey={captchaSiteKey} onToken={setCaptchaToken} />
                </div>
              )}

              {serverError && (
                <p role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {serverError}
                </p>
              )}

              <div className="sticky bottom-0 -mx-5 mt-8 flex gap-3 border-t border-slate-100 bg-white/95 px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
                {step > 0 && (
                  <button
                    type="button"
                    onClick={() => setStep((s) => s - 1)}
                    className="inline-flex min-h-12 items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <ArrowLeft className="size-4" aria-hidden /> Back
                  </button>
                )}
                <button
                  type="submit"
                  disabled={formState.isSubmitting}
                  className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg px-6 text-base font-semibold shadow-sm transition hover:brightness-95 focus-visible:ring-4 focus-visible:ring-[color-mix(in_srgb,var(--form-accent)_30%,transparent)] disabled:opacity-70 sm:flex-none"
                  style={{ background: buttonColor, color: readableTextColor(buttonColor) }}
                >
                  {formState.isSubmitting && <Loader2 className="size-5 animate-spin" aria-hidden />}
                  {isLast ? behavior.submitButtonText || "Submit" : "Next"}
                  {!isLast && <ArrowRight className="size-4" aria-hidden />}
                </button>
              </div>
            </form>
          )}
        </main>
        <footer className="mt-6 text-center text-xs text-slate-500">
          <p>Your information is kept confidential by {orgName ?? "Synergy Wellness"}.</p>
          <p className="mt-1">
            <a href="/privacy" target="_blank" rel="noopener" className="underline-offset-2 hover:underline">Privacy Policy</a>
            <span aria-hidden> · </span>
            <a href="/terms" target="_blank" rel="noopener" className="underline-offset-2 hover:underline">Terms of Service</a>
          </p>
        </footer>
      </div>
    </div>
  );
}
