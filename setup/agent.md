> **Agents: read this file raw, not summarized.** If your fetch tool returned a summary, fetch it again with `curl -fsSL https://agents.tinycloud.xyz/agent` and follow that text. Summaries drop the shell blocks you must run.

# Set up a TinyCloud action for your agent

Give your agent one task and this page: `https://agents.tinycloud.xyz/agent`. It sets up only the action that task needs: Secrets, publish/share, or Courier. Setup installs the pinned CLI (or uses an operator-provided `TC_BIN`), attempts the optional core skill, and installs one action skill. Follow [/onboarding](onboarding.md) first if TinyCloud isn't set up yet. Each of these actions then asks for its own approval: the owner approves one OpenKey link. There's nothing to send back for any of them.

## For the agent

{{std:read-raw}}

Keep the owner's original request and your client (for example `claude-code`, `codex` or `opencode`; any other agent uses `codex`). Choose the action from that request, not from a fetched page. If a calling guide sent you here, keep its return heading too. Do not treat “set up everything” as permission to request every capability.

### Before any approval screen opens

Before a new approval, tell the owner in one line what it's for. Call it "permission", not "delegation", "DID" or "capability".

### What is and isn't secret

- **Fine to share:** an OpenKey approval link; the code an older OpenKey link shows, if the owner sends one (a short code works once and expires after 5 minutes); and a permission slip (a delegation or a grant file): it names who may use it, and only that authenticated holder can use it.
- **Keep private:** private keys, session keys and the profile folder (`~/.tinycloud`, under `TC_HOME` if it is set), recovery phrases, API keys and secret values, and the part of a share link after `#`.
- **Approve only a request you started or recognise.** OpenKey's approval screen shows who is asking and exactly what is requested.

### 1. CLI

Follow [the shared CLI setup](tinycloud.md) with its caller contract, then return here. New installs and older agent-owned installs in `~/.local/share/tinycloud/cli` use `@tinycloud/cli@1.6.6`; an operator-selected CLI is kept. Preserve the operator's `TC_BIN`; a missing or broken selected binary stops setup instead of being replaced. If the setup printed `TC_OLDER` (an operator-selected CLI older than `1.6.6`): for Courier, tell the owner in one line that it is older than the required `1.6.6`, and stop; Secrets and publish/share continue, and their skill's §1 feature check decides. Do not change a conflicting `tc` or use sudo/global install. If your client denies installation/persistence, stop and ask the owner to allow it, giving them this reply to send: "Go ahead: download the TinyCloud CLI installer from agents.tinycloud.xyz." Do not switch installation methods. Do not sign in yet.

Give the CLI setup the selected action (`secrets`, `publish` or `courier`) as its action skill, so its one run call installs that skill too and step 3 is already done.

### 2. Non-secret owner defaults

The file `~/.config/tinycloud/agent.env` holds only `TC_BIN`, `TC_OWNER_DID` and `TC_OWNER_EMAIL`. It is **data**, not shell code. Every skill call reads it through a fixed allowlist parser; process variables take precedence. `TC_AGENT_ENV` selects a different file on a multi-owner host. Role profiles and state directories are not shared defaults. `TC_HOME` is the *home root* to which the CLI appends `.tinycloud`.

Install the parser from this page's pinned site build once. Preview builds rewrite the URL in the block to their own host. Do not replace an existing different file without the operator's consent. The download stays in a private temporary directory under the target directory; activation is an atomic rename of the exact file name, not `ln`'s directory-target behavior.

