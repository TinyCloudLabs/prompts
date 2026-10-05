---
name: tc-data
description: Save and read the owner's personal records, such as their weight, in their own TinyCloud storage. The owner signs in once with OpenKey in their own terminal. Use when the owner asks you to log, record, look up or list a record like their weight, even if they don't mention TinyCloud.
metadata:
  version: "0.1.0"
---

# Save and read records in TinyCloud

You keep one kind of record for the owner, for example their weight, in their TinyCloud `applications` space. The owner approves access once, for 30 days, by running a script you write in their own terminal. You never see the approval link or code.

Operator-set, never change or unset:
- `TC_BIN`: absolute path to `tc`, CLI 1.0.0 or newer. `command -v tc` can resolve to `/usr/sbin/tc`.
- `TC_HOME`: the CLI profile store. Optional.
- `TC_DATA_STATE`: this skill's state folder. Default `$HOME/.local/state/tc-data`.

How to run the blocks:
- Run each block as one shell tool call, exactly as written, after filling in the `'<…>'` values.
- `<TC_BIN>`, `<TC_HOME>` and `<STATE>` are the three lines §1 prints, copied exactly. Don't put `$TC_BIN` back, and keep the assignments first, before `umask 077`: Claude Code can remember an approval only for commands whose paths it can work out from the block itself.
- Commands take 4–10 s, sometimes more, so wait up to 60 s for each one. In Codex, pass `yield_time_ms: 30000` to `exec_command`: with its default of 10 s, a slower command returns before it finishes and you have to poll it.
- Write files only through these blocks, never with a file-editing tool.
- Never install anything yourself, and don't run `tc` commands that aren't here.
- Run §1 and §3 once per conversation.

## 1. Read the paths

```sh
printenv TC_BIN || echo 'TC_BIN is unset'
printenv TC_HOME || echo "$HOME"
printenv TC_DATA_STATE || echo "$HOME/.local/state/tc-data"
```

It prints `<TC_BIN>`, `<TC_HOME>` and `<STATE>`, one per line. Without `TC_HOME`, the CLI keeps its profiles under your home folder, which is what the second line then shows. `TC_BIN is unset` → stop and tell the owner.

## 2. Name the records

From the request, pick one lowercase word (a–z only) for the kind of record: `<type>`, for example `weight`. Then:
- profile: `data-<type>`;
- app id: `xyz.tinycloud.agent-data.<type>`, in the `applications` space;
- key: `xyz.tinycloud.agent-data.<type>/<id>`. For weight, `<id>` is the day, `YYYY-MM-DD`;
- value: JSON, for example `{"kg":80.5}`.

## 3. Check the CLI and the sign-in

```sh
TC_BIN='<TC_BIN>'; TYPE='<type>'; umask 077
"$TC_BIN" --version
"$TC_BIN" kv list --prefix "xyz.tinycloud.agent-data.$TYPE/" --space applications --json --profile "data-$TYPE"
```

- The first line must be `1.0.0` or newer. Otherwise stop and tell the owner that `TC_BIN` must point to TinyCloud CLI 1.0.0 or newer: 0.10.0 silently saves no sign-in.
- The list prints `"keys"` → signed in: §5. The keys are the records saved so far.
- `PROFILE_NOT_FOUND`, `AUTH_REQUIRED`, `AUTH_EXPIRED`, `AUTH_UNAUTHORIZED` or `PERMISSION_DENIED` → §4.

## 4. Sign in

Do this when §3 says so, or when a §5 command fails with one of the codes above.

**a. Write the request and the owner's script, then dry-run it.** The script creates the profile if it doesn't exist yet (`PROFILE_NOT_FOUND`), then signs in. It holds absolute paths because the owner's terminal doesn't have your environment. The dry run gets no code, so CLI 1.0.0 stops with `PASTE_CODE_MISSING`; 0.10.0 exits without it, which is how the dry run catches an old CLI. The block prints only error codes, never the link.

