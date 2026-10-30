# Share an artifact with TinyCloud

Your agent publishes a document or web page from your computer to your own TinyCloud and gives you a link. Anyone with the link can open it, so your agent asks you first. Sharing with an email address or a domain is not available yet. Your agent can revoke the link any time.

## For the owner

- **Paste into your agent:** `Share this with TinyCloud: https://agents.tinycloud.xyz/share`
- You need a shell, Node.js 22.20 or later, and npm. An agent that can't run the TinyCloud CLI can't publish: have it write the document, save it as Markdown, and create the share yourself on share.tinycloud.xyz.
- **What it does:** installs the pinned TinyCloud CLI and the `tc-publish` skill, asks you before it makes the link, publishes, and returns the link.
- **You approve:** standing publish access to your share folders, for up to 30 days. Setup alone grants nothing. Publishing has its own single approval, separate from /onboarding: the first time, you approve one sign-in in OpenKey and paste its code back to your agent.
- **It asks first.** Anyone with the link can open it, so the agent makes one only after you say yes. If you say no, nothing is published and the file stays on your computer.
- **Undo:** see [Undo](#undo).

## For the agent

Keep the owner's request, then read [setup/agent.md](agent.md), select **publish/share** and follow its steps: it installs the pinned CLI (or uses the owner's `TC_BIN`) and only the `tc-publish` skill. Then read the installed `tc-publish` `SKILL.md` and continue in this conversation: its §1 checks the CLI, §2 gets the owner's approval, §3-§6 publish, verify and report. Never make a link without asking (step 1).

Use the skill's shell preamble and `TC_BIN` for every command. Don't call a bare `tc` (on Linux it is often the system traffic-control tool).

The rest of this page is what to run once the skill's §1 and §2 are done, and the options the skill doesn't cover.

### 1. Ask before making the link

Only link shares are available for now: always pass `--to anyone`, never `email:`, `domain:` or `did:`. Before publishing, ask the owner in one line: "Anyone with the link can open it. Make a link?" Publish only after they say yes. If they say no, tell them it isn't published and the file stays on this computer. If they ask to share with an email address, a domain or only themselves, say that isn't available yet, then ask the same question.

### 2. Pick the content

The CLI publishes **files**, not folders. A directory fails with `MAX_BYTES_EXCEEDED` (observed on 1.2.3).

| Content | What to publish | What the recipient sees |
|---|---|---|
| Markdown document | `report.md` | Formatted page: headings, lists, tables, Mermaid |
| Text, JSON, image | the file | Shown in the browser |
| HTML page | one self-contained `.html` file | **See the HTML note below.** |
| JSX component | `App.jsx` or `App.tsx` with a default export (**see Artifacts below**) | Renders as a live page in a sandbox. |

Media type is inferred from the extension: `md`/`markdown`, `txt`, `html`/`htm`, `json`, `css`, `js`, otherwise `application/octet-stream`. The CLI release after 1.3.0-beta.30 also maps `jsx` to `text/jsx` and `tsx` to `text/tsx`; on any earlier CLI, pass `--media-type text/jsx` (or `text/tsx`). Override with `--media-type` for one file. File names must be one safe path segment; names with spaces are stored under a safe name.

**HTML note.** Before publishing HTML, run the skill's self-contained check: external `src`, `href`, CSS `url()` and network calls don't load in the viewer. Tell the owner what to expect: the page renders in a sandboxed frame. If you can't confirm what the recipient sees, say so. Don't promise a rendered site.

**Artifacts (pages and small apps).** A Markdown file, one self-contained HTML file, or one JSX component is an artifact: a file the recipient opens in the viewer, not a folder. Markdown renders; HTML and JSX render live in a sandbox.

