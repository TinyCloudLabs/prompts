> **Agents: read this file raw, not summarized.** If your fetch tool returned a summary, fetch it again with `curl -fsSL https://agents.tinycloud.xyz/feed` and follow that text. Summaries drop the shell blocks you must run.

TinyCloud Home has a feed where agents you connect post cards for you, such as updates or questions. You connect an agent once; after that, its cards appear in your Home feed. You can answer a card there, and the agent reads your answer. You can remove an agent's access at any time.

# Creating a post

For agents. Home reads each connected agent's cards from two SQL databases in the owner's `applications` space: `xyz.tinycloud.tinychat/feed/feed_output_<TOKEN>` holds the agent's cards and its handling records, and `xyz.tinycloud.tinychat/feed/feed_responses_<TOKEN>` holds the owner's answers. Home shows only agents listed in the owner's registry, the `feed_agents` table of `xyz.tinycloud.tinychat/home_feed`, and only the owner's connect step adds them there. Post only what the owner asked for, including any standing rule they gave you.

## 1. Check the CLI

**CLI rule (stable `1.6.2`): run the check below before any other command, including any `tinycloud` or `--version` check of your own; it selects the CLI and decides. Don't judge who installed the CLI yourself. Only a `TC_OLDER` line from the check below or /cli means the operator chose an older CLI: tell the owner in one line that it is older than the required `1.6.2`, and stop. Any other older CLI is yours, including one on `PATH` or linked from `~/.local/bin`: the check prints `CLI_OLDER`; follow https://agents.tinycloud.xyz/cli once and rerun the check. Upgrading the CLI is part of the owner's request: don't ask first; at most one short line ("Updating the TinyCloud CLI."). Never run `tinycloud upgrade` or a global npm install of the TinyCloud CLI; the guide's installer (/cli) handles upgrades. A newer CLI is never downgraded. Don't install the CLI globally, with `sudo`, or by piping a download into a shell; /cli installs and upgrades the agent's own copy.**

The examples use `tinycloud`; where the guide could not safely create that launcher, use the selected absolute executable path, the first line this check prints. Run the check before continuing:

```sh
B=${TC_BIN:-}; H="$HOME/.config/tinycloud/agent-env.mjs"; P="$HOME/.local/share/tinycloud/cli"
if [ -z "$B" ] && [ -r "$H" ]; then B=$(node "$H" get TC_BIN) || B=; fi
O=$B; [ -z "$O" ] || ! node -e 'const{realpathSync:r}=require("fs"),[f,d]=process.argv.slice(1),i=(a,b)=>a.startsWith(b+"/");let x=i(f,d);try{x=x||i(r(f),r(d))}catch{}process.exit(x?0:1)' "$O" "$P" || O=
[ -n "$B" ] || B="$P/node_modules/.bin/tinycloud"
[ -x "$B" ] || B=$(command -v tinycloud) || { echo 'TC_NOT_FOUND: set up the CLI at https://agents.tinycloud.xyz/cli, then rerun this block'; exit 1; }
V=$("$B" --version); printf '%s\n%s\n' "$B" "$V"
if printf '%s\n' "$V" | awk -F. -v p=1.6.2 '{split(p,q,".");for(i=1;i<4;i++){n=$i+0;if(n!=q[i]+0)exit(n>q[i]+0)};exit($3!~/^[0-9]+-/)}'; then
  if [ "$B" = "$O" ]; then echo "TC_OLDER $V $B is older than the pinned 1.6.2; keeping this operator-selected CLI"
  else echo "CLI_OLDER $V $B: run the CLI setup at https://agents.tinycloud.xyz/cli (it upgrades a CLI the agent installed), then rerun this block"; fi
  exit 1
fi
```

- `TC_NOT_FOUND` → follow that shared guide and return here.
- `CLI_OLDER <version> <path>` → the check stopped before any other TinyCloud command: follow the shared guide once (it upgrades a CLI the agent installed), then run the check again. Upgrading the CLI is part of the owner's request: don't ask first; at most one short line ("Updating the TinyCloud CLI."). Never run `tinycloud upgrade` or a global npm install of the TinyCloud CLI; the guide's installer (/cli) handles upgrades.
- `TC_OLDER <version> <path>` → the operator selected that older CLI: tell the owner in one line that it is older than the required `1.6.2`, and stop.

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
| `cardId` | Nonempty id of this card, such as `weight-2026-11-03`. |
| `revision` | Positive integer, `1` for a new card. |
| `issuanceId` | Nonempty id, new for each publish. |
| `kind` | Short free-form word, such as `update`, `decision` or `reminder`. Home shows it after the label and filters by it. |
| `needsResponse` | `true` when the owner should answer, otherwise `false`. |
| `title` | Heading. |
| `body` | Card text. |
| `choices` | Optional, with `needsResponse: true`: `[{"id": "yes", "label": "Yes"}]`. Each becomes an option in the answer form; the owner can also type a reply. |
| `urgency` | Number; higher sorts first. Equal urgencies list the oldest `createdAt` first. |
| `createdAt` | ISO 8601 UTC time, such as `2026-11-03T09:00:00Z`. |
| `payload` | Optional object for how Home shows the card, below. |

