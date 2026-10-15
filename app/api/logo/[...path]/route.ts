import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

export const runtime = "nodejs";

const SAFE_PATH = /^logos\/[a-z0-9-]{8,64}\.(png|jpe?g|webp|svg)$/i;
const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml" };

/**
 * Streams an uploaded logo from the public Supabase "branding" bucket via our
 * own origin. Only logo files under logos/ are served.
 */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/logo/[...path]">) {
  const { path } = await ctx.params;
  const key = path.join("/");
  if (!SAFE_PATH.test(key)) return new NextResponse("Not found", { status: 404 });

  const upstream = await fetch(`${env.supabaseUrl().replace(/\/+$/, "")}/storage/v1/object/public/branding/${key}`, {
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!upstream || !upstream.ok || !upstream.body) return new NextResponse("Not found", { status: 404 });

  const ext = key.split(".").pop()!.toLowerCase();
  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": TYPES[ext] ?? "application/octet-stream",
      // File names are random UUIDs, so the content never changes.
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
