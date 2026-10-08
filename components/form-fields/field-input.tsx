"use client";

import { Check, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AnswerValue, FormField, UploadedFileRef } from "@/types/forms";
import { describedBy, FieldShell, fieldIds } from "./field-shell";
import { SignaturePad } from "./signature-pad";
import { FileUpload } from "./file-upload";

const inputBase =
  "block w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 sm:text-sm shadow-xs outline-none transition placeholder:text-slate-400 focus:border-[var(--form-accent)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--form-accent)_18%,transparent)] aria-[invalid=true]:border-red-500 disabled:opacity-60";

const optionBase =
  "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border bg-white px-4 py-2.5 text-sm text-slate-800 transition hover:border-slate-400 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[color-mix(in_srgb,var(--form-accent)_25%,transparent)]";

const horizontal = (field: FormField) => field.settings.optionsLayout === "horizontal";

/** Vertical: one option per row. Horizontal: options side by side, wrapping on small screens. */
function optionsContainer(field: FormField) {
  return horizontal(field) ? "flex flex-wrap gap-2" : "grid gap-2";
}

export interface FieldInputProps {
  field: FormField;
  value: AnswerValue;
  onChange: (v: AnswerValue) => void;
  onBlur?: () => void;
  error?: string;
  disabled?: boolean;
  uploadUrl: string | null;
}

