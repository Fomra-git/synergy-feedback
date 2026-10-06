import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { signToken, verifyToken } from "@/lib/security/crypto";
import { allowedMimeTypes, contentMatchesMime, MAX_UPLOAD_BYTES, MIME_EXTENSION, sanitizeFileName } from "@/lib/security/files";
import type { FormField, StoredFileRef, UploadedFileRef } from "@/types/forms";

export const SUBMISSION_BUCKET = "submission-files";
const UPLOAD_TOKEN_TTL = 6 * 60 * 60; // 6 hours to finish the form

interface UploadTokenPayload extends Record<string, unknown> {
  p: string; // storage path
  f: string; // form id
  k: string; // field key
  n: string; // file name
  s: number; // size
  t: string; // mime type
}

export class UploadError extends Error {}

/** Validates and stores an uploaded file in a private "pending" area. */
export async function storePendingUpload(formId: string, field: FormField, file: File): Promise<UploadedFileRef> {
  if (field.type !== "file_upload") throw new UploadError("This field does not accept files.");
  const maxBytes = Math.min((field.settings.maxSizeMb ?? 5) * 1024 * 1024, MAX_UPLOAD_BYTES);
  if (file.size === 0) throw new UploadError("The file is empty.");
  if (file.size > maxBytes) throw new UploadError(`File must be smaller than ${Math.round(maxBytes / 1024 / 1024)} MB.`);

  const mime = file.type.toLowerCase();
  if (!allowedMimeTypes(field.settings.accept).includes(mime)) {
    throw new UploadError("This file type is not allowed.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!contentMatchesMime(bytes, mime)) throw new UploadError("The file content does not match its type.");

  const day = new Date().toISOString().slice(0, 10);
  const path = `pending/${day}/${randomUUID()}.${MIME_EXTENSION[mime] ?? "bin"}`;
  const { error } = await createAdminClient()
    .storage.from(SUBMISSION_BUCKET)
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const name = sanitizeFileName(file.name);
  const token = signToken({ p: path, f: formId, k: field.field_id, n: name, s: file.size, t: mime }, "upload", UPLOAD_TOKEN_TTL);
  return { token, name, size: file.size, type: mime };
}

/**
 * Verifies upload tokens from a submission and moves files from pending/ to
 * their permanent location. Tokens are HMAC-signed and bound to form+field, so
 * a respondent cannot reference somebody else's file.
 */
export async function finalizeUploads(
  formId: string,
  fieldId: string,
  refs: UploadedFileRef[],
  folder: string,
): Promise<StoredFileRef[]> {
  const storage = createAdminClient().storage.from(SUBMISSION_BUCKET);
  const stored: StoredFileRef[] = [];
  for (const ref of refs) {
    const payload = verifyToken<UploadTokenPayload>(ref.token, "upload");
    if (!payload || payload.f !== formId || payload.k !== fieldId || !payload.p.startsWith("pending/")) {
      throw new UploadError("A file upload has expired. Please upload it again.");
    }
    const finalPath = `forms/${formId}/${folder}/${payload.p.split("/").pop()}`;
    const { error } = await storage.move(payload.p, finalPath);
    if (error) throw new UploadError("A file upload has expired. Please upload it again.");
    stored.push({ path: finalPath, name: payload.n, size: payload.s, type: payload.t });
  }
  return stored;
}

export async function storeSignature(formId: string, fieldId: string, dataUrl: string, folder: string): Promise<StoredFileRef> {
  const base64 = dataUrl.slice("data:image/png;base64,".length);
  const bytes = new Uint8Array(Buffer.from(base64, "base64"));
  if (!contentMatchesMime(bytes, "image/png")) throw new UploadError("Invalid signature image.");
  const path = `forms/${formId}/${folder}/signature-${fieldId}.png`;
  const { error } = await createAdminClient()
    .storage.from(SUBMISSION_BUCKET)
    .upload(path, bytes, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`Signature upload failed: ${error.message}`);
  return { path, name: `signature-${fieldId}.png`, size: bytes.byteLength, type: "image/png" };
}

export async function createSignedFileUrl(path: string, expiresIn = 300): Promise<string | null> {
  const { data } = await createAdminClient().storage.from(SUBMISSION_BUCKET).createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? null;
}

/** Removes abandoned uploads (pending folders older than 2 days). */
export async function purgeAbandonedUploads(): Promise<number> {
  const storage = createAdminClient().storage.from(SUBMISSION_BUCKET);
  const { data: folders } = await storage.list("pending", { limit: 100 });
  const cutoff = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
  let removed = 0;
  for (const folder of folders ?? []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(folder.name) || folder.name >= cutoff) continue;
    const { data: files } = await storage.list(`pending/${folder.name}`, { limit: 1000 });
    const paths = (files ?? []).map((f) => `pending/${folder.name}/${f.name}`);
    if (paths.length) {
      await storage.remove(paths);
      removed += paths.length;
    }
  }
  return removed;
}
