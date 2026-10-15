"use client";

const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 1.9 * 1024 * 1024;
const MAX_SIDE = 1200;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("unsupported"));
    };
    img.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Makes any picked image uploadable as a logo: PNG/JPG/WebP under 2 MB are
 * sent as-is; anything larger, or SVG/GIF/BMP, is scaled to at most 1200px and
 * re-encoded in the browser (keeps transparency).
 */
export async function prepareLogo(file: File): Promise<File> {
  if (ACCEPTED.includes(file.type) && file.size <= MAX_BYTES) return file;
  let img: HTMLImageElement;
  try {
    img = await loadImage(file);
  } catch {
    throw new Error("This image format can't be used. Please choose a PNG, JPG, WebP or SVG file.");
  }
  // SVGs without intrinsic size report 0 — give them a sensible canvas.
  const w0 = img.naturalWidth || 800;
  const h0 = img.naturalHeight || 400;
  const scale = Math.min(1, MAX_SIDE / Math.max(w0, h0));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w0 * scale));
  canvas.height = Math.max(1, Math.round(h0 * scale));
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(img.src);

  let blob = await toBlob(canvas, "image/png");
  let type = "image/png";
  if (!blob || blob.size > MAX_BYTES) {
    blob = await toBlob(canvas, "image/webp", 0.9);
    type = "image/webp";
  }
  if (!blob || blob.size > MAX_BYTES) throw new Error("That image is too large even after resizing. Please use a smaller logo.");
  const base = file.name.replace(/\.[^.]+$/, "") || "logo";
  return new File([blob], `${base}.${type === "image/png" ? "png" : "webp"}`, { type });
}
