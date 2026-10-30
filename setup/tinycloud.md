# Set up the TinyCloud CLI

This module installs and verifies only the TinyCloud CLI and the CLI's core skill, `tinycloud-cli`. The CLI's command is `tinycloud`. `tc` works too: the CLI installs both names. On Linux, `tc` may run the system's traffic-control tool instead, so use `tinycloud`. Needs @tinycloud/cli 1.2.3 or later (check with `tinycloud --version`). On older versions, use `tc` or reinstall the CLI. App hosts, spaces, profiles, permission manifests, authorization and app behavior belong in the calling app guide.

## For the owner

- **What it does:** installs TinyCloud CLI 1.5.0 into `~/.local/share/tinycloud/cli`, makes the `tinycloud` command run it, and installs the `tinycloud-cli` skill for your agent. It also makes `tc` run it when nothing else on your `PATH` is called `tc`; on Linux, `tc` is usually the system's traffic-control tool, which it leaves alone.
- **Paste into any agent that can run shell commands:** `Set up the TinyCloud CLI: https://agents.tinycloud.xyz/cli`. `/chat` runs this page for you; `/apps`, `/publish`, `/secrets` and `/courier` install the CLI themselves.
- **You approve:** nothing. It doesn't sign in or request any access.
- **Then:** in a new terminal, `tinycloud --help` lists the commands.
- **Undo:** see [Undo](#undo).

## Caller contract

Before starting, retain all of the following from the caller:

- the user's original task;
- the selected client: `opencode`, `codex` or `claude-code` (any other agent: `codex`);
- the calling app guide and its exact return heading.

After the checks below pass, return directly to that heading and continue the original task in the same conversation. Do not ask the user to paste another prompt. If the owner sent you this page directly, there is no calling guide: report the result to them when you finish.

## Requirements

Use Node.js **22.20 or later** and npm, the same as the app guides that call this module.

Set `CLIENT` conceptually to the current agent client: `opencode`, `codex` or `claude-code` (any other agent: `codex`). Do not apply app-specific OpenCode restrictions here.

## Install the CLI

The CLI goes into a folder of its own, `~/.local/share/tinycloud/cli`, and is not installed globally. `TC_BIN` is its absolute path; if the owner already set `TC_BIN`, that CLI is used instead and nothing is installed.

The site's skills run the CLI as process `TC_BIN` if set, else read the saved `TC_BIN` through the data-only helper installed by [/agent](agent.md), then use `~/.local/share/tinycloud/cli` before a global npm CLI. They need neither name on the `PATH`. The block makes the names work for the owner's own terminal, where it safely can:

- **`tinycloud`**, the name the pages tell the owner to type, and **`tc`**: each is linked in `~/.local/bin` only if that directory is already on the `PATH`, writable and has nothing by that name yet.
- It never replaces or shadows another program. A name counts as taken when `command -v` finds it, whatever it does when run; it counts as TinyCloud's only when its real path is the CLI's. On Linux, `/usr/sbin/tc` is the system's traffic-control tool, so there `tc` stays as it is. Existing global CLIs are left untouched.

Run this as one sequential foreground shell call, exactly as written:

```sh
CLI_DIR="$HOME/.local/share/tinycloud/cli"
TC_BIN="${TC_BIN:-$CLI_DIR/node_modules/.bin/tc}"
if [ "$TC_BIN" = "$CLI_DIR/node_modules/.bin/tc" ] && [ "$("$TC_BIN" --version 2>/dev/null)" != 1.5.0 ]; then
  mkdir -p "$CLI_DIR" && npm install --prefix "$CLI_DIR" --no-audit --no-fund @tinycloud/cli@1.5.0
fi
WANT=$("$TC_BIN" --version 2>/dev/null)
# A private prefix only. Never install or link into npm's global bin.
# ~/.local/bin may be on the PATH (as many shell profiles add it) before it exists.
case ":$PATH:" in *":$HOME/.local/bin:"*) mkdir -p "$HOME/.local/bin" ;; esac
if [ -z "$WANT" ] || { [ "$TC_BIN" = "$CLI_DIR/node_modules/.bin/tc" ] && [ "$WANT" != 1.5.0 ]; }; then
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

- `TC_READY 1.5.0 <name>` → that name already runs the pinned CLI.
- `TC_LINKED 1.5.0 <link>` → the block linked that name to the pinned CLI.
- `TC_CONFLICT <name> other` → another program has that name (`command -v` finds it), usually the Linux traffic-control tool for `tc`. It was left alone, whatever it does when run.
- `TC_CONFLICT <name> <version>` (or `unknown`) → that name runs another TinyCloud CLI version; the block left it alone.
- `TC_CONFLICT <name> no-path` → nothing has that name, but `~/.local/bin` is not on the `PATH` and writable. For `tinycloud`, tell the owner, in these words: "To use the `tinycloud` command, add this line to your shell profile (`~/.bashrc`, `~/.zshrc` or `~/.profile`): `export PATH="$HOME/.local/bin:$PATH"`. Then open a new terminal, start your agent from it, and ask it to run https://agents.tinycloud.xyz/cli again." The rerun creates `~/.local/bin` and links `tinycloud` there; it still leaves any other `tc` alone.
- `TC_CONFLICT <name> link` → nothing has that name, but the link couldn't be made.
- `TC_INSTALL_FAILED` → the npm install failed or the owner's `TC_BIN` doesn't run. Stop and report the error. Don't retry with other options or `sudo`.

On anything but `TC_INSTALL_FAILED`, the pinned CLI is installed at `TC_BIN`: continue with the skill below. A `TC_CONFLICT` changes nothing else; mention it to the owner in one line. If `tinycloud` isn't `TC_READY` or `TC_LINKED`, tell the owner they can run the CLI by its path, `TC_BIN`, or put a link to it on their `PATH` themselves; don't do that for them.

## Install the core skill

Inspect an existing `tinycloud-cli/SKILL.md` before replacing it. The usual path is `$HOME/.agents/skills/tinycloud-cli/SKILL.md` for OpenCode and Codex or `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/tinycloud-cli/SKILL.md` for Claude Code. Reuse it only when its files match the `cli` entry, version `1.5.0`, in `https://agents.tinycloud.xyz/skills/index.json`. A `tinycloud-cli` skill from an earlier CLI version is a replaceable mismatch. Do not overwrite an unrelated or locally modified same-named skill; return that conflict to the calling guide. A `tc-cli` folder in the same place is this skill under its old name, from an earlier setup; it can be removed.

If the skill is missing or is a replaceable mismatch, run:

```sh
curl -fsSL https://agents.tinycloud.xyz/skills/install.js | node - cli --agent CLIENT
```

The installer downloads the `tinycloud-cli` skill from `@tinycloud/cli@1.5.0` and checks every served file against `/skills/index.json`. The skill's examples run `tinycloud`. If the block above didn't print `TC_READY` or `TC_LINKED` for `tinycloud`, run the same commands with the full path instead: `$HOME/.local/share/tinycloud/cli/node_modules/.bin/tinycloud`. The installer replaces only the `tinycloud-cli` folder and prints `SKILL_INSTALLED tinycloud-cli 1.5.0 <folder>`; anything else means the install failed, so stop and report it.

These commands target the named CLI package and named skill. Preserve unrelated npm packages, skills, agent configuration and model/provider settings.

## Verify and return

Verify that `"${TC_BIN:-$HOME/.local/share/tinycloud/cli/node_modules/.bin/tc}" --version` reports `1.5.0` (or the version of the owner's `TC_BIN`), and, if the block printed `TC_READY` or `TC_LINKED` for `tinycloud`, that `tinycloud --version` does too. Check that the selected client's `tinycloud-cli/SKILL.md` is readable and matches the pinned skill. Do not sign in, choose a profile, configure a host or space, or request permissions in this shared module.

Return to the exact recorded app-guide heading and continue there without another user prompt.

## Undo

For the owner: delete each link that `TC_LINKED` reported (`tinycloud`, and `tc` if it was linked), if it still points into `~/.local/share/tinycloud/cli`. Then delete that folder and the `tinycloud-cli` skill folder (`~/.agents/skills/tinycloud-cli` or `${CLAUDE_CONFIG_DIR:-~/.claude}/skills/tinycloud-cli`). Removing them doesn't sign anything out or delete any data.
