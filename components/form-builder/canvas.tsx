"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, Copy, EyeOff, GitBranch, GripVertical, MousePointerClick, Trash2 } from "lucide-react";
import { FieldInput } from "@/components/form-fields/field-input";
import { FIELD_TYPE_META, isInputType } from "@/lib/forms/field-registry";
import { cn } from "@/lib/utils";
import type { FormField } from "@/types/forms";

function SortableField({
  field,
  index,
  total,
  selected,
  onSelect,
  onDuplicate,
  onDelete,
  onMove,
}: {
  field: FormField;
  index: number;
  total: number;
  selected: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: field.field_id,
    data: { from: "canvas" },
  });

  const label = field.label || FIELD_TYPE_META[field.type].label;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group relative rounded-xl border bg-card transition-shadow",
        selected ? "border-primary ring-2 ring-primary/20" : "hover:border-slate-300 hover:shadow-sm",
        isDragging && "z-10 opacity-60 shadow-lg",
        field.type === "section" && "border-dashed bg-slate-50",
      )}
    >
      <div className="flex items-center gap-1 border-b border-transparent px-2 pt-2 group-hover:border-border/50">
        <button
          ref={setActivatorNodeRef}
          {...listeners}
          {...attributes}
          type="button"
          className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"
          aria-label={`Drag to reorder ${label}`}
        >
          <GripVertical className="size-4" />
        </button>
        <span className="truncate text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{FIELD_TYPE_META[field.type].label}</span>
        {field.required && <span className="text-[11px] font-medium text-red-600">Required</span>}
        {field.settings.hidden && <EyeOff className="size-3.5 text-muted-foreground" aria-label="Hidden field" />}
        {field.logic?.conditions?.length ? <GitBranch className="size-3.5 text-violet-600" aria-label="Has conditional logic" /> : null}
        <div className={cn("ml-auto flex items-center gap-0.5 transition-opacity", selected ? "opacity-100" : "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100")}>
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0} className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label="Move up">
            <ArrowUp className="size-4" />
          </button>
          <button type="button" onClick={() => onMove(1)} disabled={index === total - 1} className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label="Move down">
            <ArrowDown className="size-4" />
          </button>
          <button type="button" onClick={onDuplicate} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Duplicate field">
            <Copy className="size-4" />
          </button>
          <button type="button" onClick={onDelete} className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-destructive" aria-label="Delete field">
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
      {/* Clicking anywhere on the preview selects the field; the preview itself is inert. */}
      <button type="button" onClick={onSelect} className="block w-full cursor-pointer px-4 pt-2 pb-4 text-left" aria-label={`Edit ${label}`} aria-pressed={selected}>
        <div inert className="pointer-events-none">
          {field.type === "section" ? (
            <div>
              <p className="text-base font-semibold">{field.label || "Section"}</p>
              {field.description && <p className="text-sm text-muted-foreground">{field.description}</p>}
              <p className="mt-1 text-xs text-muted-foreground">Page break — the form continues on a new step</p>
            </div>
          ) : (
            <FieldInput field={{ ...field, label: field.label || (isInputType(field.type) ? "Untitled question" : field.label) }} value={undefined} onChange={() => undefined} uploadUrl={null} />
          )}
        </div>
      </button>
    </div>
  );
}

export function BuilderCanvas({
  fields,
  selectedId,
  onSelect,
  onDuplicate,
  onDelete,
  onMove,
  formName,
  formDescription,
}: {
  fields: FormField[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  formName: string;
  formDescription: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "canvas" });
  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-4 rounded-xl border bg-card px-5 py-5">
        <h2 className="text-xl font-semibold">{formName}</h2>
        {formDescription && <p className="mt-1 text-sm text-muted-foreground">{formDescription}</p>}
      </div>
      <SortableContext items={fields.map((f) => f.field_id)} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={cn("min-h-64 space-y-3 rounded-xl pb-24 transition-colors", isOver && "bg-accent/60 ring-2 ring-primary/30 ring-dashed", fields.length === 0 && "border-2 border-dashed")}
        >
          {fields.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center text-muted-foreground">
              <MousePointerClick className="mb-3 size-8" aria-hidden />
              <p className="font-medium text-foreground">Start building your form</p>
              <p className="mt-1 text-sm">Drag a field here, or click a field type to add it.</p>
            </div>
          ) : (
            fields.map((f, i) => (
              <SortableField
                key={f.field_id}
                field={f}
                index={i}
                total={fields.length}
                selected={selectedId === f.field_id}
                onSelect={() => onSelect(f.field_id)}
                onDuplicate={() => onDuplicate(f.field_id)}
                onDelete={() => onDelete(f.field_id)}
                onMove={(d) => onMove(f.field_id, d)}
              />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  );
}
