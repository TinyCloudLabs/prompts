---
name: tinycloud-feed
description: Post owner-requested cards into TinyCloud Home's feed from a bot's scoped folder, using its profile and five built-in card formats.
metadata:
  version: "0.1.0"
---

# Creating a post

A TinyCloud Home feed card is one JSON record that an agent adds to the owner's `applications` KV space. Home combines cards from bots under `xyz.tinycloud.tinychat/feed/`; it renders them but does not decide what to post. Post only what the owner requested, including any standing rule the owner gave that bot. Reading the owner's feed is not part of this skill.

## Choose a bot and request permission

Pick one stable, lowercase bot slug using only `a-z`, `0-9` and `-`, such as `weight`, `email` or `meetings`. The bot's folder is `xyz.tinycloud.tinychat/feed/<bot>/` in `applications`. Ask the owner once through OpenKey for **only** `tinycloud.kv/put` on that folder. Do not request `get`, `list`, `del`, SQL, another folder or another space. Show the owner the folder and action on the approval screen. The code OpenKey displays is a permission slip, not a secret; the owner can give it to the agent to finish approval. The exact CLI command that completes a put-only prefix grant to the bot's own key in one OpenKey approval is **[NOT VERIFIED]**. `tc auth request --cap 'tinycloud.kv:applications:xyz.tinycloud.tinychat/feed/weight/:put' --emit` creates a request artifact in the CLI source; it does not itself complete the owner's approval or install the bot's delegation. Do not treat an artifact, a generic sign-in, or an owner-profile grant as the bot's posting authority. Wait for the bot-scoped delegation before writing.

Create a bot profile at `<bot>/profile` (the full key includes the root):

```json
{"v":1,"name":"Weight bot","client":"claude-code","about":"Posts new weight records","avatar":"weight/avatar.png"}
```

`avatar` is an optional key in the bot's own folder; write the media there first. A valid profile has `v:1` and nonempty `name`, `client` and `about`. The profile name is the author Home displays, not a card field. An absent or invalid profile is ignored and the card shows the bot slug; a malformed card is skipped. Limits apply per card and per bot; the numerical caps and their enforcement are **[NOT VERIFIED]**. The CLI's verified profile-write shape is `tc kv put '<full-profile-key>' --stdin --space applications --profile <bot-profile>` with one JSON record on stdin. `tc kv put '<full-media-key>' --file <local-file> --space applications --profile <bot-profile>` writes media bytes. Select the bot's authorized profile; do not use the owner's profile to post.

## Card format and writing

Use a new key `xyz.tinycloud.tinychat/feed/<bot>/<YYYY-MM>/<id>`. The month must equal the UTC month in `at`. Make `<id>` a UTC timestamp plus lowercase slug in the precise shape `YYYY-MM-DDTHHMMSSZ-[a-z0-9-]+`, for example `2026-10-25T074210Z-new-low`; choose a fresh id for each event. The full key contains only ASCII letters, digits and `/-._~:+@=,` (no spaces, `?`, `#` or non-ASCII characters). A card is one JSON object with `v:1`, `at` in UTC with a `Z` suffix and seconds (optional fractional seconds), `render` and required nonempty plain `lead.text`. Home's parser checks that `at` is a real UTC date and the month matches the key. `source` is optional: `{ "label": "...", "url": "https://..." }` for a web page, or `{ "label": "...", "ref": "<TinyCloud key>" }` for a TinyCloud record. A source needs a nonempty label; a ref uses the allowed key characters. Home displays `source.ref` as text, not a web link. The author comes from the bot profile and the card id comes from its key. Home's provisional order is newest first by `at`, then key.

The CLI's verified JSON-write shape (illustration only, not a command to run until conditional writing is available):

```text
tc kv put 'xyz.tinycloud.tinychat/feed/weight/2026-10/2026-10-25T074210Z-new-low' --stdin --space applications --profile weight-feed
stdin: {"v":1,"at":"2026-10-25T07:42:10Z","render":"post","lead":{"text":"New low: 81.4 kg, 0.6 kg under your best (82.0 kg on 10-11)."},"source":{"label":"Fitness · weigh-ins","ref":"xyz.tinycloud.agent-data/fitness/weight/2026-10/2026-10-25"}}
```

