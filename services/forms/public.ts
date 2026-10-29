import "server-only";
import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/server";
import type { FormFieldRow } from "@/types/db";
import type { FormField, FormPublicSettings } from "@/types/forms";
import { rowToField } from "./mappers";

export interface PublishedForm {
  /** internal id — used server-side only, never sent to the browser */
  id: string;
  slug: string;
  name: string;
  description: string | null;
  settings: FormPublicSettings;
  fields: FormField[];
}

/**
 * Loads a published form with the ANON client, so Row Level Security decides
 * what the public can see (drafts/archived forms are invisible).
 */
export const getPublishedForm = cache(async (slug: string): Promise<PublishedForm | null> => {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 80) return null;
  // One round trip: the form with its fields embedded (ordered by position).
  const { data } = await createPublicClient()
    .from("forms")
    .select("id, slug, name, description, settings, form_fields(*)")
    .eq("slug", slug)
    .eq("status", "published")
    .order("position", { referencedTable: "form_fields" })
    .maybeSingle<{ id: string; slug: string; name: string; description: string | null; settings: FormPublicSettings; form_fields: FormFieldRow[] | null }>();
  if (!data) return null;
  const { form_fields: fields, ...form } = data;
  return { ...form, settings: form.settings ?? {}, fields: (fields ?? []).map(rowToField) };
});

/** Strips anything the browser does not need. */
export function toClientForm(form: PublishedForm) {
  return {
    slug: form.slug,
    name: form.name,
    description: form.description,
    settings: form.settings,
    fields: form.fields,
  };
}

export type ClientForm = ReturnType<typeof toClientForm>;
