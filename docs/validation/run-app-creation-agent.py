#!/usr/bin/env python3
"""Public task-plus-link runner; synthetic component runs require explicit opt-in."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import time
from urllib.parse import urlparse
from urllib.request import urlopen

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--mode", required=True, choices=("public-entry", "synthetic"))
parser.add_argument("--connection", help="Synthetic-only fixture connection file")
parser.add_argument("--guide", required=True, help="Exact public URL, or synthetic local guide")
parser.add_argument("--directory", required=True, help="New private evidence directory outside repository ancestry")
parser.add_argument("--state", help="Synthetic-only continuation state")
parser.add_argument("--request", required=True, help="Unmodified natural-language request")
parser.add_argument("--continuation", help="Synthetic-only injected private plan handle")
parser.add_argument("--starting-state", help="Declare installation, hosted owner, saved grants and prepared state")
parser.add_argument("--guide-revision", help="Full published candidate commit, verified against served entry before execution")
parser.add_argument("--prepare-only", action="store_true", help="Validate and save exact input; no network, CLI or agent invocation")
parser.add_argument("--timeout", type=int, default=900, help="Agent wall-clock limit in seconds (default: 900)")
args = parser.parse_args()
if not args.request.strip() or args.timeout <= 0:
    parser.error("A nonempty request and positive timeout are required")
if args.mode == "public-entry":
    if any((args.connection, args.state, args.continuation)):
        parser.error("--connection, --state and --continuation are synthetic-only")
    url = urlparse(args.guide)
    if (url.scheme != "https" or url.hostname != "raw.githubusercontent.com" or
            url.username or url.password or url.port or url.query or url.fragment or
            not url.path.startswith("/TinyCloudLabs/prompts/") or
            not url.path.endswith("/quickstart/tinycloud.md")):
        parser.error("Use the exact public HTTPS TinyCloudLabs/prompts raw quickstart URL, without credentials")
    if not args.starting_state or not args.starting_state.strip():
        parser.error("Public entry requires --starting-state")
    if not args.guide_revision or not re.fullmatch(r"[0-9a-f]{40}", args.guide_revision):
        parser.error("Public entry requires a full 40-character --guide-revision")
else:
    if not args.connection or not args.state:
        parser.error("Synthetic mode requires --connection and --state")

os.umask(0o077)
directory = Path(args.directory).resolve()
directory.mkdir(parents=True, exist_ok=False)
workspace = directory / "workspace" if args.mode == "public-entry" else directory
if workspace != directory:
    workspace.mkdir()
connection = None
if args.mode == "synthetic":
    state = Path(args.state).resolve()
    state.mkdir(parents=True, exist_ok=True)
    connection = json.loads(Path(args.connection).read_text())
    safe = {key: connection[key] for key in (
        "cli", "tcHome", "profile", "host", "expectedOwnerDid", "installedSkill"
    )}
    (directory / "connection.json").write_text(json.dumps(safe, indent=2))
    entry = directory / "tinycloud.md"
    entry.write_text(f"""# Use TinyCloud — synthetic component validation

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
else:
    # Do not append connection hints, metadata, plans, consent or a generated guide.
    prompt = f"{args.request}\n\nUse TinyCloud: {args.guide}"
(directory / "request.txt").write_text(prompt + "\n")
evidence = {
    "mode": args.mode,
    "classification": "public-entry candidate; independent acceptance pending" if args.mode == "public-entry" else "synthetic component; not human consent or public acceptance",
    "startingState": args.starting_state or "Prepared synthetic fixture; protected reader and loopback signing",
    "client": {"name": "codex", "version": None, "mode": "exec, fresh ephemeral session"},
    "cli": {"beforeVersion": None, "afterVersion": None},
    "guide": {"input": args.guide, "declaredRevision": args.guide_revision, "servedRevision": None, "sha256": None},
    "humanInterventions": None,
    "measurements": {"wallSeconds": None, "humanApprovalSeconds": None,
                     "nonApprovalSeconds": None, "toolInvocations": None, "cliInvocations": None,
                     "completedToolEvents": None, "consentCount": None, "repeatedQuestions": None},
    "independentStateVerification": None,
    "outcome": "prepared-not-run",
}

