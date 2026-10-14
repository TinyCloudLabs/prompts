# TinyCloud CLI usage lessons

Internal log of what agents got wrong or found slow when using the TinyCloud CLI (`tinycloud` / `tc`) and the skills built on it. The site build skips `docs/`, so this file is never published; it feeds the skills and setup pages that are.

**Owner:** CLI experience lead (Naomi's team). Officers send new lessons to the owner, who adds them here.

**Folding:** every so often the owner folds open lessons into the skills and pages they name. Each fold is one prompts PR, reviewed by Astra, and the entries it covers move to `folded into …`. Lessons fixed in the CLI itself (js-sdk) cite the js-sdk PR and the CLI version.

**Entry format:**
- **Date.**
- **What went wrong:** the exact command and flags.
- **Right usage.**
- **Evidence:** agent, TC issue, PR.
- **Feeds:** the skills and pages it belongs in.
- **Status:** exactly one of `open`, `partly folded`, or `folded into <skill or CLI> <version> (#PR)`, optionally followed by `; ` and a short note.

---

## L1. `tc` can be Linux traffic control, not TinyCloud

- **Date:** 2026-10-13
- **What went wrong:**
  - On stock Ubuntu, `/usr/sbin/tc` (iproute2) is on the `PATH`, so agents that ran `tc …`, or relayed a hint like ``Run `tc auth login` ``, ran the traffic-control tool.
  - `/cli` correctly reported `TC_CONFLICT other` and skipped the link. `/chat` then dead-ended (Clarissa's prompts#19 QA, finding F1), until prompts#19 patched the served TinyChat pack to resolve `TC_BIN`, then the private install, and let `/chat` continue past `TC_CONFLICT`.
  - Agents worked around it by calling the npm-installed binary by absolute path (e.g. `~/.nvm/…/bin/tc`) or setting `TC_BIN`.
- **Right usage:**
  - Owners type `tinycloud` (CLI 1.2.3+ ships it next to `tc`).
  - Skills never run a bare `tc`. They resolve the CLI once: `TC_BIN`, else `~/.local/share/tinycloud/cli/node_modules/.bin/tinycloud`, else `$(npm prefix --global)/bin/tinycloud`, else stop with `TC_NOT_FOUND`. Then they run `"$TC" …`.
- **Evidence:**
  - prompts#17 (O2), #19 (TinyChat pack patch, `/chat` continues on `TC_CONFLICT`), #21 (setup pages switch to `tinycloud`);
  - js-sdk#519, #521 (alias; hints name the invoked bin), #526 / TC-1085 (skill resolver runs `.bin/tinycloud`);
  - TC-1077 (TinyChat's own skill still falls back to `tc`);
  - Avasarala's transcript-job access notes (worker 6f350d25);
  - roci-board hints still use `$(npm prefix --global)/bin/tc` (planner 664677c0, 2026-10-14).
- **Feeds:** `/cli`, `/chat`, tc-cli skill, courier skill, tinychat-retrieval (upstream), roci-board hints.
- **Status:** partly folded; pages switched in prompts#19/#21, the js-sdk resolver ships in CLI 1.2.4, TC-1077 and the roci-board hints are open.

## L2. Always pass `--profile`; `init` may or may not change the default

- **Date:** 2026-10-13
- **What went wrong:**
  - `tc init --name <p> --key-only` changed the machine's default profile in some runs (sitrep builder, 2026-10-13), displacing another app's default. With CLI 1.2.0-beta.8 it left the default unchanged: `tc init --name factory-keys --key-only` kept `meeting-digest` as the default, contradicting tc-secrets §3a, and `--help` doesn't say either way. Commands without `--profile` then ran against the wrong profile, and other agents on the machine depend on that default.
  - A `doctor` run without `--profile` and with `TC_HOME` set to empty read another home and reported "skipped (no active session)" for a signed-in profile.
- **Right usage:**
  - Name the profile on every command: `tinycloud --profile <p> …`.
  - Set `TC_HOME` explicitly or not at all. For tc-secrets, set `TC_SECRETS_PROFILE` and `TC_SECRETS_STATE` per command instead of switching the default.
  - Never rely on the default. If a command might switch it, read `defaultProfile` before and after (`tinycloud profile list --json`) and put it back in the same command with `tinycloud profile switch <name>`.
- **Evidence:**
  - Bobbie's worker fe113e54 (2026-10-13);
  - Alex (sitrep builder, 2026-10-13);
  - Drummer (86645198, then 152677c6), TC-804, profile `factory-keys` (2026-10-12), and Amos's caution the same day;
  - Amos's 1.2.2-beta.5 release smoke;
  - prompts#23 (rewords §3a).
  - Related: TC-1078. The `PROFILE_DELETE_DEFAULT` hint names a non-existent `tc profile default`. Removing a profile's folder by hand instead of with `profile delete` leaves `defaultProfile` pointing at it; the `/publish` undo now says to remove the whole store.
- **Feeds:** tc-secrets (§3a), tc-cli SKILL.md, every skill's blocks.
- **Status:** open; prompts#23 in review.

## L3. Ask for several secrets in one request

- **Date:** 2026-10-14
- **What went wrong:**
  - For two Better Stack keys, an agent ran two separate `tc secrets request <NAME> --owner <did> --requester <label>` calls, one per key, so the owner opened two links and approved twice.
  - In Holden's logs-reader sitting, an agent opened one board card per secret name.
- **Right usage:**
  - Collect every name first, then make **one** request: `tinycloud secrets request A B … --owner <did> --requester <label>`. That gives one Secret Manager link with a repeated `name=`.
  - The grant manifest lists every `vault/secrets/<NAME>` get, plus the names the profile already reads, because a new grant replaces the old one.
  - On Rocinante, it's one `roci-board secret request NAME [NAME…]` naming all of them.
  - Ask again only for names that come up later.
- **Evidence:** Sam, 2026-10-14 (via Naomi); Alex (Better Stack, 2026-10-14); prompts#23 commit 57193b7.
- **Feeds:** tc-secrets (§2–§3), roci-board secret request usage.
- **Status:** open; prompts#23 in review.

## L4. OpenKey codes expire in 10 minutes: redeem at once

- **Date:** 2026-10-13
- **What went wrong:** the 8-character code from OpenKey's approval page (paste login, tc-secrets §3c, tc-apps SQL, Courier init) is valid for 10 minutes. Agents that waited, or asked something else first, got `CODE_EXPIRED` / "Delegation code not found or expired" and had to start the approval again.
- **Right usage:**
  - Redeem the code in the very next step after it arrives: `tinycloud --profile <p> auth login --paste … < "$STATE/code"`.
  - If it has expired, ask for the full code ("Use full delegation code instead"), which doesn't expire after 10 minutes.
  - Paste the code exactly as sent. OpenKey shows it in upper case, and either case works (js-sdk#523).
- **Evidence:** tc-secrets §3c and tc-apps SQL.md (already warn); Clarissa's 1.2.2 QA; js-sdk#523.
- **Feeds:** tc-secrets, tc-apps (SQL.md), courier, tc-cli AUTH.md.
- **Status:** partly folded; tc-secrets and tc-apps say it, tc-cli AUTH.md and courier don't yet.

## L5. Read secrets with `secrets get --raw`; never print a value

- **Date:** 2026-10-13
- **What went wrong:** `tinycloud secrets get NAME` without `--raw` prints JSON containing the value, so it lands in the transcript. Polling or asking the owner "is it saved yet?" wastes turns.
- **Right usage:**
  - Wait with `tinycloud --profile <p> secrets wait NAMES --timeout 9m`; the owner never has to say "saved".
  - Use the value with `secrets get NAME --raw` inside the one command that needs it, with stdin closed.
  - Pass the value through the environment or stdin, never as an argument.
- **Evidence:** TC-835 (`secrets request` / `wait`); tc-secrets 0.4.0 (prompts#12) and 0.5.0 (prompts#13).
- **Feeds:** tc-secrets, tc-cli REFERENCE.md.
- **Status:** folded into tc-secrets 0.5.0 (#13).

## L6. `space list` needs `tinycloud.space/list`, which a plain owner sign-in lacks

- **Date:** 2026-10-14
- **What went wrong:**
  - After a plain `tinycloud auth login --method openkey`, `tinycloud space list` failed with `AUTH_REQUIRED` (exit 3, "not authenticated") while `doctor` said `Session: active`.
  - The default owner session covers only the `default` space. Listing needs `tinycloud.space/list`, or a read of the account-space registry.
- **Right usage:**
  - On CLI 1.2.4+, the command answers `PERMISSION_DENIED` (exit 5) and prints the one grant command: `tinycloud --profile <p> auth request --grant --cap tinycloud.kv:account:spaces/:get,list`. Run it, then `space list`.
  - Generally, treat a 401 that names a capability as missing permission, not as a dead session, and don't sign in again.
- **Evidence:** TC-1083; js-sdk#528 (1.2.4-beta); Clarissa's 1.2.4-beta.3 QA. The same pattern is still open for `delegation list` (TC-1115).
- **Feeds:** tc-cli REFERENCE.md (updated in js-sdk#528), tc-cli SKILL.md.
- **Status:** partly folded; the CLI fix ships in 1.2.4, and the consent change that would make it just work is pending Sam (TC-1083).

## L7. The tc-secrets preamble's `chmod 600 "$STATE"/*` breaks subdirectories

- **Date:** 2026-10-13
- **What went wrong:**
  - Every tc-secrets 0.5.0 block started with `STATE="${TC_SECRETS_STATE:-$HOME/.local/state/tc-secrets}" … chmod 600 "$STATE"/* 2>/dev/null`.
  - The glob also matched subdirectories, which lost their execute bit. Five subdirectories in `~/.local/state/tc-secrets` (`default` and four agent-UUID dirs) became `drw-------`, and nothing could enter them. There was no error, because stderr went to `/dev/null`.
  - Two stale FIFOs from 2026-10-03 (`read.fifo`, `write.fifo`) in the same directory also blocked a naive read or grep.
- **Right usage:**
  - Repair files only: `find "$STATE" -mindepth 1 -maxdepth 1 -type f -exec chmod 600 {} +`.
  - Recover broken subdirectories once with `chmod 700`.
  - Remove a stale FIFO only after `fuser` shows nothing holds it.
  - Don't hide `chmod` or `rm` errors on globs that can match directories.
- **Evidence:**
  - Bobbie's worker fe113e54 (iron-proxy secrets sync trial, 2026-10-13);
  - Bobbie's proposal (`.context/rocinante/officers/bobbie/proposals.md`), approved by Sam 2026-10-14 15:54Z;
  - Alex patched both installed copies and restored the directories;
  - prompts#23.
- **Feeds:** tc-secrets (every block's preamble); check tc-publish and tc-apps preambles for the same glob.
- **Status:** open; prompts#23 in review, and until it merges the next skill resync overwrites the local patch.

## L8. Secret Bridge is retired; secrets go through the board

- **Date:** 2026-10-14
- **What went wrong:** the tc-secrets skill and plan #87 told agents to hand over OpenKey codes, and some secrets, through Paseo's Secret Bridge (`secret-bridge request` / `pipe`). Sam turned it off on 2026-10-14.
- **Right usage:**
  - **Secrets:** on Rocinante, run `roci-board secret request NAME … --from … --profile … --background … --why-now … --if-no-answer …`. The owner stores the value in TinyCloud Secrets and approves. Then read it with `tinycloud --profile <p> secrets get NAME --raw`.
  - **OpenKey codes:** they come back in the 1:1 channel, or on the board card the watcher relays.
  - Never use `secret-bridge`.
- **Evidence:** Sam, 2026-10-14 (via Naomi); prompts#24 (tc-secrets 0.5.3); plan #87 rev 2.2 (planner 664677c0).
- **Feeds:** tc-secrets, Courier setup, plan #87.
- **Status:** folded into tc-secrets 0.5.3 (#24); plan #87 rev 2.2 also updated.

## L9. `auth status` is not proof of access

- **Date:** 2026-10-12
- **What went wrong:** `tc auth status` reported `authenticated: true` on profile `tinychat-agent` 9 days after its session had expired. A real `tc sql query` then returned `AUTH_REQUIRED`.
- **Right usage:**
  - Check `tinycloud --profile <p> context --json`: session `state` is `missing`, `expired`, `unverified`, `unknown-expiry` or `present`, with `expiresAt` (null when the expiry can't be determined). This is local metadata (`access: "not-tested"`), not verified access; make a real read when access matters.
  - Since CLI 1.2.2, `auth status` reports the expired state too, but a real read remains the only proof that a capability works.
- **Evidence:** TC-973 (js-sdk#508); Avasarala's transcript job (worker 6f350d25).
- **Feeds:** tc-cli SKILL.md and AUTH.md, tinychat-retrieval.
- **Status:** folded into CLI 1.2.2 (js-sdk#508); the skills should still say "check `context --json` or read".

## L10. Device login can't grant SQL or the secrets, account or applications spaces

- **Date:** 2026-10-13
- **What went wrong:** `tinycloud auth login --device --manifest M` for a manifest including `tinycloud.sql`, or the `secrets`, `account` or `applications` spaces, was refused. The CLI rejects secrets-space and encryption scopes before contacting OpenKey (`DEVICE_AUTH_UNSUPPORTED_SCOPE`), and OpenKey's device flow refuses the rest (`SCOPE_REJECTED`) by design.
- **Right usage (headless box):**
  1. Run the paste login once with stdin closed, which prints the approval URL: `tinycloud --profile <p> auth login --method openkey --paste --manifest M --expiry 30d --owner did:pkh:… < /dev/null`.
  2. The owner approves and sends back the short code.
  3. Redeem it with the same command and the code on stdin: `printf '%s\n' "$CODE" | tinycloud --profile <p> auth login --method openkey --paste --manifest M --expiry 30d --owner did:pkh:…`.
  - The URL is stable when the profile, key, manifest and the other effective options (expiry, host, reason) are the same, so rerunning the identical command gives the same link.
- **Evidence:** openkey `apps/api/src/services/device-authorization.ts` (allowed and refused scopes); Avasarala (profile `meeting-digest`, redeemed 2026-10-13); Alex (2026-10-14).
- **Feeds:** tc-cli AUTH.md, tc-secrets (already uses paste), tc-apps SQL.md (already uses paste), tinychat-retrieval.
- **Status:** partly folded; tc-secrets and tc-apps use paste, tc-cli AUTH.md should say which scopes need it.

## L11. `kv list` couldn't prove a listing was complete

- **Date:** 2026-10-12
- **What went wrong:** `tc kv list` dropped the node's `truncated` / `nextCursor` and had no paging flags, so agents couldn't tell a partial listing from a complete one. They cross-checked counts against the SQL catalog instead.
- **Right usage:** on CLI 1.2.3+, use `tinycloud kv list --all`, or `--limit N` with `--cursor <nextCursor>`, and check `truncated: false`. A rejected cursor is `KV_LIST_CURSOR_INVALID` (exit 2).
- **Evidence:** TC-982; js-sdk#514 and #524 (both in 1.2.3; #524 first shipped in 1.2.3-beta.4).
- **Feeds:** tc-cli SKILL.md (paging guidance added in js-sdk#514), tc-apps and tinychat-retrieval listing code.
- **Status:** folded into CLI 1.2.3 (js-sdk#514).

## L12. Skill packs that match the CLI version with a regex reject pre-releases

- **Date:** 2026-10-13
- **What went wrong:** tinychat-retrieval's version check rejected `1.2.0-beta.8` as `CLI_VERSION`, because its regex only accepted `X.Y.Z`.
- **Right usage:** compare versions with a semver-aware check that accepts pre-release suffixes, or feature-probe (`--help` output) as tc-secrets and tc-publish do.
- **Evidence:** tinychat #327; Avasarala's transcript job.
- **Feeds:** tinychat-retrieval (fixed), any pack with a version check.
- **Status:** folded into tinychat-retrieval 0.1.1-onboarding.17 (tinychat #327); audit other packs at the next fold.

## L13. Check that a secret exists without reading it: `secrets wait --timeout 0`

- **Date:** 2026-10-14
- **What went wrong:** agents used `tc secrets list` to see whether a secret existed. It needs a list grant on `vault/secrets/`, which no agent profile has, so it returned `PERMISSION_DENIED` on 9 profiles.
- **Right usage:** `tinycloud --profile <p> secrets wait NAME --timeout 0` on a signed-in profile. It never decrypts. Branch on the exit code:
  - 0: the secret exists and this profile can read it (the KV read grant; decrypt is not tested).
  - 8: pending, the secret isn't there yet. Send the add link and wait.
  - 5: `PERMISSION_DENIED`, the secret may exist but this profile can't read it. Request consent; don't wait for it to be added.
  - 3: `AUTH_REQUIRED`, no usable session.
- **Evidence:** Alex, 2026-10-14; tc-secrets §2.
- **Feeds:** tc-secrets (already uses it), tc-cli REFERENCE.md.
- **Status:** partly folded; tc-secrets uses it, tc-cli REFERENCE.md doesn't point to it yet.

## L14. `auth logout` is local only

- **Date:** 2026-10-14
- **What went wrong:** agents treated `tc auth logout` as ending access. It clears only the local session; delegations and grants on the node stay valid until they expire.
- **Right usage:**
  - Request short lifetimes (`--expiry`) for temporary access.
  - To end access now, run `tinycloud delegation revoke <cid>` (needs owner authority).
  - Undo steps should say this.
- **Evidence:** Alex, 2026-10-14; `tinycloud auth logout --help`.
- **Feeds:** setup-page undo sections (`/apps`, `/secrets`, `/publish`, `/chat`), tc-cli AUTH.md.
- **Status:** open.

## L15. A key-only profile doesn't know its owner: pass `--owner`

- **Date:** 2026-10-14
- **What went wrong:** on a key-only profile, `tc context --json` reports `ownerDid: null`, so requests that needed the owner failed or targeted nothing.
- **Right usage:**
  - Before the profile has signed in, pass `--owner did:pkh:eip155:1:<address>` to `secrets request` and `auth login`. `secrets request` works offline this way.
  - `secrets wait` still needs a signed-in session: on an unsigned key-only profile it exits 3 (`AUTH_REQUIRED`) even with `--owner`. Run it only after sign-in, where `--owner` checks the profile's live identity against the expected owner.
  - Keep pinning the owner explicitly (`TC_OWNER_DID`) rather than relying on the profile.
- **Evidence:** Alex (sitrep CLI, 2026-10-14).
- **Feeds:** tc-secrets (uses `TC_OWNER_DID`), tc-cli REFERENCE.md.
- **Status:** partly folded; tc-secrets passes `TC_OWNER_DID`, tc-cli REFERENCE.md doesn't say it yet.

## L16. A scoped login replaces a live session: one key-only profile per consumer

- **Date:** 2026-10-12
- **What went wrong:**
  - To add one secret name (`TYPESAFE_API_KEY`) on the shared `api-keys` profile, whose live session already covered other names, the agent ran the tc-secrets consent step: a scoped login, `tc --profile api-keys auth login --method openkey --paste --manifest M`, with `M` naming only the new secret. Drummer reported the step as `auth request`.
  - It was refused with `SESSION_IN_USE`: the new scoped session would have replaced the one that other tools (universe, the video tools) use for `ELEVENLABS_API_KEY`.
  - The agent couldn't tell which names the live session covered, so it couldn't safely widen the manifest either.
- **Right usage:**
  - Give each consumer its own key-only profile (`tinycloud init --name factory-keys --key-only`) and request only that consumer's names. This is the safe default.
  - If you must widen an existing profile, the new scoped login's manifest has to list every name the current session reads plus the new ones, because a scoped login replaces the session.
  - Take those names from the manifest of the login that created the current session. tc-secrets writes it to `$STATE/manifest.json`, but the next consent run overwrites that file; if it's gone, ask the owner which names the profile must keep. `tinycloud auth caps` is not a full inventory: it shows only appended runtime delegations, not the base session's manifest permissions.
  - `tinycloud auth request` doesn't replace anything. Without `--grant` it writes a request artifact; with `--grant` it appends an additional delegation.
  - On Rocinante, `roci-board secret request` handles this with `--keep NAME` for each name the session already covers, and enforces it.
  - Never add `--replace-session` (an `auth login` flag) to get past `SESSION_IN_USE`; that drops the other consumers' access.
- **Evidence:** TC-804; Drummer (86645198, then 152677c6), profile `factory-keys`. The CLI 1.2.3 behaviour of `auth caps` and `auth request` was checked in the prompts#26 review.
- **Feeds:** tc-secrets (§3, profile choice, and the scoped login replacing the session), tc-cli AUTH.md.
- **Status:** partly folded; roci-board enforces `--keep`, and the skills should still recommend one profile per consumer and say a scoped login replaces the session.

## L17. Ask Sam with a proceeding steer question, not a blocking stop (Rocinante board)

- **Date:** 2026-10-14
- **What went wrong:** agents that hit a non-obvious design or product choice either stopped and waited for an answer, or chose silently. Board answers also missed agents that had no worker label.
- **Right usage:**
  - Label yourself first, so answers reach you: `paseo agent update "$PASEO_AGENT_ID" --label rocinante.worker=<name>`. Use the same name as `--from`.
  - Post your default and a deadline, then keep working:

    ```sh
    roci-board upsert ask --id <id> --from <name> --mode proceeding --default <optionId> --decide-by <30m|2h|tonight|ISO> \
      --set title="…" --background "<60+ chars, readable from zero>" --option <id>="<label>|<consequence>" …
    ```

  - Check the card with `--dry-run` first.
  - At the point of no return, run `roci-board steer done <id> --from <name>`.
  - Name the TC issue a card blocks, and move that issue to "Waiting for Human Feedback" when you post. Move it back when Sam answers.
  - Never pass `--force`.
  - Pipe approval codes; never echo them.
  - Limits: 3 open cards and 6 per hour per name.
- **Evidence:** Sam's order via Naomi, 2026-10-14; `roci-board --help`.
- **Feeds:** Rocinante agent conventions (not a public skill). The code-handling part matches tc-secrets §3c.
- **Status:** open; it's a board convention, recorded here so the CLI skills' "ask the owner" steps can point to it.
