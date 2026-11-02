// /matrix is no longer published (#131). The custom domain kept serving a stored
// copy of the old page after the deploy, so answer the path from a Function,
// which runs before any stored asset, with the site's 404 page and no caching.
export async function onRequest({ request, env }) {
  const page = await env.ASSETS.fetch(new Request(new URL("/404.html", request.url)));
  return new Response(request.method === "HEAD" ? null : page.body, {
    status: 404,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
