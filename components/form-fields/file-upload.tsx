"use client";

import { useRef, useState } from "react";
import { FileText, Loader2, Paperclip, X } from "lucide-react";
import { acceptAttribute } from "@/lib/security/files";
import type { FormField, UploadedFileRef } from "@/types/forms";

function formatSize(bytes: number) {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Uploads each file immediately to the server, which validates and stores it privately. */
export function FileUpload({
  field,
  value,
  onChange,
  uploadUrl,
  inputId,
  describedBy,
  invalid,
  disabled,
}: {
  field: FormField;
  value: UploadedFileRef[];
  onChange: (v: UploadedFileRef[]) => void;
  uploadUrl: string | null;
  inputId: string;
  describedBy?: string;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const maxFiles = field.settings.maxFiles ?? 1;
  const maxMb = field.settings.maxSizeMb ?? 5;
  const files = Array.isArray(value) ? value : [];

  async function handle(list: FileList | null) {
    if (!list?.length) return;
    setError(null);
    const room = maxFiles - files.length;
    const selected = Array.from(list).slice(0, room);
    const next = [...files];
    setBusy(true);
    for (const file of selected) {
      if (file.size > maxMb * 1024 * 1024) {
        setError(`${file.name} is larger than ${maxMb} MB.`);
        continue;
      }
      if (!uploadUrl) {
        // Admin preview: don't upload, just simulate.
        next.push({ token: "preview-token-not-uploaded", name: file.name, size: file.size, type: file.type });
        continue;
      }
      try {
        const body = new FormData();
        body.set("fieldId", field.field_id);
        body.set("file", file);
        const res = await fetch(uploadUrl, { method: "POST", body });
        const json = (await res.json()) as { file?: UploadedFileRef; error?: string };
        if (!res.ok || !json.file) setError(json.error ?? "Upload failed. Please try again.");
        else next.push(json.file);
      } catch {
        setError("Upload failed. Check your connection and try again.");
      }
    }
    setBusy(false);
    onChange(next);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-2">
      {files.length < maxFiles && (
        <label
          htmlFor={inputId}
          className={`flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed bg-white px-4 py-5 text-center text-sm transition-colors hover:bg-slate-50 ${invalid ? "border-red-400" : "border-slate-300"}`}
        >
          {busy ? <Loader2 className="size-5 animate-spin text-slate-500" aria-hidden /> : <Paperclip className="size-5 text-slate-500" aria-hidden />}
          <span className="font-medium text-slate-700">{busy ? "Uploading…" : "Tap to choose a file or take a photo"}</span>
          <span className="text-xs text-slate-500">
            Up to {maxFiles} file{maxFiles > 1 ? "s" : ""}, {maxMb} MB each
          </span>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            className="sr-only"
            accept={acceptAttribute(field.settings.accept)}
            multiple={maxFiles > 1}
            disabled={disabled || busy}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            onChange={(e) => handle(e.target.files)}
          />
        </label>
      )}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-3 rounded-lg border bg-white px-3 py-2 text-sm">
              <FileText className="size-4 shrink-0 text-slate-500" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="text-xs text-slate-500">{formatSize(f.size)}</span>
              <button
                type="button"
                onClick={() => onChange(files.filter((_, j) => j !== i))}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
                aria-label={`Remove ${f.name}`}
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
