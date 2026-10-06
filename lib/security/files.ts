import type { FileCategory } from "@/types/forms";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const FILE_CATEGORY_MIME: Record<FileCategory, string[]> = {
  image: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"],
  pdf: ["application/pdf"],
  document: [
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
  ],
};

export const MIME_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
};

export function allowedMimeTypes(accept: FileCategory[] | undefined): string[] {
  const cats = accept?.length ? accept : (["image", "pdf"] as FileCategory[]);
  return cats.flatMap((c) => FILE_CATEGORY_MIME[c] ?? []);
}

export function acceptAttribute(accept: FileCategory[] | undefined): string {
  return allowedMimeTypes(accept).join(",");
}

function startsWith(bytes: Uint8Array, sig: number[], offset = 0): boolean {
  return sig.every((b, i) => bytes[offset + i] === b);
}

/**
 * Verifies file content matches its declared type using magic bytes, so a
 * renamed executable/HTML file cannot be stored as an "image".
 */
export function contentMatchesMime(bytes: Uint8Array, mime: string): boolean {
  switch (mime) {
    case "image/jpeg":
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case "image/png":
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/gif":
      return startsWith(bytes, [0x47, 0x49, 0x46, 0x38]);
    case "image/webp":
      return startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8);
    case "image/heic":
    case "image/heif":
      return startsWith(bytes, [0x66, 0x74, 0x79, 0x70], 4); // ....ftyp
    case "application/pdf":
      return startsWith(bytes, [0x25, 0x50, 0x44, 0x46]); // %PDF
    case "application/msword":
      return startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0]);
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]); // zip container
    case "text/plain": {
      // Reject binary content and anything that looks like markup.
      const sample = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, 2048));
      return !sample.includes("\u0000") && !/<\s*(script|html|svg|iframe)/i.test(sample);
    }
    default:
      return false;
  }
}

/** Removes path separators/control characters from user-supplied file names. */
export function sanitizeFileName(name: string): string {
  const cleaned = name
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150);
  return cleaned || "file";
}
