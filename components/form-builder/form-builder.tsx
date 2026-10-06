"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { AlertCircle, ArrowLeft, Check, CloudOff, Eye, Loader2, Redo2, Rocket, Save, Sheet, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { FormStatusBadge } from "@/components/admin/status-badges";
import { createField, makeFieldId } from "@/lib/forms/field-registry";
import { useHistory } from "@/hooks/use-history";
import { cn } from "@/lib/utils";
import type { FieldType, FormField, FormStatus } from "@/types/forms";
import type { SheetConnectionStatus } from "@/types/db";
import { saveBuilderAction, setFormStatusAction } from "@/app/admin/(console)/forms/actions";
import { FieldPalette, PaletteDragPreview } from "./palette";
import { BuilderCanvas } from "./canvas";
import { PropertiesPanel } from "./properties-panel";

type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict";
const AUTOSAVE_MS = 1000;

export function FormBuilder({
  form,
  initialFields,
  sheetStatus,
  publicUrl,
}: {
  form: { id: string; name: string; description: string | null; status: FormStatus; version: number; slug: string };
  initialFields: FormField[];
  sheetStatus: SheetConnectionStatus | null;
  publicUrl: string;
}) {
  const router = useRouter();
  // Stable id keeps dnd-kit's generated aria ids identical on server and client (no hydration mismatch).
  const dndId = useId();
  const history = useHistory<FormField[]>(initialFields);
  const fields = history.value;
  const [selectedId, setSelectedId] = useState<string | null>(initialFields[0]?.field_id ?? null);
  const [syncState, setSyncState] = useState<"idle" | "saving" | "error" | "conflict">("idle");
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(initialFields));
  const [status, setStatus] = useState<FormStatus>(form.status);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [dragType, setDragType] = useState<FieldType | null>(null);
  const [mobilePanel, setMobilePanel] = useState<"fields" | "canvas" | "properties">("canvas");

  const version = useRef(form.version);
  const lastSaved = useRef(savedJson);
  const saving = useRef<Promise<boolean> | null>(null);
  const failedJson = useRef<string | null>(null);
  const latest = useRef(fields);
  const currentJson = useMemo(() => JSON.stringify(fields), [fields]);
  const dirty = currentJson !== savedJson;
  const saveState: SaveState = syncState === "idle" ? (dirty ? "dirty" : "saved") : syncState;

  useEffect(() => {
    latest.current = fields;
  }, [fields]);

  const save = useCallback(async (): Promise<boolean> => {
    if (saving.current) await saving.current;
    const snapshot = latest.current;
    const serialized = JSON.stringify(snapshot);
    if (serialized === lastSaved.current) return true;
    setSyncState("saving");
    const run = (async () => {
      const res = await saveBuilderAction({ formId: form.id, expectedVersion: version.current, fields: snapshot });
      if (res.ok) {
        version.current = res.data.version;
        lastSaved.current = serialized;
        setSavedJson(serialized);
        setSyncState("idle");
        return true;
      }
      failedJson.current = serialized;
      setSyncState(res.error.includes("another tab") ? "conflict" : "error");
      toast.error(res.error);
      return false;
    })();
    saving.current = run;
    const ok = await run;
    saving.current = null;
    return ok;
  }, [form.id]);

  // Debounced autosave (never on every keystroke).
  useEffect(() => {
    // Don't hammer the server: a failed snapshot is only retried after another edit (or manual Save).
    if (!dirty || syncState === "conflict" || syncState === "saving" || failedJson.current === currentJson) return;
    const t = setTimeout(() => void save(), AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [currentJson, dirty, syncState, save]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (JSON.stringify(latest.current) !== lastSaved.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // Keyboard shortcuts: Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z, Ctrl/Cmd+S
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const target = e.target as HTMLElement;
      const typing = target.closest("input, textarea, select, [contenteditable]");
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      } else if (e.key.toLowerCase() === "z" && !typing) {
        e.preventDefault();
        if (e.shiftKey) history.redo();
        else history.undo();
      } else if (e.key.toLowerCase() === "y" && !typing) {
        e.preventDefault();
        history.redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [history, save]);

  const selected = fields.find((f) => f.field_id === selectedId) ?? null;

  const addField = (type: FieldType, index?: number) => {
    const field = createField(type, fields.map((f) => f.field_id));
    history.set((prev) => {
      const next = [...prev];
      next.splice(index ?? next.length, 0, field);
      return next;
    });
    setSelectedId(field.field_id);
    setMobilePanel("properties");
  };

  const updateField = (patch: Partial<FormField>) => {
    if (!selectedId) return;
    history.set(
      (prev) => prev.map((f) => (f.field_id === selectedId ? { ...f, ...patch } : f)),
      `${selectedId}:${Object.keys(patch).join(",")}`,
    );
  };

  const duplicateField = (id: string) => {
    const idx = fields.findIndex((f) => f.field_id === id);
    if (idx < 0) return;
    const src = fields[idx]!;
    const copy: FormField = structuredClone({ ...src, field_id: makeFieldId(src.field_id, fields.map((f) => f.field_id)), label: src.label ? `${src.label} (copy)` : src.label });
    history.set((prev) => [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)]);
    setSelectedId(copy.field_id);
  };

  const deleteField = (id: string) => {
    const idx = fields.findIndex((f) => f.field_id === id);
    history.set((prev) =>
      prev
        .filter((f) => f.field_id !== id)
        // Drop logic conditions that referenced the deleted field.
        .map((f) =>
          f.logic?.conditions.some((c) => c.fieldId === id)
            ? { ...f, logic: f.logic.conditions.filter((c) => c.fieldId !== id).length ? { ...f.logic, conditions: f.logic.conditions.filter((c) => c.fieldId !== id) } : null }
            : f,
        ),
    );
    if (selectedId === id) setSelectedId(fields[idx + 1]?.field_id ?? fields[idx - 1]?.field_id ?? null);
    toast("Field deleted", { action: { label: "Undo", onClick: () => history.undo() } });
  };

  const moveField = (id: string, dir: -1 | 1) => {
    const idx = fields.findIndex((f) => f.field_id === id);
    const to = idx + dir;
    if (idx < 0 || to < 0 || to >= fields.length) return;
    history.set((prev) => arrayMove(prev, idx, to));
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as { from?: string; type?: FieldType } | undefined;
    if (data?.from === "palette" && data.type) setDragType(data.type);
  };

  const onDragEnd = (e: DragEndEvent) => {
    setDragType(null);
    const { active, over } = e;
    if (!over) return;
    const data = active.data.current as { from?: string; type?: FieldType } | undefined;
    if (data?.from === "palette" && data.type) {
      const overIdx = fields.findIndex((f) => f.field_id === over.id);
      addField(data.type, overIdx >= 0 ? overIdx : fields.length);
      return;
    }
    if (active.id !== over.id) {
      const from = fields.findIndex((f) => f.field_id === active.id);
      const to = fields.findIndex((f) => f.field_id === over.id);
      if (from >= 0 && to >= 0) history.set((prev) => arrayMove(prev, from, to));
    }
  };

  const publish = async () => {
    if (!(await save())) return;
    const res = await setFormStatusAction(form.id, "published");
    if (res.ok) {
      setStatus("published");
      toast.success("Form published", { description: publicUrl });
      router.refresh();
    } else toast.error(res.error);
  };

  const saveIndicator = {
    saved: { icon: <Check className="size-3.5" />, text: "Saved", cls: "text-emerald-700" },
    dirty: { icon: <span className="size-2 rounded-full bg-amber-500" />, text: "Unsaved", cls: "text-amber-700" },
    saving: { icon: <Loader2 className="size-3.5 animate-spin" />, text: "Saving...", cls: "text-muted-foreground" },
    error: { icon: <CloudOff className="size-3.5" />, text: "Save failed", cls: "text-destructive" },
    conflict: { icon: <AlertCircle className="size-3.5" />, text: "Out of date", cls: "text-destructive" },
  }[saveState];

  return (
    <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragType(null)}>
      <div className="flex h-dvh flex-col bg-background">
        {/* Top bar */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card px-3 sm:px-4">
          <Button asChild variant="ghost" size="icon-sm" aria-label="Back to form">
            <Link href={`/admin/forms/${form.id}`}>
              <ArrowLeft />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-sm font-semibold sm:text-base">{form.name}</h1>
              <span className="hidden sm:inline-flex">
                <FormStatusBadge status={status} />
              </span>
            </div>
            <p role="status" aria-live="polite" className={cn("flex items-center gap-1 text-xs", saveIndicator.cls)}>
              {saveIndicator.icon}
              {saveIndicator.text}
            </p>
          </div>
          <Link
            href={`/admin/forms/${form.id}/settings?tab=integrations`}
            className="hidden items-center gap-1.5 rounded-md px-2 py-1 text-xs hover:bg-muted md:flex"
            title="Google Sheets integration"
          >
            <Sheet className="size-4 text-emerald-700" aria-hidden />
            <span className="text-muted-foreground">Google Sheets</span>
            {sheetStatus === "connected" ? (
              <Badge variant="success">✓ Connected</Badge>
            ) : sheetStatus === "reauth_required" || sheetStatus === "error" ? (
              <Badge variant="destructive">Needs attention</Badge>
            ) : (
              <Badge variant="outline">Not Connected · Connect</Badge>
            )}
          </Link>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" onClick={history.undo} disabled={!history.canUndo} aria-label="Undo" title="Undo (Ctrl+Z)">
              <Undo2 />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={history.redo} disabled={!history.canRedo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
              <Redo2 />
            </Button>
            {saveState === "conflict" ? (
              <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                Reload
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => void save()} disabled={saveState === "saving"} className="hidden sm:inline-flex">
                <Save /> Save
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                if (await save()) router.push(`/admin/forms/${form.id}/preview`);
              }}
            >
              <Eye /> <span className="hidden sm:inline">Preview</span>
            </Button>
            {status !== "published" ? (
              <Button size="sm" onClick={() => setConfirmPublish(true)}>
                <Rocket /> <span className="hidden sm:inline">Publish</span>
              </Button>
            ) : (
              <Button asChild size="sm" variant="secondary">
                <a href={publicUrl} target="_blank" rel="noreferrer">Live</a>
              </Button>
            )}
          </div>
        </header>

        {/* Mobile panel switcher */}
        <div className="flex border-b bg-card lg:hidden" role="tablist" aria-label="Builder panels">
          {(["fields", "canvas", "properties"] as const).map((p) => (
            <button
              key={p}
              role="tab"
              aria-selected={mobilePanel === p}
              onClick={() => setMobilePanel(p)}
              className={cn("flex-1 py-2.5 text-sm font-medium capitalize", mobilePanel === p ? "border-b-2 border-primary text-foreground" : "text-muted-foreground")}
            >
              {p === "fields" ? "Add fields" : p}
            </button>
          ))}
        </div>

        <div className="flex min-h-0 flex-1">
          <aside aria-label="Field types" className={cn("w-full shrink-0 overflow-y-auto border-r bg-slate-50/80 p-3 lg:block lg:w-64", mobilePanel === "fields" ? "block" : "hidden")}>
            <FieldPalette
              onAdd={(t) => {
                const idx = selectedId ? fields.findIndex((f) => f.field_id === selectedId) + 1 : undefined;
                addField(t, idx && idx > 0 ? idx : undefined);
              }}
            />
          </aside>
          <section aria-label="Form canvas" className={cn("min-w-0 flex-1 overflow-y-auto bg-slate-100/70 px-3 py-6 sm:px-6 lg:block", mobilePanel === "canvas" ? "block" : "hidden")}>
            <BuilderCanvas
              fields={fields}
              selectedId={selectedId}
              onSelect={(id) => {
                setSelectedId(id);
                if (window.matchMedia("(max-width: 1023px)").matches) setMobilePanel("properties");
              }}
              onDuplicate={duplicateField}
              onDelete={deleteField}
              onMove={moveField}
              formName={form.name}
              formDescription={form.description}
            />
          </section>
          <aside aria-label="Field properties" className={cn("w-full shrink-0 overflow-y-auto border-l bg-card lg:block lg:w-80", mobilePanel === "properties" ? "block" : "hidden")}>
            <PropertiesPanel field={selected} fields={fields} onChange={updateField} />
          </aside>
        </div>
      </div>
      <DragOverlay dropAnimation={null}>{dragType ? <PaletteDragPreview type={dragType} /> : null}</DragOverlay>
      <ConfirmDialog
        open={confirmPublish}
        onOpenChange={setConfirmPublish}
        title="Publish Form?"
        description={<p>This form will become available publicly.</p>}
        confirmLabel="Publish"
        onConfirm={() => void publish()}
      />
    </DndContext>
  );
}
