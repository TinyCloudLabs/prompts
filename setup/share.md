# Share an artifact with TinyCloud

Your agent publishes a document or web page from your computer to your own TinyCloud and gives you a link. You decide who can open it: anyone with the link, one email address, or everyone at a domain. Your agent can revoke it any time.

## For the owner

- **Paste into Claude Code, Codex or OpenCode:** `Share this with TinyCloud, and ask me who should be able to open it: https://agents.tinycloud.xyz/share`
- You need a shell, Node.js 22.20 or later, and npm. A chat agent that can't run shell commands can't publish: have it write the document, save it as Markdown, and create the share yourself on share.tinycloud.xyz.
- **What it does:** installs the pinned TinyCloud CLI and the `tc-publish` skill, asks which audience you want, publishes, and returns the link.
- **You approve:** one OpenKey request for standing publish access to your share folders, for up to 30 days. Setup alone grants nothing.
- **Default is private.** With no audience named, the agent makes a link only your own email can open. It makes a public link only when you ask for one.
- **Undo:** see [Undo](#undo).

## For the agent

Keep the owner's request, then read [setup/agent.md](agent.md), select **publish/share** and follow its steps: it installs the pinned CLI (or uses the owner's `TC_BIN`) and only the `tc-publish` skill, records `TC_OWNER_EMAIL`, and never publishes publicly as a fallback. Then read the installed `tc-publish` `SKILL.md` and continue in this conversation: its §1 checks the CLI, §2 gets the owner's approval, §3-§6 publish, verify and report.

Use the skill's shell preamble and `TC_BIN` for every command. Don't call a bare `tc` (on Linux it is often the system traffic-control tool).

The rest of this page is what to run once the skill's §1 and §2 are done, and the options the skill doesn't cover.

### 1. Ask who can open it

If the owner didn't say, ask. Never guess and never choose public yourself. The choices map to `--to`:

| The owner says | `--to` value |
|---|---|
| Anyone with the link | `anyone` (the default) |
| Only me | `email:<owner email>` |
| One other person | `email:<their address>`, confirmed by the owner |
| Everyone at a company or school | `domain:<name>`, e.g. `domain:example.com` |
| A specific TinyCloud identity | `did:pkh:eip155:1:0x…` |

A bare address (`alex@example.com`) also works as `--to`; write the `email:` form so the intent is unambiguous. An invalid address is refused before anything is published, with `INVALID_ARGUMENT`.

Anything else fails: `--to must be anyone, a did:, an email address, or domain:example.com`.

### 2. Pick the content

The CLI publishes **files**, not folders. A directory fails with `MAX_BYTES_EXCEEDED` (observed on 1.2.3).

| Content | What to publish | What the recipient sees |
|---|---|---|
| Markdown document | `report.md` | Formatted page: headings, lists, tables, Mermaid |
| Text, JSON, image | the file | Shown in the browser |
| HTML page | one self-contained `.html` file | **See the HTML note below.** |
| JSX component | `App.jsx` or `App.tsx` with a default export (**see Artifacts below**) | Downloads today; the viewer has no JSX renderer yet. Don't promise a rendered app. |

Media type is inferred from the extension: `md`/`markdown`, `txt`, `html`/`htm`, `json`, `css`, `js`, otherwise `application/octet-stream`. The CLI release after 1.3.0-beta.30 also maps `jsx` to `text/jsx` and `tsx` to `text/tsx`; on any earlier CLI, pass `--media-type text/jsx` (or `text/tsx`). Override with `--media-type` for one file. File names must be one safe path segment; names with spaces are stored under a safe name.

**HTML note.** Before publishing HTML, run the skill's self-contained check: external `src`, `href`, CSS `url()` and network calls don't load in the viewer. Tell the owner what to expect: a public (anyone-with-link) HTML link renders in a sandboxed frame and an owner-only or other addressed one downloads. If you can't confirm what the recipient sees, say that: "the page may open as a download". Don't promise a rendered site.

**Several files.** Only for an addressed target (not `anyone`): `--prefix` with several file paths publishes them under one prefix. Each name must be a flat file name; nested folders can't be expressed. The viewer's full-site HTML mode needs a folder containing `index.html` chosen in the web composer, and nothing here confirms a CLI `--prefix` share triggers it. Don't tell the owner their site will render.

