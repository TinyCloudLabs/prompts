# TinyCloud OpenCode read setup

This release extends the existing TinyChat-derived native handoff with one model-facing `tinycloud_setup` call. Code owns the bundled runtime, durable account selection, canonical app read scope, approval and private import. The CLI remains the signed-proof verifier. Transport provenance is TinyCloudLabs/tinychat `f67bf08417c8954fc0bab4379e99db13977f4d96`.

The supported client is stock OpenCode 1.18.31, direct local macOS TUI. The release binds CLI 0.10.1-lean-auth.1 and OpenCode plugin schema 1.18.31 with a complete dependency lock and per-file integrity inventory. Node is bound to the actual Node executable at installation; compiled OpenCode is never used as a Node replacement. Use Node 22.22.2 LTS or newer compatible LTS.

Use `quickstart/tinycloud-opencode-read.md` from the complete release. Existing installations must upgrade the whole release. The bootstrap checks the archive digest, stages a new versioned directory and validates the complete tree before the installer atomically switches only its managed loader. Validation failure retains the prior loader. The installer preserves existing account state and unrelated plugins.

```sh
node scripts/bootstrap-opencode.mjs --delivery /absolute/release-output/delivery.json --activate
```

`--activate` runs inside the supported native OpenCode conversation and uses its exact-session reload/continuation. Without activation, the installer reports restart required. Neither installation mode establishes authentication or end-to-end acceptance.

Setup returns its loaded release identity, durable `contextHandle`, selected application, resource mappings and exact CLI context. Saved account context is separate from conversation-bound pending approval; sufficient warm grants need no old helper receipt. Saved app selection is reused only for the same question and is revalidated against live canonical metadata. Ambiguous app descriptions return to the model for selection.

Cold discovery requires compatible OpenKey web and API with app-read protocol 1. Its approval visits authenticate the owner, discover canonical registrations, show exact selected-app reads and sign one multi-space proof. Unsupported registrations never fall back to all-space scope. The supported cold path remains managed keys on allowed node hosts. A successful proof import preserves primary sessions and unrelated additional grants. The hook removes paste material before model/transcript delivery; native TUI input history is a separate limitation.

`tinycloud_signin_status` and `tinycloud_auth_cancel` remain recovery tools. Interrupted acquisition can retry explicitly through setup after fixing the reported cause. Known parser/startup/deployment errors retain safe diagnostics and bound runtime identity; unknown subprocess output is withheld. The older `scripts/auth.mjs` interface remains an internal fixed-scope diagnostic interface and is not the supported model entry.

Run `node --test test/*.test.mjs`. Build a complete artifact with `node scripts/build-release.mjs --runtime /absolute/locked-runtime --output /absolute/new-output`. The output includes the archive, full release manifest, dependency lock, baseline registry template, core CLI reference, guide and `delivery.json` hashes. Source checkout alone is intentionally not a validated installation.

Publication and live acceptance remain explicit gates. Publish an immutable replacement entry, deploy matching OpenKey web/API, verify intended managed-owner eligibility and process-local discovery routing, then exercise the exact guide in a fresh supported TUI: one approval/paste, automatic original-question answer, and warm repeat with zero approvals. Component or synthetic integration tests do not substitute for that trial.
