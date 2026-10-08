export const INPUT_FIELD_TYPES = [
  "short_text",
  "long_text",
  "email",
  "phone",
  "number",
  "url",
  "dropdown",
  "radio",
  "checkbox",
  "multi_select",
  "date",
  "time",
  "datetime",
  "rating",
  "star_rating",
  "yes_no",
  "linear_scale",
  "file_upload",
  "signature",
] as const;

export const LAYOUT_FIELD_TYPES = ["heading", "paragraph", "divider", "section"] as const;

export const FIELD_TYPES = [...INPUT_FIELD_TYPES, ...LAYOUT_FIELD_TYPES] as const;

export type InputFieldType = (typeof INPUT_FIELD_TYPES)[number];
export type LayoutFieldType = (typeof LAYOUT_FIELD_TYPES)[number];
export type FieldType = (typeof FIELD_TYPES)[number];

export type FileCategory = "image" | "pdf" | "document";

export interface FieldSettings {
  options?: string[];
  helpText?: string;
  defaultValue?: string;
  hidden?: boolean;
  /** rating / star_rating: max value; linear_scale: upper bound */
  max?: number;
  /** linear_scale lower bound */
  min?: number;
  minLabel?: string;
  maxLabel?: string;
  /** file_upload */
  maxFiles?: number;
  maxSizeMb?: number;
  accept?: FileCategory[];
  /** heading level */
  level?: 1 | 2 | 3;
  /** layout width on desktop */
  width?: "full" | "half";
  /** radio / checkbox: stack options vertically (default) or place them side by side */
  optionsLayout?: "vertical" | "horizontal";
  /** pre-fill from a URL query parameter (e.g. ?branch=porur) */
  prefillParam?: string;
}

export interface FieldValidation {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
  patternMessage?: string;
}

export type LogicOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "is_empty"
  | "is_not_empty"
  | "greater_than"
  | "less_than";

export interface LogicCondition {
  fieldId: string;
  operator: LogicOperator;
  value?: string;
}

export interface FieldLogic {
  action: "show" | "hide";
  match: "all" | "any";
  conditions: LogicCondition[];
}

export interface FormField {
  field_id: string;
  type: FieldType;
  label: string;
  description?: string | null;
  placeholder?: string | null;
  required: boolean;
  settings: FieldSettings;
  validation: FieldValidation;
  logic?: FieldLogic | null;
}

export interface FormAppearance {
  /** true: use the global form appearance from Settings instead of the values below */
  useGlobal?: boolean;
  primaryColor?: string;
  backgroundColor?: string;
  buttonColor?: string;
  /** background of the title banner at the top of the form */
  headerColor?: string;
  font?: "inter" | "serif" | "rounded" | "system";
  logoUrl?: string;
}

export interface FormBehavior {
  showProgressBar?: boolean;
  submitButtonText?: string;
  successTitle?: string;
  successMessage?: string;
  showSubmissionNumber?: boolean;
  redirectUrl?: string;
  successButtonText?: string;
  successButtonUrl?: string;
}

export interface FormSeo {
  title?: string;
  description?: string;
}

/** Public-safe settings stored on forms.settings */
export interface FormPublicSettings {
  appearance?: FormAppearance;
  behavior?: FormBehavior;
  seo?: FormSeo;
}

/** Private settings stored in form_settings */
export interface FormSubmissionSettings {
  allowSubmissions?: boolean;
  duplicateProtection?: boolean;
  maxSubmissions?: number | null;
  closeAt?: string | null;
  closedMessage?: string;
}

export interface FormNotificationSettings {
  enabled?: boolean;
  recipients?: string[];
  subject?: string;
  includeAnswers?: boolean;
}

export interface FormSheetSettings {
  includeFormName?: boolean;
  includeBranch?: boolean;
  includeUserAgent?: boolean;
  includeIpHash?: boolean;
}

export type FormStatus = "draft" | "published" | "archived";

/** Answer value shapes per field type */
export interface UploadedFileRef {
  token: string;
  name: string;
  size: number;
  type: string;
}

export interface StoredFileRef {
  path: string;
  name: string;
  size: number;
  type: string;
}

export type AnswerValue = string | number | boolean | string[] | UploadedFileRef[] | null | undefined;
export type AnswerMap = Record<string, AnswerValue>;
