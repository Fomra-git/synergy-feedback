import type {
  FieldLogic,
  FieldSettings,
  FieldValidation,
  FieldType,
  FormNotificationSettings,
  FormPublicSettings,
  FormSheetSettings,
  FormStatus,
  FormSubmissionSettings,
} from "./forms";

export type UserRole = "super_admin" | "admin" | "staff";

export interface ProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BranchRow {
  id: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  manager_name: string | null;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface FormRow {
  id: string;
  branch_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  status: FormStatus;
  settings: FormPublicSettings;
  version: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  archived_at: string | null;
}

export interface FormFieldRow {
  id: string;
  form_id: string;
  field_id: string;
  type: FieldType;
  label: string;
  description: string | null;
  placeholder: string | null;
  required: boolean;
  position: number;
  settings: FieldSettings;
  validation: FieldValidation;
  logic: FieldLogic | null;
}

export interface FormSettingsRow {
  form_id: string;
  submission: FormSubmissionSettings;
  notifications: FormNotificationSettings;
  google_sheets: FormSheetSettings;
  updated_at: string;
}

export interface SubmissionRow {
  id: string;
  form_id: string;
  branch_id: string | null;
  submission_number: string;
  status: "active" | "archived";
  submitted_at: string;
  ip_hash: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  archived_at: string | null;
}

export interface AnswerRow {
  id: string;
  submission_id: string;
  field_id: string;
  field_type: string;
  field_label: string;
  value: string | null;
  value_json: unknown;
}

export type SheetConnectionStatus = "pending_setup" | "connected" | "reauth_required" | "error" | "disconnected";
export type SyncStatus = "pending" | "processing" | "synced" | "failed" | "skipped";

export interface SheetColumn {
  /** "meta:<name>" for system columns, "field:<field_id>" for form fields */
  key: string;
  header: string;
  /** true when the admin renamed the column; otherwise it follows the field label */
  custom?: boolean;
}

export interface SheetConnectionRow {
  id: string;
  form_id: string;
  google_account_id: string | null;
  google_account_email: string | null;
  spreadsheet_id: string | null;
  spreadsheet_name: string | null;
  spreadsheet_url: string | null;
  worksheet_id: number | null;
  worksheet_name: string | null;
  status: SheetConnectionStatus;
  enabled: boolean;
  column_map: SheetColumn[];
  headers_hash: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  connected_at: string | null;
}

export interface GoogleAccountRow {
  id: string;
  email: string;
  google_user_id: string | null;
  scopes: string[];
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
  status: "connected" | "reauth_required" | "revoked";
  last_error: string | null;
}

export interface SyncLogRow {
  id: string;
  submission_id: string;
  form_id: string;
  connection_id: string | null;
  spreadsheet_id: string | null;
  worksheet_name: string | null;
  status: SyncStatus;
  attempt_count: number;
  google_row_number: number | null;
  error_message: string | null;
  error_kind: string | null;
  next_attempt_at: string | null;
  locked_at: string | null;
  attempted_at: string | null;
  synced_at: string | null;
  created_at: string;
}
