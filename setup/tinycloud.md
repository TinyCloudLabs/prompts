# Set up TinyCloud prerequisites

Installation only: retain the caller's original request and return heading, install only what is missing, then continue without another prompt. Do not authenticate or choose an account here.

## Requirements

Use Node.js **22.20 or later** and npm. This conservative baseline also supports the optional `skills@1.7.0` installer. The reviewed published CLI is **`@tinycloud/cli@0.10.0`**; do not substitute npm `latest` or an unpublished helper build.

## Reuse or install

Reuse the intended absolute CLI path when supplied; otherwise locate `tc` on `PATH`. Check its `--version`. If an existing installation differs, report the compatibility conflict or install the pinned version in a separate durable location; do not overwrite unrelated packages or locally modified skills.

If installation is needed and a global installation is appropriate:

```sh
npm install --global @tinycloud/cli@0.10.0
tc --version
npm root --global
```

The package already contains `skills/tc-cli/SKILL.md` and its reference files. Consult only packaged sections needed for the pending operation beneath the installed `@tinycloud/cli` directory; client skill discovery is not a prerequisite for following this link. Preserve the absolute executable and package reference paths for the caller.

### Project-local setup

For an isolated installation, choose a new, durable runtime directory, not an arbitrary temporary directory remembered only in chat or an unrelated application's dependency tree. Inspect before reusing an existing destination. With `TC_RUNTIME` set to its absolute path:

```sh
npm install --prefix "$TC_RUNTIME" --no-audit --no-fund @tinycloud/cli@0.10.0
"$TC_RUNTIME/node_modules/.bin/tc" --version
```

Keep the same executable across independent subprocesses. Disposable acceptance runs may use temporary directories, but that is not the normal saved-context strategy.

## Optional client discovery

Only if client-discoverable skills are desired, install the packaged skill using the actual client (`opencode`, `codex` or `claude-code`):

```sh
npx --yes skills@1.7.0 add https://registry.npmjs.org/@tinycloud/cli/-/cli-0.10.0.tgz --skill tc-cli --global --copy --agent CLIENT --yes
```

Omit `--global` for project-local skill discovery. Inspect any same-named skill first and preserve local modifications. Keep the entire skill and its references together. This optional step does not grant access or activate an app.

CLI skill discovery does not install or activate OpenCode's private sign-in transport. If saved access is insufficient, return to the single [authentication procedure](authenticate.md#3-complete-consent-through-a-supported-transport); do not start raw CLI login from installation or substitute TinyChat's app-specific setup for generic permissions.

## OpenCode private sign-in

Only when [authentication](authenticate.md#3-complete-consent-through-a-supported-transport) needs it, reuse or install the existing adapter's **`0.1.1-generic.1` branch preview** below. This is not a production release or a new plugin. Do not use TinyChat's top-level app setup, default host/profile or meeting manifest.

The supported baseline is stock OpenCode **`1.18.31`**, Node **22.20+**, and a direct local TUI (`opencode` or `opencode /absolute/project/path`). Keep the selected durable `TC_HOME` and put the selected CLI's directory on the client's startup `PATH`; the adapter runs `tc` from that path. Linux/macOS additional grants also require system `script` and `stty`; unavailable transport is a blocker, not permission to bypass capture.

Inspect existing same-named skills and preserve local modifications. Install only missing compatible components; with a new destination these commands install the CLI reference skill and pinned existing adapter:

```sh
npx --yes skills@1.7.0 add https://registry.npmjs.org/@tinycloud/cli/-/cli-0.10.0.tgz --skill tc-cli --global --copy --agent opencode --yes
npx --yes skills@1.7.0 add https://d33365c2.tinychat-4jq.pages.dev/agents/tinychat-retrieval/0.1.1-generic.1/tinychat-retrieval-0.1.1-generic.1.tgz --skill tinychat-retrieval --global --copy --agent opencode --yes
```

The immutable preview archive's SHA-256 is `f848ca3da17b0683569d9049f522626ab00ddaa522290dbe314e10354cb1890d`; runtime source revision is `4aa33448d4658c275563d095ceb6ebd292fe0e6e`. Installation grants no authority.

**Linux: load before starting the conversation.** Run the plain installer in the human-operated terminal before launching the direct TUI:

```sh
node "$HOME/.agents/skills/tinychat-retrieval/scripts/install-opencode.mjs"
```

This writes the loader; it does not activate a running Linux client. If that conversation already lacks the tools, report the prestart-install/relaunch prerequisite and preserve the pending request. Do not claim this is in-conversation activation or start an approval before capture is loaded.

**Local macOS only:** automatic activation in the supported direct TUI uses the command below as the last, separate native bash tool call, never combined, backgrounded or parallelized. Keep one active chat and no background agents; the expected interruption loads the integration and resumes that conversation.

```sh
node "$HOME/.agents/skills/tinychat-retrieval/scripts/install-opencode.mjs" --activate
```

`--prompt`, `--mini`, `serve`, `run`, `attach`, wrappers and remote clients are not this activation route. Follow only the relevant [versioned activation/capture contract](https://d33365c2.tinychat-4jq.pages.dev/agents/tinychat-retrieval/0.1.1-generic.1/references/setup.md); its meeting retrieval instructions are unrelated. Require callable `tinychat_setup`, `tinychat_authorize` and `tinychat_signin_status`, then return to [canonical authentication](authenticate.md#3-complete-consent-through-a-supported-transport). A loader receipt alone proves neither loaded capture nor successful authorization.

## Verify and return

Verify version `0.10.0` and readable packaged references, then return to the caller's recorded heading. [Saved context selection](authenticate.md#1-select-and-retain-the-context) uses standard home by default or an intentionally configured durable `TC_HOME`; the runtime install directory and CLI state home are different things.
