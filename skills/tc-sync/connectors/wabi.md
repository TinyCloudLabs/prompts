# Connector: Wabi

Part of the `tc-sync` skill: read `SKILL.md` first. This file says how to turn a Wabi app's stored data into the snapshot of `SKILL.md` §6. Everything else (the grant, the sync, the report) is in `SKILL.md`.

- **Connector name:** `wabi`. The data goes to `xyz.tinycloud.sync.wabi/<app>`.
- **Where you run:** in the Wabi agent's workspace, with its Wabi tools and a shell. The TinyCloud CLI and onboarding work there as on any computer: if the workspace isn't onboarded yet, follow [/onboarding](https://agents.tinycloud.xyz/onboarding) first.
- **One-way:** read the Wabi app only. Never write it back (no `patch_store`, no `call_action`).

## 1. Find the app

Call `list_apps` and pick the app the owner named. If two could match, ask which one. Use the app's id as `app.id` and its name as `app.title`.

## 2. Read its stored data

Call `read_store` for that app with `include_definition=true`. Use the persisted state (what the app saves), not values it computes on screen. If the result says it is truncated or covers only part of the store, read the rest if the tool allows it; if it doesn't, set `complete: false` on every collection from that read. Put the store's revision, if the result gives one, in `revision`, as a string.

## 3. Write the snapshot

Turn the persisted state into collections:

- **A list of records with an id field** (an array of objects, each with a unique `id`, such as a log's `entries`): one collection, named after its key in the store, with `"id": "id"` (or whichever field holds the id). Copy each record as it is.
- **Everything else** in the persisted state (settings, single values, lists without ids): one collection named `state`, with `"id": "key"` and one record per top-level key: `{"key": "<key>", "value": <its value>}`.

Add a `map` to a collection whose records are weigh-ins, with the field names it uses. For a weight log whose entries have `date` (YYYY-MM-DD), `pounds` and `createdAt` (milliseconds):

```json
"map": [ { "to": "healthlog.weight", "day": "date", "lb": "pounds", "at": "createdAt" } ]
```

Use `"kg"` instead of `"lb"` when the weights are in kilograms. Leave `at` out when the records have no time of their own.

Write the file with your file tool (or a shell here-document), as `<STATE>/wabi-<app>.json`, where `<app>` is the app's id in lowercase. Then go back to `SKILL.md` §2 and run `plan`.

## Example

A weight log with two entries and a goal:

```json
{
  "v": 1,
  "connector": "wabi",
  "app": { "id": "<app id from list_apps>", "title": "Weight log" },
  "revision": null,
  "captured_at": "2026-10-28T10:00:00Z",
  "collections": [
    {
      "name": "entries",
      "complete": true,
      "id": "id",
      "records": [
        { "id": "a1", "date": "2026-10-26", "pounds": 182.4, "createdAt": 1793001600000, "updatedAt": 1793001600000 },
        { "id": "a2", "date": "2026-10-27", "pounds": 181.9, "createdAt": 1793088000000, "updatedAt": 1793088000000 }
      ],
      "map": [ { "to": "healthlog.weight", "day": "date", "lb": "pounds", "at": "createdAt" } ]
    },
    {
      "name": "state",
      "complete": true,
      "id": "key",
      "records": [ { "key": "goalPounds", "value": 175 } ]
    }
  ]
}
```
