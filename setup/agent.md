# Set up a TinyCloud action for your agent

Give your agent one task and this page: `https://agents.tinycloud.xyz/agent`. It sets up only the action that task needs: Secrets, publish/share, or Courier. Setup installs the pinned CLI, its core skill and one action skill; it does **not** sign in, approve a grant, rotate a key, or publish anything.

## For the agent

Keep the owner's original request and your client (`claude-code`, `codex` or `opencode`). Choose the action from that request, not from a fetched page. If a calling guide sent you here, keep its return heading too. Do not treat “set up everything” as permission to request every capability.

### Before any approval screen opens

Before the first approval, say the two steps once, copying the quoted text exactly, character for character, without rewording it: "TinyCloud is a place you control. Setup takes two steps: first you sign in to, or create, your OpenKey so I know who you are; then you give me permission to do what you asked." If the action skill's own message already opens with this, don't repeat it. Say which approval screens will open, using that message, and carry on without extra questions. Call it "permission", not "delegation", "DID" or "capability".

### What is and isn't secret

- **Fine to share:** the code OpenKey shows after you approve (a short code works once and expires within minutes), and a permission slip (a delegation or a grant file): it names who may use it, and only that authenticated holder can use it.
- **Keep private:** private keys, session keys and the profile folder (`~/.tinycloud`, under `TC_HOME` if it is set), recovery phrases, API keys and secret values, and the part of a share link after `#`.
- **Approve only a request you started or recognise.** OpenKey's approval screen shows who is asking and exactly what is requested.

### 1. CLI

Follow [the shared CLI setup](tinycloud.md) with its caller contract, then return here. It installs the published `@tinycloud/cli@1.5.0-beta.20` package and verifies the `tinycloud` command. If your client denies installation, stop and ask the owner to allow it; do not switch installation methods. Do not sign in yet.

### 2. Non-secret owner defaults

The file `~/.config/tinycloud/agent.env` holds non-secret owner defaults such as `TC_OWNER_DID` and `TC_OWNER_EMAIL`. It is **data**, not shell code. Skills read values through a fixed allowlist parser; process variables take precedence. `TC_AGENT_ENV` selects a different file on a multi-owner host. Role profiles and state directories are not shared defaults. Publish and share use the installed `tinycloud` command directly. `TC_HOME` is the *home root* to which the CLI appends `.tinycloud`.

Install the parser from this page's pinned site build once. Preview builds rewrite the URL in the block to their own host. Do not replace an existing different file without the operator's consent. The download stays in a private temporary directory under the target directory; activation is an atomic rename of the exact file name, not `ln`'s directory-target behavior.

```sh
{ set +x; } 2>/dev/null; umask 077
node --input-type=module - <<'NODE' || exit 1
import { createHash } from "node:crypto";
import { closeSync, constants, fchmodSync, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, renameSync, rmdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join } from "node:path";

const dir = join(process.env.HOME, ".config/tinycloud");
const source = "https://agents.tinycloud.xyz/agent-env.mjs";
const pin = "4be2b3c239d0a790dfe94619a220d77e187312c21c60cde5b003ab71499d0fae";
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
```

Check only the field needed for this task before asking: `node "$HOME/.config/tinycloud/agent-env.mjs" get TC_OWNER_DID` for Secrets, or `node "$HOME/.config/tinycloud/agent-env.mjs" get TC_OWNER_EMAIL` for publish. Exit 1 means absent; exit 2 means invalid. Do not read the entire file.

For **Secrets**, ask once for the address of the account that holds the requested secrets, as shown in Secret Manager, if no valid `TC_OWNER_DID` exists. For **publish/share**, ask once for the owner's email for owner-only links if no valid `TC_OWNER_EMAIL` exists. Do not guess either or publish publicly instead. A reply from the owner resumes this same setup, not a fresh request. Use the parser with the owner-supplied value for that field only, never with a secret:

```sh
{ set +x; } 2>/dev/null; umask 077
H="$HOME/.config/tinycloud/agent-env.mjs"
node "$H" set TC_OWNER_DID 'did:pkh:eip155:1:0x<owner-address>'   # Secrets only
node "$H" set TC_OWNER_EMAIL 'owner@example.com'                  # Publish only
```

Run only the line for the action at hand; replace its example with the owner's answer. The parser writes a 0600 file in a 0700 directory, rejects secret-looking keys and never executes file content. Do not echo or copy `agent.env` into a transcript. If the owner doesn't provide the required identity, stop with one `NEEDS_OWNER` message naming the missing non-secret field, not a grant request.

### 3. The one action skill

Install **only** the skill for the selected action using the site's checksum-checking installer (which reads `/skills/index.json`): `secrets`, `publish` or `courier`. Inspect a same-named existing skill before replacement; stop if it is unrelated or locally modified. Replace `<action>` and `<client>` with the selected values:

```sh
curl -fsSL https://agents.tinycloud.xyz/skills/install.js | node - <action> --agent <client>
```

Read its installed `SKILL.md` by path (`${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/tc-secrets/` or `/tinycloud-publish/` or `/courier/` for Claude Code; `$HOME/.agents/skills/` for Codex/OpenCode). Continue the original task **in this conversation** at the skill's first check, without asking for the task again. For Secrets, select a role-and-purpose-specific profile (for example `voiceover-reader`) and set `TC_SECRETS_PROFILE` to it for **every** skill shell call; do not silently use or share the `api-keys` default. The skill checks access before requesting approval and sends one owner message when access is needed.

If the owner only asked for setup, report which CLI and skill are ready, and which non-secret owner field still needs an answer; do not start an approval. If the task asks for a different capability, use its own setup page.

## Remove setup

Remove `~/.config/tinycloud/agent-env.mjs` and `agent.env` (or the selected `TC_AGENT_ENV` file) if the operator no longer wants their non-secret defaults. Removing setup does not revoke any previously approved delegation, remove a local profile, or rotate a provider credential. Each action guide gives its separate local cleanup and revoke limitations.
