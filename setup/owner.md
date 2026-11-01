# Optional Claude Code setting for the sign-in command

Optional. The agent doesn't need this and won't set it. Claude Code may stop a command and ask you to approve it. If you want the TinyCloud sign-in command to run without that stop, add this line to your Claude Code settings yourself.

1. Open `~/.claude/settings.json`, or `$CLAUDE_CONFIG_DIR/settings.json` if you set that: your user settings. Claude Code ignores `autoMode` in a project's settings files. Or run `/permissions` in Claude Code (2.1.246 or later), open the **Auto mode** tab and add the second string below as an allow rule.
2. Add this entry. If the file already has `autoMode.allow`, add only the second string to it and leave the rest. If that list doesn't start with `"$defaults"`, it already replaces Claude Code's built-in rules: add `"$defaults"` only if you want them back.

```json
{
  "autoMode": {
    "allow": [
      "$defaults",
      "This is not Unauthorized Persistence: saving the owner's TinyCloud sign-in is allowed. The agent may run the TinyCloud CLI that the tc-apps setup installed (~/.local/share/tc-apps/tinycloud) with `init --name <profile> --key-only`, `init --name owner`, and `auth login --method openkey` (for an app profile, with `--manifest` set to that profile's file in ~/.local/state/tc-apps, or $TC_APPS_STATE if the owner set that, and `--expiry 30d`), to save a key and a session in the owner's TinyCloud profile folder (~/.tinycloud, or the TC_HOME the owner already set). Only the profiles owner, agent-data, agent-data-sql, tinyapp-<app> and tinyapp-<app>-sql; each app manifest requests only that app's folder or index. The OpenKey link may be shown only to the owner, who approves the sign-in on openkey.so."
    ]
  }
}
```

If you added this setting before, paste it again so it covers the current sign-in commands.

To undo it, delete the entry.
