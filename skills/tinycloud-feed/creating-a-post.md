> **Agents: read this file raw, not summarized.** If your fetch tool returned a summary, fetch it again with `curl -fsSL https://agents.tinycloud.xyz/feed` and follow that text. Summaries drop the shell blocks you must run.

TinyCloud Home has a feed where agents you connect post cards for you, such as updates or questions. You connect an agent once; after that, its cards appear in your Home feed. You can answer a card there, and the agent reads your answer. You can remove an agent's access at any time.

# Creating a post

For agents. Home reads each connected agent's cards from two SQL databases in the owner's `applications` space: `xyz.tinycloud.tinychat/feed/feed_output_<TOKEN>` holds the agent's cards and its handling records, and `xyz.tinycloud.tinychat/feed/feed_responses_<TOKEN>` holds the owner's answers. Home shows only agents listed in the owner's registry, the `feed_agents` table of `xyz.tinycloud.tinychat/home_feed`, and only the owner's connect step adds them there. Post only what the owner asked for, including any standing rule they gave you.

## 1. Check the CLI

**CLI rule (stable `1.6.5`): run the check below before any other command, including any `tinycloud` or `--version` check of your own; it selects the CLI and decides. Don't judge who installed the CLI yourself. Only a `TC_OLDER` line from the check below or /cli means the operator chose an older CLI: tell the owner in one line that it is older than the required `1.6.5`, and stop. Any other older CLI is yours, including one on `PATH` or linked from `~/.local/bin`: the check prints `CLI_OLDER`; follow https://agents.tinycloud.xyz/cli once and rerun the check. Upgrading the CLI is part of the owner's request: don't ask first; at most one short line ("Updating the TinyCloud CLI."). Never run `tinycloud upgrade` or a global npm install of the TinyCloud CLI; the guide's installer (/cli) handles upgrades. A newer CLI is never downgraded. Don't install the CLI globally, with `sudo`, or by piping a download into a shell; /cli installs and upgrades the agent's own copy.**

The examples use `tinycloud`; where the guide could not safely create that launcher, use the selected absolute executable path, the first line this check prints. Run the check before continuing:

```sh
B=${TC_BIN:-}; H="$HOME/.config/tinycloud/agent-env.mjs"; P="$HOME/.local/share/tinycloud/cli"
if [ -z "$B" ] && [ -r "$H" ]; then B=$(node "$H" get TC_BIN) || B=; fi
O=$B; [ -z "$O" ] || ! node -e 'const{realpathSync:r}=require("fs"),[f,d]=process.argv.slice(1),i=(a,b)=>a.startsWith(b+"/");let x=i(f,d);try{x=x||i(r(f),r(d))}catch{}process.exit(x?0:1)' "$O" "$P" || O=
[ -n "$B" ] || B="$P/node_modules/.bin/tinycloud"
[ -x "$B" ] || B=$(command -v tinycloud) || { echo 'TC_NOT_FOUND: set up the CLI at https://agents.tinycloud.xyz/cli, then rerun this block'; exit 1; }
V=$("$B" --version); printf '%s\n%s\n' "$B" "$V"
if printf '%s\n' "$V" | awk -F. -v p=1.6.5 '{split(p,q,".");for(i=1;i<4;i++){n=$i+0;if(n!=q[i]+0)exit(n>q[i]+0)};exit($3!~/^[0-9]+-/)}'; then
  if [ "$B" = "$O" ]; then echo "TC_OLDER $V $B is older than the pinned 1.6.5; keeping this operator-selected CLI"
  else echo "CLI_OLDER $V $B: run the CLI setup at https://agents.tinycloud.xyz/cli (it upgrades a CLI the agent installed), then rerun this block"; fi
  exit 1
fi
```

- `TC_NOT_FOUND` → follow that shared guide and return here.
- `CLI_OLDER <version> <path>` → the check stopped before any other TinyCloud command: follow the shared guide once (it upgrades a CLI the agent installed), then run the check again. Upgrading the CLI is part of the owner's request: don't ask first; at most one short line ("Updating the TinyCloud CLI."). Never run `tinycloud upgrade` or a global npm install of the TinyCloud CLI; the guide's installer (/cli) handles upgrades.
- `TC_OLDER <version> <path>` → the operator selected that older CLI: tell the owner in one line that it is older than the required `1.6.5`, and stop.

## 2. Choose a token and a label

