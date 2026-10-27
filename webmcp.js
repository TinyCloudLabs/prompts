const resultsNode = document.getElementById("guide-search-results");
const form = document.getElementById("guide-search");

async function searchGuides(query) {
  const response = await fetch("/search-index.json", { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Guide search is unavailable");
  const entries = await response.json();
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  return entries
    .map((entry) => {
      const haystack = `${entry.title}\n${entry.text}`.toLocaleLowerCase();
      const score = terms.reduce((total, term) => total + Number(haystack.includes(term)), 0);
      return { title: entry.title, url: entry.url, score };
    })
    .filter((entry) => entry.score === terms.length)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, 8)
    .map(({ title, url }) => ({ title, url: new URL(url, location.origin).href }));
}

if (form && resultsNode) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    resultsNode.replaceChildren();
    const query = new FormData(form).get("query");
    try {
      const results = await searchGuides(String(query || ""));
      if (results.length === 0) {
        resultsNode.textContent = "No matching guides.";
        return;
      }
      for (const result of results) {
        const item = document.createElement("li");
        const link = document.createElement("a");
        link.href = result.url;
        link.textContent = result.title;
        item.append(link);
        resultsNode.append(item);
      }
    } catch {
      resultsNode.textContent = "Guide search is temporarily unavailable.";
    }
  });
}

if (document.modelContext?.registerTool) {
  document.modelContext.registerTool({
    name: "search_tinycloud_guides",
    description: "Search public TinyCloud setup guides and agent skills by keyword. Returns matching guide titles and URLs.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", minLength: 1 } },
      required: ["query"],
      additionalProperties: false,
    },
    execute: async ({ query }) => JSON.stringify(await searchGuides(query)),
  }).catch(() => {});
}
