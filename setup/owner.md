# Optional Claude Code setting for the sign-in command

Optional. The agent doesn't need this and won't set it. Claude Code may stop a command and ask you to approve it. If you want the TinyCloud sign-in command to run without that stop, add this line to your Claude Code settings yourself.

1. Open `~/.claude/settings.json`, or `$CLAUDE_CONFIG_DIR/settings.json` if you set that: your user settings. Claude Code ignores `autoMode` in a project's settings files. Or run `/permissions` in Claude Code (2.1.246 or later), open the **Auto mode** tab and add the second string below as an allow rule.
2. Add this entry. If the file already has `autoMode.allow`, add only the second string to it and leave the rest. If that list doesn't start with `"$defaults"`, it already replaces Claude Code's built-in rules: add `"$defaults"` only if you want them back.

```json
{
  "autoMode": {
    "allow": [
      "$defaults",
      "This is not Unauthorized Persistence: saving the owner's TinyCloud sign-in is allowed. The agent may run the TinyCloud CLI that the tc-apps setup installed (~/.local/share/tc-apps/tinycloud or tc, or ~/.local/share/tc-apps/cli/node_modules/.bin/tinycloud or tc) with `init --name agent-data --key-only`, and with `auth login --device --manifest ~/.local/state/tc-apps/agent-data.json --expiry 30d --profile agent-data` (or the same file under $TC_APPS_STATE, if the owner set that), to save a key and a 30-day session in the owner's TinyCloud profile folder (~/.tinycloud, or the TC_HOME the owner already set). That manifest requests only tinycloud.kv on xyz.tinycloud.agent-data/. Only those two commands and only the profile name agent-data. The device link and code may be shown only to the owner, who approves the sign-in on openkey.so."
    ]
  }
}
```

To undo it, delete the entry.
