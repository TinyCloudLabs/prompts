# Share an artifact with TinyCloud

Your agent publishes a document or web page from your computer to your own TinyCloud and gives you a link. You decide who can open it: anyone with the link, one email address, or everyone at a domain. Your agent can revoke it any time.

## For the owner

- **Paste into Claude Code, Codex or OpenCode:** `Share this with TinyCloud, and ask me who should be able to open it: https://agents.tinycloud.xyz/share`
- You need a shell, Node.js 22.20 or later, and npm. A chat agent that can't run shell commands can't publish: have it write the document, save it as Markdown, and create the share yourself on share.tinycloud.xyz.
- **What it does:** installs the pinned TinyCloud CLI and the `tc-publish` skill, asks which audience you want, publishes, and returns the link.
- **You approve:** one OpenKey request for standing publish access to your share folders, for up to 30 days. Setup alone grants nothing. Owner-only and email links need one more approval, for decryption, which your agent asks for the first time.
- **Ask first.** With no audience named, the agent asks who the link is for before it publishes. Owner-only and email links need one extra approval (decryption), which the agent asks for the first time. Public links work right away, and the agent makes one only when you ask for one.
- **Undo:** see [Undo](#undo).

## For the agent

Keep the owner's request, then read [setup/agent.md](agent.md), select **publish/share** and follow its steps: it installs the pinned CLI (or uses the owner's `TC_BIN`) and only the `tc-publish` skill, records `TC_OWNER_EMAIL`, and never publishes publicly as a fallback. Then read the installed `tc-publish` `SKILL.md` and continue in this conversation: its §1 checks the CLI, §2 gets the owner's approval, §3-§6 publish, verify and report.

Use the skill's shell preamble and `TC_BIN` for every command. Don't call a bare `tc` (on Linux it is often the system traffic-control tool).

The rest of this page is what to run once the skill's §1 and §2 are done, and the options the skill doesn't cover.

### 1. Ask who can open it

If the owner didn't say, ask. Never guess and never choose public yourself. The choices map to `--to`:

| The owner says | `--to` value |
|---|---|
| Anyone with the link | `anyone` |
| Only me | `email:<owner email>` (`$TC_OWNER_EMAIL`) |
| One other person | `email:<their address>`: the address the owner named in the request, used exactly; if the owner gave a name but no address, ask. In the skill's §3 block this is `TC_SHARE_TO`. |

The `email:` choices need the extra approval described above. `anyone` works right away.

A bare address (`alex@example.com`) also works as `--to`; write the `email:` form so the intent is unambiguous. An invalid address is refused before anything is published, with `INVALID_ARGUMENT`.

For HTML or JSX, ask the owner which they want: **anyone with the link** sees the page running; **someone you name by email** gets it as a download for now. Use the audience the owner picks.

### 2. Pick the content

The CLI publishes **files**, not folders. A directory fails with `MAX_BYTES_EXCEEDED` (observed on 1.2.3).

| Content | What to publish | What the recipient sees |
|---|---|---|
| Markdown document | `report.md` | Formatted page: headings, lists, tables, Mermaid |
| Text, JSON, image | the file | Shown in the browser |
| HTML page | one self-contained `.html` file | **See the HTML note below.** |
| JSX component | `App.jsx` or `App.tsx` with a default export (**see Artifacts below**) | Anyone-with-link: renders as a live page in a sandbox. Addressed (`email:`, `domain:`, `did:`): a Download, not rendered. |

Media type is inferred from the extension: `md`/`markdown`, `txt`, `html`/`htm`, `json`, `css`, `js`, otherwise `application/octet-stream`. The CLI release after 1.3.0-beta.30 also maps `jsx` to `text/jsx` and `tsx` to `text/tsx`; on any earlier CLI, pass `--media-type text/jsx` (or `text/tsx`). Override with `--media-type` for one file. File names must be one safe path segment; names with spaces are stored under a safe name.

**HTML note.** Before publishing HTML, run the skill's self-contained check: external `src`, `href`, CSS `url()` and network calls don't load in the viewer. Tell the owner what to expect: an anyone-with-link HTML link renders in a sandboxed frame; an owner-only or other addressed one (`email:`, `domain:`, `did:`) downloads for the recipient. Never switch the audience yourself to make a page render. If you can't confirm what the recipient sees, say that: "the page may open as a download". Don't promise a rendered site.

**Several files.** Only for an addressed target (not `anyone`): `--prefix` with several file paths publishes them under one prefix. Each name must be a flat file name; nested folders can't be expressed. The viewer's full-site HTML mode needs a folder containing `index.html` chosen in the web composer, and nothing here confirms a CLI `--prefix` share triggers it. Don't tell the owner their site will render.

**Artifacts (pages and small apps).** A Markdown file, one self-contained HTML file, or one JSX component is an artifact: a file the recipient opens in the viewer, not a folder. Markdown renders for every audience. HTML and JSX render live in a sandbox for anyone-with-link shares only; an addressed (`email:`, `domain:`, `did:`) HTML or JSX file shows as a Download for the recipient. Ask the owner which they want (step 1) and use their pick; never choose anyone-with-link yourself to make a page render, since that makes the share less private.

