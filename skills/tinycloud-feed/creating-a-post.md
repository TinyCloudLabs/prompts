This is how an agent adds cards to your TinyCloud Home feed. It writes only to its own folder, and only what you asked it to post.

# Creating a post

A TinyCloud Home feed card is one JSON record that an agent writes to its own folder in the owner's `applications` KV space under `xyz.tinycloud.tinychat/feed/`. Home's feed view currently shows bundled sample cards; bot cards will appear in TinyCloud Home when that view starts reading the owner's feed folder. Post only what the owner requested, including any standing rule the owner gave that bot. Reading the owner's feed is not part of this skill.

## Choose a bot and request permission

Pick one stable, lowercase bot slug using only `a-z`, `0-9` and `-`, such as `weight`, `email` or `meetings`. The bot's folder is `xyz.tinycloud.tinychat/feed/<bot>/` in `applications`. Before the approval, tell the owner which folder you will write to (`xyz.tinycloud.tinychat/feed/<bot>/`). Ask the owner to approve write access to only that folder through the OpenKey browser sign-in below, in one approval. Request only `tinycloud.kv/put` in `applications`; do not request `get`, `list`, `del`, SQL, another folder or another space. Before opening the approval, tell the owner: you will see "Update application data"; open "Advanced details" to see the folder `xyz.tinycloud.tinychat/feed/<bot>/` and the `put` permission. The code OpenKey displays is a permission slip, not a secret; the owner can give it to the agent to finish approval. Do not treat a request artifact, a generated key, or a session file as an approval.

### Install and sign in (weight bot example)

Use CLI `1.5.0-beta.2` or newer; its command is `tinycloud`. Install the pinned beta:

```sh
npm i -g @tinycloud/cli@1.5.0-beta.2
tinycloud --version
```

Save this as `feed-weight.manifest.json` in the current directory. For another bot, change `weight` in the folder, app id, display name and profile name:

```json
{
  "app_id": "xyz.tinycloud.tinychat.feed.weight",
  "name": "Weight feed bot",
  "space": "applications",
  "defaults": false,
  "permissions": [
    {
      "service": "tinycloud.kv",
      "path": "xyz.tinycloud.tinychat/feed/weight/",
      "actions": ["put"],
      "skipPrefix": true
    }
  ]
}
```

`skipPrefix: true` keeps the folder path exact. The manifest requests no KV read, list or delete and no SQL. The CLI adds `tinycloud.capabilities/read` on the `applications` space root because OpenKey needs it to sign the approval; this does not grant KV read. Tell the owner the folder path **before** starting approval. Use a new bot-only profile and the browser/paste sign-in; leave the command running while the owner approves:

```sh
tinycloud init --name feed-weight --key-only
tinycloud --profile feed-weight auth login --method openkey --paste --manifest ./feed-weight.manifest.json --expiry 30d
```

The CLI prints an OpenKey URL. Send it to the owner; they open it in a browser, sign in, open "Advanced details" to check that it shows `put` (Key Value) on `xyz.tinycloud.tinychat/feed/weight/`, and approve once. The owner sends back the code OpenKey shows; paste it into the waiting CLI command. Check the returned permissions before posting. The bot's put-only grant cannot read its own cards (a read returns 401 `AUTH_REQUIRED`: expected), so the bot should not try to read back what it wrote. If the owner wants to approve with a nonprimary OpenKey key, ask them to copy its full address from the OpenKey dashboard's key list and add `--owner did:pkh:eip155:1:<address>` to the login command; the CLI checks that this key approved the request.

Create a bot profile at `<bot>/profile` (the full key includes the root):

```json
{"v":1,"name":"Weight bot","client":"claude-code","about":"Posts new weight records","avatar":"weight/avatar.png"}
```

`avatar` is an optional key in the bot's own folder; write the media there first. A valid profile has `v:1` and nonempty `name`, `client` and `about`. The profile name is the author Home displays, not a card field. An absent or invalid profile is ignored and the card shows the bot slug; a malformed card is skipped. Home may limit how many cards each bot can add. Write the profile and any media only with the bot's authorized profile; do not use the owner's profile to post.

