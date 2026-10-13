# Set up TinyCloud prerequisites

This reusable prerequisite module installs and verifies only the TinyCloud CLI and the CLI's core skill. App hosts, spaces, profiles, permission manifests, authorization and app behavior belong in the calling app guide.

## Caller contract

Before starting, retain all of the following from the caller:

- the user's original task;
- the selected client: `opencode`, `codex` or `claude-code`;
- the calling app guide and its exact return heading.

After the checks below pass, return directly to that heading and continue the original task in the same conversation. Do not ask the user to paste another prompt. If a pin conflict prevents completion, return the conflict to the caller instead of silently changing an existing installation.

## Requirements

Use Node.js **22.20 or later** and npm. The `@tinycloud/cli` package supports Node 20 or later, but this handoff pins `skills@1.7.0`, so the combined prerequisite uses Node 22.20 or later.

Set `CLIENT` conceptually to the current agent client: `opencode`, `codex` or `claude-code`. Do not apply app-specific OpenCode restrictions here.

## Install the CLI

The CLI goes into a folder of its own, `~/.local/share/tinycloud/cli`, and is not installed globally. `TC_BIN` is its absolute path; if the owner already set `TC_BIN`, that CLI is used instead and nothing is installed.

App skills that call this module run the CLI as `tc` from the `PATH`. A `tc` that is already on the `PATH` may be another program: on Linux, `/usr/sbin/tc` is the system's traffic-control tool. So the block makes `tc` reach the CLI only when nothing on the `PATH` is called `tc` yet: it links `tc` to `TC_BIN` in the first of `~/.local/bin` and npm's global `bin` folder that is on the `PATH` and writable. It never replaces or shadows another `tc`, with one exception: earlier versions of this guide installed the CLI globally with npm, so when the `tc` the `PATH` selects is that global TinyCloud CLI itself (same real path as npm's global `bin/tc`, inside npm's global `@tinycloud/cli`), the block upgrades it in place to the pin, as those versions did.

Run this as one sequential foreground shell call, exactly as written:

```sh
CLI_DIR="$HOME/.local/share/tinycloud/cli"
TC_BIN="${TC_BIN:-$CLI_DIR/node_modules/.bin/tc}"
if [ "$TC_BIN" = "$CLI_DIR/node_modules/.bin/tc" ] && [ "$("$TC_BIN" --version 2>/dev/null)" != 1.2.1 ]; then
  mkdir -p "$CLI_DIR" && npm install --prefix "$CLI_DIR" --no-audit --no-fund @tinycloud/cli@1.2.1
fi
WANT=$("$TC_BIN" --version 2>/dev/null)
HAVE=$(tc --version 2>/dev/null); HAVE_EXIT=$?
G=$(npm prefix --global 2>/dev/null)
LINK_DIR=
for DIR in "$HOME/.local/bin" ${G:+"$G/bin"}; do
  case ":$PATH:" in *":$DIR:"*) [ -z "$LINK_DIR" ] && [ -w "$DIR" ] && [ ! -e "$DIR/tc" ] && LINK_DIR=$DIR ;; esac
done
if [ -z "$WANT" ] || { [ "$TC_BIN" = "$CLI_DIR/node_modules/.bin/tc" ] && [ "$WANT" != 1.2.1 ]; }; then
  echo "TC_INSTALL_FAILED $TC_BIN"
elif [ "$HAVE" = "$WANT" ]; then
  echo "TC_READY $WANT"
elif [ "$WANT" = 1.2.1 ] && [ -n "$G" ] && printf '%s\n' "$HAVE" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+' &&
  node -e 'const f = require("fs"), [sel, bin, pkg] = process.argv.slice(1).map((p) => f.realpathSync(p)); process.exit(sel === bin && sel.startsWith(pkg + "/") ? 0 : 1)' \
    "$(command -v tc)" "$G/bin/tc" "$G/lib/node_modules/@tinycloud/cli" 2>/dev/null; then
  if npm install --global --no-audit --no-fund @tinycloud/cli@1.2.1; then
    [ "$(tc --version 2>/dev/null)" = 1.2.1 ] && echo "TC_READY 1.2.1" || echo "TC_CONFLICT $HAVE"
  else
    echo "TC_INSTALL_FAILED global"
  fi
elif [ "$HAVE_EXIT" -ne 127 ]; then
  echo "TC_CONFLICT ${HAVE:-other}"
elif [ -z "$LINK_DIR" ]; then
  echo "TC_CONFLICT no-path"
elif ln -sfn "$TC_BIN" "$LINK_DIR/tc" && [ "$(tc --version 2>/dev/null)" = "$WANT" ]; then
  echo "TC_LINKED $WANT $LINK_DIR/tc"
else
  echo "TC_CONFLICT link"
fi
```

- `TC_READY 1.2.1` or `TC_LINKED 1.2.1 <link>` → `tc` runs the pinned CLI. Continue with the skill below. `TC_READY` also covers a global TinyCloud CLI from an earlier version of this guide, which the block has just upgraded in place to 1.2.1.
- `TC_INSTALL_FAILED` → the npm install failed (`global`: upgrading the earlier global CLI failed), or the owner's `TC_BIN` doesn't run. Stop and report the error. Don't retry with other options or `sudo`.
- `TC_CONFLICT other` → `tc` on the `PATH` is another program, usually the Linux traffic-control tool.
- `TC_CONFLICT <version>` → the `tc` the `PATH` selects is a TinyCloud CLI at that version, but not npm's global copy, so the block left it and any global copy alone.
- `TC_CONFLICT no-path` or `TC_CONFLICT link` → nothing is called `tc`, but neither `~/.local/bin` nor npm's global `bin` folder is on the `PATH` and writable, or the link couldn't be made.

On any `TC_CONFLICT`, change nothing else and return the conflict to the calling guide. The pinned CLI is installed and stays at `TC_BIN`. The owner can resolve it, for example by putting a link to `TC_BIN` first on their `PATH` themselves; don't do that for them, because it changes what `tc` means in every shell.

## Install the core skill

Inspect an existing `tc-cli/SKILL.md` before replacing it. With the pinned installer, the usual path is `$HOME/.agents/skills/tc-cli/SKILL.md` for OpenCode and Codex or `$HOME/.claude/skills/tc-cli/SKILL.md` for Claude Code. Reuse an intact skill from `@tinycloud/cli@1.2.1`. Do not overwrite an unrelated or locally modified same-named skill; return that conflict to the calling guide.

If the skill is missing or is a replaceable mismatch, run:

```sh
npx --yes skills@1.7.0 add https://registry.npmjs.org/@tinycloud/cli/-/cli-1.2.1.tgz --skill tc-cli --global --copy --agent CLIENT --yes
```

These commands target the named CLI package and named skill. Preserve unrelated npm packages, skills, agent configuration and model/provider settings.

## Verify and return

Verify that `tc --version` reports `1.2.1` (or the version of the owner's `TC_BIN`) and that the selected client's `tc-cli/SKILL.md` is readable and belongs to the pinned CLI package. Do not sign in, choose a profile, configure a host or space, or request permissions in this shared module.

Return to the exact recorded app-guide heading and continue there without another user prompt.

To remove the CLI later, delete the `tc` link that `TC_LINKED` reported, if it still points into `~/.local/share/tinycloud/cli`, then delete that folder.