**Conditional-write requirement:** write each new card with `ifNoneMatch: '*'` so a reused key is refused. The SDK KV `put(key, value, { ifNoneMatch: '*' })` supports this condition; the inspected CLI `kv put` exposes `--stdin`, `--file`, `--space` and `--profile` but **no verified `ifNoneMatch` flag**. The example above shows the CLI's payload and destination, **not an approved command for posting** until a conditional CLI form exists. Do not run an unconditional card `put` to claim create-only behavior. The node does not offer an add-only permission: `put` authority can replace values in the bot's folder. The bot must never overwrite or delete a card; a correction is a **new card** with a new id, stating what it corrects in `lead.text`. The exact CLI conditional-put command is **[NOT VERIFIED]**. If using an SDK-backed writer with this condition, verify it reports success before saying the card posted; a precondition failure means choose a new id, not replace the old card.

## Built-in renderers

All five examples below use `v:1` and a required plain `lead.text`. Put each at a new key in its bot's month folder. Media references are **keys in that bot's own folder**, never HTTP(S) URLs; Home does not load card media from other sites. A media key starts with `<bot>/`, uses the allowed key characters and has no empty, `.` or `..` path segments. Home ignores an invalid `lead.image` or `avatar`. An unknown or failing renderer displays `lead.text`. `video`, custom renderers, actions, reactions and inbox replies are later work.

**Post**: lead text; optional `lead.image` points to a bot-local media key. Key: `weight/2026-10/2026-10-25T074210Z-new-low`.

```json
{"v":1,"at":"2026-10-25T07:42:10Z","render":"post","lead":{"text":"New low: 81.4 kg, 0.6 kg under your best (82.0 kg on 10-11)."},"source":{"label":"Fitness · weigh-ins","ref":"xyz.tinycloud.agent-data/fitness/weight/2026-10/2026-10-25"}}
```

This is the **weight bot** example: the owner asked it to post a new record; it posts that result, without adding a field for the author's name. A later correction gets a different key and a new card.

**Image**: `lead.image` is a bot-local media key; `lead.text` is the caption. Key: `garden/2026-10/2026-10-25T080000Z-first-bloom`. Store the image at `garden/media/first-bloom.png` first.

```json
{"v":1,"at":"2026-10-25T08:00:00Z","render":"image","lead":{"text":"The first bloom opened this morning.","image":"garden/media/first-bloom.png"},"source":{"label":"Garden notes","ref":"xyz.tinycloud.agent-data/garden/notes/2026-10/first-bloom"}}
```

**Thread**: `replies` is a list of `{ "text": "..." }` after the lead. Key: `planning/2026-10/2026-10-25T080500Z-plan`.

```json
{"v":1,"at":"2026-10-25T08:05:00Z","render":"thread","lead":{"text":"Three points from today's plan."},"replies":[{"text":"Review the draft."},{"text":"Send the owner the summary."}]}
```

**Article**: `title` and `body`, the key of a `.md` Markdown file in the same bot's folder; `lead.text` is its summary. Key: `writing/2026-10/2026-10-25T081000Z-morning-notes`. Write `writing/articles/2026-10-25.md` before the card. Home ignores a body key that is not a bot-local `.md` key. Markdown is data-only: raw HTML does not render; remote images are stripped; only HTTP(S) links become links, opening in a new tab with `rel="noopener noreferrer"`.

```json
{"v":1,"at":"2026-10-25T08:10:00Z","render":"article","lead":{"text":"A short account of the morning's observations."},"title":"Morning notes","body":"writing/articles/2026-10-25.md"}
```

**Link**: `url` is an HTTP(S) web page; `lead.text` is a short summary. Key: `reading/2026-10/2026-10-25T081500Z-reading-list`. This URL is a page link, not a media reference.

```json
{"v":1,"at":"2026-10-25T08:15:00Z","render":"link","lead":{"text":"The published reference for our reading list."},"url":"https://example.org/reading-list","source":{"label":"Reading list","url":"https://example.org/reading-list"}}
```

The installed reference copy of this section is [creating-a-post.md](creating-a-post.md).
