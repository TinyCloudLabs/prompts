---
name: tc-sync
description: Copy another app's data into the owner's TinyCloud when they ask (sync, import, back up, move). One-way and repeatable; nothing is deleted. Connectors say how to read each source app.
metadata:
  version: "0.1.0"
---

# Sync another app's data into TinyCloud

Use this when the owner asks to sync, copy, import or back up data from another app into their TinyCloud. The source app stays the source of truth: each sync copies what it holds now, updates what changed since the last sync, and deletes nothing.

A sync has two parts. A **connector** (in `connectors/`) reads the source app and writes a snapshot file. The **helper**, `sync.mjs`, writes that snapshot into TinyCloud, reads it back and records the run. The model never writes SQL for the records itself.

| Source app | Connector |
| --- | --- |
| Wabi | [connectors/wabi.md](connectors/wabi.md) |

No connector for the app: tell the owner TinyCloud can't sync that app yet, and stop.

## Where the data goes

- **Every record** goes into the SQLite database `xyz.tinycloud.sync.<connector>/<app>` in the owner's `applications` space: table `records`, one row per source record, the record as JSON in `rec`. `<app>` comes from the source app's id, so renaming the app keeps the same database. Table `runs` has one row per sync.
- **Records a TinyCloud app owns** are also written to that app, in its own format, so its view and other agents see them. Today that is body weight: a connector that marks a collection as weigh-ins puts each one in Health Log's `weight` table, in kilograms, with `source = 'import'`. Health Log must already be set up (the owner opened it once); if it isn't, the sync reports it and copies the weigh-ins there on a later run.
- **Nothing is deleted.** A record that is gone from the source app stays, with `removed_at` set. Its Health Log row stays too.
- **Other agents find it** through `xyz.tinycloud.sync.<connector>/knowledge/`, which describes each synced app's database and fields. `tinycloud knowledge list` lists it.

## 1. Check the CLI and find the helper

The agent must be onboarded: if it isn't, follow [/onboarding](https://agents.tinycloud.xyz/onboarding) first, then come back.

```sh
TC="${TC_BIN:-$HOME/.local/share/tinycloud/cli/node_modules/.bin/tinycloud}"
"$TC" sql --help >/dev/null 2>&1 && "$TC" auth caps --help >/dev/null 2>&1 && echo CLI_READY
for d in "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/tc-sync" "$HOME/.agents/skills/tc-sync"; do [ -f "$d/sync.mjs" ] && { echo "$d/sync.mjs"; break; }; done
STATE="${TC_SYNC_STATE:-$HOME/.local/state/tc-sync}"; mkdir -p "$STATE" && chmod 700 "$STATE" && echo "$STATE"
```

