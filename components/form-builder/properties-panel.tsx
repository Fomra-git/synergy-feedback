"use client";

import { useState } from "react";
import { Columns3, GripVertical, Plus, Rows3, Settings2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FIELD_TYPE_META, hasOptions, isInputType, isTextLike } from "@/lib/forms/field-registry";
import type { FieldSettings, FieldValidation, FormField } from "@/types/forms";
import { LogicEditor } from "./logic-editor";

function num(v: string): number | undefined {
  if (v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="space-y-1.5">{children}</div>;
}

function ToggleRow({ id, label, hint, checked, onChange }: { id: string; label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <Label htmlFor={id}>{label}</Label>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function OptionsEditor({ options, onChange }: { options: string[]; onChange: (o: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v || options.includes(v)) return;
    onChange([...options, v]);
    setDraft("");
  };
  return (
    <div className="space-y-2">
      <ul className="space-y-1.5">
        {options.map((o, i) => (
          <li key={i} className="flex items-center gap-1.5">
            <GripVertical className="size-4 text-muted-foreground/50" aria-hidden />
            <Input
              value={o}
              aria-label={`Option ${i + 1}`}
              className="h-8 text-sm"
              onChange={(e) => onChange(options.map((x, j) => (j === i ? e.target.value : x)))}
            />
            <button
              type="button"
              disabled={i === 0}
              onClick={() => {
                const next = [...options];
                [next[i - 1], next[i]] = [next[i]!, next[i - 1]!];
                onChange(next);
              }}
              className="rounded p-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-30"
              aria-label="Move option up"
            >
              ↑
            </button>
            <button type="button" onClick={() => onChange(options.filter((_, j) => j !== i))} className="rounded p-1 text-muted-foreground hover:text-destructive" aria-label={`Remove option ${o}`}>
              <X className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-1.5">
        <Input
          value={draft}
          placeholder="Add option"
          aria-label="New option"
          className="h-8 text-sm"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (text.includes("\n")) {
              e.preventDefault();
              const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
              onChange(Array.from(new Set([...options, ...lines])));
            }
          }}
        />
        <button type="button" onClick={add} className="flex size-8 shrink-0 items-center justify-center rounded-md border hover:bg-muted" aria-label="Add option">
          <Plus className="size-4" />
        </button>
      </div>
      <p className="text-xs text-muted-foreground">Tip: paste a list (one per line) to add many options.</p>
    </div>
  );
}

export function PropertiesPanel({
  field,
  fields,
  onChange,
}: {
  field: FormField | null;
  fields: FormField[];
  onChange: (patch: Partial<FormField>) => void;
}) {
  if (!field) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center text-muted-foreground">
        <Settings2 className="mb-3 size-8" aria-hidden />
        <p className="font-medium text-foreground">No field selected</p>
        <p className="mt-1 text-sm">Select a field on the canvas to edit its properties.</p>
      </div>
    );
  }

  const s = field.settings;
  const v = field.validation;
  const setS = (patch: Partial<FieldSettings>) => onChange({ settings: { ...s, ...patch } });
  const setV = (patch: Partial<FieldValidation>) => onChange({ validation: { ...v, ...patch } });
  const input = isInputType(field.type);
  const id = (k: string) => `prop-${field.field_id}-${k}`;

  return (
    <div className="p-4">
      <div className="mb-4">
        <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{FIELD_TYPE_META[field.type].label}</p>
        <p className="truncate font-mono text-xs text-muted-foreground" title="Field key (stable — used in submissions and Google Sheets mapping)">
          key: {field.field_id}
        </p>
      </div>
      <Tabs defaultValue="general">
        <TabsList className="w-full">
          <TabsTrigger value="general" className="flex-1">General</TabsTrigger>
          {input && <TabsTrigger value="validation" className="flex-1">Validation</TabsTrigger>}
          <TabsTrigger value="logic" className="flex-1">Logic</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          {field.type !== "divider" && (
            <Row>
              <Label htmlFor={id("label")}>{field.type === "heading" || field.type === "section" ? "Title" : field.type === "paragraph" ? "Title (optional)" : "Label"}</Label>
              <Input id={id("label")} value={field.label} onChange={(e) => onChange({ label: e.target.value })} />
            </Row>
          )}
          {field.type !== "divider" && (
            <Row>
              <Label htmlFor={id("desc")}>{field.type === "paragraph" ? "Text" : "Description"}</Label>
              <Textarea id={id("desc")} rows={field.type === "paragraph" ? 5 : 2} value={field.description ?? ""} onChange={(e) => onChange({ description: e.target.value })} />
            </Row>
          )}
          {field.type === "heading" && (
            <Row>
              <Label htmlFor={id("level")}>Size</Label>
              <NativeSelect id={id("level")} value={s.level ?? 2} onChange={(e) => setS({ level: Number(e.target.value) as 1 | 2 | 3 })}>
                <option value={1}>Large</option>
                <option value={2}>Medium</option>
                <option value={3}>Small</option>
              </NativeSelect>
            </Row>
          )}
          {input && (
            <>
              {(isTextLike(field.type) || field.type === "number" || field.type === "dropdown") && (
                <Row>
                  <Label htmlFor={id("ph")}>Placeholder</Label>
                  <Input id={id("ph")} value={field.placeholder ?? ""} onChange={(e) => onChange({ placeholder: e.target.value })} />
                </Row>
              )}
              <Row>
                <Label htmlFor={id("help")}>Help text</Label>
                <Input id={id("help")} value={s.helpText ?? ""} onChange={(e) => setS({ helpText: e.target.value })} />
              </Row>
              {hasOptions(field.type) && (
                <Row>
                  <Label>Options</Label>
                  <OptionsEditor options={s.options ?? []} onChange={(options) => setS({ options })} />
                </Row>
              )}
              {(field.type === "radio" || field.type === "checkbox") && (
                <Row>
                  <Label>Options layout</Label>
                  <div role="radiogroup" aria-label="Options layout" className="grid grid-cols-2 gap-2">
                    {(["vertical", "horizontal"] as const).map((l) => {
                      const active = (s.optionsLayout ?? "vertical") === l;
                      return (
                        <button
                          key={l}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => setS({ optionsLayout: l })}
                          className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm capitalize transition ${active ? "border-primary bg-accent font-medium text-accent-foreground" : "hover:bg-muted"}`}
                        >
                          {l === "vertical" ? <Rows3 className="size-4" aria-hidden /> : <Columns3 className="size-4" aria-hidden />}
                          {l}
                        </button>
                      );
                    })}
                  </div>
                </Row>
              )}
              {(field.type === "rating" || field.type === "star_rating") && (
                <Row>
                  <Label htmlFor={id("max")}>Maximum</Label>
                  <NativeSelect id={id("max")} value={s.max ?? (field.type === "star_rating" ? 5 : 10)} onChange={(e) => setS({ max: Number(e.target.value) })}>
                    {(field.type === "star_rating" ? [3, 4, 5, 6, 7, 10] : [3, 4, 5, 7, 10]).map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </NativeSelect>
                </Row>
              )}
              {field.type === "linear_scale" && (
                <div className="grid grid-cols-2 gap-3">
                  <Row>
                    <Label htmlFor={id("min")}>From</Label>
                    <NativeSelect id={id("min")} value={s.min ?? 0} onChange={(e) => setS({ min: Number(e.target.value) })}>
                      <option value={0}>0</option>
                      <option value={1}>1</option>
                    </NativeSelect>
                  </Row>
                  <Row>
                    <Label htmlFor={id("smax")}>To</Label>
                    <NativeSelect id={id("smax")} value={s.max ?? 10} onChange={(e) => setS({ max: Number(e.target.value) })}>
                      {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </NativeSelect>
                  </Row>
                  <Row>
                    <Label htmlFor={id("minl")}>Low label</Label>
                    <Input id={id("minl")} value={s.minLabel ?? ""} onChange={(e) => setS({ minLabel: e.target.value })} />
                  </Row>
                  <Row>
                    <Label htmlFor={id("maxl")}>High label</Label>
                    <Input id={id("maxl")} value={s.maxLabel ?? ""} onChange={(e) => setS({ maxLabel: e.target.value })} />
                  </Row>
                </div>
              )}
              {field.type === "file_upload" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Row>
                      <Label htmlFor={id("mf")}>Max files</Label>
                      <NativeSelect id={id("mf")} value={s.maxFiles ?? 1} onChange={(e) => setS({ maxFiles: Number(e.target.value) })}>
                        {[1, 2, 3, 5, 10].map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </NativeSelect>
                    </Row>
                    <Row>
                      <Label htmlFor={id("ms")}>Max size (MB)</Label>
                      <NativeSelect id={id("ms")} value={s.maxSizeMb ?? 5} onChange={(e) => setS({ maxSizeMb: Number(e.target.value) })}>
                        {[1, 2, 5, 10].map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </NativeSelect>
                    </Row>
                  </div>
                  <Row>
                    <Label>Allowed types</Label>
                    {(["image", "pdf", "document"] as const).map((cat) => {
                      const acc = s.accept ?? ["image", "pdf"];
                      return (
                        <label key={cat} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="size-4 accent-[var(--primary)]"
                            checked={acc.includes(cat)}
                            onChange={(e) => {
                              const next = e.target.checked ? [...acc, cat] : acc.filter((x) => x !== cat);
                              if (next.length) setS({ accept: next });
                            }}
                          />
                          {cat === "image" ? "Images (JPG, PNG, HEIC…)" : cat === "pdf" ? "PDF" : "Documents (DOC, DOCX, TXT)"}
                        </label>
                      );
                    })}
                  </Row>
                </>
              )}
              {field.type !== "file_upload" && field.type !== "signature" && (
                <Row>
                  <Label htmlFor={id("def")}>Default value</Label>
                  <Input id={id("def")} value={s.defaultValue ?? ""} onChange={(e) => setS({ defaultValue: e.target.value })} placeholder={hasOptions(field.type) ? "Must match an option" : ""} />
                </Row>
              )}
              <Row>
                <Label htmlFor={id("width")}>Width (desktop)</Label>
                <NativeSelect id={id("width")} value={s.width ?? "full"} onChange={(e) => setS({ width: e.target.value as "full" | "half" })}>
                  <option value="full">Full width</option>
                  <option value="half">Half width</option>
                </NativeSelect>
              </Row>
              <div className="space-y-3 border-t pt-4">
                <ToggleRow id={id("req")} label="Required" checked={field.required} onChange={(required) => onChange({ required })} />
                <ToggleRow id={id("hid")} label="Hidden" hint="Not shown; submits its default or URL value" checked={!!s.hidden} onChange={(hidden) => setS({ hidden })} />
              </div>
              {s.hidden && (
                <Row>
                  <Label htmlFor={id("pp")}>Pre-fill from URL parameter</Label>
                  <Input id={id("pp")} value={s.prefillParam ?? ""} placeholder="e.g. source" onChange={(e) => setS({ prefillParam: e.target.value.replace(/[^a-zA-Z0-9_-]/g, "") })} />
                </Row>
              )}
            </>
          )}
        </TabsContent>

        {input && (
          <TabsContent value="validation" className="space-y-4">
            {(isTextLike(field.type) || field.type === "long_text") && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Row>
                    <Label htmlFor={id("minlen")}>Min length</Label>
                    <Input id={id("minlen")} type="number" min={0} value={v.minLength ?? ""} onChange={(e) => setV({ minLength: num(e.target.value) })} />
                  </Row>
                  <Row>
                    <Label htmlFor={id("maxlen")}>Max length</Label>
                    <Input id={id("maxlen")} type="number" min={1} value={v.maxLength ?? ""} onChange={(e) => setV({ maxLength: num(e.target.value) })} />
                  </Row>
                </div>
                <Row>
                  <Label htmlFor={id("re")}>Pattern (regular expression)</Label>
                  <Input id={id("re")} className="font-mono text-xs" value={v.pattern ?? ""} placeholder="e.g. [0-9]{6}" onChange={(e) => setV({ pattern: e.target.value })} />
                </Row>
                <Row>
                  <Label htmlFor={id("rem")}>Pattern error message</Label>
                  <Input id={id("rem")} value={v.patternMessage ?? ""} placeholder="Please enter a 6-digit PIN code" onChange={(e) => setV({ patternMessage: e.target.value })} />
                </Row>
              </>
            )}
            {(field.type === "number" || field.type === "checkbox" || field.type === "multi_select") && (
              <div className="grid grid-cols-2 gap-3">
                <Row>
                  <Label htmlFor={id("vmin")}>{field.type === "number" ? "Minimum value" : "Min selections"}</Label>
                  <Input id={id("vmin")} type="number" value={v.min ?? ""} onChange={(e) => setV({ min: num(e.target.value) })} />
                </Row>
                <Row>
                  <Label htmlFor={id("vmax")}>{field.type === "number" ? "Maximum value" : "Max selections"}</Label>
                  <Input id={id("vmax")} type="number" value={v.max ?? ""} onChange={(e) => setV({ max: num(e.target.value) })} />
                </Row>
              </div>
            )}
            {field.type === "email" && <p className="text-sm text-muted-foreground">Email addresses are always validated automatically.</p>}
            {field.type === "phone" && <p className="text-sm text-muted-foreground">Phone numbers are validated automatically (7–15 digits, optional + country code).</p>}
            {!isTextLike(field.type) && !["number", "checkbox", "multi_select", "long_text"].includes(field.type) && (
              <p className="text-sm text-muted-foreground">This field type is validated automatically based on its settings.</p>
            )}
          </TabsContent>
        )}

        <TabsContent value="logic">
          <LogicEditor field={field} fields={fields} onChange={(logic) => onChange({ logic })} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
