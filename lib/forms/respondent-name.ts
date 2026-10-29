export interface NameAnswer {
  field_type: string;
  field_label: string;
  value: string | null;
}

// Labels that mention "name" but are not the person filling in the form.
const NOT_RESPONDENT = /\b(doctor|dr|therapist|physio|staff|branch|clinic|company|business|centre|center|hospital|referr|father|mother|parent|guardian|spouse|husband|wife|pet|user ?name|file)/i;

function score(label: string): number {
  const l = label.trim().toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  if (!/\bname\b/.test(l) || NOT_RESPONDENT.test(l)) return 0;
  if (l === "name" || l === "full name" || l === "your name" || l === "your full name") return 4;
  if (/\b(patient|customer|client|guest|member|visitor)\b/.test(l)) return 3;
  if (/\bfirst name\b/.test(l)) return 2;
  return 1;
}

/** Best guess at the respondent's name from a submission's text answers. */
export function respondentName(answers: NameAnswer[] | null | undefined): string | null {
  let best: { s: number; v: string } | null = null;
  for (const a of answers ?? []) {
    if (a.field_type !== "short_text") continue;
    const v = (a.value ?? "").trim();
    if (!v) continue;
    const s = score(a.field_label);
    if (s > (best?.s ?? 0)) best = { s, v };
  }
  return best ? best.v.slice(0, 120) : null;
}