- **JSX:** `export default function App() { … }` in one file. The libraries available to it are `react` 19 (and `react-dom/client`), `lucide-react` (icons), `recharts` (charts), `d3`, `mermaid` 11 (diagrams) and Tailwind CSS classes (browser runtime). Nothing else can be imported. The code runs sandboxed: no network, no CDN, no storage, no cookies and no access to the page around it, so embed the data. An import that isn't in this list shows a "library not available" panel instead of the page.
- **TinyCloud style tokens** are available in JSX artifacts only; plain HTML pages don't get them. CSS variables: `var(--tc-color-page|surface|text|text-muted|border|accent|on-accent|link)`, `var(--tc-space-1…7)`, `var(--tc-radius-sm|md|lg)`, `var(--tc-font-sans|mono)`. Tailwind classes map to them: colors `tc-page|surface|subtle|active|text|muted|border|accent|accent-hover|on-accent|success|warning|danger` (`bg-tc-surface`, `text-tc-muted`, `border-tc-border`), `rounded-tc-sm|md|lg`, `font-tc-sans|mono`. Light and dark follow the system. In a plain HTML page the variables are undefined, so any `var(--tc-…)` there needs a fallback value, for example `var(--tc-color-text, #1a1c21)`.
- **Pin a version:** `--artifact new` stores the file as write-once version 1 and pins the link to it; a later publish of changed content with `--artifact <id>` (the `artifactId` in the JSON) makes version 2 with its own link, and the earlier link keeps showing version 1 (identical bytes to a bearer link return the same version). Needs CLI 1.3.0-beta.10 or newer; the 1.3.5 this site pins has it. Check with `"$TC_BIN" share publish --help | grep -q -- --artifact`. A profile approved on an older CLI must go through the skill's §2 consent again to add the `artifacts/` scope. A pinned share is read-only: `--action edit` is refused with `--artifact`.
- **Revoke:** `share revoke <id>` closes the link. Copies already opened or downloaded can't be recalled.
- Never put secrets or tokens in an artifact: everyone who holds the link can read its source.

### 3. Publish, with an expiry

Always pass `--expires` and tell the owner the date. Owner-only links default to the publisher session's remaining lifetime minus 1 h (6d if its expiry can't be read); public links use 24h. The value can't pass the signed session's end and can't be under 60 seconds (`SESSION_LIFETIME_EXCEEDED`). The owner's approval lasts up to 30 days ([CLI reference](https://agents.tinycloud.xyz/skills/cli/REFERENCE.md)).

Publish only through the skill's §3 blocks (`skills/tc-publish/SKILL.md`). They compute `--expires` from the publisher session and handle `RECIPIENT_UNSET` and `SESSION_ENDING`. Run EXACTLY those blocks; do not write your own `share publish` command.

- `--json` prints redacted metadata with `metadata.shareId`; the link is not in it. Get the link as the skill does: `"$TC_BIN" --profile "$PROFILE" share show "$id" --reveal-link`. Never combine `--reveal-link` with `--json`.
- Everything after `#` in a link is the credential. Follow the skill's handling contract for storing and delivering it. Never retype or chunk a link.
- Edit access for an addressed recipient: add `--action read edit`; it takes a list, so put it last, after the file and the other flags. Only use it when the owner asks and only with an addressed `--to`; the Markdown editor is the share viewer's. Never pass `--action edit` with `anyone`: the CLI release after 1.3.0-beta.30 refuses it (`INVALID_ARGUMENT`, exit 2: a link only reads), and earlier CLIs publish a read-only link without saying so.
- When you share with an email address, pass `--notify`: TinyCloud emails the recipient the invitation, so the owner has nothing to forward. For "only you", or for a public link, give the owner the link in your reply, with the recipient and the expiry, ready to forward. Don't tell the owner to send it themselves. When the recipient opens the link, the viewer emails them a one-time code to prove the address is theirs.

What the recipient does: opens the link; for `email:` links they prove the address with a code the viewer emails them. A bearer link opens without signing in.

### 4. List and look up shares

```sh
"$TC_BIN" --profile "$PROFILE" share list --json     # sender history; no complete links
"$TC_BIN" --profile "$PROFILE" share show "$id"      # one record
```

`share list --json` returns `{"shares":[{shareId, target, expiresAt, revoked, …}]}`; filter out `revoked` and past `expiresAt` before calling a share active. Ids: public shares are CIDs (`bafkr4…`), addressed shares 32 hex characters.

### 5. Revoke

```sh
"$TC_BIN" --profile "$PROFILE" share revoke "$id"    # bearer or addressed share this profile created
"$TC_BIN" --profile "$PROFILE" share show "$id"      # afterwards reports "revoked": true
```

Report honestly what revoke did. `share revoke` is for shares this profile created. `--ancestor` revokes the owner delegation ancestry; don't pass it unprompted. Copies a recipient already downloaded can't be recalled ([CLI reference](https://agents.tinycloud.xyz/skills/cli/REFERENCE.md)). After a revoke of a public link, confirm with `share receive` on the link (`SHARE_REVOKED`) before telling the owner it's closed; if it still opens, say so.

### 6. Report

Use the skill's report templates. State: the audience, the expiry date, what the recipient will see (use the HTML note for HTML and the Artifacts paragraph for JSX), and that you can revoke. For HTML or JSX, say first what the recipient will see (a running page, or a download), then, when it is a running page, add these words: **"Shared HTML and JSX pages run the sender's code in a sandbox. The sender can tell that you opened it."** Never tell the owner viewers are anonymous. Leave the line out for Markdown. End with the link, once, in your reply to the owner.

## Undo

Same as [Publish and share](publish.md#undo): revoking a share is separate from clearing the agent's local login; `"$TC_BIN" --profile publisher auth logout` clears only the local session.
