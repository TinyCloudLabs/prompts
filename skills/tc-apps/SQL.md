# The SQL index (tc-apps)

Part of the `tc-apps` skill: read `SKILL.md` first. The index copies every record into a SQLite database, `xyz.tinycloud.agent-data.index`, in the owner's `default` space, so one query can answer a question over many records. The KV records stay the truth: when the index and KV disagree, KV wins, and §6 rebuilds the index from it.

- **Profile:** `agent-data-sql`, separate from `agent-data`.
- **Sign-in:** OpenKey's approval page, because the phone-code sign-in can't grant SQL. The owner approves, then sends you back a code.
- **Lifetime:** 30 days.
- **Reach:** the grant names one database, but TinyCloud's node also lets it open the space's other SQL databases. The owner accepted this. Always pass exactly `--db xyz.tinycloud.agent-data.index`, never a longer or different name.

Run the blocks as `SKILL.md` says: literal `<TC_BIN>` and `<STATE>` from its §1, values filled into `'<…>'`. Keep the SQL in double quotes, exactly as written: a `\$` stays `\$`. Put every option before `--`, and the SQL after it.

**Never run two SQL writes at the same time.** That includes another block of yours, and `xargs`. Parallel writes to one database can fail, or half-apply. Writes in this file run one after another; only reads run side by side.

## 1. Sign in for the index

Do this only when the owner asks for the index, or agrees after you've said a question would be faster with it. It takes two steps.

**1a. Get the approval link.**

```sh
TC_BIN='<TC_BIN>'; STATE='<STATE>'; umask 077
mkdir -p "$STATE"
printf '%s\n' '{"manifest_version":1,"app_id":"xyz.tinycloud.agent-data","name":"Personal apps index (agent)","space":"default","defaults":false,"permissions":[{"service":"tinycloud.sql","path":"xyz.tinycloud.agent-data.index","skipPrefix":true,"actions":["read","write","schema"]}]}' > "$STATE/agent-data-sql.json"
"$TC_BIN" context --json --profile agent-data-sql 2>&1 | grep -q PROFILE_NOT_FOUND && "$TC_BIN" init --name agent-data-sql --key-only > /dev/null
"$TC_BIN" auth login --paste --manifest "$STATE/agent-data-sql.json" --expiry 30d --profile agent-data-sql < /dev/null 2> "$STATE/sql-login.err"
grep -o 'https*://[^ ]*/delegate?[^ ]*' "$STATE/sql-login.err" | head -n 1; grep -o '"code": "[A-Z_]*"' "$STATE/sql-login.err"
```

- **The link and `"code": "PASTE_CODE_MISSING"`** → expected: the CLI is waiting for the owner's code. Send them:

  > To set up the index, open <link> and sign in to OpenKey. It asks for SQL access to `xyz.tinycloud.agent-data.index` in your `default` space for 30 days. Approve, then copy the code OpenKey shows at the end and send it to me here. The code only works for this computer's `agent-data-sql` profile.

- **Any other code** → `SKILL.md` §8; `SESSION_IN_USE` means the index is already signed in.

Don't open the link yourself, and run 1a only once per approval.

**1b. Finish with the owner's code.** Paste it between the `CODE` lines exactly as they sent it, in one tool call:

```sh
TC_BIN='<TC_BIN>'; STATE='<STATE>'; umask 077
cat > "$STATE/sql-code" <<'CODE'
<the code exactly as the owner sent it>
CODE
"$TC_BIN" auth login --paste --manifest "$STATE/agent-data-sql.json" --expiry 30d --profile agent-data-sql < "$STATE/sql-code"
rm -f "$STATE/sql-code" "$STATE/sql-login.err"
```

- **`"authenticated": true` and `"declined": []`** → §2.
- **`"declined"` lists `tinycloud.sql/schema`** → the owner unchecked it. If the index already exists, carry on (§2 will fail harmlessly); otherwise tell them §2 needs it.
- **`OPENKEY_PROOF_INVALID`, or the code was cut short** → ask the owner to send the code again, and rerun 1b. Don't start a new 1a.
- Never reuse a code for another profile.

## 2. Create the table and the view

Run once, after the first sign-in. It's harmless to run again.

