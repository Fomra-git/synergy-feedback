/**
 * Structured server logging. Detailed errors go to server logs only — users
 * always receive generic, friendly messages. Secrets are redacted.
 */
const SECRET_KEYS = /token|secret|password|authorization|cookie|key/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SECRET_KEYS.test(k) ? "[redacted]" : redact(v, depth + 1);
  }
  return out;
}

function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) return { name: err.name, message: err.message, stack: err.stack };
  if (err && typeof err === "object") return redact(err) as Record<string, unknown>;
  return { message: String(err) };
}

export function logError(event: string, err: unknown, context: Record<string, unknown> = {}) {
  console.error(JSON.stringify({ level: "error", event, error: serializeError(err), context: redact(context), at: new Date().toISOString() }));
}

export function logInfo(event: string, context: Record<string, unknown> = {}) {
  console.info(JSON.stringify({ level: "info", event, context: redact(context), at: new Date().toISOString() }));
}
