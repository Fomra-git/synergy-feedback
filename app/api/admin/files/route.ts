import { NextResponse, type NextRequest } from "next/server";
import { getAdminSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createSignedFileUrl } from "@/services/submissions/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Redirects an authorised admin to a short-lived signed URL for a submission
 * file. Access is checked through RLS: the admin must be able to read the
 * answer that references the file.
 */
export async function GET(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const answerId = request.nextUrl.searchParams.get("answer");
  const index = Number(request.nextUrl.searchParams.get("i") ?? "0");
  if (!answerId || !/^[0-9a-f-]{36}$/i.test(answerId) || !Number.isInteger(index) || index < 0) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: answer } = await supabase
    .from("submission_answers")
    .select("field_type, value_json")
    .eq("id", answerId)
    .maybeSingle<{ field_type: string; value_json: unknown }>();
  if (!answer) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const refs = Array.isArray(answer.value_json) ? answer.value_json : [answer.value_json];
  const ref = refs[index] as { path?: string } | undefined;
  if (!ref?.path) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = await createSignedFileUrl(ref.path, 120);
  if (!url) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.redirect(url, { headers: { "Cache-Control": "no-store" } });
}
