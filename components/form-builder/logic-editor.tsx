"use client";

import { GitBranch, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { hasOptions, isInputType } from "@/lib/forms/field-registry";
import type { FieldLogic, FormField, LogicOperator } from "@/types/forms";

const OPERATORS: { id: LogicOperator; label: string; needsValue: boolean }[] = [
  { id: "equals", label: "is / equals", needsValue: true },
  { id: "not_equals", label: "is not", needsValue: true },
  { id: "contains", label: "contains", needsValue: true },
  { id: "not_contains", label: "does not contain", needsValue: true },
  { id: "is_empty", label: "is empty", needsValue: false },
  { id: "is_not_empty", label: "is not empty", needsValue: false },
  { id: "greater_than", label: "is greater than", needsValue: true },
  { id: "less_than", label: "is less than", needsValue: true },
];

function valueOptions(source: FormField | undefined): string[] | null {
  if (!source) return null;
  if (source.type === "yes_no") return ["Yes", "No"];
  if (hasOptions(source.type)) return source.settings.options ?? [];
  return null;
}

/** IF field X (is / is not / contains / equals) value THEN show / hide this field. */
export function LogicEditor({ field, fields, onChange }: { field: FormField; fields: FormField[]; onChange: (logic: FieldLogic | null) => void }) {
  const idx = fields.findIndex((f) => f.field_id === field.field_id);
  // Only earlier input fields can drive logic (prevents cycles, matches respondent flow).
  const sources = fields.slice(0, idx).filter((f) => isInputType(f.type) && f.type !== "signature" && f.type !== "file_upload");
  const logic = field.logic;

  if (!logic || !logic.conditions.length) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-center">
        <GitBranch className="mx-auto mb-2 size-5 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">Show or hide this field based on earlier answers.</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          disabled={!sources.length}
          onClick={() => onChange({ action: "show", match: "all", conditions: [{ fieldId: sources[sources.length - 1]!.field_id, operator: "equals", value: "" }] })}
        >
          <Plus /> Add condition
        </Button>
        {!sources.length && <p className="mt-2 text-xs text-muted-foreground">Add a question above this field first.</p>}
      </div>
    );
  }

  const update = (patch: Partial<FieldLogic>) => onChange({ ...logic, ...patch });
  const updateCond = (i: number, patch: Partial<FieldLogic["conditions"][number]>) =>
    update({ conditions: logic.conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <NativeSelect aria-label="Action" value={logic.action} onChange={(e) => update({ action: e.target.value as "show" | "hide" })} className="h-8 w-24 text-sm">
          <option value="show">Show</option>
          <option value="hide">Hide</option>
        </NativeSelect>
        <span>this field when</span>
        <NativeSelect aria-label="Match" value={logic.match} onChange={(e) => update({ match: e.target.value as "all" | "any" })} className="h-8 w-20 text-sm">
          <option value="all">all</option>
          <option value="any">any</option>
        </NativeSelect>
        <span>match:</span>
      </div>
      {logic.conditions.map((c, i) => {
        const source = fields.find((f) => f.field_id === c.fieldId);
        const op = OPERATORS.find((o) => o.id === c.operator);
        const opts = valueOptions(source);
        return (
          <div key={i} className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">IF</span>
              <NativeSelect aria-label="Field" value={c.fieldId} onChange={(e) => updateCond(i, { fieldId: e.target.value, value: "" })} className="h-8 text-sm">
                {!source && <option value={c.fieldId}>(removed field)</option>}
                {sources.map((s) => (
                  <option key={s.field_id} value={s.field_id}>{s.label || s.field_id}</option>
                ))}
              </NativeSelect>
              <button type="button" onClick={() => update({ conditions: logic.conditions.filter((_, j) => j !== i) })} className="rounded p-1 text-muted-foreground hover:text-destructive" aria-label="Remove condition">
                <Trash2 className="size-4" />
              </button>
            </div>
            <NativeSelect aria-label="Operator" value={c.operator} onChange={(e) => updateCond(i, { operator: e.target.value as LogicOperator })} className="h-8 text-sm">
              {OPERATORS.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </NativeSelect>
            {op?.needsValue &&
              (opts ? (
                <NativeSelect aria-label="Value" value={c.value ?? ""} onChange={(e) => updateCond(i, { value: e.target.value })} className="h-8 text-sm">
                  <option value="">Select value…</option>
                  {opts.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </NativeSelect>
              ) : (
                <Input aria-label="Value" value={c.value ?? ""} onChange={(e) => updateCond(i, { value: e.target.value })} className="h-8 text-sm" placeholder="Value" />
              ))}
          </div>
        );
      })}
      <div className="flex justify-between">
        <Button type="button" variant="ghost" size="sm" disabled={logic.conditions.length >= 10 || !sources.length} onClick={() => update({ conditions: [...logic.conditions, { fieldId: sources[0]!.field_id, operator: "equals", value: "" }] })}>
          <Plus /> Add condition
        </Button>
        <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => onChange(null)}>
          Remove logic
        </Button>
      </div>
    </div>
  );
}
