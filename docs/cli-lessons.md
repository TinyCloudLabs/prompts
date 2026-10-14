# TinyCloud CLI usage lessons

Internal log of what agents got wrong or found slow when using the TinyCloud CLI (`tinycloud` / `tc`) and the skills built on it. The site does not publish this file; it feeds the skills and setup pages that do.

**Owner:** CLI experience lead (Naomi's team). Officers send new lessons to the owner, who adds them here.

**Folding:** every so often the owner folds open lessons into the skills and pages they name. Each fold is one prompts PR, reviewed by Astra. The entries it covers then move to `folded into <skill> <version> (#PR)`. Lessons whose fix is in the CLI itself (js-sdk) say so and link the js-sdk PR.

**Entry format:** date; what went wrong or was slow, with the exact command and flags; the right usage; evidence (agent, TC issue, PR); what it feeds; status (`open`, `partly folded`, or `folded into <skill> <version> (#PR)`).

---

## L1. `tc` can be Linux traffic control, not TinyCloud

- **Date:** 2026-10-13
- **What went wrong:** on stock Ubuntu, `/usr/sbin/tc` (iproute2) is on the `PATH`. Agents that ran `tc …`, or relayed a hint like ``Run `tc auth login` ``, ran the traffic-control tool instead. `/cli` correctly reported `TC_CONFLICT other` and skipped the link, but before prompts#21 `/chat` then dead-ended.
- **Right usage:**
  - Owners type `tinycloud` (CLI 1.2.3+ ships it next to `tc`).
  - Skills never run a bare `tc`. They resolve the CLI once: `TC_BIN`, else `~/.local/share/tinycloud/cli/node_modules/.bin/tinycloud`, else `$(npm prefix --global)/bin/tinycloud`, else stop with `TC_NOT_FOUND`. Then they run `"$TC" …`.
- **Evidence:**
  - prompts#17 (O2), prompts#21 (setup pages switch to `tinycloud`);
  - js-sdk#519 and #521 (alias, hints name the invoked bin), js-sdk#526 / TC-1085 (skill resolver runs `.bin/tinycloud`);
  - TC-1077 (TinyChat's skill still falls back to `tc`; the site patches it);
  - Clarissa's prompts#21 QA (strace: no `/usr/sbin/tc` exec).
  - Open on the board: roci-board hints use `$(npm prefix --global)/bin/tc`, not the shared prefix (planner 664677c0, 2026-10-14).
- **Feeds:** `/cli`, `/chat`, tc-cli skill, courier skill, tinychat-retrieval (upstream), roci-board hints.
- **Status:** partly folded. Setup pages switched in prompts#21. The js-sdk skill resolver ships in CLI 1.2.4; the site drops its tinychat patch after TC-1077.

## L2. Always pass `--profile`; `init` may not change the default

- **Date:** 2026-10-13
- **What went wrong:**
  - The tc-secrets skill (§3a) said `tc init --name <p> --key-only` makes the new profile the default. With CLI 1.2.0-beta.8 it did not (the default stayed `meeting-digest`), so later commands without `--profile` ran against the wrong profile.
  - Separately, a `doctor` run without `--profile` (and with `TC_HOME` set to empty) read another home and reported "skipped (no active session)" for a profile that was signed in.
- **Right usage:** name the profile on every command, as `tinycloud --profile <p> …`, and set `TC_HOME` explicitly or not at all. Never rely on `init` or `profile switch` to change what an unqualified command targets.
- **Evidence:**
  - Bobbie's worker fe113e54 (iron-proxy secrets sync, 2026-10-13);
  - prompts#23 (open: rewords tc-secrets §3a);
  - Amos's 1.2.2-beta.5 release smoke (doctor without `--profile`).
  - Related CLI bugs: TC-1078 (the `PROFILE_DELETE_DEFAULT` hint names a non-existent `tc profile default`; deleting the only profile leaves `defaultProfile` dangling).
- **Feeds:** tc-secrets (§3a), tc-cli SKILL.md, every skill's blocks.
- **Status:** open (prompts#23 in review).

## L3. Ask for several secrets in one request

- **Date:** 2026-10-14
- **What went wrong:** in Holden's logs-reader sitting, an agent opened one secret request (one board card) per secret name, so the owner had to approve the same kind of access several times.
- **Right usage:** collect every name the task needs first, then make **one** request that names them all. With the skill, that's one manifest listing all the names, one approval link and one add link covering every `MISSING` / `NO_ACCESS` name. On Rocinante, it's one `roci-board secret request` that carries all the names. Ask again only for names that come up later.
- **Evidence:** Sam, 2026-10-14 (via Naomi); Holden's logs-reader sitting.
- **Feeds:** tc-secrets (§2–§3, make "all names in one request" explicit), roci-board secret request usage.
- **Status:** open.

## L4. OpenKey codes expire in 10 minutes: redeem at once

- **Date:** 2026-10-13
- **What went wrong:** the 8-character code from OpenKey's approval page (paste login, tc-secrets §3c, tc-apps SQL, Courier init) is valid for 10 minutes. Agents that waited, or asked something else first, got `CODE_EXPIRED` / "Delegation code not found or expired" and had to start the approval again.
- **Right usage:** redeem the code in the very next step after it arrives (`tinycloud --profile <p> auth login --paste … < "$STATE/code"`). If it has expired, ask for the full code ("Use full delegation code instead"), which doesn't expire after 10 minutes. Paste the code exactly as sent; OpenKey shows it in upper case, and either case works (js-sdk#523).
- **Evidence:** tc-secrets §3c and tc-apps SQL.md (already warn); Clarissa's 1.2.2 QA; js-sdk#523 (upper-case codes).
- **Feeds:** tc-secrets, tc-apps (SQL.md), courier, tc-cli AUTH.md.
- **Status:** partly folded (tc-secrets and tc-apps say it; add to tc-cli AUTH.md and courier).

## L5. Read secrets with `secrets wait` / `secrets get --raw`; never print a value

- **Date:** 2026-10-13
- **What went wrong:** `tinycloud secrets get NAME` without `--raw` prints JSON containing the value, so it ends up in the transcript. Polling or asking the owner "is it saved yet?" wastes turns.
- **Right usage:**
  - Check, then wait: `tinycloud --profile <p> secrets wait NAMES --timeout 0` classifies without decrypting, and `--timeout 9m` waits for the owner to add them.
  - Use: capture with `secrets get NAME --raw` inside the one command that needs it, with stdin closed, and pass the value through the environment or stdin, never as an argument.
- **Evidence:** TC-835 (`secrets request` / `wait`); tc-secrets 0.4.0 (prompts#12) and 0.5.0 (prompts#13).
- **Feeds:** tc-secrets, tc-cli REFERENCE.md.
- **Status:** folded into tc-secrets 0.4.0 (#12) and 0.5.0 (#13).

## L6. `space list` needs `tinycloud.space/list`, which a plain owner sign-in lacks

- **Date:** 2026-10-14
- **What went wrong:**
  - After a plain `tinycloud auth login --method openkey`, `tinycloud space list` failed with `AUTH_REQUIRED` (exit 3, "not authenticated") while `doctor` said `Session: active`.
  - The default owner session covers only the `default` space. Listing needs `tinycloud.space/list` or a read of the account-space registry.
- **Right usage:**
  - **CLI 1.2.4+:** the command answers `PERMISSION_DENIED` (exit 5) and prints the one grant command: `tinycloud --profile <p> auth request --grant --cap tinycloud.kv:account:spaces/:get,list`. Run it, then `space list`.
  - **Generally:** treat a 401 that names a capability as missing permission, not a dead session; don't re-login.
- **Evidence:** TC-1083, js-sdk#528 (in 1.2.4-beta); Clarissa's 1.2.4-beta.3 QA. Same pattern still open for `delegation list` (TC-1115).
- **Feeds:** tc-cli REFERENCE.md (updated in #528), tc-cli SKILL.md.
- **Status:** CLI fix in 1.2.4 (pending stable). The consent change that would make it just work is pending Sam (TC-1083 options A/B/C).

## L7. The tc-secrets preamble's `chmod 600 "$STATE"/*` breaks subdirectories

- **Date:** 2026-10-13
- **What went wrong:**
  - Every tc-secrets 0.5.0 block started with `STATE="${TC_SECRETS_STATE:-$HOME/.local/state/tc-secrets}" … chmod 600 "$STATE"/* 2>/dev/null`.
  - The glob also matched subdirectories, which lost their execute bit. Five subdirectories in `~/.local/state/tc-secrets` (`default` and four agent-UUID dirs) became `drw-------` and nothing could enter them.
  - There was no error because stderr went to `/dev/null`.
  - Two stale FIFOs from 2026-10-03 (`read.fifo`, `write.fifo`) in the same directory also blocked a naive read or grep.
- **Right usage:**
  - Repair files only: `find "$STATE" -mindepth 1 -maxdepth 1 -type f -exec chmod 600 {} +`.
  - One-off recovery: `chmod 700` on the broken subdirectories. Remove a stale FIFO only after `fuser` shows nothing holds it.
  - Generally, don't hide `chmod`/`rm` errors on globs that can match directories.
- **Evidence:**
  - Bobbie's worker fe113e54 (iron-proxy secrets sync trial, 2026-10-13);
  - Bobbie's proposal (`.context/rocinante/officers/bobbie/proposals.md`), approved by Sam 2026-10-14 15:54Z;
  - Alex patched both installed copies and restored the directories;
  - upstream fix: prompts#23.
- **Feeds:** tc-secrets (every block's preamble); check tc-publish and tc-apps preambles for the same glob.
- **Status:** open (prompts#23 in review; the next skill resync overwrites the local patch until it merges).

## L8. Secret Bridge is retired; secrets go through the board

- **Date:** 2026-10-14
- **What went wrong:** the tc-secrets skill and plan #87 told agents to hand over OpenKey codes, and some secrets, through Paseo's Secret Bridge (`secret-bridge request` / `pipe`). Sam turned it off on 2026-10-14.
- **Right usage:**
  - **Secrets:** on Rocinante, request them with `roci-board secret request NAME … --from … --profile … --background … --why-now … --if-no-answer …`. The owner stores the value in TinyCloud Secrets and approves; then read it with `tinycloud --profile <p> secrets get NAME --raw`.
  - **OpenKey codes:** they come back in the 1:1 channel, or on the board card the watcher relays.
  - Never reach for `secret-bridge`.
- **Evidence:** Sam 2026-10-14 (via Naomi); prompts#24 (tc-secrets 0.5.3); plan #87 rev 2.2 (planner 664677c0).
- **Feeds:** tc-secrets, Courier setup, plan #87.
- **Status:** folded into tc-secrets 0.5.3 (#24) and plan #87 rev 2.2.
