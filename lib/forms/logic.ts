import type { AnswerMap, AnswerValue, FormField, LogicCondition } from "@/types/forms";

function asStrings(value: AnswerValue): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === "object" && v !== null ? (v as { name: string }).name : String(v)));
  }
  if (typeof value === "boolean") return [value ? "Yes" : "No"];
  const s = String(value).trim();
  return s === "" ? [] : [s];
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

export function evaluateCondition(condition: LogicCondition, value: AnswerValue): boolean {
  const values = asStrings(value);
  const target = norm(condition.value ?? "");
  switch (condition.operator) {
    case "is_empty":
      return values.length === 0;
    case "is_not_empty":
      return values.length > 0;
    case "equals":
      return values.some((v) => norm(v) === target);
    case "not_equals":
      return !values.some((v) => norm(v) === target);
    case "contains":
      return values.some((v) => norm(v).includes(target));
    case "not_contains":
      return !values.some((v) => norm(v).includes(target));
    case "greater_than":
    case "less_than": {
      const n = Number(values[0]);
      const t = Number(condition.value);
      if (values.length === 0 || Number.isNaN(n) || Number.isNaN(t)) return false;
      return condition.operator === "greater_than" ? n > t : n < t;
    }
    default:
      return false;
  }
}

/**
 * Returns the set of field ids that are currently shown to the respondent.
 * Fields are evaluated in order; a condition that references a field which is
 * itself hidden by logic sees an empty value (so logic cascades correctly).
 * Fields marked `settings.hidden` are never shown (they still submit defaults).
 */
export function computeVisibleFields(fields: FormField[], values: AnswerMap): Set<string> {
  const visible = new Set<string>();
  const logicallyHidden = new Set<string>();

  for (const field of fields) {
    let shown = true;
    const logic = field.logic;
    if (logic && logic.conditions?.length) {
      const results = logic.conditions
        .filter((c) => c.fieldId && c.fieldId !== field.field_id)
        .map((c) => evaluateCondition(c, logicallyHidden.has(c.fieldId) ? undefined : values[c.fieldId]));
      if (results.length) {
        const matched = logic.match === "any" ? results.some(Boolean) : results.every(Boolean);
        shown = logic.action === "show" ? matched : !matched;
      }
    }
    if (!shown) {
      logicallyHidden.add(field.field_id);
      continue;
    }
    if (!field.settings?.hidden) visible.add(field.field_id);
  }
  return visible;
}

/** Fields whose values should be accepted/stored: visible ones + hidden-by-config ones (not hidden by logic). */
export function computeActiveFields(fields: FormField[], values: AnswerMap): Set<string> {
  const visible = computeVisibleFields(fields, values);
  const active = new Set(visible);
  // Fields hidden by configuration (not logic) are still active.
  const configHidden = fields.filter((f) => f.settings?.hidden);
  if (configHidden.length) {
    const withoutHiddenFlag = fields.map((f) => (f.settings?.hidden ? { ...f, settings: { ...f.settings, hidden: false } } : f));
    const logicVisible = computeVisibleFields(withoutHiddenFlag, values);
    for (const f of configHidden) if (logicVisible.has(f.field_id)) active.add(f.field_id);
  }
  return active;
}
