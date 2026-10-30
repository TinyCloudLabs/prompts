# Publish and share with TinyCloud

Your agent publishes a document or web page from your computer to your TinyCloud and sends you a link. Anyone with the link can open it, so the agent asks you first and makes the link only after you say yes. The first time, you approve one sign-in in OpenKey and paste its code back.

## For the owner

- **Paste into your agent:** `Publish this report and send me a link. Use TinyCloud: https://agents.tinycloud.xyz/publish`
- Your agent follows [the shared setup](agent.md): it installs or reuses the pinned CLI, installs only the `tc-publish` skill and continues this request. Before it makes a link, it asks: "Anyone with the link can open it. Make a link?" If you say no, nothing is published and the file stays on your computer. Sharing with an email address or a domain is not available yet.
- **You approve:** an OpenKey request for standing read/write authority across the share prefixes, not just this document. It can mint narrowed read-only links. Check the requested duration (up to 30 days). This setup step does not itself request a grant. Publishing has its own single approval, separate from /onboarding: the first time, you approve one sign-in in OpenKey and paste its code back to your agent.
- **Undo:** the receipt must distinguish revoking a share from clearing the agent's local login. Revoking a share stops its link opening; copies already downloaded can't be recalled. After key rotation, older links may last until expiry.

## For the agent

Keep the owner's request, read [setup/agent.md](agent.md), select **publish/share** and follow its steps. Install only `tc-publish`. Then read its installed `SKILL.md` and continue the original task from §1 in this conversation. A missing CLI is `NEEDS_SETUP`. Never make a link without the owner's yes.

## Undo

These are owner steps. Use the private CLI from `~/.local/share/tinycloud/cli/node_modules/.bin/tinycloud` (or your own `TC_BIN`) and the profile that published the link. `TC_HOME` is a home root; by default profiles are in `~/.tinycloud`.

- **A link:** any link can be revoked by the issuing profile while it retains its key; the link then stops opening. Copies already downloaded can't be recalled, and the stored file stays in your space until deleted. Links usually expire after 24 hours, unless you requested another time. Local login cleanup is not link revocation.
- **Local session:** `"$TC_BIN" --profile publisher auth logout` clears its copy on this computer but not the live owner grant. If the agent never created the profile, `PROFILE_NOT_FOUND` is expected.
- **The agent's key:** the first time it runs, the agent creates a local profile, `publisher`, holding a key that your approval is for. It never deletes profiles itself. Remove it with `"$TC_BIN" profile delete publisher`; this succeeds even if the profile was never created. If it reports `PROFILE_DELETE_DEFAULT`, `publisher` is the default profile:
  - if you have another (`"$TC_BIN" profile list`), make that the default with `"$TC_BIN" profile switch <other>` and delete again;
  - if `publisher` is your only profile, delete the whole profile store, `${TC_HOME:-$HOME}/.tinycloud`. Deleting just the profile's folder would leave `publisher` named as the default.
- **The skill and the CLI:** delete `~/.agents/skills/tc-publish` or `${CLAUDE_CONFIG_DIR:-~/.claude}/skills/tc-publish`, and `~/.local/share/tinycloud/cli` if nothing else uses it.