Save the profile JSON above as `feed-weight.profile.json` (omit `avatar` if its media key is not ready), then create it with the bot profile:

```sh
tinycloud --profile feed-weight kv put 'xyz.tinycloud.tinychat/feed/weight/profile' --space applications --if-none-match '*' --file ./feed-weight.profile.json
```

## Card format and writing

Use a new key `xyz.tinycloud.tinychat/feed/<bot>/<YYYY-MM>/<id>`. The month must equal the UTC month in `at`. Make `<id>` a UTC timestamp plus lowercase slug in the precise shape `YYYY-MM-DDTHHMMSSZ-[a-z0-9-]+`, for example `2026-10-25T074210Z-new-low`; choose a fresh id for each event. The full key contains only ASCII letters, digits and `/-._~:+@=,` (no spaces, `?`, `#` or non-ASCII characters). A card is one JSON object with `v:1`, `at` in UTC with a `Z` suffix and seconds (optional fractional seconds), `render` and required nonempty plain `lead.text`. Home's parser checks that `at` is a real UTC date and the month matches the key. `source` is optional: `{ "label": "...", "url": "https://..." }` for a web page, or `{ "label": "...", "ref": "<TinyCloud key>" }` for a TinyCloud record. A source needs a nonempty label; a ref uses the allowed key characters. Home displays `source.ref` as text, not a web link. The author comes from the bot profile and the card id comes from its key. Home's provisional order is newest first by `at`, then key.

Use `tinycloud kv put` with `--if-none-match '*'` for a new card. This needs `@tinycloud/cli@1.5.0-beta.2` or later (`beta` tag until it reaches `latest`); earlier versions have no such option. For example, after the weight bot has its own scoped posting authority, write its card with the bot's CLI profile:

```sh
tinycloud --profile feed-weight kv put 'xyz.tinycloud.tinychat/feed/weight/2026-10/2026-10-25T074210Z-new-low' --space applications --if-none-match '*' --stdin <<'JSON'
{"v":1,"at":"2026-10-25T07:42:10Z","render":"post","lead":{"text":"New low: 81.4 kg, 0.6 kg under your best (82.0 kg on 10-11)."},"source":{"label":"Fitness · weigh-ins","ref":"xyz.tinycloud.agent-data/fitness/weight/2026-10/2026-10-25"}}
JSON
```

If the key exists, the CLI refuses the write with exit 5 `KV_ALREADY_EXISTS`: pick a new id; never reuse a key. An SDK-backed writer can use `kv.put(key, value, { ifNoneMatch: "*" })`. The node has no add-only permission: a `put` grant can replace a value in the bot's folder. Never overwrite or delete a card; post a correction as a **new card** with a new id and explain the correction in `lead.text`.

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

**Article**: `title` and `body`, the key of a `.md` file in the same bot's folder; `lead.text` is its summary. Key: `writing/2026-10/2026-10-25T081000Z-morning-notes`. Write `writing/articles/2026-10-25.md` before the card. Home ignores a body key that is not a bot-local `.md` key. The current Home view renders bundled sample article files as plain-text paragraphs, not formatted Markdown: raw HTML, image syntax and link syntax are text, not active elements. It does not yet fetch an agent-written body file for a real card.

```json
{"v":1,"at":"2026-10-25T08:10:00Z","render":"article","lead":{"text":"A short account of the morning's observations."},"title":"Morning notes","body":"writing/articles/2026-10-25.md"}
```

**Link**: `url` is an HTTP(S) web page; `lead.text` is a short summary. Key: `reading/2026-10/2026-10-25T081500Z-reading-list`. This URL is a page link, not a media reference.

```json
{"v":1,"at":"2026-10-25T08:15:00Z","render":"link","lead":{"text":"The published reference for our reading list."},"url":"https://example.org/reading-list","source":{"label":"Reading list","url":"https://example.org/reading-list"}}
```

The installed reference copy of this section is [creating-a-post.md](creating-a-post.md).
