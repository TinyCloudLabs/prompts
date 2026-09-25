# Set up the standalone OpenKey CLI

This optional reusable module installs and verifies the standalone `openkey` tool. Use it only when a calling workflow explicitly needs direct OpenKey CLI commands. It is not an application authorization step: installing or signing in with `openkey` does not grant another application's TinyCloud permissions, which remain the calling app's responsibility.

## Caller contract

Before starting, retain the user's original task, the current agent client, the calling guide and its exact return heading. After verification, return directly to that heading and continue the original task in the same conversation without asking the user to paste another prompt.

## Requirements

Use Node.js **22.12 or later** and npm. The published CLI depends on `commander@^15.0.0`, whose supported Node.js range begins at 22.12.

## Reuse or install

Check an existing installation with `command -v openkey` and `npm list --global --depth=0 @openkey/cli`. Reuse it when npm reports `@openkey/cli@0.1.4` and the resolved executable belongs to that package. If `openkey` resolves to a custom executable or another package, return the conflict to the caller; do not overwrite it or its configuration.

The exact [package is publicly available from npm](https://www.npmjs.com/package/@openkey/cli/v/0.1.4), so a missing installation, or a mismatched `@openkey/cli` installation whose replacement the caller approved, can be installed with:

```sh
npm install --global @openkey/cli@0.1.4
```

Verify the installed package version with `npm list --global --depth=0 @openkey/cli`, then run `openkey --help` as a non-authenticating launch check. The published `0.1.4` artifact currently embeds `0.0.1` in `openkey --version`; that output is an upstream version-string defect, so do not use it as the package-version authority. Installation and verification are the end of this module; do not start OAuth as part of prerequisite setup.

## Generic usage boundary

Login requires an OAuth client ID supplied by the calling application or operator. There is no universal client ID, so never invent one. When login is explicitly requested and the caller has supplied an ID, the generic form is:

```sh
openkey login --client-id <CALLER_OAUTH_CLIENT_ID>
```

OpenKey owns the [CLI package](https://github.com/TinyCloudLabs/openkey/tree/495b9d39c3484333fcf9e98af0eb7b67286b0323/packages/cli), its [package metadata](https://github.com/TinyCloudLabs/openkey/blob/495b9d39c3484333fcf9e98af0eb7b67286b0323/packages/cli/package.json) and the upstream [generic `openkey-cli` skill](https://github.com/TinyCloudLabs/openkey/blob/495b9d39c3484333fcf9e98af0eb7b67286b0323/packages/cli/.claude/skills/openkey-cli/SKILL.md). That skill remains upstream-owned and is not copied into this repository or shipped in the npm package's declared `dist` files.

Return to the recorded caller after verification, preserving its original task, client and next heading.