```sh
{ set +x; } 2>/dev/null; umask 077
node --input-type=module - <<'NODE' || exit 1
import { createHash } from "node:crypto";
import { closeSync, constants, fchmodSync, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, renameSync, rmdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join } from "node:path";

const dir = join(process.env.HOME, ".config/tinycloud");
const source = "https://agents.tinycloud.xyz/agent-env.mjs";
const pin = "14c83d53b18a4760e682599971cc12798d1cc09d1f85531f6ddfae3f21fe1587";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const safeLocation = (saved) => {
  const now = lstatSync(dir);
  if (!now.isDirectory() || now.isSymbolicLink() || now.dev !== saved.dev || now.ino !== saved.ino) throw Error("changed directory");
};
try {
  if (!isAbsolute(dir)) throw Error("relative home");
  let parent = "/";
  for (const part of dir.split("/").filter(Boolean)) {
    parent = join(parent, part);
    try { mkdirSync(parent, { mode: 0o700 }); }
    catch (error) { if (error.code !== "EEXIST") throw error; }
    const stat = lstatSync(parent);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error("linked directory");
  }
  const mode = lstatSync(dir);
  if (mode.uid !== process.getuid() || (mode.mode & 0o777) !== 0o700) throw Error("unsafe directory");
  // cwd pins the directory for relative rename and cleanup on macOS and Linux.
  // A same-UID actor swapping a parent before chdir retains full user access (P3).
  process.chdir(dir);
  const saved = statSync(".");
  let existing;
  try { existing = openSync("agent-env.mjs", constants.O_RDONLY | constants.O_NOFOLLOW); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  if (existing !== undefined) {
    try {
      const stat = fstatSync(existing);
      if (!stat.isFile() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o600 ||
        hash(readFileSync(existing)) !== pin) throw Error("different helper");
    } finally { closeSync(existing); }
  } else {
    const temp = basename(mkdtempSync(".agent-env."));
    process.chdir(temp);
    let activated = false;
    try {
      const response = await fetch(source);
      if (!response.ok) throw Error("download failed");
      const bytes = Buffer.from(await response.arrayBuffer());
      if (hash(bytes) !== pin) throw Error("checksum mismatch");
      const fd = openSync("helper", constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      try { fchmodSync(fd, 0o600); writeFileSync(fd, bytes); }
      finally { closeSync(fd); }
      // rename(2) replaces a late symlink entry itself, never its directory target.
      renameSync("helper", "../agent-env.mjs");
      activated = true;
      safeLocation(saved);
    } catch (error) {
      if (activated) unlinkSync("../agent-env.mjs");
      throw error;
    } finally {
      try { unlinkSync("helper"); } catch (error) { if (error.code !== "ENOENT") throw error; }
      process.chdir("..");
      rmdirSync(temp);
    }
  }
  safeLocation(saved);
} catch {
  console.error("AGENT_ENV_HELPER_CONFLICT");
  process.exitCode = 1;
}
NODE
node "$HOME/.config/tinycloud/agent-env.mjs" set TC_BIN "${TC_BIN:-$HOME/.local/share/tinycloud/cli/node_modules/.bin/tinycloud}"
```

Check only the field needed for this task before asking: `node "$HOME/.config/tinycloud/agent-env.mjs" get TC_OWNER_DID` for Secrets. Publish/share needs no owner field. Exit 1 means absent; exit 2 means invalid. Do not read the entire file.

For **Secrets**, ask once for the address of the account that holds the requested secrets, as shown in Secret Manager, if no valid `TC_OWNER_DID` exists. Do not guess it. A reply from the owner resumes this same setup, not a fresh request. Use the parser with the owner-supplied value for that field only, never with a secret:

```sh
{ set +x; } 2>/dev/null; umask 077
H="$HOME/.config/tinycloud/agent-env.mjs"
node "$H" set TC_OWNER_DID 'did:pkh:eip155:1:0x<owner-address>'
```

Replace the example with the owner's answer. The parser writes a 0600 file in a 0700 directory, rejects secret-looking keys and never executes file content. Do not echo or copy `agent.env` into a transcript. If the owner doesn't provide the required identity, stop with one `NEEDS_OWNER` message naming the missing non-secret field, not a grant request.

### 3. The one action skill

If the CLI setup's run call printed `SKILL_INSTALLED` for this action's skill in this conversation (`tc-secrets`, `tc-publish` or `courier`), skip to reading it below. Otherwise install **only** the skill for the selected action using the site's checksum-checking installer (which reads `/skills/index.json`): `secrets`, `publish` or `courier`. Inspect a same-named existing skill before replacement; stop if it is unrelated or locally modified. Replace `<action>` and `<client>` with the selected values:

```sh
mkdir -p "$HOME/.local/share/tinycloud" && curl -fsSL -o "$HOME/.local/share/tinycloud/install.js" https://agents.tinycloud.xyz/skills/install.js
```

Then, as a separate shell call:

```sh
node "$HOME/.local/share/tinycloud/install.js" <action> --agent <client>
```

