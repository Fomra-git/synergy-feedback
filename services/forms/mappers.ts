import type { FormFieldRow } from "@/types/db";
import type { FormField } from "@/types/forms";

export function rowToField(row: FormFieldRow): FormField {
  return {
    field_id: row.field_id,
    type: row.type,
    label: row.label ?? "",
    description: row.description,
    placeholder: row.placeholder,
    required: row.required,
    settings: row.settings ?? {},
    validation: row.validation ?? {},
    logic: row.logic ?? null,
  };
}
