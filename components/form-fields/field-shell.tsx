import { cn } from "@/lib/utils";
import { FieldError } from "@/components/ui/field-error";
import type { FormField } from "@/types/forms";

export function fieldIds(field: FormField) {
  const base = `f-${field.field_id}`;
  return { input: base, help: `${base}-help`, error: `${base}-error`, label: `${base}-label` };
}

export function describedBy(field: FormField, error?: string) {
  const ids = fieldIds(field);
  return [field.description || field.settings.helpText ? ids.help : null, error ? ids.error : null].filter(Boolean).join(" ") || undefined;
}

/** Label, description, help text and error wrapper. Group inputs render as fieldset/legend. */
export function FieldShell({
  field,
  error,
  group,
  children,
  className,
}: {
  field: FormField;
  error?: string;
  group?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const ids = fieldIds(field);
  const labelContent = (
    <>
      {field.label}
      {field.required ? (
        <span className="text-red-600" aria-hidden>
          {" "}*
        </span>
      ) : null}
      {field.required ? <span className="sr-only"> (required)</span> : null}
    </>
  );
  const help = field.description || field.settings.helpText;
  const helpEl = help ? (
    <p id={ids.help} className="text-sm text-slate-500">
      {field.description}
      {field.description && field.settings.helpText ? " " : ""}
      {field.settings.helpText}
    </p>
  ) : null;

  if (group) {
    return (
      <fieldset className={cn("min-w-0 space-y-2.5", className)} aria-describedby={describedBy(field, error)} aria-invalid={!!error || undefined}>
        <legend id={ids.label} className="mb-1 text-[15px] font-medium text-slate-900">
          {labelContent}
        </legend>
        {helpEl}
        {children}
        <FieldError id={ids.error} message={error} />
      </fieldset>
    );
  }
  return (
    <div className={cn("min-w-0 space-y-2", className)}>
      <label id={ids.label} htmlFor={ids.input} className="block text-[15px] font-medium text-slate-900">
        {labelContent}
      </label>
      {helpEl}
      {children}
      <FieldError id={ids.error} message={error} />
    </div>
  );
}
