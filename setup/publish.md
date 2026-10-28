# Publish and share with TinyCloud

Your agent publishes a document or web page from your computer to your TinyCloud and sends you a link. Links are owner-only by default; the agent makes a public link, which anyone holding it can open, only when you ask for one. The first time, you approve two sign-ins in OpenKey and paste each code back.

## For the owner

- **Paste into Claude Code, Codex or OpenCode:** `Publish this report and send me a private link. Use TinyCloud: https://agents.tinycloud.xyz/publish`
- Your agent follows [the shared setup](agent.md): it installs or reuses the pinned CLI, records your email as a non-secret owner default, installs only the `tinycloud-publish` skill and continues this request. It asks for your email if it is unknown; it never switches to a public link unless you reply "Yes, make an open link".
- **You approve:** an OpenKey request for standing read/write authority across the share prefixes, not just this document. It can mint narrowed read-only links. Check the requested duration (up to 30 days). This setup step does not itself request a grant. The first time, you approve two sign-ins in OpenKey and paste each code back to your agent.
- **Undo:** the receipt must distinguish revoking a share from clearing the agent's local login. Revoking a share stops its link opening; copies already downloaded can't be recalled. After key rotation, older links may last until expiry.

## For the agent

Keep the owner's request, read [setup/agent.md](agent.md), select **publish/share** and follow its steps. Install only `tinycloud-publish`. Then read its installed `SKILL.md` and continue the original task from §1 in this conversation. Missing CLI or owner email is `NEEDS_SETUP`; don't publish publicly to bypass it.

## Undo

These are owner steps. Use the private CLI from `~/.local/share/tinycloud/cli/node_modules/.bin/tinycloud` (or your own `TC_BIN`) and the profile that published the link. `TC_HOME` is a home root; by default profiles are in `~/.tinycloud`.

- **A link:** any link, public or owner-only, can be revoked by the issuing profile while it retains its key; the link then stops opening. Copies already downloaded can't be recalled, and the stored file stays in your space until deleted. Public links usually expire after 24 hours, unless you requested another time. Local login cleanup is not link revocation.
- **Local session:** `"$TC_BIN" --profile publisher auth logout` clears its copy on this computer but not the live owner grant. If the agent never created the profile, `PROFILE_NOT_FOUND` is expected.
- **The agent's key:** the first time it runs, the agent creates a local profile, `publisher`, holding a key that your approval is for. It never deletes profiles itself. Remove it with `"$TC_BIN" profile delete publisher`; this succeeds even if the profile was never created. If it reports `PROFILE_DELETE_DEFAULT`, `publisher` is the default profile:
  - if you have another (`"$TC_BIN" profile list`), make that the default with `"$TC_BIN" profile switch <other>` and delete again;
  - if `publisher` is your only profile, delete the whole profile store, `${TC_HOME:-$HOME}/.tinycloud`. Deleting just the profile's folder would leave `publisher` named as the default.
- **The skill and the CLI:** delete `~/.agents/skills/tinycloud-publish` or `${CLAUDE_CONFIG_DIR:-~/.claude}/skills/tinycloud-publish`, and `~/.local/share/tinycloud/cli` if nothing else uses it.
