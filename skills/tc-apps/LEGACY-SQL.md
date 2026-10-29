# The SQL index (tc-apps legacy mode)

Part of the `tc-apps` skill's legacy mode: read `SKILL.md` and `LEGACY.md` first. The index copies every record into a SQLite database, `xyz.tinycloud.agent-data.index`, in the owner's `default` space, so one query can answer a question over many records. The KV records stay the truth: when the index and KV disagree, KV wins, and §6 rebuilds the index from it.

- **Access:** one more approval, asked for in §1, lets the owner's TinyCloud sign-in read, write and create this database for 30 days.
- **Reach:** the grant names one database, but TinyCloud's node also lets it open the space's other SQL databases. The owner accepted this. Always pass exactly `--db xyz.tinycloud.agent-data.index`, never a longer or different name.

Run the blocks as `SKILL.md` says: literal `<TC_BIN>` and `<STATE>` from its §1, values filled into `'<…>'`. Keep the SQL in double quotes, exactly as written. Only `$` needs a backslash: write it `\$`, and leave `%` and every other character as it is. Put every option before `--`, and the SQL after it.

**Never run two SQL writes at the same time.** That includes another block of yours, and `xargs`. Parallel writes to one database can fail, or half-apply. Writes in this file run one after another; only reads run side by side.

## 1. Ask for the fast copy

`LEGACY.md` §7 sends you here when an answer needed many records and `LEGACY.md` §3 printed `index: none` or `index: no access`, or when the owner asks about it. It takes two steps: you ask in 1a, and finish in 1b once the owner sends the code. The `<cap>` for both is `tinycloud.sql:default:xyz.tinycloud.agent-data.index:read,write,schema`.

When talking to the owner, it's "a fast, searchable copy of your records". Don't say "index", "SQL" or "database".

**1a. Get the approval link.** Run the first block of `SKILL.md` §4b with that `<cap>`.

- **Exit 0 with `"changed": false`** → you already have it: go to §2.
- **Exit 3, with the link** → expected. After your answer, add, with `<N>` the number of records you just read, and end your turn:

  > That took a while: I read your <N> records one at a time. I can keep a fast, searchable copy of them in your TinyCloud, so questions like this are much quicker. Open <link> and approve, then send me the code OpenKey shows.

- **Anything else** → `LEGACY.md` §8.

**1b. Finish with the owner's code.** Run the second block of `SKILL.md` §4b with the same `<cap>` and the code exactly as the owner sent it.

- **Exit 0** → §2, then §6 for every kind the catalog lists, skipping §6 step 2 because the copy is still empty. Then tell the owner in one short line, without counts or dates, for example: "Done: questions over many records will be quicker from now on."
- **The code is refused** → it works once and expires after 5 minutes. Run 1a again, send the new link, and ask for the new code.
- **An error code** → `LEGACY.md` §8.

## 2. Create the table and the view

Run once, after §1. It's harmless to run again.

```sh
TC_BIN='<TC_BIN>'; umask 077
"$TC_BIN" sql execute --db xyz.tinycloud.agent-data.index --space default --json -- "CREATE TABLE IF NOT EXISTS records (key TEXT PRIMARY KEY, rec TEXT NOT NULL)"
"$TC_BIN" sql execute --db xyz.tinycloud.agent-data.index --space default --json -- "CREATE VIEW IF NOT EXISTS entries AS SELECT key, app, kind, substr(r2, 1, instr(r2, '/') - 1) AS folder, substr(r2, instr(r2, '/') + 1) AS id, substr(r2, instr(r2, '/') + 1, 10) AS day, json_extract(rec, '\$.v') AS v, json_extract(rec, '\$.at') AS at, json_extract(rec, '\$.by') AS by, json_extract(rec, '\$.data') AS data, rec FROM (SELECT key, rec, app, substr(r1, 1, instr(r1, '/') - 1) AS kind, substr(r1, instr(r1, '/') + 1) AS r2 FROM (SELECT key, rec, substr(p, 1, instr(p, '/') - 1) AS app, substr(p, instr(p, '/') + 1) AS r1 FROM (SELECT key, rec, substr(key, 26) AS p FROM records)))"
```

- **`records`** holds one row per KV record: its full key, and the record as stored.
- **`entries`** splits the key into `app`, `kind`, `folder` and `id`. `folder` is the month for a log kind and the state for an item kind. `day` is the date the id starts with.
- **`v`, `at`, `by` and `data`** come straight from the record; read fields with `json_extract(data, '\$.<field>')`.

Then fill the index: rebuild every kind the catalog lists (§6).

## 3. Keep the index in step

Do this after every write, status change and delete in `LEGACY.md` §6, whenever `LEGACY.md` §3 printed `index: present`. List every key you touched: written, moved to and moved from, deleted. The block reads each key from KV and copies it into the index; a key that's gone from KV is removed from the index.