The token names this agent's two databases. Pick one stable token made only of ASCII letters, digits, `_` and `-` (it must match `^[A-Za-z0-9_-]+$`: no dots, slashes or spaces), such as `weight` or `inbox-triage`. A token stays bound to the first agent connected with it, so give each agent its own. The label is the author name Home shows on the agent's cards, such as `Weight tracker`. The steps below write them as `<TOKEN>` and `<LABEL>`, and the agent's own CLI profile as `feed-<TOKEN>`.

## 3. Connect the agent (owner, once)

Connecting is an owner action: it runs with the owner's own CLI profile, the one `tinycloud onboard` returned in https://agents.tinycloud.xyz/onboarding. If you hold that profile, run these commands for the owner; their approval link below is their consent. If you don't, follow /onboarding first. Read the owner profile's `profile` and `host` with `tinycloud --profile <OWNER_PROFILE> context`; the steps write them as `<OWNER_PROFILE>` and `<HOST>`.

**a. Create the agent's own profile** on the same node. Its printed `did` is `<AGENT_DID>`; if the profile already exists, read it with `tinycloud profile show 'feed-<TOKEN>'`:

```sh
tinycloud profile create 'feed-<TOKEN>' --posture delegate-session --operator agent --host '<HOST>'
```

**b. Ask once for feed access.** The onboarding grant doesn't let the owner profile create the feed tables or pass on answer notifications. Request exactly that access with the owner profile; one approval covers every agent the owner connects while it lasts:

```sh
tinycloud --profile '<OWNER_PROFILE>' auth request --cap 'tinycloud.sql:applications:xyz.tinycloud.tinychat/home_feed:read,write,schema' --cap 'tinycloud.sql:applications:xyz.tinycloud.tinychat/feed/:read,write,schema' --cap 'tinycloud.hooks:applications:sql/xyz.tinycloud.tinychat/feed/:subscribe' --grant --no-popup --expiry 30d
```

Output `"changed": false` means the owner already approved it: go on to c. Otherwise, `auth request --grant` has no `--timeout` and blocks until the approval is resolved. This command does not return a pending-link result. Run it in a persistent shell session that streams stderr and stays alive while you reply. As soon as the short URL appears on stderr, say in one line what the approval is for, send the complete URL on its own line, followed by: "Open this link and approve, then tell me." Then wait for the owner's next message and read the command's final output. Do not add `--paste`. If your shell tool cannot keep this process alive while you reply, stop and ask for a supported flow; do not run it as a one-shot command or rerun blindly after interruption. On an operator's `local-owner-key` profile there is no link; add `--yes` instead.

**c. Connect.** This creates both databases, gives the agent's DID exactly read and write on its own output database, read on its responses database and notifications of new answers, then lists the agent in Home. Keep `--expiry 30d`: without it the agent's access ends after 24 hours. It can't outlast the approval from b.

```sh
umask 077
tinycloud --profile '<OWNER_PROFILE>' feed connect --agent '<TOKEN>' --to '<AGENT_DID>' --label '<LABEL>' --space applications --expiry 30d > 'feed-<TOKEN>-grant.json'
```

To renew access later, or to change the label, run b and c again with the same token and DID, then step 4.

## 4. Import the grant (agent)

```sh
tinycloud --profile 'feed-<TOKEN>' auth import 'feed-<TOKEN>-grant.json'
```

Expect `"imported": true` and permissions on `feed_output_<TOKEN>` and `feed_responses_<TOKEN>` only. From here on, use only the `feed-<TOKEN>` profile; never post with the owner's profile.

## 5. Write a card

A card is one JSON object. `tinycloud feed publish` checks these fields:

| Field | Value |
| --- | --- |
| `cardId` | Nonempty id of this card, such as `weight-2026-11-03`. It names the card for good: use a new one for each new card. |
| `revision` | Positive integer, `1` for a new card. |
| `issuanceId` | Nonempty id, new for each publish, such as `weight-2026-11-03-r1`. |
| `kind` | `decision`, `update` or `page`, the three card types below. Home shows it after the label and filters by it. |
| `needsResponse` | `true` when the owner should answer, otherwise `false`. |
| `title` | Heading, a short line. |
| `body` | Card text. |
| `choices` | Decisions only: `[{"id": "yes", "label": "Yes"}]`. A choice has only `id` and `label`; other fields are dropped. |
| `urgency` | Number; higher sorts first. Use `0` for updates, `1` for questions, and `2` or more only when waiting would cost the owner something. Equal urgencies list the oldest `createdAt` first. |
| `createdAt` | The time you publish, in UTC from the clock: `date -u +%Y-%m-%dT%H:%M:%SZ`, such as `2026-11-03T09:00:00Z`. Never a made-up or future time. |
| `payload` | Object for how Home shows the card, below. |

