# Share an artifact with TinyCloud

Your agent publishes a document or web page from your computer to your own TinyCloud and gives you a link. You decide who can open it: anyone with the link, one email address, or everyone at a domain. Every share expires, and your agent can revoke it.

## For the owner

- **Paste into Claude Code, Codex or OpenCode:** `Share this with TinyCloud, and ask me who should be able to open it: https://agents.tinycloud.xyz/share`
- You need a shell, Node.js 22.20 or later, and npm (`setup/README.md:5`). A chat agent that can't run shell commands can't publish: have it write the document, save it as Markdown, and create the share yourself on share.tinycloud.xyz.
- **What it does:** installs the pinned TinyCloud CLI and the `tc-publish` skill, asks which audience you want, publishes, and returns the link (`setup/publish.md:8`).
- **You approve:** one OpenKey request for standing publish access to your share folders, for up to 30 days. Setup alone grants nothing (`setup/publish.md:9`).
- **Default is private.** With no audience named, the agent makes a link only your own email can open. It makes a public link only when you ask for one (`skill:45`).
- **Undo:** see [Undo](#undo).

## For the agent

Keep the owner's request, then read [setup/agent.md](agent.md), select **publish/share** and follow its steps: it installs the pinned CLI (or uses the owner's `TC_BIN`) and only the `tc-publish` skill, records `TC_OWNER_EMAIL`, and never publishes publicly as a fallback (`setup/agent.md:9-13`, `setup/publish.md:14`). Then read the installed `tc-publish` `SKILL.md` and continue in this conversation: its §1 checks the CLI, §2 gets the owner's approval, §3-§6 publish, verify and report.

Use the skill's shell preamble and `TC_BIN` for every command. Don't call a bare `tc` (on Linux it is often the system traffic-control tool; `prompts/README.md:44`).

The rest of this page is what to run once the skill's §1 and §2 are done, and the options the skill doesn't cover.

### 1. Ask who can open it

If the owner didn't say, ask. Never guess and never choose public yourself (`skill:45`). The choices map to `--to`:

| The owner says | `--to` value | Source |
|---|---|---|
| Anyone with the link | `anyone` (the default) | share.ts:60, `.option("--to", …, "anyone")` at share.ts:299 |
| Only me | `email:<owner email>` | share.ts:63; `skill:47` |
| One other person | `email:<their address>`, confirmed by the owner | share.ts:63; `skill:47` |
| Everyone at a company or school | `domain:<name>`, e.g. `domain:example.com` | share.ts:62; REF "Share Publish, Inspect, Receive, List, Revoke" |
| A specific TinyCloud identity | `did:pkh:eip155:1:0x…` | share.ts:61; REF same section |

A bare address (`alex@example.com`) also works as `--to` (share.ts:64); write the `email:` form so the intent is unambiguous. An invalid address is refused before anything is published, with `INVALID_ARGUMENT` (share.ts:63, 69-75).

Anything else fails: `--to must be anyone, a did:, an email address, or domain:example.com` (share.ts:65).

### 2. Pick the content

The CLI publishes **files**, not folders. A directory fails with `MAX_BYTES_EXCEEDED` (observed on 1.2.3; the check is `!info.isFile()`, io.ts:65).

| Content | What to publish | What the recipient sees |
|---|---|---|
| Markdown document | `report.md` | Formatted page: headings, lists, tables, Mermaid (`skill:594`; viewer, `repositories/share/src/viewer/content.ts:35`) |
| Text, JSON, image | the file | Shown in the browser (`content.ts:35-37`) |
| HTML page | one self-contained `.html` file | **See the HTML note below.** |
| JSX app | not supported | There is no JSX renderer; don't publish `.jsx` and call it an app. |

Media type is inferred from the extension: `md`/`markdown`, `txt`, `html`/`htm`, `json`, `css`, `js`, otherwise `application/octet-stream` (share.ts:267-276). Override with `--media-type` for one file (share.ts:304). File names must be one safe path segment; names with spaces are stored under a safe name (share.ts:317, io.ts:55-58; `skill:258`).

**HTML note.** Before publishing HTML, run the skill's self-contained check (`skill:554-592`): external `src`, `href`, CSS `url()` and network calls don't load in the viewer. Tell the owner what to expect: the skill says a public HTML link renders in a sandboxed frame and an owner-only one downloads (`skill:462,552`). The share viewer's `classifyContent` currently sends `text/html` to "download" (`content.ts:34`). If you can't confirm what the recipient sees, say that: "the page may open as a download". Don't promise a rendered site.