```sh
TC_BIN='<TC_BIN>'; STATE='<STATE>'; umask 077
printf '%s\n' '<key>' '<key>' | xargs -P 8 -I{} sh -c 'R=$("$0" kv get "$1" --raw --space default 2>/dev/null); c=$?; if [ $c -eq 0 ]; then printf "{\"k\":\"%s\",\"r\":%s}\n" "$1" "$R"; elif [ $c -eq 4 ]; then printf "{\"k\":\"%s\"}\n" "$1"; else printf "{\"k\":\"%s\",\"r\":}\n" "$1"; fi' "$TC_BIN" {} > "$STATE/rows"
ROWS=$(sed 's/\\/\\\\/g; s/"/\\"/g' "$STATE/rows" | paste -s -d, -)
"$TC_BIN" sql execute --db xyz.tinycloud.agent-data.index --space default --json --params "[\"[$ROWS]\"]" -- "INSERT OR REPLACE INTO records (key, rec) SELECT json_extract(value, '\$.k'), json_extract(value, '\$.r') FROM json_each(?) WHERE json_extract(value, '\$.r') IS NOT NULL" && "$TC_BIN" sql execute --db xyz.tinycloud.agent-data.index --space default --json --params "[\"[$ROWS]\"]" -- "DELETE FROM records WHERE key IN (SELECT json_extract(value, '\$.k') FROM json_each(?) WHERE json_extract(value, '\$.r') IS NULL)"
```

- **Two `{"changes": …}` lines** → done.
- **`SQL_ERROR` about malformed JSON** → a KV read failed on the way. Run the block again once.
- **`NETWORK_ERROR`** ("superseded checkpoint") → another write hit the index at the same moment. Run the block again once; it's safe to repeat.
- **Up to 200 keys per block.** For more, run it again with the next 200.

If the block still fails, or the copy's access has ended (§7), mark the kind as behind, once per app and kind you touched, so the next agent with a working index rebuilds it:

```sh
TC_BIN='<TC_BIN>'; umask 077
"$TC_BIN" kv put 'xyz.tinycloud.agent-data/index-stale/<app>/<kind>' --stdin --space default --json <<'EOF'
{"since":"<today's date>","by":"<your client>"}
EOF
```

## 4. Check before answering

Before you answer from the index, check every app and kind the question covers. Repeat the two `kv list` lines and the `sql query` line for each kind, keeping them in this order.

```sh
TC_BIN='<TC_BIN>'; umask 077
"$TC_BIN" kv list --prefix xyz.tinycloud.agent-data/index-stale/ --space default --json
"$TC_BIN" sql query --db xyz.tinycloud.agent-data.index --space default --json --params '["xyz.tinycloud.agent-data/<app>/<kind>/"]' -- "SELECT count(*) AS n FROM records WHERE instr(key, ?) = 1"
"$TC_BIN" kv list --prefix 'xyz.tinycloud.agent-data/<app>/<kind>/' --space default --json | grep '"count"'
```

- **The kind isn't under `index-stale/`, and `n` equals `"count"`** → the index is in step for that kind: §5.
- **Otherwise** → rebuild that kind (§6), then answer.
- **`ERROR` "SIWE is expired", `AUTH_REQUIRED` or `AUTH_UNAUTHORIZED`** → the copy's access has ended. Answer from KV (`LEGACY.md` §5), then ask for it again with §1, at most once per conversation.

## 5. Query

```sh
TC_BIN='<TC_BIN>'; umask 077
"$TC_BIN" sql query --db xyz.tinycloud.agent-data.index --space default --json --params '[<values>]' -- "<SELECT …>"
```

It prints `{"columns": […], "rows": [[…]], "rowCount": …}`. Query the `entries` view. Pass values as `?` parameters in `--params`, a JSON array, and never paste values into the SQL. Inside the SQL, write each `$` as `\$`. Leave `%` as it is, for example `strftime('%Y-%W', day)`.

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

Rebuild when §4 finds a kind behind, and for every kind after §2 first created the copy.

1. List the kind's keys with `LEGACY.md` §5, using the prefix `xyz.tinycloud.agent-data/<app>/<kind>/`.
2. Clear the kind's rows, unless the copy was created moments ago in §2 and is still empty:

   ```sh
   TC_BIN='<TC_BIN>'; umask 077
   "$TC_BIN" sql execute --db xyz.tinycloud.agent-data.index --space default --json --params '["xyz.tinycloud.agent-data/<app>/<kind>/"]' -- "DELETE FROM records WHERE instr(key, ?) = 1"
   ```

3. Copy exactly the keys step 1 listed, all of them, with §3's block: at most 200 keys per block, one block after another. Never build key names yourself, for example from dates.
4. Remove the kind's mark, if §4 listed one:

   ```sh
   TC_BIN='<TC_BIN>'; umask 077
   "$TC_BIN" kv delete 'xyz.tinycloud.agent-data/index-stale/<app>/<kind>' --space default --json
   ```

5. Run §4's block once, with its lines for every kind you rebuilt. Report `n` and `"count"` for each: they must be equal.

## 7. Lifetime and errors

- **The copy's access lasts 30 days.** Afterwards `LEGACY.md` §3 prints `index: no access`: writes mark kinds behind (§3), and reads use KV. The next time an answer needs many records, ask for it again with §1.
- **`AUTH_UNAUTHORIZED` ending in `tinycloud.sql/schema`** → §2 needs the permission from §1: ask for it with §1. Everything except §2 works without it.
- **`SQL_ERROR` "no such table" or "no such view"** → run §2, then §6 for every kind.
- **`SQL_PERMISSION_DENIED`** → the statement type isn't allowed: rewrite it with `SELECT` or `WITH`.
- **Anything else** → `LEGACY.md` §8.
