// /connect is HTML unless the client explicitly prefers Markdown.
// Both assets contain the complete guide; this never guesses from User-Agent.
function quality(accept, type) {
  for (const range of accept.split(",")) {
    const [name, ...params] = range.split(";").map((s) => s.trim().toLowerCase());
    if (name !== type) continue;
    const q = params.find((p) => p.startsWith("q="));
    return q ? Number(q.slice(2)) || 0 : 1;
  }
  return null;
}

export async function onRequest({ request, env, next }) {
  if (request.method !== "GET" && request.method !== "HEAD") return next();
  const accept = request.headers.get("Accept") || "";
  const md = quality(accept, "text/markdown") ?? 0;
  const html = quality(accept, "text/html") ?? quality(accept, "text/*") ?? quality(accept, "*/*") ?? 0;
  const markdown = md > 0 && md >= html;
  const res = markdown
    ? await env.ASSETS.fetch(new Request(new URL("/connect.md", request.url), { method: request.method, headers: request.headers }))
    : await next();
  const out = new Response(request.method === "HEAD" ? null : res.body, res);
  if (res.ok) out.headers.set("Content-Type", `${markdown ? "text/markdown" : "text/html"}; charset=utf-8`);
  // Cloudflare email obfuscation otherwise rewrites package@version in install commands.
  out.headers.append("Cache-Control", "no-transform");
  out.headers.set("Link", '</connect>; rel="canonical", </connect.md>; rel="alternate"; type="text/markdown"');
  out.headers.append("Vary", "Accept");
  return out;
}