def save_evidence():
    (directory / "evidence.json").write_text(json.dumps(evidence, indent=2) + "\n")


def version(executable):
    if not executable:
        return None
    result = subprocess.run([executable, "--version"], capture_output=True, text=True, timeout=30)
    if result.returncode:
        raise RuntimeError("Version command failed; see installed runtime before acceptance")
    return result.stdout.strip()


save_evidence()
if args.prepare_only:
    print(json.dumps({"directory": str(directory), "outcome": evidence["outcome"]}))
    raise SystemExit(0)

code = 1
started = None
try:
    if args.mode == "public-entry":
        # Check the exact supplied URL, not a substitute link in the model input.
        immutable = "https://raw.githubusercontent.com/TinyCloudLabs/prompts/" + args.guide_revision + "/quickstart/tinycloud.md"
        with urlopen(args.guide, timeout=30) as response:
            served = response.read()
        with urlopen(immutable, timeout=30) as response:
            pinned = response.read()
        if served != pinned:
            raise RuntimeError("Public entry does not match the declared candidate revision")
        evidence["guide"].update(servedRevision=args.guide_revision, sha256=hashlib.sha256(served).hexdigest())
    else:
        evidence["guide"]["sha256"] = hashlib.sha256(Path(args.guide).read_bytes()).hexdigest()
    evidence["client"]["version"] = version("codex")
    cli = connection["cli"] if connection else shutil.which("tc")
    evidence["cli"]["beforeVersion"] = version(cli)
    command = ["codex", "exec", "--skip-git-repo-check", "--ephemeral"]
    if args.mode == "synthetic":
        command += ["--ignore-user-config", "--ignore-rules", "-c", 'approval_policy="never"',
                    "--sandbox", "danger-full-access"]
    # Public mode retains the installed client's ordinary configuration and policies.
    command += ["--cd", str(workspace), "--json", "--output-last-message", str(directory / "final.txt"), prompt]
    (directory / "invocation.json").write_text(json.dumps(command, indent=2))
    evidence["outcome"] = "running"
    evidence["startedAt"] = datetime.now(timezone.utc).isoformat()
    save_evidence()
    started = time.monotonic()
    with (directory / "events.jsonl").open("w") as out, (directory / "stderr.log").open("w") as err:
        process = subprocess.Popen(command, stdout=out, stderr=err, start_new_session=True)
        (directory / "process.json").write_text(json.dumps({"pid": process.pid}))
        try:
            code = process.wait(timeout=args.timeout)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
            code = 124
    evidence["measurements"]["wallSeconds"] = round(time.monotonic() - started, 3)
    evidence["outcome"] = "client-exited; independent acceptance pending" if code == 0 else "client-timeout" if code == 124 else "client-failed"
    events = [json.loads(line) for line in (directory / "events.jsonl").read_text().splitlines() if line.strip()]
    evidence["measurements"]["completedToolEvents"] = sum(
        event.get("type") == "item.completed" and event.get("item", {}).get("type") in
        ("command_execution", "mcp_tool_call", "web_search", "file_change") for event in events)
    evidence["cli"]["afterVersion"] = version(cli or shutil.which("tc"))
except Exception as error:
    evidence["outcome"] = "runner-failed"
    # Details may contain local paths; keep them in private evidence, not stdout.
    (directory / "runner-error.txt").write_text(str(error) + "\n")
    code = 1
finally:
    evidence["exitCode"] = code
    save_evidence()
    (directory / "exit.json").write_text(json.dumps({"code": code}))
print(json.dumps({"directory": str(directory), "exitCode": code, "outcome": evidence["outcome"]}))
raise SystemExit(code)
