export const CONTEXT_VARIABLE = "TC_DIAGNOSTICS_CONTEXT";
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
// Bound nesting before JSON.parse, including discarded payload fields.
export function boundedJson(text, bytes, depth) {
  if (typeof text !== "string" || Buffer.byteLength(text) > bytes) return;
  let level = 0, quoted = false, escaped = false;
  for (const char of text) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === "{" || char === "[") { if (++level > depth) return; }
    else if (char === "}" || char === "]") { if (--level < 0) return; }
  }
  try { return JSON.parse(text); } catch { return; }
}

export function nativeIdentity(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}
