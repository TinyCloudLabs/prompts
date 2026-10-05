---
name: tc-data
description: Save and read the owner's personal records, such as their weight, in their own TinyCloud storage. The owner approves access once, on OpenKey, from a link and code you show them. Use when the owner asks you to log, record, look up or list a record like their weight, even if they don't mention TinyCloud.
metadata:
  version: "0.2.0"
---

# Save and read records in TinyCloud

You keep one kind of record for the owner, for example their weight, in their TinyCloud `default` space. The owner approves access once, for 30 days: you start a sign-in that prints an OpenKey link and a code, you show them both, and the command finishes by itself when they approve.

Operator-set, never change or unset:
- `TC_BIN`: absolute path to `tc`, CLI 1.0.0 or newer. `command -v tc` can resolve to `/usr/sbin/tc`.
- `TC_HOME`: the CLI profile store. Optional.
- `TC_DATA_STATE`: this skill's state folder. Default `$HOME/.local/state/tc-data`.

How to run the blocks:
- Run each block as one shell tool call, exactly as written, after filling in the `'<…>'` values.
- `<TC_BIN>` and `<STATE>` are the two lines §1 prints, copied exactly. Don't put `$TC_BIN` back, and keep the assignments first, before `umask 077`: Claude Code can remember an approval only for commands whose paths it can work out from the block itself.
- Commands take 4–10 s, sometimes more, so wait up to 60 s for each one. In Codex, pass `yield_time_ms: 30000` to `exec_command`: with its default of 10 s, a slower command returns before it finishes and you have to poll it. §4 is the exception: it waits for the owner.
- Write files only through these blocks, never with a file-editing tool.
- Never install anything yourself, and don't run `tc` commands that aren't here.
- Run §1 and §3 once per conversation.

## 1. Read the paths

```sh
printenv TC_BIN || echo 'TC_BIN is unset'
printenv TC_DATA_STATE || echo "$HOME/.local/state/tc-data"
```

It prints `<TC_BIN>` and `<STATE>`, one per line. `TC_BIN is unset` → stop and tell the owner.

## 2. Name the records

From the request, pick one lowercase word (a–z only) for the kind of record: `<type>`, for example `weight`. Then:
- profile: `data-<type>`;
- app id: `xyz.tinycloud.agent-data.<type>`, in the `default` space;
- key: `xyz.tinycloud.agent-data.<type>/<id>`. For weight, `<id>` is the day, `YYYY-MM-DD`;
- value: JSON, for example `{"kg":80.5}`.

## 3. Check the CLI and the sign-in

```sh
TC_BIN='<TC_BIN>'; TYPE='<type>'; umask 077
"$TC_BIN" --version
"$TC_BIN" kv list --prefix "xyz.tinycloud.agent-data.$TYPE/" --space default --json --profile "data-$TYPE"
```

- The first line must be `1.0.0` or newer. Otherwise stop and tell the owner that `TC_BIN` must point to TinyCloud CLI 1.0.0 or newer.
- The list prints `"keys"` → signed in: §5. The keys are the records saved so far.
- `PROFILE_NOT_FOUND`, `AUTH_REQUIRED`, `AUTH_EXPIRED`, `AUTH_UNAUTHORIZED` or `PERMISSION_DENIED` → §4.
- `SPACE_NOT_HOSTED` → stop and tell the owner that their TinyCloud `default` space isn't set up. Don't try to fix it.

## 4. Sign in

Do this when §3 or §6 sends you here. The block writes the request, creates the profile if it doesn't exist yet (`PROFILE_NOT_FOUND`), and asks OpenKey for approval. The CLI prints a link and a code, then keeps running until the owner approves, for at most 10 minutes.

