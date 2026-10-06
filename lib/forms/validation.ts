import { z } from "zod";
import type { AnswerMap, AnswerValue, FormField, UploadedFileRef } from "@/types/forms";
import { isInputType } from "./field-registry";
import { computeActiveFields, computeVisibleFields } from "./logic";

export const SIGNATURE_MAX_BYTES = 300 * 1024;
const PHONE_RE = /^\+?[0-9\s\-().]{7,25}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;

const emailSchema = z.email();

function isEmpty(value: AnswerValue): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function isValidDate(s: string): boolean {
  const d = new Date(`${s.slice(0, 10)}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s.slice(0, 10);
}

function safeRegex(pattern: string): RegExp | null {
  // Admin-provided patterns are length-limited and compiled defensively.
  if (!pattern || pattern.length > 300) return null;
  try {
    return new RegExp(`^(?:${pattern})$`, "u");
  } catch {
    return null;
  }
}

const fileRefSchema = z.object({
  token: z.string().min(10).max(2000),
  name: z.string().min(1).max(255),
  size: z.number().int().nonnegative(),
  type: z.string().max(150),
});

/**
 * Validates and normalises a single field value. Returns either the clean value
 * (undefined for empty) or an error message. Pure — used on client AND server.
 */
export function validateFieldValue(field: FormField, raw: AnswerValue): { value?: AnswerValue; error?: string } {
  const v = field.validation ?? {};
  const s = field.settings ?? {};
  const label = field.label || "This field";

  if (isEmpty(raw)) {
    return field.required ? { error: `${label} is required.` } : { value: undefined };
  }

  switch (field.type) {
    case "short_text":
    case "long_text":
    case "email":
    case "phone":
    case "url": {
      if (typeof raw !== "string" && typeof raw !== "number") return { error: "Invalid value." };
      let str = String(raw).trim();
      const hardMax = field.type === "long_text" ? 10000 : 1000;
      if (str.length > hardMax) return { error: `Please keep this under ${hardMax} characters.` };
      if (v.minLength && str.length < v.minLength) return { error: `Please enter at least ${v.minLength} characters.` };
      if (v.maxLength && str.length > v.maxLength) return { error: `Please enter no more than ${v.maxLength} characters.` };
      if (field.type === "email") {
        str = str.toLowerCase();
        if (!emailSchema.safeParse(str).success) return { error: "Please enter a valid email address." };
      }
      if (field.type === "phone") {
        const digits = str.replace(/\D/g, "");
        if (!PHONE_RE.test(str) || digits.length < 7 || digits.length > 15) {
          return { error: "Please enter a valid phone number." };
        }
      }
      if (field.type === "url") {
        try {
          const u = new URL(str);
          if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("protocol");
        } catch {
          return { error: "Please enter a valid URL starting with http:// or https://" };
        }
      }
      if (v.pattern) {
        const re = safeRegex(v.pattern);
        if (re && !re.test(str)) return { error: v.patternMessage || "Please match the requested format." };
      }
      return { value: str };
    }
    case "number": {
      const n = typeof raw === "number" ? raw : Number(String(raw).trim());
      if (!Number.isFinite(n)) return { error: "Please enter a valid number." };
      if (v.min !== undefined && v.min !== null && n < v.min) return { error: `Please enter a number of at least ${v.min}.` };
      if (v.max !== undefined && v.max !== null && n > v.max) return { error: `Please enter a number no greater than ${v.max}.` };
      return { value: n };
    }
    case "dropdown":
    case "radio": {
      const str = String(raw);
      if (!(s.options ?? []).includes(str)) return { error: "Please choose one of the available options." };
      return { value: str };
    }
    case "checkbox":
    case "multi_select": {
      const arr = Array.isArray(raw) ? raw.map(String) : [String(raw)];
      const options = s.options ?? [];
      const unique = Array.from(new Set(arr));
      if (unique.some((x) => !options.includes(x))) return { error: "Please choose from the available options." };
      if (v.min && unique.length < v.min) return { error: `Please select at least ${v.min}.` };
      if (v.max && unique.length > v.max) return { error: `Please select no more than ${v.max}.` };
      // Keep option order stable
      return { value: options.filter((o) => unique.includes(o)) };
    }
    case "date": {
      const str = String(raw);
      if (!DATE_RE.test(str) || !isValidDate(str)) return { error: "Please enter a valid date." };
      return { value: str };
    }
    case "time": {
      const str = String(raw).slice(0, 5);
      if (!TIME_RE.test(str)) return { error: "Please enter a valid time." };
      return { value: str };
    }
    case "datetime": {
      const str = String(raw).slice(0, 16);
      if (!DATETIME_RE.test(str) || !isValidDate(str)) return { error: "Please enter a valid date and time." };
      return { value: str };
    }
    case "rating":
    case "star_rating":
    case "linear_scale": {
      const n = Number(raw);
      const min = field.type === "linear_scale" ? (s.min ?? 0) : 1;
      const max = s.max ?? (field.type === "star_rating" ? 5 : 10);
      if (!Number.isInteger(n) || n < min || n > max) return { error: "Please choose a valid rating." };
      return { value: n };
    }
    case "yes_no": {
      const str = typeof raw === "boolean" ? (raw ? "Yes" : "No") : String(raw);
      if (str !== "Yes" && str !== "No") return { error: "Please choose Yes or No." };
      return { value: str };
    }
    case "file_upload": {
      const parsed = z.array(fileRefSchema).safeParse(raw);
      if (!parsed.success) return { error: "Please upload a valid file." };
      const files = parsed.data as UploadedFileRef[];
      const maxFiles = Math.min(s.maxFiles ?? 1, 10);
      if (files.length > maxFiles) return { error: `You can upload up to ${maxFiles} file${maxFiles > 1 ? "s" : ""}.` };
      const maxBytes = (s.maxSizeMb ?? 5) * 1024 * 1024;
      if (files.some((f) => f.size > maxBytes)) return { error: `Each file must be smaller than ${s.maxSizeMb ?? 5} MB.` };
      return { value: files };
    }
    case "signature": {
      const str = String(raw);
      if (!str.startsWith("data:image/png;base64,")) return { error: "Please provide your signature." };
      const approxBytes = Math.ceil(((str.length - 22) * 3) / 4);
      if (approxBytes > SIGNATURE_MAX_BYTES) return { error: "Signature image is too large. Please try again." };
      return { value: str };
    }
    default:
      return { value: undefined };
  }
}

export interface ValidationResult {
  success: boolean;
  values: AnswerMap;
  errors: Record<string, string>;
}

/**
 * Validates a complete set of answers against the form definition, applying
 * conditional logic. Values for fields hidden by logic are discarded and never
 * required. Unknown keys are dropped. Used by the public renderer AND the
 * submission API (client-side validation is never trusted).
 */
export function validateAnswers(
  fields: FormField[],
  raw: AnswerMap,
  options: { onlyFieldIds?: Set<string> } = {},
): ValidationResult {
  const active = computeActiveFields(fields, raw);
  const values: AnswerMap = {};
  const errors: Record<string, string> = {};

  for (const field of fields) {
    if (!isInputType(field.type)) continue;
    if (!active.has(field.field_id)) continue;
    if (options.onlyFieldIds && !options.onlyFieldIds.has(field.field_id)) continue;
    const result = validateFieldValue(field, raw[field.field_id]);
    if (result.error) errors[field.field_id] = result.error;
    else if (result.value !== undefined) values[field.field_id] = result.value;
  }

  return { success: Object.keys(errors).length === 0, values, errors };
}

/** Splits fields into steps at each `section` field. */
export function splitIntoSteps(fields: FormField[]): { section: FormField | null; fields: FormField[] }[] {
  const steps: { section: FormField | null; fields: FormField[] }[] = [];
  let current: { section: FormField | null; fields: FormField[] } = { section: null, fields: [] };
  for (const field of fields) {
    if (field.type === "section") {
      if (current.section || current.fields.length) steps.push(current);
      current = { section: field, fields: [] };
    } else {
      current.fields.push(field);
    }
  }
  if (current.section || current.fields.length || steps.length === 0) steps.push(current);
  return steps;
}

export function initialValues(fields: FormField[], searchParams?: Record<string, string | undefined>): AnswerMap {
  const values: AnswerMap = {};
  for (const f of fields) {
    if (!isInputType(f.type)) continue;
    const prefill = f.settings?.prefillParam ? searchParams?.[f.settings.prefillParam] : undefined;
    const def = prefill ?? f.settings?.defaultValue;
    if (def === undefined || def === "") {
      values[f.field_id] = f.type === "checkbox" || f.type === "multi_select" || f.type === "file_upload" ? [] : "";
      continue;
    }
    if (f.type === "checkbox" || f.type === "multi_select") {
      values[f.field_id] = def.split(",").map((x) => x.trim()).filter(Boolean);
    } else if (["rating", "star_rating", "linear_scale", "number"].includes(f.type)) {
      const n = Number(def);
      values[f.field_id] = Number.isFinite(n) ? n : "";
    } else {
      values[f.field_id] = def;
    }
  }
  return values;
}

export { computeVisibleFields };
