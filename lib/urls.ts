import "server-only";
import { env } from "@/lib/env";

export function publicFormUrl(slug: string): string {
  return `${env.appUrl()}/forms/${slug}`;
}
