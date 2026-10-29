# Set up the TinyCloud CLI

This module installs and verifies TinyCloud CLI `1.5.0-beta.28` and its core skill, `tc-cli`. The CLI's command is `tinycloud`; `tc` is also installed, but may name Linux's traffic-control tool. Preserve an operator's `TC_BIN` and stop if it cannot run the pinned release. App hosts, profiles, permission requests and app behavior belong in the calling guide.

## For the owner

- **What it does:** installs TinyCloud CLI 1.5.0-beta.28 into `~/.local/share/tinycloud/cli`, makes the `tinycloud` command run it, and installs the `tc-cli` skill for your agent. It also makes `tc` run it when nothing else on your `PATH` is called `tc`; on Linux, `tc` is usually the system's traffic-control tool, which it leaves alone.
- **Paste into Claude Code, Codex or OpenCode:** `Set up the TinyCloud CLI: https://agents.tinycloud.xyz/cli`. `/chat` runs this page for you; `/apps`, `/publish`, `/secrets` and `/courier` install the CLI themselves.
- **You approve:** nothing. It doesn't sign in or request any access.
- **Then:** in a new terminal, `tinycloud --help` lists the commands.
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

Run this as one sequential foreground shell call, exactly as written:

```sh
CLI_DIR="$HOME/.local/share/tinycloud/cli"
if [ "${TC_BIN+x}" != x ]; then
  TC_BIN="$CLI_DIR/node_modules/.bin/tc"
  if [ "$("$TC_BIN" --version 2>/dev/null)" != 1.5.0-beta.28 ]; then
    mkdir -p "$CLI_DIR" && npm install --prefix "$CLI_DIR" --no-audit --no-fund @tinycloud/cli@1.5.0-beta.28
  fi
fi
[ -x "$TC_BIN" ] || { echo "TC_INSTALL_FAILED: $TC_BIN is not executable; left unchanged" >&2; exit 1; }
WANT=$("$TC_BIN" --version) || { echo "TC_INSTALL_FAILED: $TC_BIN could not report its version; left unchanged" >&2; exit 1; }
[ "$WANT" = 1.5.0-beta.28 ] || { echo "TC_INSTALL_FAILED: $TC_BIN reports $WANT; need 1.5.0-beta.28; left unchanged" >&2; exit 1; }
# A private prefix only. Never install or link into npm's global bin.
# ~/.local/bin may be on the PATH (as many shell profiles add it) before it exists.
case ":$PATH:" in *":$HOME/.local/bin:"*) mkdir -p "$HOME/.local/bin" ;; esac
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
```

It prints one line for `tinycloud`, then one for `tc`:

- `TC_READY 1.5.0-beta.28 <name>` → that name already runs the pinned CLI.
- `TC_LINKED 1.5.0-beta.28 <link>` → the block linked that name to the pinned CLI.
- `TC_CONFLICT <name> other` → another program has that name (`command -v` finds it), usually the Linux traffic-control tool for `tc`. It was left alone, whatever it does when run.
- `TC_CONFLICT <name> <version>` (or `unknown`) → that name runs another TinyCloud CLI version; the block left it alone.
- `TC_CONFLICT <name> no-path` → nothing has that name, but `~/.local/bin` is not on the `PATH` and writable. For `tinycloud`, tell the owner, in these words: "To use the `tinycloud` command, add this line to your shell profile (`~/.bashrc`, `~/.zshrc` or `~/.profile`): `export PATH="$HOME/.local/bin:$PATH"`. Then open a new terminal, start your agent from it, and ask it to run https://agents.tinycloud.xyz/cli again." The rerun creates `~/.local/bin` and links `tinycloud` there; it still leaves any other `tc` alone.
- `TC_CONFLICT <name> link` → nothing has that name, but the link couldn't be made.
- `TC_INSTALL_FAILED` → the npm install failed or the owner's `TC_BIN` doesn't run. Stop and report the error. Don't retry with other options or `sudo`.

On anything but `TC_INSTALL_FAILED`, the pinned CLI is installed at `TC_BIN`: continue with the skill below. A `TC_CONFLICT` changes nothing else; mention it to the owner in one line. If `tinycloud` isn't `TC_READY` or `TC_LINKED`, tell the owner they can run the CLI by its path, `TC_BIN`, or put a link to it on their `PATH` themselves; don't do that for them.

## Install the core skill

Inspect an existing `tc-cli/SKILL.md` before replacing it. The usual path is `$HOME/.agents/skills/tc-cli/SKILL.md` for OpenCode and Codex or `${CLAUDE_CONFIG_DIR:-~/.claude}/skills/tc-cli/SKILL.md` for Claude Code. Reuse it only when its files match the `cli` entry, version `1.5.0-beta.28`, in `https://agents.tinycloud.xyz/skills/index.json`. A `tc-cli` skill from an earlier CLI version is a replaceable mismatch. Do not overwrite an unrelated or locally modified same-named skill; return that conflict to the calling guide.

If the skill is missing or is a replaceable mismatch, run:

```sh
curl -fsSL https://agents.tinycloud.xyz/skills/install.js | node - cli --agent CLIENT
```

The installer downloads the `tc-cli` skill from `@tinycloud/cli@1.5.0-beta.28` with this site's pinned resolver overlay and checks every served file against `/skills/index.json`. Its shell blocks read process `TC_BIN` first, then the data-only `agent.env` selection via the `/agent` helper, then the private installation before global npm. The installer replaces only the `tc-cli` folder and prints `SKILL_INSTALLED tc-cli 1.5.0-beta.28 <folder>`; anything else means the install failed, so stop and report it.

These commands target the named CLI package and named skill. Preserve unrelated npm packages, skills, agent configuration and model/provider settings.

## Verify and return

Verify that `"${TC_BIN:-$HOME/.local/share/tinycloud/cli/node_modules/.bin/tc}" --version` reports `1.5.0-beta.28`, and, if the block printed `TC_READY` or `TC_LINKED` for `tinycloud`, that `tinycloud --version` does too. A missing, broken or incompatible operator `TC_BIN` stops setup; never replace it or switch binaries. Check that the selected client's `tc-cli/SKILL.md` is readable and matches the pinned skill. Do not sign in, choose a profile, configure a host or space, or request permissions in this shared module.

Return to the exact recorded app-guide heading and continue there without another user prompt.

## Undo

For the owner: delete each link that `TC_LINKED` reported (`tinycloud`, and `tc` if it was linked), if it still points into `~/.local/share/tinycloud/cli`. Then delete that folder and the `tc-cli` skill folder (`~/.agents/skills/tc-cli` or `${CLAUDE_CONFIG_DIR:-~/.claude}/skills/tc-cli`). Removing them doesn't sign anything out or delete any data.
