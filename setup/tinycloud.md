# Set up the TinyCloud CLI

This module installs and verifies only the TinyCloud CLI and the CLI's core skill, `tc-cli`. The CLI's command is `tinycloud`. `tc` works too: the CLI installs both names. On Linux, `tc` may run the system's traffic-control tool instead, so use `tinycloud`. Needs @tinycloud/cli 1.2.3 or later (check with `tinycloud --version`). On older versions, use `tc` or reinstall the CLI. App hosts, spaces, profiles, permission manifests, authorization and app behavior belong in the calling app guide.

## For the owner

- **What it does:** installs TinyCloud CLI 1.5.0-beta.23 into the private CLI folder, links the `tinycloud` command only when safe, and installs the `tc-cli` skill when the agent's skill directory is writable. TinyCloud keeps the owner's records available across agents and secrets out of chat; a useful first task is logging a meal in Health Log.
- **Paste into Claude Code, Codex or OpenCode:** `Set up the TinyCloud CLI: https://agents.tinycloud.xyz/cli`. `/chat` runs this page for you; `/apps`, `/publish`, `/secrets` and `/courier` install the CLI themselves.
- **You approve:** nothing. It doesn't sign in or request any access.
- **Then:** use `tinycloud --help` or the verified `TC_BIN` path. Skill installation status is reported separately from CLI readiness.
- **Undo:** see [Undo](#undo).

## Caller contract

Before starting, retain all of the following from the caller:

- the user's original task;
- the selected client: `opencode`, `codex` or `claude-code`;
- the calling app guide and its exact return heading.

After the checks below pass, return directly to that heading and continue the original task in the same conversation. Do not ask the user to paste another prompt. If the owner sent you this page directly, there is no calling guide: report the result to them when you finish.

## Requirements

Use Node.js **22.20 or later** and npm, the same as the app guides that call this module. The `@tinycloud/cli` package alone supports Node 20 or later.

Set `CLIENT` conceptually to the current agent client: `opencode`, `codex` or `claude-code`. Do not apply app-specific OpenCode restrictions here.

## Install the CLI

The CLI goes into a folder of its own, `~/.local/share/tinycloud/cli`, and is not installed globally. `TC_BIN` is its absolute path; if the owner already set `TC_BIN`, that CLI is used instead and nothing is installed.

The site's skills run the CLI as process `TC_BIN` if set, else read the saved `TC_BIN` through the data-only helper installed by [/agent](agent.md), then use `~/.local/share/tinycloud/cli` before a global npm CLI. They need neither name on the `PATH`. The block makes the names work for the owner's own terminal, where it safely can:

- **`tinycloud`**, the name the pages tell the owner to type, and **`tc`**: each is linked in `~/.local/bin` only if that directory is already on the `PATH`, writable and has nothing by that name yet.
- It never replaces or shadows another program. A name counts as taken when `command -v` finds it, whatever it does when run; it counts as TinyCloud's only when its real path is the CLI's. On Linux, `/usr/sbin/tc` is the system's traffic-control tool, so there `tc` stays as it is. Existing global CLIs are left untouched.

**Codex sandbox:** If Codex blocks the CLI install because its default sandbox cannot write outside the project or access the network, run this CLI install block as one shell call with `sandbox_permissions: "require_escalated"`, justification `Install the TinyCloud CLI and core skill`, and `yield_time_ms: 30000`—the same escalation used by [/apps](tc-apps.md#personal-records-in-tinycloud-tc-apps). If that escalation is unavailable, stop and report the CLI install failure. Do not ask the owner to restart Codex or run `/cli` again.

Run this as one sequential foreground shell call, exactly as written:

```sh
CLI_DIR="$HOME/.local/share/tinycloud/cli"
TC_BIN="${TC_BIN:-$CLI_DIR/node_modules/.bin/tc}"
if [ "$TC_BIN" = "$CLI_DIR/node_modules/.bin/tc" ] && [ "$("$TC_BIN" --version 2>/dev/null)" != 1.5.0-beta.23 ]; then
  mkdir -p "$CLI_DIR" && npm install --prefix "$CLI_DIR" --no-audit --no-fund @tinycloud/cli@1.5.0-beta.23
fi
WANT=$("$TC_BIN" --version 2>/dev/null)
# A private prefix only. Never install or link into npm's global bin.
# ~/.local/bin may already be on PATH even when it does not yet exist.
case ":$PATH:" in *":$HOME/.local/bin:"*) mkdir -p "$HOME/.local/bin" ;; esac
if [ -z "$WANT" ] || { [ "$TC_BIN" = "$CLI_DIR/node_modules/.bin/tc" ] && [ "$WANT" != 1.5.0-beta.23 ]; }; then
  echo "TC_INSTALL_FAILED $TC_BIN"
else
  for NAME in tinycloud tc; do
    # The CLI's own `tinycloud` executable, next to TC_BIN, if it has one.
    TARGET=$TC_BIN; [ "$NAME" = tinycloud ] && [ -x "$(dirname "$TC_BIN")/tinycloud" ] && TARGET="$(dirname "$TC_BIN")/tinycloud"
    FOUND=$(command -v "$NAME")
    DIR=
    for D in "$HOME/.local/bin"; do
      case ":$PATH:" in *":$D:"*) [ -z "$DIR" ] && [ -w "$D" ] && [ ! -e "$D/$NAME" ] && [ ! -L "$D/$NAME" ] && DIR=$D ;; esac
    done
    if [ -z "$FOUND" ]; then
      if [ -z "$DIR" ]; then
        echo "TC_CONFLICT $NAME no-path"
      elif ln -s "$TARGET" "$DIR/$NAME" && [ "$("$NAME" --version 2>/dev/null)" = "$WANT" ]; then
        echo "TC_LINKED $WANT $DIR/$NAME"
      else
        echo "TC_CONFLICT $NAME link"
      fi
    # Taken: TinyCloud's CLI only if its real path is the target or inside a @tinycloud/cli package.
    elif node -e 'const f = require("fs"), r = (p) => { try { return f.realpathSync(p) } catch { return "" } }, [found, target] = process.argv.slice(1).map(r);
      process.exit(found && (found === target || found.includes("/node_modules/@tinycloud/cli/")) ? 0 : 1)' "$FOUND" "$TARGET"; then
      HAVE=$("$FOUND" --version 2>/dev/null)
      if [ "$HAVE" = "$WANT" ]; then echo "TC_READY $WANT $NAME"; else echo "TC_CONFLICT $NAME ${HAVE:-unknown}"; fi
    else
      echo "TC_CONFLICT $NAME other"
    fi
  done
fi
```

It prints one line for `tinycloud`, then one for `tc`:

- `TC_READY 1.5.0-beta.23 <name>` → that name already runs the pinned CLI.
- `TC_LINKED 1.5.0-beta.23 <link>` → the block linked that name to the pinned CLI.
- `TC_CONFLICT <name> other` → another program has that name (`command -v` finds it), usually the Linux traffic-control tool for `tc`. It was left alone, whatever it does when run.
- `TC_CONFLICT <name> <version>` (or `unknown`) → that name runs another TinyCloud CLI version; the block left it alone.
- `TC_CONFLICT <name> no-path` → nothing has that name, but `~/.local/bin` is not on the `PATH` and writable. Give the owner the full `TC_BIN` path for immediate use. Do not ask them to edit a shell profile or rerun `/cli`.
- `TC_CONFLICT <name> link` → nothing has that name, but the link couldn't be made.
- `TC_INSTALL_FAILED` → the npm install failed or the owner's `TC_BIN` doesn't run. For an observed Codex sandbox denial, use the escalation above; otherwise stop and report the actual error. Don't retry with other options or `sudo`.

On anything but `TC_INSTALL_FAILED`, the CLI is installed at `TC_BIN`; the `tc-cli` skill step below is optional. A `TC_CONFLICT` changes nothing else; mention it in one line. When `tinycloud` is not `TC_READY` or `TC_LINKED`, use `TC_BIN` directly.

## Install the core skill

Inspect an existing `tc-cli/SKILL.md` before replacing it. The usual path is `$HOME/.agents/skills/tc-cli/SKILL.md` for OpenCode and Codex or `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/tc-cli/SKILL.md` for Claude Code. Reuse it only when its files match the `cli` entry, version `1.5.0-beta.23`, in `https://agents.tinycloud.xyz/skills/index.json`. A `tc-cli` skill from an earlier CLI version is a replaceable mismatch. Do not overwrite an unrelated or locally modified same-named skill; return that conflict to the calling guide.

If the skill is already current, report `TC_SKILL_STATUS reused` and skip installation. If missing or replaceable, run:

```sh
if TC_SKILL_TMP=$(mktemp 2>/dev/null) && curl -fsSL https://agents.tinycloud.xyz/skills/install.js -o "$TC_SKILL_TMP" && node "$TC_SKILL_TMP" cli --agent "$CLIENT"; then
  echo "TC_SKILL_STATUS installed"
else
  echo "TC_SKILL_STATUS unavailable"
fi
if [ -n "${TC_SKILL_TMP:-}" ]; then rm -f "$TC_SKILL_TMP" || :; fi
```

The installer downloads the `tc-cli` skill from `@tinycloud/cli@1.5.0-beta.23` with this site's pinned resolver overlay and checks every served file against `/skills/index.json`. Its shell blocks read process `TC_BIN` first, then the data-only `agent.env` selection via the `/agent` helper, then the private installation before global npm. An unavailable status means the core skill could not be installed or verified; it does not invalidate the CLI. If a shell-tool denial prevents this optional command from running, record the status as unavailable and continue; do not retry or escalate the skill installation.

These commands target the named CLI package and named skill. Preserve unrelated npm packages, skills, agent configuration and model/provider settings.

Verify that `"${TC_BIN:-$HOME/.local/share/tinycloud/cli/node_modules/.bin/tc}" --version` reports `1.5.0-beta.23` (or the version of the owner's `TC_BIN`), and, if the block printed `TC_READY` or `TC_LINKED` for `tinycloud`, that `tinycloud --version` does too. If `TC_SKILL_STATUS` is `installed` or `reused`, check that the selected client's `tc-cli/SKILL.md` is readable and matches the pinned skill. If it is `unavailable`, tell the owner the CLI is ready but the `tc-cli` skill could not be installed or verified; do not claim otherwise. A caller such as `/onboarding` must continue using the CLI.

Do not sign in, choose a profile, configure a host or space, or request permissions here.

Return to the exact recorded app-guide heading and continue the original task in the same conversation. Do not ask the owner to restart the flow or paste another prompt.

## Undo

For the owner: delete each link that `TC_LINKED` reported (`tinycloud`, and `tc` if it was linked), if it still points into `~/.local/share/tinycloud/cli`. Then delete that folder and the `tc-cli` skill folder (`~/.agents/skills/tc-cli` or `${CLAUDE_CONFIG_DIR:-~/.claude}/skills/tc-cli`). Removing them doesn't sign anything out or delete any data.