**Several files.** Only for an addressed target (not `anyone`): `--prefix` with several file paths publishes them under one prefix (share.ts:322-324). Each name must be a flat file name; nested folders can't be expressed (io.ts:57, share.ts:317). The viewer's full-site HTML mode needs a folder containing `index.html` chosen in the web composer (`repositories/share/docs/html-artifact-sharing.md:3-6`), and nothing here confirms a CLI `--prefix` share triggers it. Don't tell the owner their site will render.

### 3. Publish, with an expiry

Always pass `--expires` and tell the owner the date. Default when omitted is 7 days; the skill uses 7d for private and 24h for public links (share.ts:349; `skill:254`). The value can't pass the signed session's end and can't be under 60 seconds (`SESSION_LIFETIME_EXCEEDED`, share.ts:117-125). The owner's approval lasts up to 30 days (`setup/publish.md:9`; REF "`--expiry`" row).

Run through the skill's §3 blocks, which wrap exactly these commands. Shape of the command, with `$TC_BIN` and `$PROFILE` from the skill's preamble (`PROFILE=publisher`):

```sh
# one person (owner-only is this with the owner's own address) — skill:308-310 and the owner-only block
"$TC_BIN" --profile "$PROFILE" share publish "$FILE" --to "email:alex@example.com" --expires 7d --json

# anyone with the link — skill:308-310
"$TC_BIN" --profile "$PROFILE" share publish "$FILE" --to anyone --expires 24h --json

# everyone at a domain — share.ts:62, REF "Share Publish, Inspect, Receive, List, Revoke"
"$TC_BIN" --profile "$PROFILE" share publish "$FILE" --to "domain:example.com" --expires 7d --json
```

- `--json` prints redacted metadata with `metadata.shareId`; the link is not in it (`skill:308-313`, share.ts:373). Get the link as the skill does: `"$TC_BIN" --profile "$PROFILE" share show "$id" --reveal-link` (share.ts:457; `skill:312`). Never combine `--reveal-link` with `--json` (share.ts:462).
- Everything after `#` in a link is the credential. Follow the skill's handling contract for storing and delivering it (`skill:34-41`). Never retype or chunk a link.
- Edit access for an addressed recipient: add `--action read edit` (share.ts:305, 278-282); it takes a list, so put it last, after the file and the other flags. Only use it when the owner asks and only with an addressed `--to`; the Markdown editor is the share viewer's. Don't use `--action` with `anyone`; that combination isn't evidenced.
- To email an invitation to an exact-email recipient, add `--notify`; for a domain, `--notify --notify-to <mailbox at that domain>` (share.ts:300-301, 325-339; REF "Share Publish Options"). Only when the owner asks. The recipient's viewer sends its own code either way (`skill:49`).

What the recipient does: opens the link; for `email:`/`domain:` links they prove the address with a code the viewer emails them (`skill:49`, `skill:458`). A bearer link opens without signing in (`skill:460`).

### 4. List and look up shares

```sh
"$TC_BIN" --profile "$PROFILE" share list --json     # sender history; no complete links — share.ts:442-453, REF "…List, Revoke"
"$TC_BIN" --profile "$PROFILE" share show "$id"      # one record — share.ts:455-467
```

`share list --json` returns `{"shares":[{shareId, target, expiresAt, revoked, …}]}`; filter out `revoked` and past `expiresAt` before calling a share active (`skill:390-410`). Ids: public shares are CIDs (`bafkr4…`), addressed shares 32 hex characters (`skill:390`).

### 5. Revoke

```sh
"$TC_BIN" --profile "$PROFILE" share revoke "$id"    # share.ts:497-513; REF "…Revoke": bearer or addressed share this profile created
"$TC_BIN" --profile "$PROFILE" share show "$id"      # afterwards reports "revoked": true — skill:450
```

Report honestly what revoke did. `share revoke` is for shares this profile created (share.ts:498). `--ancestor` revokes the owner delegation ancestry (share.ts:499); don't pass it unprompted. Copies a recipient already downloaded can't be recalled (REF "Bearer vs addressed": "revocation cannot recall copies already received"). **Known conflict:** REF says bearer links are revocable; `skill:452` and `setup/publish.md:20` say public links can't be revoked. After a revoke of a public link, confirm with `share receive` on the link (`SHARE_REVOKED`, REF) before telling the owner it's closed; if it still opens, say so.

### 6. Report

Use the skill's report templates (`skill:456-464`). State: the audience, the expiry date, what the recipient will see (use the HTML note for HTML), and that you can revoke. End with the link, once, in the owner's channel.

## Undo

Same as [Publish and share](publish.md#undo): revoking a share is separate from clearing the agent's local login; `"$TC_BIN" --profile publisher auth logout` clears only the local session (`setup/publish.md:21`).