**Artifacts (pages and small apps).** A Markdown file, one self-contained HTML file, or one JSX component is an artifact: a file the recipient opens in the viewer, not a folder. HTML renders for anyone-with-link shares only; an addressed (`email:`, `domain:`, `did:`) HTML file downloads. JSX is meant to follow the same rule, but the viewer does not render it yet, so today a JSX file downloads for every link type. So when the owner wants a page that opens in the browser, say that, and ask whether anyone-with-link is acceptable; if the owner wants it private, use an addressed link and say it will download.

- **JSX (for when the viewer's JSX renderer is live):** `export default function App() { … }` in one file. The planned imports are `react`, `react-dom/client`, `lucide-react`, `recharts`, `d3` and `mermaid`, plus Tailwind classes. There will be no network in the sandbox, so embed the data. Until the renderer ships, publish a self-contained HTML page when the owner wants something that opens in the browser.
- **TinyCloud style tokens** are planned for artifacts so they can follow light and dark: `var(--tc-color-page|surface|text|text-muted|border|accent|on-accent|link)`, `var(--tc-space-1…7)`, `var(--tc-radius-sm|md|lg)`, `var(--tc-font-sans|mono)`. A viewer that doesn't provide them ignores them, so always write a fallback value, for example `var(--tc-color-text, #1a1c21)`.
- **Pin a version:** `--artifact new` stores the file as write-once version 1 and pins the link to it; a later publish of changed content with `--artifact <id>` (the `artifactId` in the JSON) makes version 2 with its own link, and the earlier link keeps showing version 1 (identical bytes to a bearer link return the same version). Needs CLI 1.3.0-beta.10 or newer, not the 1.2.3 this site pins; check with `"$TC_BIN" share publish --help | grep -q -- --artifact`. A profile approved on an older CLI must go through the skill's §2 consent again to add the `artifacts/` scope. A pinned share is read-only: `--action edit` is refused with `--artifact`.
- **Revoke:** `share revoke <id>` closes the link. Copies already opened or downloaded can't be recalled.
- Never put secrets or tokens in an artifact: everyone who holds the link can read its source.

### 3. Publish, with an expiry

Always pass `--expires` and tell the owner the date. Default when omitted is 7 days; the skill uses 7d for private and 24h for public links. The value can't pass the signed session's end and can't be under 60 seconds (`SESSION_LIFETIME_EXCEEDED`). The owner's approval lasts up to 30 days ([CLI reference](https://agents.tinycloud.xyz/skills/cli/REFERENCE.md)).

Run through the skill's §3 blocks, which wrap exactly these commands. Shape of the command, with `$TC_BIN` and `$PROFILE` from the skill's preamble (`PROFILE=publisher`):

```sh
# one person (owner-only is this with the owner's own address)
"$TC_BIN" --profile "$PROFILE" share publish "$FILE" --to "email:alex@example.com" --expires 7d --json

# anyone with the link
"$TC_BIN" --profile "$PROFILE" share publish "$FILE" --to anyone --expires 24h --json

# everyone at a domain
"$TC_BIN" --profile "$PROFILE" share publish "$FILE" --to "domain:example.com" --expires 7d --json
```

- `--json` prints redacted metadata with `metadata.shareId`; the link is not in it. Get the link as the skill does: `"$TC_BIN" --profile "$PROFILE" share show "$id" --reveal-link`. Never combine `--reveal-link` with `--json`.
- Everything after `#` in a link is the credential. Follow the skill's handling contract for storing and delivering it. Never retype or chunk a link.
- Edit access for an addressed recipient: add `--action read edit`; it takes a list, so put it last, after the file and the other flags. Only use it when the owner asks and only with an addressed `--to`; the Markdown editor is the share viewer's. Never pass `--action edit` with `anyone`: the CLI release after 1.3.0-beta.30 refuses it (`INVALID_ARGUMENT`, exit 2: a link only reads), and earlier CLIs publish a read-only link without saying so.
- Send the link to the recipient yourself (chat, email, wherever you talk). When they open it, the viewer emails them a one-time code to prove the address is theirs.

What the recipient does: opens the link; for `email:`/`domain:` links they prove the address with a code the viewer emails them. A bearer link opens without signing in.

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

Use the skill's report templates. State: the audience, the expiry date, what the recipient will see (use the HTML note for HTML), and that you can revoke. End with the link, once, in the owner's channel.

## Undo

Same as [Publish and share](publish.md#undo): revoking a share is separate from clearing the agent's local login; `"$TC_BIN" --profile publisher auth logout` clears only the local session.