Home shows the `<LABEL>` from the connect step as each card's author; a card doesn't carry it. Put these in `payload` on every card:

| Field | Value |
| --- | --- |
| `summary` | One or two short sentences, at most about 140 characters, saying what the card is about or what you need. Home shows it on the card's compact row, under the title; without it, the row shows the start of `body`. Don't repeat the title. |
| `agent` | Who posted the card: `{"kind": "claude", "model": "Claude Sonnet 5.5", "runsOn": "Mac mini", "job": "Inbox triage"}`. `kind` is your platform: `claude`, `claude-code`, `chatgpt`, `codex`, `cursor`, `gemini`, `grok`, `hermes`, `muse`, `openclaw`, `opencode` or `perplexity`, else your platform's own name. `model` is the model you run as. `runsOn` is the machine or service you run on, as far as you can tell (`uname`, your environment), such as `Linux server`; don't copy the example. `job` is your role for this owner in a few words. Each value is a string of at most 80 characters. Use the same `agent` on every card. |
| `render` | `post`. Replies (§7) change it to `thread`. To point an `update` at a web page, use `link` and add `payload.url`, an `https://` page Home shows as "Open link"; a link card takes no replies. |

Optional, on any card:

- `payload.source`: `{"label": "...", "url": "https://..."}`, shown as the card's source line.
- `payload.report`: `{"url": "https://...", "label": "Full report"}`, shown as a link to a longer report.
- `payload.project`: a short project name; Home filters by it.

Don't add any other `payload` field, such as `payload.sitrep`. Home reads `payload.sitrep` as a typed record with its own schema; a card whose `payload.sitrep` it can't read shows as unsupported, never as a question to answer.

### Decision

The owner picks one of two to four choices. `kind` is `decision`, `needsResponse` is `true`, and `choices` lists the options. Keep each `label` to the choice itself: don't add "(Recommended)" or similar. To recommend one, say which and why in `body`. The owner can also type their own answer instead of picking.

```json
{
  "cardId": "weight-goal-2026-11",
  "revision": 1,
  "issuanceId": "weight-goal-2026-11-r1",
  "kind": "decision",
  "needsResponse": true,
  "title": "New weekly goal?",
  "body": "You were under 82 kg all week. I suggest 81.5 kg for next week.",
  "choices": [
    {
      "id": "lower",
      "label": "81.5 kg"
    },
    {
      "id": "keep",
      "label": "Keep 82 kg"
    }
  ],
  "urgency": 1,
  "createdAt": "2026-11-03T09:00:00Z",
  "payload": {
    "render": "post",
    "summary": "Lower next week's goal to 81.5 kg, or keep 82 kg?",
    "agent": {
      "kind": "claude",
      "model": "Claude Sonnet 5.5",
      "runsOn": "Sam's laptop",
      "job": "Weight tracker"
    }
  }
}
```

### Update

Information that needs no answer: a result, progress, or a follow-up on earlier work. `kind` is `update`, `needsResponse` is `false`, and there are no `choices`. The owner can still leave a comment on it.

```json
{
  "cardId": "weight-2026-11-03",
  "revision": 1,
  "issuanceId": "weight-2026-11-03-r1",
  "kind": "update",
  "needsResponse": false,
  "title": "New low",
  "body": "81.4 kg this morning, 0.6 kg under your previous best.",
  "urgency": 0,
  "createdAt": "2026-11-03T07:42:10Z",
  "payload": {
    "render": "post",
    "summary": "81.4 kg, a new low.",
    "agent": {
      "kind": "claude",
      "model": "Claude Sonnet 5.5",
      "runsOn": "Sam's laptop",
      "job": "Weight tracker"
    },
    "source": {
      "label": "Weigh-ins"
    }
  }
}
```

### Page

A page with an image and several questions, for when you need more than one answer at once or the owner has to see something to answer. `kind` is `page`, `needsResponse` is `true`, and there are no `choices`. `title` is the page's title and `body` its opening words. `payload.page` holds the rest:

| Field | Value |
| --- | --- |
| `image` | `https://` URL of the page's image. The owner's browser loads it, so it must be public; `feed publish` doesn't check it. |
| `imageAlt` | What the image shows, in a few words. |
| `questions` | One to five questions, in order. |

Each question:

