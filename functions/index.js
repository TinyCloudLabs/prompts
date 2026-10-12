// Markdown for agents: GET / with Accept: text/markdown returns llms.txt
// (already Markdown) instead of the HTML front page. Only "/" runs this.
export async function onRequestGet({ request, env, next }) {
  const res = (request.headers.get("Accept") || "").includes("text/markdown")
    ? await env.ASSETS.fetch(new URL("/llms.txt", request.url))
    : await next();
  const out = new Response(res.body, res);
  if (res.ok && out.headers.get("Content-Type")?.startsWith("text/plain")) {
    out.headers.set("Content-Type", "text/markdown; charset=utf-8");
  }
  out.headers.append("Vary", "Accept");
  return out;
}
