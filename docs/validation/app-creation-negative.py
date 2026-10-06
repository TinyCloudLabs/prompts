#!/usr/bin/env python3
"""Fresh-agent negative cases on a separately running synthetic fixture only."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

parser = argparse.ArgumentParser()
parser.add_argument("--fixture", required=True)
parser.add_argument("--output", required=True)
parser.add_argument("--reuse-compatible", action="store_true", help="After negative suite, replace only its seeded registrations and test semantic reuse")
args = parser.parse_args()
os.umask(0o077)
context = json.loads(Path(args.fixture).read_text())
root = Path(__file__).resolve().parents[2]
private = Path(context["directory"]) / "private" / ("semantic-reuse" if args.reuse_compatible else "negative")
if args.reuse_compatible and private.exists():
    private = private.with_name("semantic-reuse-repeat")
private.mkdir(exist_ok=False)
runner = root / "docs/validation/run-app-creation-agent.py"
guide = root / "quickstart/tinycloud.md"
connection = Path(context["connectionFile"])
checks = []
capability = {"service": "tinycloud.capabilities", "path": "", "skipPrefix": True, "actions": ["read"]}

def cli(command, profile="observer", home=None, expected=True):
    home = home or context["observer"]["tcHome"]
    result = subprocess.run([context["cli"], "--profile", profile, "--host", context["host"], "--json", *command],
        env={**os.environ, "TC_HOME": home}, capture_output=True, text=True, timeout=45)
    if expected:
        assert result.returncode == 0, result.stderr or result.stdout
    return json.loads(result.stdout) if result.stdout.strip() else {"stderr": result.stderr, "status": result.returncode}

def grant(key):
    manifest = private / (key.split("/")[-1] + "-grant.json")
    manifest.write_text(json.dumps({"manifest_version": 1, "app_id": "negative-observer", "space": context["accountSpace"],
        "defaults": False, "includePublicSpace": False, "permissions": [
            {"service": "tinycloud.kv", "path": key, "skipPrefix": True, "actions": ["get", "put", "del"]}, capability]}))
    cli(["auth", "request", "--manifest", str(manifest), "--grant", "--expiry", "1h", "--no-popup"])

def put(key, body, space):
    file = private / "seed-value.txt"
    file.write_text(body if isinstance(body, str) else json.dumps(body))
    cli(["kv", "put", key, "--file", str(file), "--space", space])

def snapshot():
    result = {}
    for label, space, prefix in [("registry", context["accountSpace"], "applications/"), ("app", context["appSpace"], "")]:
        keys = cli(["kv", "list", "--prefix", prefix, "--space", space])["keys"]
        result[label] = {key: cli(["kv", "get", key, "--space", space])["data"] for key in keys}
    result["siblingSql"] = cli(["sql", "query", "SELECT * FROM sibling ORDER BY id", "--db", context["siblingDb"], "--space", context["appSpace"]])["rows"]
    result["probeSql"] = cli(["sql", "query", "SELECT * FROM probe ORDER BY id", "--db", "fixture_schema_probe", "--space", context["appSpace"]])["rows"]
    return result

def log_records(path):
    return [json.loads(line) for line in Path(path).read_text().splitlines() if line]

def storage_mutation(command):
    pairs = [["kv", "put"], ["kv", "delete"], ["sql", "execute"], ["sql", "batch"], ["space", "create"], ["space", "host"]]
    return any(command[i:i+2] in pairs or command[i:i+3] == ["account", "apps", "register"] for i in range(len(command)))

def run_case(name, request, selected_connection=connection):
    before = snapshot()
    (private / (name + "-before.json")).write_text(json.dumps(before, sort_keys=True))
    first_command = len(log_records(context["commandLog"]))
    first_grant = len(json.loads(Path(context["grantLog"]).read_text()))
    target = private / name
    state = private / (name + "-state")
    command = [sys.executable, str(runner), "--mode", "synthetic", "--connection", str(selected_connection), "--guide", str(guide),
        "--directory", str(target), "--state", str(state), "--request", request]
    run = subprocess.run(command, capture_output=True, text=True, timeout=900)
    (private / (name + "-runner-output.txt")).write_text(run.stdout + run.stderr)
    after = snapshot()
    (private / (name + "-after.json")).write_text(json.dumps(after, sort_keys=True))
    events = log_records(context["commandLog"])[first_command:]
    agent_commands = [event for event in events if event["home"] == context["tcHome"]]
    granted = [grant for grant in json.loads(Path(context["grantLog"]).read_text())[first_grant:] if not grant["internal"]]
    write_grants = [permission for grant in granted for permission in grant["permissions"] if any(action.split("/")[-1] not in ["get", "list", "read"] for action in permission["actions"])]
    mutations = [event for event in agent_commands if storage_mutation(event["args"])]
    state_unchanged = before == after
    record = {"case": name, "freshProcessExit": run.returncode, "storedStateUnchanged": state_unchanged,
        "canonicalRegistryUnchanged": before["registry"] == after["registry"], "syntheticSiblingsUnchanged": before["siblingSql"] == after["siblingSql"] and before["app"][context["siblingKey"]] == after["app"][context["siblingKey"]],
        "agentCliCommands": len(agent_commands), "agentStorageMutationAttempts": len(mutations), "agentWritePermissionsGranted": len(write_grants),
        "approvedReadOnlyConsentRequests": len(granted), "newProvisioningPlans": len(list((state / "provisioning").glob("*/plan.json"))) if (state / "provisioning").exists() else 0,
        "snapshotSha256": hashlib.sha256(json.dumps(before, sort_keys=True).encode()).hexdigest(),
        "pass": run.returncode == 0 and state_unchanged and not mutations and not write_grants}
    checks.append(record)
    Path(args.output).write_text(json.dumps({"classification": "fresh ordinary Codex processes and independent unchanged-CLI owner observations on disposable synthetic node", "cases": checks, "limitations": ["Synthetic callback signing is not human consent or hosted onboarding.", "These are seeded negative discovery cases, not new-app creation acceptance.", "The denied-registry process stopped after the real server denial; it did not attempt missing-read consent, so consent rejection/recovery is not established by that case."]}, indent=2) + "\n")
    print(json.dumps({"case": name, "result": record, "final": (target / "final.txt").read_text() if (target / "final.txt").exists() else None}), flush=True)
    assert record["pass"], name

if args.reuse_compatible:
    # Only remove this helper's synthetic registrations, never arbitrary apps.
    listed = cli(["account", "apps", "list", "--live"])
    ids = {app["appId"] for app in listed["applications"]}
    assert ids in ({"negative.tasks.home", "negative.tasks.shared"}, {"negative.actions"})
    app_id, prefix = "negative.actions", "negative/actions"
    if ids == {"negative.tasks.home", "negative.tasks.shared"}:
        for app in listed["applications"]:
            cli(["kv", "delete", "applications/" + app["appId"], "--space", context["accountSpace"]])
        item = {"manifest_version": 1, "app_id": app_id, "name": "Errands", "description": "Personal actions, todos and errands with add, edit, complete, reopen and delete operations", "space": context["appSpace"], "prefix": prefix,
            "defaults": False, "includePublicSpace": False, "knowledge": "knowledge/index.md", "permissions": [
            {"service": "tinycloud.kv", "path": prefix + "/knowledge/index.md", "skipPrefix": True, "actions": ["get"]},
            {"service": "tinycloud.kv", "path": prefix + "/items/", "skipPrefix": True, "actions": ["get", "list", "put", "del"]}]}
        knowledge = cli(["kv", "get", "negative/tasks/home/knowledge/index.md", "--space", context["appSpace"]])["data"]
        knowledge = knowledge.replace("negative.tasks.home", app_id).replace("negative/tasks/home", prefix).replace("Home todos", "Errands")
        put(prefix + "/knowledge/index.md", knowledge, context["appSpace"])
        grant("applications/" + app_id)
        manifest_path = private / "application.json"
        manifest_path.write_text(json.dumps(item))
        cli(["account", "apps", "register", str(manifest_path)])
    before = snapshot()
    (private / "before.json").write_text(json.dumps(before, sort_keys=True))
    first_command = len(log_records(context["commandLog"]))
    first_grant = len(json.loads(Path(context["grantLog"]).read_text()))
    target, state = private / "agent", private / "state"
    result = subprocess.run([sys.executable, str(runner), "--mode", "synthetic", "--connection", str(connection), "--guide", str(guide), "--directory", str(target), "--state", str(state), "--request", "Add buy milk to my todos."], capture_output=True, text=True, timeout=900)
    (private / "runner-output.txt").write_text(result.stdout + result.stderr)
    after = snapshot()
    (private / "after.json").write_text(json.dumps(after, sort_keys=True))
    new_keys = set(after["app"]) - set(before["app"])
    matching = [key for key in new_keys if key.startswith(prefix + "/items/")]
    new_value = after["app"][matching[0]] if len(matching) == 1 else {}
    if isinstance(new_value, str):
        new_value = json.loads(new_value)
    events = [event for event in log_records(context["commandLog"])[first_command:] if event["home"] == context["tcHome"]]
    mutations = [event for event in events if storage_mutation(event["args"])]
    granted = [grant for grant in json.loads(Path(context["grantLog"]).read_text())[first_grant:] if not grant["internal"]]
    setup_permissions = [permission for grant in granted for permission in grant["permissions"] if any(action.endswith(("/schema", "/admin")) or action.endswith("/put") and (permission["space"].endswith(":account") or "/knowledge/" in permission["path"]) for action in permission["actions"])]
    record = {"case": "existing-compatible-app-semantic-reuse", "classification": "pre-enrolled alternate app ID/name; reuse evidence only", "freshProcessExit": result.returncode,
        "canonicalRegistryUnchanged": before["registry"] == after["registry"], "allExistingKvUnchanged": all(after["app"].get(key) == value for key, value in before["app"].items()),
        "syntheticSqlUnchanged": before["siblingSql"] == after["siblingSql"] and before["probeSql"] == after["probeSql"],
        "newItemCount": len(matching), "onlyRequestedItemAdded": len(new_keys) == 1 and new_value.get("title") == "buy milk" and new_value.get("status") == "open" and bool(new_value.get("id")),
        "agentStorageMutationAttempts": len(mutations), "setupAuthorityGranted": len(setup_permissions), "newProvisioningPlans": len(list((state / "provisioning").glob("*/plan.json"))) if (state / "provisioning").exists() else 0}
    record["pass"] = result.returncode == 0 and record["canonicalRegistryUnchanged"] and record["allExistingKvUnchanged"] and record["syntheticSqlUnchanged"] and record["onlyRequestedItemAdded"] and len(mutations) == 1 and not setup_permissions and not record["newProvisioningPlans"]
    report = json.loads(Path(args.output).read_text())
    report["existingCompatibleReuse"] = record
    Path(args.output).write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"result": record, "final": (target / "final.txt").read_text() if (target / "final.txt").exists() else None}), flush=True)
    assert record["pass"]
    sys.exit(0)

run_case("read-only-empty-registry", "Show my todos.")
run_case("hypothetical-no-storage-intent", "Would TinyCloud be a good way to organize my todos? Explain briefly; I am only considering options.")

# A separate genuinely authenticated profile has no account-registry authority.
# Its test consent transport declines requested registry reads, while every
# storage command still reaches the unchanged installed CLI and real node.
blocked_profile = "denied-reader"
cli(["init", "--name", blocked_profile, "--key-only", "--host", context["host"]], blocked_profile, context["tcHome"])
primary = private / "denied-primary.json"
primary.write_text(json.dumps({"manifest_version": 1, "app_id": "negative-discovery", "space": context["appSpace"], "defaults": False, "includePublicSpace": False, "permissions": [capability]}))
cli(["auth", "login", "--method", "openkey", "--manifest", str(primary), "--owner", context["expectedOwnerDid"], "--expiry", "1h", "--no-popup"], blocked_profile, context["tcHome"])
blocked_cli = private / "tc-denied"
blocked_cli.write_text(f'''#!{sys.executable}
import json, os, sys
from pathlib import Path
args = sys.argv[1:]
if 'auth' in args and ('request' in args or 'login' in args):
    print(json.dumps({{"error":{{"code":"SYNTHETIC_CONSENT_DENIED","message":"The synthetic owner declined this permission request."}}}}), file=sys.stderr)
    raise SystemExit(5)
os.execv({json.dumps(context["cli"])}, [{json.dumps(context["cli"])}, *args])
''')
blocked_cli.chmod(0o700)
blocked_connection = private / "denied-connection.json"
blocked_context = json.loads(connection.read_text())
blocked_context.update({"cli": str(blocked_cli), "profile": blocked_profile})
blocked_connection.write_text(json.dumps(blocked_context))
run_case("denied-registry-read", "Add buy milk to my todos.", blocked_connection)

key = "applications/negative.todos.malformed"
grant(key)
put(key, {"app_id": "negative.todos.malformed", "manifests": "invalid instead of an array", "owner_note": "preserve this metadata"}, context["accountSpace"])
run_case("malformed-canonical-registration", "Add buy milk to my todos.")
cli(["kv", "delete", key, "--space", context["accountSpace"]])

def manifest(app_id, prefix, name, description):
    return {"manifest_version": 1, "app_id": app_id, "name": name, "description": description, "space": context["appSpace"], "prefix": prefix,
        "defaults": False, "includePublicSpace": False, "knowledge": "knowledge/index.md", "permissions": [
        {"service": "tinycloud.kv", "path": prefix + "/knowledge/index.md", "skipPrefix": True, "actions": ["get"]},
        {"service": "tinycloud.kv", "path": prefix + "/items/", "skipPrefix": True, "actions": ["get", "list", "put", "del"]}]}

def register(item):
    key = "applications/" + item["app_id"]
    grant(key)
    source = private / (item["app_id"] + ".json")
    source.write_text(json.dumps(item))
    cli(["account", "apps", "register", str(source)])
    return key

missing = manifest("negative.errands", "negative/errands", "Personal errands", "The user's todos, errands and tasks; supports adding and completing tasks")
key = register(missing)
put(missing["prefix"] + "/items/sentinel.json", {"id": "sentinel", "title": "preserve this existing task", "status": "open"}, context["appSpace"])
run_case("relevant-app-missing-guidance", "Add buy milk to my todos.")
cli(["kv", "delete", key, "--space", context["accountSpace"]])

for suffix, name in [("home", "Home todos"), ("shared", "Household shared todos")]:
    item = manifest("negative.tasks." + suffix, "negative/tasks/" + suffix, name, "Todo lists supporting adding, reading, editing, completing, reopening and deleting todos")
    register(item)
    prefix = item["prefix"]
    body = f'''---
format: tinycloud-kv-knowledge/2
app_id: {item["app_id"]}
space: {json.dumps(context["appSpace"])}
prefix: {prefix}
---

# {name}

This app holds {'private personal' if suffix == 'home' else 'household shared'} todos. Supported one-off operations are adding, reading, editing, completing, reopening and deleting items. An item is at `{prefix}/items/UUID.json`, with fields id (UUID), title (user text), status (open or completed), created_at and updated_at (UTC ISO timestamps). Create uses open status and one durable UUID per operation. No due date or priority is implied. List the exact item prefix for selection. Read exact ID before edit; preserve unrelated fields. Completion sets completed, reopening sets open. Deletion is permanent for one selected ID; confirm NOT_FOUND. KV has no compare-and-set: edits assume one writer, and known concurrent writes require reconciliation. A retry reads the original ID first; identical intended content confirms success, differing content stops, and absence permits repeating the exact original write. Every mutation reads back exact ID to compare the complete intended object. Repeated separate prompts can be separate items. No other side effects occur. Native chat delivery IDs are unnecessary for explicit one-off requests; retain a private durable operation identity.
'''
    put(prefix + "/knowledge/index.md", body, context["appSpace"])
run_case("materially-ambiguous-compatible-apps", "Add buy milk to my todos.")
