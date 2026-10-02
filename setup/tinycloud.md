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

The package already contains `skills/tc-cli/SKILL.md` and its reference files. Read those directly beneath the installed `@tinycloud/cli` directory; client skill discovery is not a prerequisite for following this link. Preserve the absolute executable and package reference paths for the caller.

### Project-local setup

For an isolated installation, choose a new, durable runtime directory, not an arbitrary temporary directory remembered only in chat or an unrelated application's dependency tree. Inspect before reusing an existing destination. With `TC_RUNTIME` set to its absolute path:

```sh
npm install --prefix "$TC_RUNTIME" --no-audit --no-fund @tinycloud/cli@0.10.0
"$TC_RUNTIME/node_modules/.bin/tc" --version
```

Read `$TC_RUNTIME/node_modules/@tinycloud/cli/skills/tc-cli/SKILL.md` and its references. Keep the same executable across independent subprocesses. Disposable acceptance runs may use temporary directories, but that is not the normal saved-context strategy.

## Optional client discovery

Only if client-discoverable skills are desired, install the packaged skill using the actual client (`opencode`, `codex` or `claude-code`):

```sh
npx --yes skills@1.7.0 add https://registry.npmjs.org/@tinycloud/cli/-/cli-0.10.0.tgz --skill tc-cli --global --copy --agent CLIENT --yes
```

Omit `--global` for project-local skill discovery. Inspect any same-named skill first and preserve local modifications. Keep the entire skill and its references together. This optional step does not grant access or activate an app.

## Verify and return

Verify version `0.10.0` and readable packaged references, then return to the caller's recorded heading. [Saved context selection](authenticate.md#1-select-and-retain-the-context) uses standard home by default or an intentionally configured durable `TC_HOME`; the runtime install directory and CLI state home are different things.