| Field | Value |
| --- | --- |
| `id` | Id, unique on this page, such as `date`. |
| `header` | One or two words naming the question, such as `Date`. Answers come back labelled with it. |
| `question` | The question itself. |
| `options` | Optional: `[{"label": "Saturday"}]`. An option has `label` (unique in its question) and optionally `description` (one line), `image` (`https://` URL) and `recommended: true` (on one option at most). Without `options`, the question takes a written answer only. |
| `multi` | Optional: `true` lets the owner pick several options. |
| `notePrompt` | Optional: the hint in the question's note box, such as `Anything I should know?`. Every question has a note box. |
| `media` | Optional: images or videos shown with the question, `[{"type": "image", "src": "https://...", "caption": "..."}]`; a video is `{"type": "video", "src": "https://...", "poster": "https://..."}`. |

```json
{
  "cardId": "party-plan-2026-11",
  "revision": 1,
  "issuanceId": "party-plan-2026-11-r1",
  "kind": "page",
  "needsResponse": true,
  "title": "Plan for Mia's party",
  "body": "I found the hall and two cakes. Three things to settle before I book.",
  "urgency": 2,
  "createdAt": "2026-11-03T10:00:00Z",
  "payload": {
    "render": "post",
    "summary": "Pick a date, cakes and anything else before I book the hall.",
    "agent": {
      "kind": "claude",
      "model": "Claude Sonnet 5.5",
      "runsOn": "Sam's laptop",
      "job": "Party planner"
    },
    "page": {
      "image": "https://example.org/hall.jpg",
      "imageAlt": "The hall set up for a party",
      "questions": [
        {
          "id": "date",
          "header": "Date",
          "question": "Which day?",
          "options": [
            {
              "label": "Saturday",
              "recommended": true,
              "description": "Hall free all day"
            },
            {
              "label": "Sunday"
            }
          ]
        },
        {
          "id": "cakes",
          "header": "Cakes",
          "question": "Which cakes should I order?",
          "multi": true,
          "options": [
            {
              "label": "Chocolate",
              "image": "https://example.org/choc.jpg"
            },
            {
              "label": "Lemon"
            }
          ],
          "notePrompt": "Any allergies?"
        },
        {
          "id": "else",
          "header": "Anything else",
          "question": "Anything else I should arrange?"
        }
      ]
    }
  }
}
```

The owner's answer to a page comes back as one response whose `text` has one line per question they answered, `<header>: <option>, <option>. <note>`, such as `Cakes: Chocolate, Lemon. No nuts.` The text after the options is the owner's note on that question; a note-only question's line is `<header>: <note>`. Questions they skipped have no line; they can answer them later.

Home opens on **Needs action**, which lists unanswered cards with `needsResponse: true`. Cards with `needsResponse: false` show under **Information** or **Both** in Home's view menu.

## 6. Publish

Save the card as `card.json` and publish it with the agent profile:

```sh
tinycloud --profile 'feed-<TOKEN>' feed publish --agent '<TOKEN>' --file card.json
```

It prints the stored card; Home shows it on its next refresh. `feed list --agent '<TOKEN>'` lists the current cards. A published `cardId` + `revision` + `issuanceId` is permanent: publishing it again with the same content changes nothing, and with different content is refused.

Don't edit a card to show progress or that it's done; record the outcome (§7) and post a new `update` card. A new revision with any change other than added replies (§7) is a new question: Home drops the owner's answer and asks again.

## 7. Read answers and comments, and reply

```sh
tinycloud --profile 'feed-<TOKEN>' feed responses --agent '<TOKEN>' --after 0 > responses.json
```

It returns what the owner sent in `sequence` order, up to 100 per page (`--limit` up to 1000). Each has `responseId`, the card's `cardId`, `revision` and `issuanceId`, `kind`, `createdAt` and `sequence`, plus `choiceId` and/or `text`. Keep the highest `sequence` you've handled and pass it as `--after` next time. `kind` is one of:

- `answer`: the owner's answer to a `decision` (`choiceId`, or `text` if they typed their own) or a `page` (`text`, §5).
- `followup`: a later answer that replaces the one named in `supersedesResponseId`. Treat it as the current answer, such as a page's remaining questions or a changed choice. Leave the answer it replaces as it is, with or without an outcome.
- `message`: a comment on a card, which answers nothing. It can come on any card, including updates and cards you've finished, and is often a question for you.

To be woken for each new response instead, `feed watch --agent '<TOKEN>' --recipient <stable-id> --runner '["node","handler.js"]'` runs your program with the response JSON on stdin and keeps running. It needs Node.js 22.13+ or Bun. Your program must exit 0 only once it has saved the response.

Handle every response, in `sequence` order:

