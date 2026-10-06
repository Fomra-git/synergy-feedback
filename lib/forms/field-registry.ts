import type { FieldType, FormField, InputFieldType, LayoutFieldType } from "@/types/forms";
import { INPUT_FIELD_TYPES, LAYOUT_FIELD_TYPES } from "@/types/forms";

export type FieldCategory = "basic" | "selection" | "special" | "layout";

export interface FieldTypeMeta {
  type: FieldType;
  label: string;
  category: FieldCategory;
  hint: string;
}

export const FIELD_TYPE_META: Record<FieldType, FieldTypeMeta> = {
  short_text: { type: "short_text", label: "Single Line Text", category: "basic", hint: "Names, short answers" },
  long_text: { type: "long_text", label: "Paragraph", category: "basic", hint: "Comments, long answers" },
  email: { type: "email", label: "Email", category: "basic", hint: "Validated email address" },
  phone: { type: "phone", label: "Phone", category: "basic", hint: "Validated phone number" },
  number: { type: "number", label: "Number", category: "basic", hint: "Age, quantity" },
  url: { type: "url", label: "URL", category: "basic", hint: "Website link" },
  dropdown: { type: "dropdown", label: "Dropdown", category: "selection", hint: "Pick one from a list" },
  radio: { type: "radio", label: "Radio", category: "selection", hint: "Pick one, all visible" },
  checkbox: { type: "checkbox", label: "Checkbox", category: "selection", hint: "Pick many, all visible" },
  multi_select: { type: "multi_select", label: "Multiple Select", category: "selection", hint: "Pick many as chips" },
  date: { type: "date", label: "Date", category: "special", hint: "Calendar date" },
  time: { type: "time", label: "Time", category: "special", hint: "Time of day" },
  datetime: { type: "datetime", label: "Date & Time", category: "special", hint: "Date with time" },
  rating: { type: "rating", label: "Rating", category: "special", hint: "Numbered score" },
  star_rating: { type: "star_rating", label: "Star Rating", category: "special", hint: "1–5 stars" },
  yes_no: { type: "yes_no", label: "Yes / No", category: "special", hint: "Binary choice" },
  linear_scale: { type: "linear_scale", label: "Linear Scale", category: "special", hint: "0–10 scale" },
  file_upload: { type: "file_upload", label: "File Upload", category: "special", hint: "Images, PDFs" },
  signature: { type: "signature", label: "Signature", category: "special", hint: "Draw a signature" },
  heading: { type: "heading", label: "Heading", category: "layout", hint: "Title text" },
  paragraph: { type: "paragraph", label: "Description", category: "layout", hint: "Explanatory text" },
  divider: { type: "divider", label: "Divider", category: "layout", hint: "Horizontal line" },
  section: { type: "section", label: "Section / Page", category: "layout", hint: "Starts a new step" },
};

export const FIELD_CATEGORIES: { id: FieldCategory; label: string }[] = [
  { id: "basic", label: "Basic" },
  { id: "selection", label: "Selection" },
  { id: "special", label: "Special" },
  { id: "layout", label: "Layout" },
];

export function isInputType(type: FieldType): type is InputFieldType {
  return (INPUT_FIELD_TYPES as readonly string[]).includes(type);
}

export function isLayoutType(type: FieldType): type is LayoutFieldType {
  return (LAYOUT_FIELD_TYPES as readonly string[]).includes(type);
}

export function hasOptions(type: FieldType): boolean {
  return type === "dropdown" || type === "radio" || type === "checkbox" || type === "multi_select";
}

export function isMultiValue(type: FieldType): boolean {
  return type === "checkbox" || type === "multi_select";
}

export function isTextLike(type: FieldType): boolean {
  return ["short_text", "long_text", "email", "phone", "url"].includes(type);
}

/** Converts a label into a stable snake_case field key, unique within `taken`. */
export function makeFieldId(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  let slug = base
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  if (!slug || !/^[a-z]/.test(slug)) slug = `field_${slug}`.replace(/_+$/, "");
  let candidate = slug;
  let i = 2;
  while (used.has(candidate)) candidate = `${slug}_${i++}`;
  return candidate;
}

export function createField(type: FieldType, taken: Iterable<string>): FormField {
  const meta = FIELD_TYPE_META[type];
  const defaults: Partial<Record<FieldType, Partial<FormField>>> = {
    short_text: { label: "Untitled question" },
    long_text: { label: "Comments" },
    email: { label: "Email", placeholder: "you@example.com" },
    phone: { label: "Phone Number" },
    number: { label: "Number" },
    url: { label: "Website", placeholder: "https://" },
    dropdown: { label: "Select an option", settings: { options: ["Option 1", "Option 2", "Option 3"] } },
    radio: { label: "Choose one", settings: { options: ["Option 1", "Option 2", "Option 3"] } },
    checkbox: { label: "Select all that apply", settings: { options: ["Option 1", "Option 2", "Option 3"] } },
    multi_select: { label: "Select multiple", settings: { options: ["Option 1", "Option 2", "Option 3"] } },
    date: { label: "Date" },
    time: { label: "Time" },
    datetime: { label: "Date & Time" },
    rating: { label: "How would you rate us?", settings: { max: 10 } },
    star_rating: { label: "How was your experience?", settings: { max: 5 } },
    yes_no: { label: "Are you satisfied?" },
    linear_scale: { label: "How likely are you to recommend us?", settings: { min: 0, max: 10, minLabel: "Not likely", maxLabel: "Very likely" } },
    file_upload: { label: "Upload a file", settings: { maxFiles: 1, maxSizeMb: 5, accept: ["image", "pdf"] } },
    signature: { label: "Signature" },
    heading: { label: "Section heading", settings: { level: 2 } },
    paragraph: { label: "", description: "Add some helpful text for your respondents." },
    divider: { label: "" },
    section: { label: "New section" },
  };
  const d = defaults[type] ?? {};
  const keyBase = isLayoutType(type) ? type : d.label || meta.label;
  return {
    field_id: makeFieldId(keyBase, taken),
    type,
    label: d.label ?? meta.label,
    description: d.description ?? null,
    placeholder: d.placeholder ?? null,
    required: false,
    settings: { ...(d.settings ?? {}) },
    validation: {},
    logic: null,
  };
}
