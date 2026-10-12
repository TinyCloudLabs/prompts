// Markdown for agents: / with Accept: text/markdown returns llms.txt
// (already Markdown) instead of the HTML front page. Only "/" runs this.
const LINK =
  '</llms.txt>; rel="describedby"; type="text/plain", </.well-known/agent-skills/index.json>; rel="describedby"; type="application/json", </sitemap.xml>; rel="sitemap"; type="application/xml"';

// Quality of a media type in an Accept header (0 when absent or refused).
function quality(accept, type) {
  for (const range of accept.split(",")) {
    const [name, ...params] = range.split(";").map((s) => s.trim().toLowerCase());
    if (name !== type) continue;
    const q = params.find((p) => p.startsWith("q="));
    return q ? Number(q.slice(2)) || 0 : 1;
  }
  return 0;
}

export async function onRequest({ request, env, next }) {
  if (request.method !== "GET" && request.method !== "HEAD") return next();
  const accept = request.headers.get("Accept") || "";
  const md = quality(accept, "text/markdown");
  const markdown = md > 0 && md >= quality(accept, "text/html");
  const res = markdown
    ? await env.ASSETS.fetch(new Request(new URL("/llms.txt", request.url), { method: request.method }))
    : await next();
  const out = new Response(request.method === "HEAD" ? null : res.body, res);
  if (markdown && res.ok) out.headers.set("Content-Type", "text/markdown; charset=utf-8");
  out.headers.set("Link", LINK);
  out.headers.append("Vary", "Accept");
  return out;
}