It prints `CLI_READY`, then `<SYNC>` (the helper's path), then `<STATE>` (where snapshots go). No `CLI_READY`: run the [CLI setup](https://agents.tinycloud.xyz/cli). No helper path: install the skill with `curl -fsSL https://agents.tinycloud.xyz/skills/install.js | node - sync --agent <client>`.

## 2. Make the snapshot

Follow the connector's file. It says how to read the app and how to write `<STATE>/<connector>-<app>.json` in the format of §6. Then check it:

```sh
TC="${TC_BIN:-$HOME/.local/share/tinycloud/cli/node_modules/.bin/tinycloud}"
node '<SYNC>' "$TC" plan '<SNAPSHOT>'
```

- Exit 2, `BAD_SNAPSHOT`: the message names what's wrong. Fix the snapshot and run it again.
- Exit 3, `needs_grant`: go to §3.
- Exit 0, `planned`: go to §4.

## 3. Ask for the grant, once

The sync needs one approval per connector, for 30 days: its own databases (including making their tables), its knowledge folder, and Health Log's database when the snapshot has weigh-ins. Get the link:

```sh
TC="${TC_BIN:-$HOME/.local/share/tinycloud/cli/node_modules/.bin/tinycloud}"
"$TC" auth request $(node '<SYNC>' "$TC" caps '<SNAPSHOT>' | sed 's/^/--cap /') --grant --paste --expiry 30d < /dev/null
```

It exits 3 and prints the OpenKey link on stderr, on the line after `Open this URL in a browser to authenticate:`. Send the owner the link with this line, naming the app: "Open this link and approve. It lets me copy <app> into your TinyCloud, for 30 days. Then send me the short code OpenKey shows (like ABCD-EFGH)." When the owner replies with the code, run the same command with the code on stdin:

```sh
TC="${TC_BIN:-$HOME/.local/share/tinycloud/cli/node_modules/.bin/tinycloud}"
printf '%s\n' '<the code>' | "$TC" auth request $(node '<SYNC>' "$TC" caps '<SNAPSHOT>' | sed 's/^/--cap /') --grant --paste --expiry 30d
```

Then run the `plan` block of §2 again. The code is refused after 5 minutes or once used: get a new link.

## 4. Plan, then sync

`plan` prints what a sync would do, per collection: `new`, `changed`, `unchanged` and `removed`, and for each TinyCloud app it writes to, its `status` and the records it `skipped` with the reason. It writes nothing.

Stop and ask the owner before syncing when the plan would mark most of the stored records `removed`: the source read may have been incomplete. Otherwise sync:

```sh
TC="${TC_BIN:-$HOME/.local/share/tinycloud/cli/node_modules/.bin/tinycloud}"
node '<SYNC>' "$TC" apply '<SNAPSHOT>'
```

## 5. Results and errors

`apply` prints one JSON object:

- `"status": "synced"`: every record is in TinyCloud and read back as written (`"verified": true`).
- `"status": "partial"`: the records are in TinyCloud, but a target app wasn't set up (`"status": "not_set_up"`) or some records were `skipped` for it. Say which, in one line.
- `"knowledge": "not written: <code>"`: the data is synced, but other agents won't find its description until the next sync succeeds.

Tell the owner in one or two lines: how many records are now in TinyCloud, how many were new or changed, and where they are (the app's name, and "Health Log" when weigh-ins went there). If Health Log wasn't set up, add: "Open https://share.tinycloud.xyz/apps/run#xyz.tinycloud.sample.healthlog once, and I'll add your weigh-ins next time."

Errors print `{"status": "error", "code": …, "message": …}`:

- `VERIFY_FAILED`, `OUTCOME_UNKNOWN`, `NETWORK_ERROR`, `NODE_BUSY`: run `apply` again once. It only writes what isn't there yet, so a second run never duplicates.
- `RECORD_TOO_LARGE`: one record is too big to copy. Tell the owner which app; don't retry.
- `STORAGE_QUOTA_EXCEEDED` or `STORAGE_LIMIT_REACHED`: the owner's TinyCloud is full. Tell them; don't retry.
- `AUTH_REQUIRED` or `PERMISSION_DENIED`: the grant has ended or doesn't cover this. Go back to §3.
- Anything else: stop and report it.

## 6. The snapshot format

A connector writes one JSON file per source app:

```json
{
  "v": 1,
  "connector": "<connector>",
  "app": { "id": "<the source app's own id>", "title": "<its name>" },
  "revision": "<the source's version of this data, or null>",
  "captured_at": "<ISO time of the read>",
  "collections": [
    {
      "name": "<collection>",
      "complete": true,
      "id": "<the field that holds each record's id>",
      "records": [ { "<field>": "<value>" } ],
      "map": [ { "to": "healthlog.weight", "day": "<date field>", "lb": "<pounds field>", "at": "<time field>" } ]
    }
  ]
}
```

- **`connector`**: lowercase `a-z`, `0-9` and `-`. **`app.id`**: the source app's stable id, never its title.
- **`collections`**: one per list of records. `name` uses `A-Z a-z 0-9 _ . -`. Every record is a JSON object with a unique, non-empty `id` field (a string or number). Records are copied as they are.
- **`complete`**: `true` only when `records` is every record in that list. Only then are stored records that are missing from it marked `removed`. If the read was cut short, set `false`.
- **`map`** (optional): also write the collection to a TinyCloud app. `healthlog.weight` needs `day` (a field holding `YYYY-MM-DD`), exactly one of `kg` or `lb` (a field holding the weight), and optionally `at` (a field holding when it was logged: an ISO time or milliseconds since 1970). Records outside 20 to 500 kg, or without a valid date, are skipped and reported.
- Leave out values that are credentials (passwords, tokens, API keys). Secrets belong in [/secrets](https://agents.tinycloud.xyz/secrets).

## 7. Reading synced data

Any agent with the grant reads it with SQL:

```sh
TC="${TC_BIN:-$HOME/.local/share/tinycloud/cli/node_modules/.bin/tinycloud}"
"$TC" sql query --db 'xyz.tinycloud.sync.<connector>/<app>' --space applications -- "SELECT id, rec FROM records WHERE collection = 'entries' AND removed_at IS NULL"
```

Read a field with `json_extract(rec, '$.<field>')`. The app's knowledge page, `xyz.tinycloud.sync.<connector>/knowledge/apps/<app>.md`, lists its collections and fields. Weigh-ins are in Health Log's `weight` table, in rows whose `op_id` starts `sync:<connector>:<app>:`.

## Adding a connector

A connector is one file, `connectors/<name>.md`. It says where the agent runs, how to list the source app's data and read it completely, how to turn it into the §6 snapshot, and which collections map to which TinyCloud app. It never changes `sync.mjs`. A new TinyCloud app as a target is added to `sync.mjs` (`TARGETS`) and this file, for every connector at once.