- **JSX:** `export default function App() { … }` in one file. The libraries available to it are `react` 19 (and `react-dom/client`), `lucide-react` (icons), `recharts` (charts), `d3`, `mermaid` 11 (diagrams) and Tailwind CSS classes (browser runtime). Nothing else can be imported. The code runs sandboxed: no network, no CDN, no storage, no cookies and no access to the page around it, so embed the data. An import that isn't in this list shows a "library not available" panel instead of the page.
- **TinyCloud style tokens** are available in JSX artifacts only; plain HTML pages don't get them. CSS variables: `var(--tc-color-page|surface|text|text-muted|border|accent|on-accent|link)`, `var(--tc-space-1…7)`, `var(--tc-radius-sm|md|lg)`, `var(--tc-font-sans|mono)`. Tailwind classes map to them: colors `tc-page|surface|subtle|active|text|muted|border|accent|accent-hover|on-accent|success|warning|danger` (`bg-tc-surface`, `text-tc-muted`, `border-tc-border`), `rounded-tc-sm|md|lg`, `font-tc-sans|mono`. Light and dark follow the system. In a plain HTML page the variables are undefined, so any `var(--tc-…)` there needs a fallback value, for example `var(--tc-color-text, #1a1c21)`.
- **Pin a version:** `--artifact new` stores the file as write-once version 1 and pins the link to it; a later publish of changed content with `--artifact <id>` (the `artifactId` in the JSON) makes version 2 with its own link, and the earlier link keeps showing version 1 (identical bytes to a bearer link return the same version). Needs CLI 1.3.0-beta.10 or newer; the 1.5.0 this site pins has it. Check with `"$TC_BIN" share publish --help | grep -q -- --artifact`. A profile approved on an older CLI must go through the skill's §2 consent again to add the `artifacts/` scope. A pinned share is read-only: `--action edit` is refused with `--artifact`.
- **Revoke:** `share revoke <id>` closes the link. Copies already opened or downloaded can't be recalled.
- Never put secrets or tokens in an artifact: everyone who holds the link can read its source.

### 3. Publish, with an expiry

Always pass `--expires` and tell the owner the date. Links use 24h unless the owner says otherwise. The value can't pass the signed session's end and can't be under 60 seconds (`SESSION_LIFETIME_EXCEEDED`). The owner's approval lasts up to 30 days ([CLI reference](https://agents.tinycloud.xyz/skills/cli/REFERENCE.md)).

Publish only through the skill's §3 link block (`skills/tc-publish/SKILL.md`). It uses `--expires 24h` unless the owner asks otherwise; the `SESSION_LIFETIME_EXCEEDED` row in the skill's errors table covers an expiry past the session's end. Run EXACTLY that block; do not write your own `share publish` command.

- `--json` prints redacted metadata with `metadata.shareId`; the link is not in it. Get the link as the skill does: `"$TC_BIN" --profile "$PROFILE" share show "$id" --reveal-link`. Never combine `--reveal-link` with `--json`.
- Everything after `#` in a link is the credential. Follow the skill's handling contract for storing and delivering it. Never retype or chunk a link.
- Never pass `--action edit`: a link only reads (the CLI refuses it with `INVALID_ARGUMENT`, exit 2).
- Give the owner the link in your reply, with the expiry, ready to forward. Don't tell the owner to send it themselves.

What the recipient does: opens the link. It opens without signing in.

### 4. List and look up shares

```sh
"$TC_BIN" --profile "$PROFILE" share list --json     # sender history; no complete links
"$TC_BIN" --profile "$PROFILE" share show "$id"      # one record
```

`share list --json` returns `{"shares":[{shareId, target, expiresAt, revoked, …}]}`; filter out `revoked` and past `expiresAt` before calling a share active. Link share ids are CIDs (`bafkr4…`).

### 5. Revoke

```sh
"$TC_BIN" --profile "$PROFILE" share revoke "$id"    # a share this profile created
"$TC_BIN" --profile "$PROFILE" share show "$id"      # afterwards reports "revoked": true
```

Report honestly what revoke did. `share revoke` is for shares this profile created. `--ancestor` revokes the owner delegation ancestry; don't pass it unprompted. Copies a recipient already downloaded can't be recalled ([CLI reference](https://agents.tinycloud.xyz/skills/cli/REFERENCE.md)). After a revoke of a public link, confirm with `share receive` on the link (`SHARE_REVOKED`) before telling the owner it's closed; if it still opens, say so.

### 6. Report

Use the skill's report template. State: the expiry date, what the recipient will see (use the HTML note for HTML and the Artifacts paragraph for JSX), and that you can revoke. For HTML or JSX, add these words: **"Shared HTML and JSX pages run the sender's code in a sandbox. The sender can tell that you opened it."** Never tell the owner viewers are anonymous. Leave the line out for Markdown. End with the link, once, in your reply to the owner.

## Undo

Same as [Publish and share](publish.md#undo): revoking a share is separate from clearing the agent's local login; `"$TC_BIN" --profile publisher auth logout` clears only the local session.