```sh
TC_BIN='<TC_BIN>'; STATE='<STATE>'; TYPE='<type>'; APP="xyz.tinycloud.agent-data.$TYPE"; umask 077
mkdir -p "$STATE"
printf '{"manifest_version":1,"app_id":"%s","name":"%s records (agent)","space":"default","defaults":false,"permissions":[{"service":"tinycloud.kv","path":"%s/","skipPrefix":true,"actions":["get","put","list","del"]}]}\n' "$APP" "$TYPE" "$APP" > "$STATE/$TYPE.json"
"$TC_BIN" context --json --profile "data-$TYPE" 2>&1 | grep -q PROFILE_NOT_FOUND && "$TC_BIN" init --name "data-$TYPE" --key-only > /dev/null
"$TC_BIN" auth login --device --manifest "$STATE/$TYPE.json" --expiry 30d --profile "data-$TYPE"
```

Its first line is `Approve on your phone: <link> (code <code>)`; the CLI needs a few seconds to print it. Keep the command running until it exits. How depends on your client:
- **Claude Code:** run the block with `run_in_background: true`. Read the output file it names; if the line isn't there yet, run `sleep 2` and read again. Send the message below and end your turn: Claude Code wakes you when the command exits. Then read the output file again.
- **Codex:** pass `yield_time_ms: 5000`; it returns with a session id. If the line isn't there yet, poll once with `write_stdin`, empty `chars`. Send the message below as an update, without ending your turn, then call `write_stdin` with that session id, empty `chars` and `yield_time_ms: 300000`. Call it again each time it returns before the command exits.
- **OpenCode:** you see the output only when the command exits, so first tell the owner: "Open the OpenKey link that appears below and approve the request." Then run the block with `timeout: 660000`.

The message, with the link and code from that line:

> Open <link> and approve the request on OpenKey. It should show the code <code>. I'll carry on as soon as you approve.

When the command exits, its output ends with JSON:
- `"authenticated": true` → run §3 again, then §5.
- An error code → §6.

Run one sign-in at a time, and never retry in a loop: OpenKey allows 5 per 10 minutes. Don't open the link yourself. If the owner writes while the command is still running, tell them you're waiting for their approval.

## 5. Write and read

Write, then read back:

```sh
TC_BIN='<TC_BIN>'; TYPE='<type>'; ID='<id>'; VALUE='<json>'; umask 077
"$TC_BIN" kv put "xyz.tinycloud.agent-data.$TYPE/$ID" "$VALUE" --space default --profile "data-$TYPE" \
  && "$TC_BIN" kv get "xyz.tinycloud.agent-data.$TYPE/$ID" --space default --json --profile "data-$TYPE"
```

Read one record:

```sh
TC_BIN='<TC_BIN>'; TYPE='<type>'; ID='<id>'; umask 077
"$TC_BIN" kv get "xyz.tinycloud.agent-data.$TYPE/$ID" --space default --json --profile "data-$TYPE"
```

To list the records, run §3 again. Report the value you read back, not the one you sent.

## 6. Errors

The CLI prints `{"error":{"code":…}}` on stderr. Branch on the code:
- `NOT_FOUND` (exit 4) on `get` → there's no record yet.
- `PROFILE_NOT_FOUND`, `AUTH_REQUIRED`, `AUTH_EXPIRED`, `AUTH_UNAUTHORIZED` or `PERMISSION_DENIED` → §4.
- `DEVICE_AUTH_EXPIRED` → nobody approved within 10 minutes. Tell the owner, and run §4 again only when they ask.
- `DEVICE_AUTH_DENIED` → the owner declined. Stop.
- `DEVICE_AUTH_RATE_LIMITED` → too many sign-ins from this network. Tell the owner to ask again in 10 minutes.
- `OPENKEY_OWNER_MISMATCH` → they approved with a different account or key than this profile's. Ask them to use the same one as before, and run §4 again when they're ready.
- `SPACE_NOT_HOSTED` → stop and tell the owner that their TinyCloud `default` space isn't set up. Don't try to fix it.
- `SESSION_IN_USE` → ask the owner. Never pass `--replace-session`.
- Anything else → report the code.