function TextLike({ field, value, onChange, onBlur, error, disabled }: FieldInputProps) {
  const ids = fieldIds(field);
  const common = {
    id: ids.input,
    name: field.field_id,
    value: (value as string | number | undefined) ?? "",
    placeholder: field.placeholder ?? undefined,
    disabled,
    onBlur,
    "aria-invalid": !!error || undefined,
    "aria-describedby": describedBy(field, error),
    "aria-required": field.required || undefined,
    className: inputBase,
  };
  switch (field.type) {
    case "long_text":
      return <textarea {...common} rows={4} maxLength={field.validation.maxLength ?? 10000} className={cn(inputBase, "min-h-28 resize-y")} onChange={(e) => onChange(e.target.value)} />;
    case "email":
      return <input {...common} type="email" inputMode="email" autoComplete="email" onChange={(e) => onChange(e.target.value)} />;
    case "phone":
      return <input {...common} type="tel" inputMode="tel" autoComplete="tel" onChange={(e) => onChange(e.target.value)} />;
    case "url":
      return <input {...common} type="url" inputMode="url" onChange={(e) => onChange(e.target.value)} />;
    case "number":
      return (
        <input
          {...common}
          type="number"
          inputMode="decimal"
          min={field.validation.min}
          max={field.validation.max}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        />
      );
    case "date":
      return <input {...common} type="date" onChange={(e) => onChange(e.target.value)} />;
    case "time":
      return <input {...common} type="time" onChange={(e) => onChange(e.target.value)} />;
    case "datetime":
      return <input {...common} type="datetime-local" onChange={(e) => onChange(e.target.value)} />;
    default:
      return (
        <input
          {...common}
          type="text"
          autoComplete={/name/i.test(field.label) ? "name" : "off"}
          maxLength={field.validation.maxLength ?? 1000}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

function ScaleButtons({
  field,
  value,
  onChange,
  min,
  max,
  disabled,
}: {
  field: FormField;
  value: AnswerValue;
  onChange: (v: AnswerValue) => void;
  min: number;
  max: number;
  disabled?: boolean;
}) {
  const nums = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div role="radiogroup" aria-labelledby={fieldIds(field).label} className="flex flex-wrap gap-2">
      {nums.map((n) => {
        const selected = value === n;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(selected && !field.required ? "" : n)}
            className={cn(
              "flex size-10 items-center justify-center rounded-lg border text-sm font-semibold tabular-nums transition sm:size-11",
              selected ? "border-transparent bg-[var(--form-accent)] text-[var(--form-accent-fg)] shadow" : "bg-white text-slate-700 hover:border-slate-400",
            )}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}

export function FieldInput(props: FieldInputProps) {
  const { field, value, onChange, error, disabled, uploadUrl } = props;
  const ids = fieldIds(field);
  const options = field.settings.options ?? [];

  switch (field.type) {
    case "heading": {
      const level = field.settings.level ?? 2;
      const Tag = (level === 1 ? "h2" : level === 2 ? "h3" : "h4") as "h2";
      return (
        <div className="pt-2">
          <Tag className={cn("font-semibold text-slate-900", level === 1 ? "text-xl" : level === 2 ? "text-lg" : "text-base")}>{field.label}</Tag>
          {field.description ? <p className="mt-1 text-[13px] text-slate-500">{field.description}</p> : null}
        </div>
      );
    }
    case "paragraph":
      return (
        <div className="text-sm leading-relaxed whitespace-pre-line text-slate-600">
          {field.label ? <p className="mb-1 font-medium text-slate-800">{field.label}</p> : null}
          {field.description}
        </div>
      );
    case "divider":
      return <hr className="border-slate-200" />;
    case "section":
      return null;

    case "dropdown":
      return (
        <FieldShell field={field} error={error}>
          <select
            id={ids.input}
            name={field.field_id}
            value={(value as string) ?? ""}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            onBlur={props.onBlur}
            aria-invalid={!!error || undefined}
            aria-describedby={describedBy(field, error)}
            aria-required={field.required || undefined}
            className={cn(inputBase, "appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22 fill=%22%2364748b%22><path d=%22M5.3 7.3a1 1 0 011.4 0L10 10.6l3.3-3.3a1 1 0 111.4 1.4l-4 4a1 1 0 01-1.4 0l-4-4a1 1 0 010-1.4z%22/></svg>')] bg-[length:1.25rem] bg-[right_0.75rem_center] bg-no-repeat pr-10")}
          >
            <option value="">{field.placeholder || "Select an option"}</option>
            {options.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </FieldShell>
      );

    case "radio":
    case "yes_no": {
      const opts = field.type === "yes_no" ? ["Yes", "No"] : options;
      return (
        <FieldShell field={field} error={error} group>
          <div className={cn(field.type === "yes_no" ? "grid grid-cols-2 gap-2 sm:max-w-sm" : optionsContainer(field))}>
            {opts.map((o) => {
              const checked = value === o;
              return (
                <label key={o} className={cn(optionBase, horizontal(field) && "w-auto", checked && "border-[var(--form-accent)] bg-[color-mix(in_srgb,var(--form-accent)_6%,white)]")}>
                  <input
                    type="radio"
                    name={field.field_id}
                    value={o}
                    checked={checked}
                    disabled={disabled}
                    onChange={() => onChange(o)}
                    className="size-5 shrink-0 accent-[var(--form-accent)]"
                  />
                  <span>{o}</span>
                </label>
              );
            })}
          </div>
        </FieldShell>
      );
    }

    case "checkbox":
    case "multi_select": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      const toggle = (o: string) => onChange(selected.includes(o) ? selected.filter((x) => x !== o) : [...selected, o]);
      if (field.type === "multi_select") {
        return (
          <FieldShell field={field} error={error} group>
            <div className="flex flex-wrap gap-2">
              {options.map((o) => {
                const on = selected.includes(o);
                return (
                  <button
                    key={o}
                    type="button"
                    aria-pressed={on}
                    disabled={disabled}
                    onClick={() => toggle(o)}
                    className={cn(
                      "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 py-2 text-sm transition",
                      on ? "border-transparent bg-[var(--form-accent)] text-[var(--form-accent-fg)]" : "bg-white text-slate-700 hover:border-slate-400",
                    )}
                  >
                    {on && <Check className="size-4" aria-hidden />}
                    {o}
                  </button>
                );
              })}
            </div>
          </FieldShell>
        );
      }
      return (
        <FieldShell field={field} error={error} group>
          <div className={optionsContainer(field)}>
            {options.map((o) => {
              const on = selected.includes(o);
              return (
                <label key={o} className={cn(optionBase, horizontal(field) && "w-auto", on && "border-[var(--form-accent)] bg-[color-mix(in_srgb,var(--form-accent)_6%,white)]")}>
                  <input type="checkbox" name={field.field_id} value={o} checked={on} disabled={disabled} onChange={() => toggle(o)} className="size-5 shrink-0 rounded accent-[var(--form-accent)]" />
                  <span>{o}</span>
                </label>
              );
            })}
          </div>
        </FieldShell>
      );
    }

    case "star_rating": {
      const max = field.settings.max ?? 5;
      const current = typeof value === "number" ? value : 0;
      return (
        <FieldShell field={field} error={error} group>
          <div role="radiogroup" aria-labelledby={ids.label} className="flex gap-1">
            {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={current === n}
                aria-label={`${n} star${n > 1 ? "s" : ""}`}
                disabled={disabled}
                onClick={() => onChange(n)}
                className="rounded-md p-1 transition hover:scale-110"
              >
                <Star className={cn("size-9 sm:size-10", n <= current ? "fill-amber-400 text-amber-400" : "text-slate-300")} strokeWidth={1.5} />
              </button>
            ))}
          </div>
        </FieldShell>
      );
    }

    case "rating":
      return (
        <FieldShell field={field} error={error} group>
          <ScaleButtons field={field} value={value} onChange={onChange} min={1} max={field.settings.max ?? 10} disabled={disabled} />
        </FieldShell>
      );

    case "linear_scale":
      return (
        <FieldShell field={field} error={error} group>
          <ScaleButtons field={field} value={value} onChange={onChange} min={field.settings.min ?? 0} max={field.settings.max ?? 10} disabled={disabled} />
          {(field.settings.minLabel || field.settings.maxLabel) && (
            <div className="flex justify-between text-xs text-slate-500">
              <span>{field.settings.minLabel}</span>
              <span>{field.settings.maxLabel}</span>
            </div>
          )}
        </FieldShell>
      );

    case "file_upload":
      return (
        <FieldShell field={field} error={error}>
          <FileUpload
            field={field}
            value={(value as UploadedFileRef[]) ?? []}
            onChange={onChange}
            uploadUrl={uploadUrl}
            inputId={ids.input}
            describedBy={describedBy(field, error)}
            invalid={!!error}
            disabled={disabled}
          />
        </FieldShell>
      );

    case "signature":
      return (
        <FieldShell field={field} error={error} group>
          <SignaturePad
            value={(value as string) ?? ""}
            onChange={onChange}
            labelledBy={ids.label}
            describedBy={describedBy(field, error)}
            invalid={!!error}
            disabled={disabled}
          />
        </FieldShell>
      );

    default:
      return (
        <FieldShell field={field} error={error}>
          <TextLike {...props} />
        </FieldShell>
      );
  }
}
