#!/usr/bin/env python3
"""Interrupt a fresh setup-only SQL task after CREATE, then resume its own plan."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time

parser = argparse.ArgumentParser()
parser.add_argument("--fixture", required=True)
parser.add_argument("--output", required=True)
args = parser.parse_args()
os.umask(0o077)
context = json.loads(Path(args.fixture).read_text())
root = Path(__file__).resolve().parents[2]
private = Path(context["directory"]) / "private" / "storage-interruption"
private.mkdir(exist_ok=False)
runner = root / "docs/validation/run-app-creation-agent.py"
interrupter = root / "docs/validation/interrupt-app-creation-agent.py"
guide = root / "quickstart/tinycloud.md"
request = "Set up an empty wine cellar app to track bottle names, vintages and quantities, with table queries for totals by vintage."
state = private / "state"
first_run, second_run = private / "first-agent", private / "continuation-agent"

def cli(command):
    result = subprocess.run([context["cli"], "--profile", "observer", "--host", context["host"], "--json", *command],
        env={**os.environ, "TC_HOME": context["observer"]["tcHome"]}, capture_output=True, text=True, timeout=45)
    assert result.returncode == 0, result.stderr or result.stdout
    return json.loads(result.stdout)

def snapshot():
    result = {}
    for label, space, prefix in [("registry", context["accountSpace"], "applications/"), ("app", context["appSpace"], "")]:
        keys = cli(["kv", "list", "--prefix", prefix, "--space", space])["keys"]
        result[label] = {key: cli(["kv", "get", key, "--space", space])["data"] for key in keys}
    return result

def command(directory, continuation=None):
    values = [sys.executable, str(runner), "--connection", context["connectionFile"], "--guide", str(guide), "--directory", str(directory), "--state", str(state), "--request", request]
    return values + (["--continuation", str(continuation)] if continuation else [])

before = snapshot()
(private / "before.json").write_text(json.dumps(before, sort_keys=True))
with (private / "interrupt-log.txt").open("w") as interrupt_log, (private / "first-runner.txt").open("w") as first_log:
    watcher = subprocess.Popen([sys.executable, str(interrupter), args.fixture, str(first_run), "storage"], stdout=interrupt_log, stderr=subprocess.STDOUT)
    deadline = time.monotonic() + 10
    while not Path(context["interruptControl"]).exists():
        assert watcher.poll() is None and time.monotonic() < deadline, "Watcher did not arm receipt loss"
        time.sleep(.02)
    process = subprocess.Popen(command(first_run), stdout=first_log, stderr=subprocess.STDOUT)
    assert watcher.wait(timeout=1200) == 0, "No exact SQL storage boundary observed"
    process.wait(timeout=30)

interruption = json.loads((first_run / "interruption.json").read_text())
assert interruption["confirmedProcessGroupKill"]
remote_command = interruption["command"]["args"]
database = remote_command[remote_command.index("--db") + 1]
space = remote_command[remote_command.index("--space") + 1]
assert space.lower() == context["appSpace"].lower()
schema_query = ["sql", "query", "SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name", "--db", database, "--space", space]
schema = cli(schema_query)
tables = [row[1] for row in schema["rows"] if row[0] == "table" and not row[1].startswith("sqlite_")]
assert tables, "No application table exists after interrupted CREATE"

def counts():
    return {table: cli(["sql", "query", 'SELECT COUNT(*) FROM "' + table.replace('"', '""') + '"', "--db", database, "--space", space])["rows"][0][0] for table in tables}

after_storage = snapshot()
(private / "after-storage.json").write_text(json.dumps(after_storage, sort_keys=True))
assert after_storage == before, "Storage boundary also changed guidance or registration"
assert all(count == 0 for count in counts().values()), "Setup-only inserted a record"
plans = list((state / "provisioning").rglob("plan.json"))
assert len(plans) == 1, "Need one agent-authored continuation handle"
offset = len(Path(context["commandLog"]).read_text().splitlines())
continued = subprocess.run(command(second_run, plans[0]), capture_output=True, text=True, timeout=1200)
(private / "continuation-runner.txt").write_text(continued.stdout + continued.stderr)
assert continued.returncode == 0, continued.stderr
after = snapshot()
(private / "after-continuation.json").write_text(json.dumps(after, sort_keys=True))
schema_after = cli(schema_query)
counts_after = counts()
new_registry = set(after["registry"]) - set(before["registry"])
new_keys = set(after["app"]) - set(before["app"])
events = [json.loads(line) for line in Path(context["commandLog"]).read_text().splitlines()[offset:]]
agent_events = [event for event in events if event["home"] == context["tcHome"]]
ddl = [event for event in agent_events if "sql" in event["args"] and "execute" in event["args"] and any(value.lstrip().upper().startswith(("CREATE ", "ALTER ", "DROP ")) for value in event["args"])]
record = {"case": "setup-only-interrupted-after-storage", "classification": "fresh agent authored SQL model from natural setup-only request; fresh continuation used only its private plan handle",
    "firstProcessIntentionallyStopped": True, "interruptedAfterSuccessfulCreate": True, "kvAndRegistryUnchangedAtInterruption": after_storage == before,
    "emptyAtInterruption": True, "freshContinuationExit": continued.returncode, "originalSchemaPreserved": schema == schema_after,
    "continuationSchemaMutationAttempts": len(ddl), "oneNewRegistration": len(new_registry) == 1, "oneNewKnowledgeRootOnly": len(new_keys) == 1 and next(iter(new_keys)).endswith("/knowledge/index.md"),
    "existingRegistryPreserved": all(after["registry"].get(key) == value for key, value in before["registry"].items()),
    "existingKvPreserved": all(after["app"].get(key) == value for key, value in before["app"].items()), "tableCount": len(tables), "recordCountAfterContinuation": sum(counts_after.values())}
record["pass"] = record["originalSchemaPreserved"] and not ddl and record["oneNewRegistration"] and record["oneNewKnowledgeRootOnly"] and record["existingRegistryPreserved"] and record["existingKvPreserved"] and record["recordCountAfterContinuation"] == 0
report = json.loads(Path(args.output).read_text())
report["setupOnlyStorageInterruption"] = record
Path(args.output).write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({"result": record, "final": (second_run / "final.txt").read_text()}))
assert record["pass"]