```sh
TC_BIN='<TC_BIN>'; umask 077
"$TC_BIN" sql execute --db xyz.tinycloud.agent-data.index --space default --json --profile agent-data-sql -- "CREATE TABLE IF NOT EXISTS records (key TEXT PRIMARY KEY, rec TEXT NOT NULL)"
"$TC_BIN" sql execute --db xyz.tinycloud.agent-data.index --space default --json --profile agent-data-sql -- "CREATE VIEW IF NOT EXISTS entries AS SELECT key, app, kind, substr(r2, 1, instr(r2, '/') - 1) AS folder, substr(r2, instr(r2, '/') + 1) AS id, substr(r2, instr(r2, '/') + 1, 10) AS day, json_extract(rec, '\$.v') AS v, json_extract(rec, '\$.at') AS at, json_extract(rec, '\$.by') AS by, json_extract(rec, '\$.data') AS data, rec FROM (SELECT key, rec, app, substr(r1, 1, instr(r1, '/') - 1) AS kind, substr(r1, instr(r1, '/') + 1) AS r2 FROM (SELECT key, rec, substr(p, 1, instr(p, '/') - 1) AS app, substr(p, instr(p, '/') + 1) AS r1 FROM (SELECT key, rec, substr(key, 26) AS p FROM records)))"
```

- **`records`** holds one row per KV record: its full key, and the record as stored.
- **`entries`** splits the key into `app`, `kind`, `folder` and `id`. `folder` is the month for a log kind and the state for an item kind. `day` is the date the id starts with.
- **`v`, `at`, `by` and `data`** come straight from the record; read fields with `json_extract(data, '\$.<field>')`.

Then fill the index: rebuild every kind the catalog lists (§6).

## 3. Keep the index in step

Do this after every write, status change and delete in `SKILL.md` §6, whenever `SKILL.md` §3 showed the `agent-data-sql` profile. List every key you touched: written, moved to and moved from, deleted. The block reads each key from KV and copies it into the index; a key that's gone from KV is removed from the index.

```sh
TC_BIN='<TC_BIN>'; STATE='<STATE>'; umask 077
printf '%s\n' '<key>' '<key>' | xargs -P 8 -I{} sh -c 'if R=$("$0" kv get "$1" --raw --space default --profile agent-data 2>/dev/null); then printf "{\"k\":\"%s\",\"r\":%s}\n" "$1" "$R"; elif [ $? -eq 4 ]; then printf "{\"k\":\"%s\"}\n" "$1"; else printf "{\"k\":\"%s\",\"r\":}\n" "$1"; fi' "$TC_BIN" {} > "$STATE/rows"
ROWS=$(sed 's/\\/\\\\/g; s/"/\\"/g' "$STATE/rows" | paste -s -d, -)
"$TC_BIN" sql execute --db xyz.tinycloud.agent-data.index --space default --json --profile agent-data-sql --params "[\"[$ROWS]\"]" -- "INSERT OR REPLACE INTO records (key, rec) SELECT json_extract(value, '\$.k'), json_extract(value, '\$.r') FROM json_each(?) WHERE json_extract(value, '\$.r') IS NOT NULL" && "$TC_BIN" sql execute --db xyz.tinycloud.agent-data.index --space default --json --profile agent-data-sql --params "[\"[$ROWS]\"]" -- "DELETE FROM records WHERE key IN (SELECT json_extract(value, '\$.k') FROM json_each(?) WHERE json_extract(value, '\$.r') IS NULL)"
```

- **Two `{"changes": …}` lines** → done.
- **`SQL_ERROR` about malformed JSON** → a KV read failed on the way. Run the block again once.
- **`NETWORK_ERROR`** ("superseded checkpoint") → another write hit the index at the same moment. Run the block again once; it's safe to repeat.
- **Up to 200 keys per block.** For more, run it again with the next 200.

If the block still fails, or `SKILL.md` §3 showed the index's session `"expired"`, mark the kind as behind, once per app and kind you touched, so the next agent with a working index rebuilds it:

```sh
TC_BIN='<TC_BIN>'; umask 077
"$TC_BIN" kv put 'xyz.tinycloud.agent-data/index-stale/<app>/<kind>' --stdin --space default --json --profile agent-data <<'EOF'
{"since":"<today's date>","by":"<your client>"}
EOF
```

## 4. Check before answering

Before you answer from the index, check every app and kind the question covers. Repeat the two `kv list` lines and the `sql query` line for each kind, keeping them in this order.

