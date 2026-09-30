#!/usr/bin/env python3
"""Fresh ordinary Codex acceptance; logs stay private, no fixture schema in prompt."""
import argparse
import json
import os
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument("--connection", required=True)
parser.add_argument("--guide", required=True)
parser.add_argument("--directory", required=True)
parser.add_argument("--state", required=True)
parser.add_argument("--request", required=True)
parser.add_argument("--continuation")
args = parser.parse_args()
os.umask(0o077)
directory = Path(args.directory).resolve()
directory.mkdir(parents=True, exist_ok=False)
state = Path(args.state).resolve()
state.mkdir(parents=True, exist_ok=True)
connection = json.loads(Path(args.connection).read_text())
# Deliberately exclude fixture context, observer, app locators, schema and logs.
safe = {key: connection[key] for key in (
    "cli", "tcHome", "profile", "host", "expectedOwnerDid", "installedSkill"
)}
(directory / "connection.json").write_text(json.dumps(safe, indent=2))
entry = directory / "tinycloud.md"
entry.write_text(f"""# Use TinyCloud

Complete the original task using [{args.guide}]({args.guide}).
Use nonsecret connection selections in {directory / 'connection.json'}.
The selected profile is a protected reader: keep it read-only. Use separate
ordinary-task and setup profiles when needed, all within the selected TC_HOME.
Reuse the supplied absolute CLI; it invokes the installed tc through this
disposable account's supported synthetic loopback consent transport. Normal
auth login/request commands deliver signatures directly into the CLI callback;
do not inspect the launcher's implementation or handle signed responses.
Use the installed tc-cli skill at the connection's installedSkill path.
Keep the same owner/host. Discover apps through TinyCloud; no app locators are
provided. This is a disposable synthetic account with no real user records.
Do not inspect fixture internals, unrelated local files or other profiles' files.

Reuse ordinary context if present in {state / 'connection.json'}; save only
cli, tcHome, profile, host and expectedOwnerDid there. Private operation plans
belong in {state / 'operations'}, provisioning plans in {state / 'provisioning'}.
Timezone Europe/Lisbon; request date 2026-09-30. Retain resolved dates on retry.
""")
prompt = f"{args.request} Use TinyCloud: {entry}"
if args.continuation:
    prompt += f"\nContinue the interrupted operation bound to private plan {args.continuation}. The previous agent process has stopped."
(directory / "request.txt").write_text(prompt + "\n")
command = ["codex", "exec", "--skip-git-repo-check", "--ephemeral",
           "--ignore-user-config", "--ignore-rules", "-c", 'approval_policy="never"',
           "--sandbox", "danger-full-access", "--cd", str(directory), "--json",
           "--output-last-message", str(directory / "final.txt"), prompt]
with (directory / "events.jsonl").open("w") as out, (directory / "stderr.log").open("w") as err:
    process = subprocess.Popen(command, stdout=out, stderr=err, start_new_session=True)
    (directory / "process.json").write_text(json.dumps({"pid": process.pid}))
    code = process.wait()
(directory / "exit.json").write_text(json.dumps({"code": code}))
print(json.dumps({"directory": str(directory), "exitCode": code,
                  "final": (directory / "final.txt").read_text() if (directory / "final.txt").exists() else None}))
raise SystemExit(code)