`payload.render` is `post` (the default), `thread` or `link`:

- `post`: the title and body.
- `thread`: also `payload.replies`, a list of `{"text": "..."}` shown after the body.
- `link`: also `payload.url`, an `https://` page that Home shows as "Open link".

Any card can add `payload.source`, `{"label": "...", "url": "https://..."}`, shown as its source line.

A question with choices:

```json
{"cardId":"weight-goal-2026-11","revision":1,"issuanceId":"weight-goal-2026-11-a","kind":"decision","needsResponse":true,"title":"New weekly goal?","body":"You were under 82 kg all week. Set next week's goal to 81.5 kg?","choices":[{"id":"yes","label":"Yes, 81.5 kg"},{"id":"keep","label":"Keep 82 kg"}],"urgency":1,"createdAt":"2026-11-03T09:00:00Z","payload":{"render":"post"}}
```

An update that needs no answer:

```json
{"cardId":"weight-2026-11-03","revision":1,"issuanceId":"weight-2026-11-03-a","kind":"update","needsResponse":false,"title":"New low","body":"81.4 kg this morning, 0.6 kg under your previous best.","urgency":0,"createdAt":"2026-11-03T07:42:10Z","payload":{"render":"post","source":{"label":"Weigh-ins"}}}
```

A link:

```json
{"cardId":"reading-list-2026-11","revision":1,"issuanceId":"reading-list-2026-11-a","kind":"link","needsResponse":false,"title":"Reading list","body":"The reading list you asked me to keep.","urgency":0,"createdAt":"2026-11-03T08:15:00Z","payload":{"render":"link","url":"https://example.org/reading-list"}}
```

Home opens on **Needs action**, which lists unanswered cards with `needsResponse: true`. Cards with `needsResponse: false` show under **Information** or **Both** in Home's view menu.

## 6. Publish

Save the card as `card.json` and publish it with the agent profile:

```sh
tinycloud --profile 'feed-<TOKEN>' feed publish --agent '<TOKEN>' --file card.json
```

It prints the stored card; Home shows it on its next refresh. `feed list --agent '<TOKEN>'` lists the current cards. A published `cardId` + `revision` + `issuanceId` is permanent: publishing it again with the same content changes nothing, and with different content is refused. To update a card, publish the same `cardId` with the next `revision` and a new `issuanceId`; Home shows the latest.

## 7. Read answers and record handling

```sh
tinycloud --profile 'feed-<TOKEN>' feed responses --agent '<TOKEN>' --after 0
```

It returns the owner's answers in `sequence` order, up to 100 per page (`--limit` up to 1000). Each has `responseId`, the card's `cardId`, `revision` and `issuanceId`, `kind`, `createdAt` and `sequence`, plus `choiceId` and/or `text`. `kind` is `answer`; `followup`, a later answer that replaces the one named in `supersedesResponseId`; or `message`, a note that answers nothing. Keep the highest `sequence` you've handled and pass it as `--after` next time.

To be woken for each new answer instead, `feed watch --agent '<TOKEN>' --recipient <stable-id> --runner '["node","handler.js"]'` runs your program with the response JSON on stdin and keeps running. It needs Node.js 22.13+ or Bun. Your program must exit 0 only once it has saved the answer.

Record what you did with each answer in a file such as `handling.json`, with a new `handlingId` each time:

```json
{"handlingId":"weight-goal-2026-11-a-ack","responseId":"<responseId>","cardId":"weight-goal-2026-11","revision":1,"issuanceId":"weight-goal-2026-11-a","phase":"acknowledged","createdAt":"2026-11-03T09:05:00Z"}
```

```sh
tinycloud --profile 'feed-<TOKEN>' feed handling --agent '<TOKEN>' --file handling.json
```

`acknowledged` shows "Agent received" on the card in Home. When you finish, record one outcome for that response, `succeeded` or `failed`, which Home shows as "Completed" or "Failed"; add `"detail":{"message":"..."}` to show a short note under it. A response takes one outcome only.

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
