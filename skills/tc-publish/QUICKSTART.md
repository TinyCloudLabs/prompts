# Publish a document to TinyCloud — quickstart

Five steps. Works in Codex, Claude Code, OpenCode, or OMP. Requires Node 22.20+ and `@tinycloud/cli` ≥ `1.0.0-beta.15`.

## 0. Have the CLI and tc-cli skill

```sh
npm install --global @tinycloud/cli@latest        # after TC-540 merges; see tc-cli/INSTALL.md for the pin
npx --yes skills@1.7.0 add <cli-tarball-url> --skill tc-cli --global --copy --agent YOUR_CLIENT --yes
```

## 1. Check the CLI

```sh
TC="$(command -v tc)"; "$TC" --version            # >= 1.0.0-beta.15
"$TC" --profile agent context --json              # confirm host, spaceId, session
```

## 2. Consent — device login (once per profile)

```sh
"$TC" --profile agent auth login --device --manifest builtin:share-publishing --expiry 7d &
# copy the printed URL + code to the owner (iMessage, email — not chat); the waiter exits on approval
```

Wait for `authenticated: true` before continuing.

## 3. Publish

Private (owner only):

```sh
"$TC" --profile agent share publish ./report.md --to email:owner@example.com --expires 7d
```

Public (anyone with the link):

```sh
"$TC" --profile agent share publish ./report.md --expires 7d
```

HTML publishes the same way; until TC-542 the viewer downloads it rather than rendering — keep it a self-contained single file.

## 4. Verify

```sh
LINK=$(…)                                        # the URL from publish
echo "$LINK" | "$TC" --profile agent share receive - --stdout | sha256sum
sha256sum ./report.md                            # must match
```

Private links: `echo "$LINK" | "$TC" --profile agent share inspect - --json` shows target/recipient/expiry without opening content. `share inspect` does not accept public links — hash verification is the check there.

## 5. Manage

```sh
"$TC" --profile agent share list                 # active shares
"$TC" --profile agent share show ID --reveal-link
"$TC" --profile agent share revoke ID            # addressed links only — bearer links can't be revoked
```

## Rules

- The URL fragment `#tc1=…` is the key. Never log or relay it.
- Bearer links are un-revocable — always pass `--expires`.
- Never put the signed consent response, session key, or delegation into chat or files.