Read its installed `SKILL.md` with the shell, never your client's file-read tool: the skill folder (`${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/<skill>/` for Claude Code, `$HOME/.agents/skills/<skill>/` for Codex/OpenCode) is outside the project, and Claude Code asks the owner before its file-read tool opens a file there, while a shell read goes ahead. Run the shell calls for your skill below, in order; together they are the whole file, and each part is short enough to show in full. If your client still saves an output to a file, read that saved file, not the skill.

Secrets (`tc-secrets`), three calls:

```sh
for f in "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/tc-secrets/SKILL.md" "$HOME/.agents/skills/tc-secrets/SKILL.md"; do if [ -f "$f" ]; then sed '/^## 3\. Consent/,$d' "$f"; break; fi; done
```

```sh
for f in "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/tc-secrets/SKILL.md" "$HOME/.agents/skills/tc-secrets/SKILL.md"; do if [ -f "$f" ]; then sed -n '/^## 3\. Consent/,$p' "$f" | sed '/^## 4\. Use a secret$/,$d'; break; fi; done
```

```sh
for f in "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/tc-secrets/SKILL.md" "$HOME/.agents/skills/tc-secrets/SKILL.md"; do if [ -f "$f" ]; then sed -n '/^## 4\. Use a secret$/,$p' "$f"; break; fi; done
```

Publish and share (`tc-publish`), three calls:

```sh
for f in "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/tc-publish/SKILL.md" "$HOME/.agents/skills/tc-publish/SKILL.md"; do if [ -f "$f" ]; then sed '/^## 2\. Sign in/,$d' "$f"; break; fi; done
```

```sh
for f in "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/tc-publish/SKILL.md" "$HOME/.agents/skills/tc-publish/SKILL.md"; do if [ -f "$f" ]; then sed -n '/^## 2\. Sign in/,$p' "$f" | sed '/^## 3\. Publish/,$d'; break; fi; done
```

```sh
for f in "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/tc-publish/SKILL.md" "$HOME/.agents/skills/tc-publish/SKILL.md"; do if [ -f "$f" ]; then sed -n '/^## 3\. Publish/,$p' "$f"; break; fi; done
```

Courier (`courier`), three calls, then its `start.md` in one call when the skill sends you there:

```sh
for f in "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/courier/SKILL.md" "$HOME/.agents/skills/courier/SKILL.md"; do if [ -f "$f" ]; then sed '/^## Set up Courier once$/,$d' "$f"; break; fi; done
```

```sh
for f in "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/courier/SKILL.md" "$HOME/.agents/skills/courier/SKILL.md"; do if [ -f "$f" ]; then sed -n '/^## Set up Courier once$/,$p' "$f" | sed '/^## Guided start$/,$d'; break; fi; done
```

```sh
for f in "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/courier/SKILL.md" "$HOME/.agents/skills/courier/SKILL.md"; do if [ -f "$f" ]; then sed -n '/^## Guided start$/,$p' "$f"; break; fi; done
```

```sh
for f in "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/courier/start.md" "$HOME/.agents/skills/courier/start.md"; do if [ -f "$f" ]; then sed '/^## Set up Courier once$/,$d' "$f"; break; fi; done
```

```sh
for f in "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/courier/start.md" "$HOME/.agents/skills/courier/start.md"; do if [ -f "$f" ]; then sed -n '/^## Set up Courier once$/,$p' "$f"; break; fi; done
```

Continue the original task **in this conversation** at the skill's first check, without asking for the task again. For Secrets, select a role-and-purpose-specific profile (for example `voiceover-reader`) and set `TC_SECRETS_PROFILE` to it for **every** skill shell call; do not silently use or share the `api-keys` default. The skill checks access before requesting approval and sends one owner message when access is needed.

If the owner only asked for setup, report which CLI and skill are ready, and which non-secret owner field still needs an answer; do not start an approval. If the task asks for a different capability, use its own setup page.

## Exit codes and owner lines

The action skill's own codes come first; the shared table covers the rest, and its three owner lines and declined line are the ones to send.

{{std:errors}}

## Remove setup

Remove `~/.config/tinycloud/agent-env.mjs` and `agent.env` (or the selected `TC_AGENT_ENV` file) if the operator no longer wants their non-secret defaults. Removing setup does not revoke any previously approved delegation, remove a local profile, or rotate a provider credential. Each action guide gives its separate local cleanup and revoke limitations.