```sh
TC_BIN='<TC_BIN>'; TC_HOME='<TC_HOME>'; STATE='<STATE>'; TYPE='<type>'; APP="xyz.tinycloud.agent-data.$TYPE"; umask 077
mkdir -p "$STATE"
printf '{"manifest_version":1,"app_id":"%s","name":"%s records (agent)","space":"applications","defaults":false,"permissions":[{"service":"tinycloud.kv","path":"%s/","skipPrefix":true,"actions":["get","put","list","del"]}]}\n' "$APP" "$TYPE" "$APP" > "$STATE/$TYPE.json"
printf '%s\n' '#!/bin/sh' \
  "echo 'TinyCloud sign-in: lets your agent read and write your $TYPE records ($APP/ in your applications space) for 30 days.'" \
  "echo 'Open the link below, approve on OpenKey, click Copy, paste the code here and press Enter.'" \
  "export TC_HOME='$TC_HOME'" \
  "'$TC_BIN' context --json --profile 'data-$TYPE' 2>&1 | grep -q PROFILE_NOT_FOUND && '$TC_BIN' init --name 'data-$TYPE' --key-only > /dev/null" \
  "'$TC_BIN' auth login --method openkey --manifest '$STATE/$TYPE.json' --paste --expiry 30d --profile 'data-$TYPE' && echo 'Signed in. Go back to your agent and say done.'" \
  > "$STATE/approve-$TYPE.sh"
echo "SCRIPT $STATE/approve-$TYPE.sh"
sh "$STATE/approve-$TYPE.sh" < /dev/null 2>&1 | grep -o '"code": *"[A-Z_]*"' || echo NO_ERROR_CODE
```

- Only `PASTE_CODE_MISSING` → send the owner this message with the `SCRIPT` path, then end your turn:

  > Run `sh <SCRIPT path>` in a terminal on this machine, not in this chat. Open the link it prints, approve on OpenKey, click Copy, paste the code into that terminal and press Enter. Tell me when it says "Signed in". Don't paste the code here.

- Another code → §6. `NO_ERROR_CODE` → stop and tell the owner: `TC_BIN` doesn't sign in like CLI 1.0.0.

Apart from this dry run, never run the script. Never open the link, and never ask for the code. If the owner pastes the code here anyway, don't use it: ask them to paste it into the script's terminal.

**b. When the owner replies,** run §3 again.
- `"keys"` → §5.
- Still `AUTH_REQUIRED` → the script is still waiting for the code. Tell the owner that, and end your turn.
- If they report an error from their terminal → §6.

## 5. Write and read

Write, then read back:

```sh
TC_BIN='<TC_BIN>'; TYPE='<type>'; ID='<id>'; VALUE='<json>'; umask 077
"$TC_BIN" kv put "xyz.tinycloud.agent-data.$TYPE/$ID" "$VALUE" --space applications --profile "data-$TYPE" \
  && "$TC_BIN" kv get "xyz.tinycloud.agent-data.$TYPE/$ID" --space applications --json --profile "data-$TYPE"
```

Read one record:

```sh
TC_BIN='<TC_BIN>'; TYPE='<type>'; ID='<id>'; umask 077
"$TC_BIN" kv get "xyz.tinycloud.agent-data.$TYPE/$ID" --space applications --json --profile "data-$TYPE"
```

To list the records, run §3 again. Report the value you read back, not the one you sent.

## 6. Errors

The CLI prints `{"error":{"code":…}}` on stderr. Branch on the code:
- `NOT_FOUND` (exit 4) on `get` → there's no record yet.
- `PROFILE_NOT_FOUND`, `AUTH_REQUIRED`, `AUTH_EXPIRED`, `AUTH_UNAUTHORIZED` or `PERMISSION_DENIED` → §4.
- `SESSION_IN_USE` → ask the owner. Never pass `--replace-session`.
- `OPENKEY_OWNER_MISMATCH`, in the owner's terminal → they approved with a different account or key than this profile's owner. Ask them to rerun the script and approve with the same one as before.
- Anything else → report the code.
