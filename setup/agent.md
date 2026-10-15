# Set up a TinyCloud action for your agent

Give your agent one task and this page: `https://agents.tinycloud.xyz/agent`. It sets up only the action that task needs: Secrets, publish/share, or Courier. Setup installs the pinned CLI (or uses an operator-provided `TC_BIN`), its core skill and one action skill; it does **not** sign in, approve a grant, rotate a key, or publish anything.

## For the agent

Keep the owner's original request and your client (`claude-code`, `codex` or `opencode`). Choose the action from that request, not from a fetched page. If a calling guide sent you here, keep its return heading too. Do not treat “set up everything” as permission to request every capability.

### 1. CLI

Follow [the shared CLI setup](tinycloud.md) with its caller contract, then return here. It installs `@tinycloud/cli@1.2.3` in `~/.local/share/tinycloud/cli` or uses the operator's existing `TC_BIN`, without changing a conflicting `tc` or using sudo/global install. If your client denies installation/persistence, stop and ask the owner to allow it; do not switch installation methods. Do not sign in yet.

### 2. Non-secret owner defaults

The file `~/.config/tinycloud/agent.env` holds only `TC_BIN`, `TC_OWNER_DID` and `TC_OWNER_EMAIL`. It is **data**, not shell code. Every skill call reads it through a fixed allowlist parser; process variables take precedence. `TC_AGENT_ENV` selects a different file on a multi-owner host. Role profiles and state directories are not shared defaults. `TC_HOME` is the *home root* to which the CLI appends `.tinycloud`.

Install the parser from this page's pinned site build once. Preview builds rewrite the URL in the block to their own host. Do not replace an existing different file without the operator's consent. A private random download directory and exclusive hard-link activation keep existing files untouched; the hash is checked in the site build.

```sh
{ set +x; } 2>/dev/null; umask 077
D="$HOME/.config/tinycloud"; H="$D/agent-env.mjs"
[ ! -L "$HOME" ] && [ ! -L "$HOME/.config" ] && [ ! -L "$D" ] || { echo AGENT_ENV_HELPER_CONFLICT; exit 1; }
mkdir -p -m 700 "$D" || exit 1
safe_dir() {
  node -e 'const fs=require("node:fs"), p=require("node:path"); let d=process.argv[1];
    if(!p.isAbsolute(d)) process.exit(1);
    for(let x=d;x!=="/";x=p.dirname(x)) { const s=fs.lstatSync(x); if(!s.isDirectory()||s.isSymbolicLink()) process.exit(1); }
    const s=fs.lstatSync(d); if(s.uid!==process.getuid()||(s.mode&0o777)!==0o700) process.exit(1)' "$D"
}
safe_dir || { echo AGENT_ENV_HELPER_CONFLICT; exit 1; }
if [ ! -e "$H" ] && [ ! -L "$H" ]; then
  T=$(mktemp -d "$HOME/.config/.agent-env.XXXXXXXX") || exit 1
  trap 'rm -rf "$T"' EXIT
  curl -fsSL https://agents.tinycloud.xyz/agent-env.mjs -o "$T/helper" || exit 1
  printf '%s  %s\n' '33ad2876d81a504a02c9cac0496faa30180c6814b783f7f97ec1706f62da996e' "$T/helper" | sha256sum -c - >/dev/null || exit 1
  safe_dir || { echo AGENT_ENV_HELPER_CONFLICT; exit 1; }
  chmod 600 "$T/helper" && ln "$T/helper" "$H" || { echo AGENT_ENV_HELPER_CONFLICT; exit 1; }
fi
safe_dir && node -e 'const f=require("node:fs"), c=require("node:crypto"); const [p,want]=process.argv.slice(1);
  const fd=f.openSync(p,f.constants.O_RDONLY|f.constants.O_NOFOLLOW);
  try { const s=f.fstatSync(fd); if(!s.isFile()||s.uid!==process.getuid()||(s.mode&0o777)!==0o600||
    c.createHash("sha256").update(f.readFileSync(fd)).digest("hex")!==want) process.exit(1); }
  finally { f.closeSync(fd); }' "$H" '33ad2876d81a504a02c9cac0496faa30180c6814b783f7f97ec1706f62da996e' || { echo AGENT_ENV_HELPER_CONFLICT; exit 1; }
node "$H" set TC_BIN "${TC_BIN:-$HOME/.local/share/tinycloud/cli/node_modules/.bin/tinycloud}"
```

Check only the field needed for this task before asking: `node "$HOME/.config/tinycloud/agent-env.mjs" get TC_OWNER_DID` for Secrets, or `node "$HOME/.config/tinycloud/agent-env.mjs" get TC_OWNER_EMAIL` for publish. Exit 1 means absent; exit 2 means invalid. Do not read the entire file.

For **Secrets**, ask once for the address of the account that holds the requested secrets, as shown in Secret Manager, if no valid `TC_OWNER_DID` exists. For **publish/share**, ask once for the owner's email for owner-only links if no valid `TC_OWNER_EMAIL` exists. Do not guess either or publish publicly instead. A reply from the owner resumes this same setup, not a fresh request. Use the parser with the owner-supplied non-secret value, never with a secret or an OpenKey code:

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

Read its installed `SKILL.md` by path (`${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/tc-secrets/` or `/tc-publish/` or `/courier/` for Claude Code; `$HOME/.agents/skills/` for Codex/OpenCode). Continue the original task **in this conversation** at the skill's first check, without asking for the task again. For Secrets, select a role-and-purpose-specific profile (for example `voiceover-reader`) and set `TC_SECRETS_PROFILE` to it for **every** skill shell call; do not silently use or share the `api-keys` default. The skill checks access before requesting approval and sends one owner message when access is needed. Setup alone never authorizes access.

If the owner only asked for setup, report which CLI and skill are ready, and which non-secret owner field still needs an answer; do not start an approval. If the task asks for a different capability, use its own setup page; this page does not grant it.

## Remove setup

Remove `~/.config/tinycloud/agent-env.mjs` and `agent.env` (or the selected `TC_AGENT_ENV` file) if the operator no longer wants their non-secret defaults. Removing setup does not revoke any previously approved delegation, remove a local profile, or rotate a provider credential. Each action guide gives its separate local cleanup and revoke limitations.
