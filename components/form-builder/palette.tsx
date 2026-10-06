"use client";

import { useDraggable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { FIELD_CATEGORIES, FIELD_TYPE_META } from "@/lib/forms/field-registry";
import { FIELD_TYPES, type FieldType } from "@/types/forms";
import { cn } from "@/lib/utils";
import { FIELD_ICONS } from "./field-icons";

function PaletteItem({ type, onAdd }: { type: FieldType; onAdd: (t: FieldType) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `palette:${type}`, data: { from: "palette", type } });
  const meta = FIELD_TYPE_META[type];
  const Icon = FIELD_ICONS[type];
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      role="button"
      tabIndex={0}
      aria-label={`Add ${meta.label}`}
      onClick={() => onAdd(type)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onAdd(type);
        }
      }}
      className={cn(
        "group flex cursor-grab touch-none items-center gap-2.5 rounded-lg border border-transparent bg-card px-2.5 py-2 text-sm transition hover:border-border hover:shadow-sm active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
      title={meta.hint}
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent text-primary">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="flex-1 truncate font-medium">{meta.label}</span>
      <Plus className="size-4 text-muted-foreground opacity-0 transition group-hover:opacity-100" aria-hidden />
    </div>
  );
}

export function FieldPalette({ onAdd }: { onAdd: (t: FieldType) => void }) {
  return (
    <div className="space-y-5">
      {FIELD_CATEGORIES.map((cat) => (
        <section key={cat.id}>
          <h3 className="mb-1.5 px-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{cat.label}</h3>
          <div className="grid gap-0.5">
            {FIELD_TYPES.filter((t) => FIELD_TYPE_META[t].category === cat.id).map((t) => (
              <PaletteItem key={t} type={t} onAdd={onAdd} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function PaletteDragPreview({ type }: { type: FieldType }) {
  const Icon = FIELD_ICONS[type];
  return (
    <div className="flex w-56 items-center gap-2.5 rounded-lg border bg-card px-3 py-2 text-sm font-medium shadow-xl">
      <span className="flex size-7 items-center justify-center rounded-md bg-accent text-primary">
        <Icon className="size-4" aria-hidden />
      </span>
      {FIELD_TYPE_META[type].label}
    </div>
  );
}
