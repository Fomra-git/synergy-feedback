import { NextResponse } from "next/server";
import { getPublishedForm } from "@/services/forms/public";
import { storePendingUpload, UploadError } from "@/services/submissions/files";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { getClientIp, isSameOrigin } from "@/lib/security/request";
import { hashIp } from "@/lib/security/crypto";
import { MAX_UPLOAD_BYTES } from "@/lib/security/files";
import { logError } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, ctx: RouteContext<"/api/forms/[slug]/upload">) {
  const { slug } = await ctx.params;
  if (!isSameOrigin(request.headers)) return json({ error: "Invalid request origin." }, 403);

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024) return json({ error: "File is too large." }, 413);

  const ipHash = hashIp(getClientIp(request.headers));
  if (!(await checkRateLimit(`upload:${ipHash ?? "unknown"}`, 20, 600))) {
    return json({ error: "Too many uploads. Please wait a few minutes." }, 429);
  }

  const form = await getPublishedForm(slug);
  if (!form) return json({ error: "This form is not available." }, 404);

  let data: FormData;
  try {
    data = await request.formData();
  } catch {
    return json({ error: "Invalid upload." }, 400);
  }
  const fieldId = String(data.get("fieldId") ?? "");
  const file = data.get("file");
  const field = form.fields.find((f) => f.field_id === fieldId);
  if (!field || !(file instanceof File)) return json({ error: "Invalid upload." }, 400);

  try {
    const ref = await storePendingUpload(form.id, field, file);
    return json({ ok: true, file: ref });
  } catch (err) {
    if (err instanceof UploadError) return json({ error: err.message }, 422);
    logError("upload.failed", err, { slug });
    return json({ error: "Upload failed. Please try again." }, 500);
  }
}