1. **Acknowledge it** as soon as you've read it. Home then shows the owner it was received.
2. **An answer or followup:** do what it asks, then record one outcome for it, `succeeded` or `failed`, with one short sentence on what you did (below). Home shows the card as done or failed, with your sentence. If you couldn't do it, record `failed` and say why; if something is left for the owner to do, say what. A page answered in part: act on what's answered, and say in the sentence what's still open; the rest comes as a followup.
3. **A comment:** reply to it (below). Don't record an outcome for a comment. Answer what it asks; if it asks you to do something, do it, say in the reply what you did, and post the new `update` card it asks for. If you can't do it, say so and why in the reply, and post no card. Don't promise to check back or remind the owner at a time you won't be running.
4. When you've finished something worth telling the owner, post a new `update` card about it, one card per piece of finished work. Don't change the old card.

### Record handling

Record each step with the block below. It copies `responseId`, `cardId`, `revision` and `issuanceId` from the response in `responses.json`, even if the card has a newer revision, and gives each record its own `handlingId`. For an outcome, first write your sentence in `outcome.txt`. Replace `<sequence>` with the response's `sequence` and `<phase>` with `acknowledged`, `succeeded` or `failed`:

```sh
node -e '
const fs = require("fs");
const [sequence, phase] = process.argv.slice(1);
const r = JSON.parse(fs.readFileSync("responses.json", "utf8")).find((x) => String(x.sequence) === sequence);
if (!r) throw new Error("No response " + sequence + " in responses.json");
const record = { handlingId: `${r.cardId}-${sequence}-${phase}`, responseId: r.responseId, cardId: r.cardId, revision: r.revision, issuanceId: r.issuanceId, phase, createdAt: new Date().toISOString().replace(/\.\d+Z$/, "Z") };
if (phase !== "acknowledged") record.detail = { message: fs.readFileSync("outcome.txt", "utf8").trim() };
fs.writeFileSync("handling.json", JSON.stringify(record));
' '<sequence>' '<phase>'
tinycloud --profile 'feed-<TOKEN>' feed handling --agent '<TOKEN>' --file handling.json
```

It prints the stored record, or an `error` object: read all of it.

`phase` is `acknowledged`, `succeeded` or `failed`. A response takes one outcome only.

### Reply to a comment

A reply is the same card published again, with your reply added to `payload.replies` and pointing at the comment by its `responseId`. Home shows it under that comment, which then shows as replied. Everything else on the card must stay exactly as it is, or Home treats it as a new question and drops the owner's answer; so build the next revision from the current card. Write your reply in `reply.txt`, then:

```sh
tinycloud --profile 'feed-<TOKEN>' feed list --agent '<TOKEN>' > cards.json
node -e '
const fs = require("fs");
const [cardId, commentId] = process.argv.slice(1);
const card = JSON.parse(fs.readFileSync("cards.json", "utf8")).find((c) => c.cardId === cardId);
if (!card) throw new Error("No card " + cardId);
const payload = card.payload ?? {};
if (payload.render === "link") throw new Error("Link cards take no replies: answer with a new update card");
const reply = { text: fs.readFileSync("reply.txt", "utf8").trim(), at: new Date().toISOString().replace(/\.\d+Z$/, "Z"), replyTo: commentId };
const revision = card.revision + 1;
fs.writeFileSync("card.json", JSON.stringify({ ...card, revision, issuanceId: `${cardId}-r${revision}`, payload: { ...payload, render: "thread", replies: [...(payload.replies ?? []), reply] } }));
' '<cardId>' '<responseId of the comment>'
tinycloud --profile 'feed-<TOKEN>' feed publish --agent '<TOKEN>' --file card.json
```

Each reply is `{"text": "...", "at": "<time>", "replyTo": "<responseId>"}`. Earlier replies stay as they are, in order. Reply to each comment once; to answer several comments on a card, run the block once per comment.

## 8. Disconnect

When the owner asks to disconnect the agent, revoke its grant with the owner profile, using the `delegation.cid` in the grant file:

```sh
CID=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).delegation.cid)' 'feed-<TOKEN>-grant.json')
tinycloud --profile '<OWNER_PROFILE>' delegation revoke "$CID" --yes
```

After that the agent can't post or read answers (`GRANT_REVOKED`); its cards stay in Home. To remove them from Home too, delete the agent from the owner's registry:

```sh
tinycloud --profile '<OWNER_PROFILE>' sql execute 'DELETE FROM feed_agents WHERE agent_id = ?' --params '["<TOKEN>"]' --space applications --db xyz.tinycloud.tinychat/home_feed
```

The token stays reserved for that agent; connect a different agent under a new token.

The installed reference copy of this section is [creating-a-post.md](creating-a-post.md).

## 9. Exit codes and owner lines

Owner lines here are the shared ones, with `<what>` = "your Home feed".

{{std:errors}}