```sh
TC_BIN='<TC_BIN>'; umask 077
"$TC_BIN" kv list --prefix xyz.tinycloud.agent-data/index-stale/ --space default --json --profile agent-data
"$TC_BIN" sql query --db xyz.tinycloud.agent-data.index --space default --json --profile agent-data-sql --params '["xyz.tinycloud.agent-data/<app>/<kind>/"]' -- "SELECT count(*) AS n FROM records WHERE instr(key, ?) = 1"
"$TC_BIN" kv list --prefix 'xyz.tinycloud.agent-data/<app>/<kind>/' --space default --json --profile agent-data | grep '"count"'
```

- **The kind isn't under `index-stale/`, and `n` equals `"count"`** → the index is in step for that kind: §5.
- **Otherwise** → rebuild that kind (§6), then answer.
- **`ERROR` "SIWE is expired", or `AUTH_REQUIRED`** → the index needs a new approval (§1). Answer from KV meanwhile (`SKILL.md` §5).

## 5. Query

```sh
TC_BIN='<TC_BIN>'; umask 077
"$TC_BIN" sql query --db xyz.tinycloud.agent-data.index --space default --json --profile agent-data-sql --params '[<values>]' -- "<SELECT …>"
```

It prints `{"columns": […], "rows": [[…]], "rowCount": …}`. Query the `entries` view. Pass values as `?` parameters in `--params`, a JSON array, and never paste values into the SQL. Inside the SQL, write each `$` as `\$`.

Examples. The app, kind and field names here are illustrations; use the ones the catalog records give:
- **Weight since a date:** `SELECT day, json_extract(data, '\$.kg') AS kg FROM entries WHERE app = 'fitness' AND kind = 'weight' AND day >= ? ORDER BY day`
- **Weekly volume for one exercise:** `SELECT strftime('%Y-%W', day) AS week, sum(json_extract(data, '\$.sets') * json_extract(data, '\$.reps') * json_extract(data, '\$.kg')) AS volume FROM entries WHERE app = 'fitness' AND kind = 'lift' AND json_extract(data, '\$.exercise') = ? GROUP BY week ORDER BY week`
- **Open items:** `SELECT id, json_extract(data, '\$.title') AS title FROM entries WHERE app = 'todos' AND kind = 'todo' AND folder = 'open' ORDER BY id`
- **Everything on a day:** `SELECT app, kind, id, data FROM entries WHERE day = ? ORDER BY app, kind, id`

Rules:
- Use only `SELECT` and `WITH`. Never `PRAGMA`, `GLOB` or `RETURNING`. One statement per command.
- To see a kind's fields, read its catalog record; don't inspect the table.
- `rec` and `data` come back as JSON text: read the fields you need with `json_extract`.
- Say how many records the answer covers.

## 6. Rebuild a kind

Rebuild when §4 finds a kind behind, and for every kind after the first sign-in.

1. List the kind's keys with `SKILL.md` §5, using the prefix `xyz.tinycloud.agent-data/<app>/<kind>/`.
2. Clear the kind's rows:

   ```sh
   TC_BIN='<TC_BIN>'; umask 077
   "$TC_BIN" sql execute --db xyz.tinycloud.agent-data.index --space default --json --profile agent-data-sql --params '["xyz.tinycloud.agent-data/<app>/<kind>/"]' -- "DELETE FROM records WHERE instr(key, ?) = 1"
   ```

3. Copy every key with §3's block, at most 200 keys per block, one block after another.
4. Remove the kind's mark, if §4 listed one:

   ```sh
   TC_BIN='<TC_BIN>'; umask 077
   "$TC_BIN" kv delete 'xyz.tinycloud.agent-data/index-stale/<app>/<kind>' --space default --json --profile agent-data
   ```

5. Run §4's block once, with its lines for every kind you rebuilt. Report `n` and `"count"` for each: they must be equal.

## 7. Lifetime and errors

- **The index session lasts 30 days.** `SKILL.md` §3's `context` shows `"state": "present"` while it's valid, and `"expired"` afterwards. While it's expired, writes mark kinds behind (§3), and reads use KV. Offer the owner §1 again when a question needs the index.
- **`AUTH_UNAUTHORIZED` ending in `tinycloud.sql/schema`** → the owner unchecked the schema permission (§1b). Everything except §2 still works.
- **`SQL_ERROR` "no such table" or "no such view"** → run §2, then §6 for every kind.
- **`SQL_PERMISSION_DENIED`** → the statement type isn't allowed: rewrite it with `SELECT` or `WITH`.
- **Anything else** → `SKILL.md` §8.
