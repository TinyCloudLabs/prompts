import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const exec = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const nativeCli = process.env.TC_DIAGNOSTICS_TEST_CLI;
const childSource = `#!/usr/bin/env node
const fs=require('node:fs');const cp=require('node:child_process');
const args=process.argv.slice(2),dir=process.env.CASE_DIRECTORY;
if(args[0]==='diagnostics'){
  fs.appendFileSync(dir+'/helper-input',fs.readFileSync(0));
  fs.appendFileSync(dir+'/helper-calls','called\\n');
  if(process.env.NATIVE_DIAGNOSTIC_CLI){
    const r=cp.spawnSync(process.execPath,[process.env.NATIVE_DIAGNOSTIC_CLI,...args],{stdio:['ignore','inherit','inherit']});
    process.exit(r.status??1);
  }
  process.stderr.write('private diagnostic failure must not escape\\n');process.exit(75);
}
if(process.env.CASE_MODE==='held'){
  process.stdin.once('data',()=>{process.stdout.write('held-input-returned\\n');process.exit(9);});
}else{
  let n=1;try{n=Number(fs.readFileSync(dir+'/count','utf8'))+1;}catch{}
  fs.writeFileSync(dir+'/count',String(n));
  const input=fs.readFileSync(0,'utf8');
  fs.appendFileSync(dir+'/calls',JSON.stringify({n,args,input,ns:process.hrtime.bigint().toString(),context:process.env.TC_DIAGNOSTICS_CONTEXT})+'\\n');
  process.stdout.write('out-'+n+'\\n');
  if(process.env.CASE_MODE==='retry'&&n<3){process.stderr.write('NETWORK_ERROR discarded-'+n+'\\n\\n');process.exit(7);}
  if(process.env.CASE_MODE!=='success')process.stderr.write('final-warning\\n\\n');
  process.exit(process.env.CASE_MODE==='success'?0:7);
}
`;

async function fixture() {
  const home = await mkdtemp(join(tmpdir(), "tc-wrapper-diagnostic-"));
  const wrapper = join(home, "copied wrapper");
  const cli = join(home, "synthetic cli");
  await copyFile(join(root, "skills/tc-apps/tc-wrapper.sh"), wrapper);
  await writeFile(cli, childSource, { mode: 0o700 });
  await writeFile(join(home, "cli-path"), cli, { mode: 0o600 });
  return { home, wrapper, env: { HOME: home, TC_HOME: join(home, "profiles"), TC_DIAGNOSTICS_HOME: join(home, "history"), PATH: process.env.PATH, NO_COLOR: "1" } };
}
async function runWrapper(f, shell, args, { mode = "failure", context, input = "", directory = f.home, held = false, native = false } = {}) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const proc = spawn(shell, [f.wrapper, ...args], { env: { ...f.env, CASE_DIRECTORY: directory, CASE_MODE: mode,
    ...(context ? { TC_DIAGNOSTICS_CONTEXT: JSON.stringify(context) } : {}),
    ...(native ? { NATIVE_DIAGNOSTIC_CLI: nativeCli } : {}),
  }, stdio: ["pipe", "pipe", "pipe"] });
  const out = [], err = [];
  proc.stdout.on("data", (data) => out.push(data));
  proc.stderr.on("data", (data) => err.push(data));
  proc.stdin.on("error", () => {});
  proc.stdin.write(input);
  if (!held) proc.stdin.end();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; proc.kill("SIGKILL"); }, 14000);
  const result = await new Promise((resolve, reject) => {
    proc.once("error", reject);
    proc.once("close", (code, signal) => resolve({ code, signal, stdout: Buffer.concat(out).toString(), stderr: Buffer.concat(err).toString() }));
  });
  clearTimeout(timer); proc.stdin.destroy();
  assert.equal(timedOut, false, "wrapper failed to preserve bounded fixture completion");
  return result;
}
async function calls(directory) {
  return (await readFile(join(directory, "calls"), "utf8")).trim().split("\n").map((line) => JSON.parse(line));
}

for (const shell of ["dash", "bash"]) {
  test(`${shell}: actual retries retain normalized stdin, argument order, each stdout and final-only stderr`, { timeout: 16000 }, async () => {
    const f = await fixture();
    try {
      const args = ["kv", "put", "synthetic key", "--stdin", "--profile", "named profile"];
      const result = await runWrapper(f, shell, args, { mode: "retry", input: "alpha\n\n", context: { version: 1, scope: "tc-apps", run_id: randomUUID() } });
      assert.deepEqual(result, { code: 7, signal: null, stdout: "out-1\nout-2\nout-3\n", stderr: "final-warning\n" });
      const observed = await calls(f.home);
      assert.deepEqual(observed.map(({ args: actual, input }) => ({ args: actual, input })), [1, 2, 3].map(() => ({ args, input: "alpha\n" })));
      assert(Number(BigInt(observed[1].ns) - BigInt(observed[0].ns)) / 1e6 >= 1900);
      assert(Number(BigInt(observed[2].ns) - BigInt(observed[1].ns)) / 1e6 >= 3900);
      assert.equal(await readFile(join(f.home, "helper-input"), "utf8"), "");
    } finally { await rm(f.home, { recursive: true, force: true }); }
  });
  test(`${shell}: leading options bypass retries and non-KV exec does not wait for stdin EOF`, async () => {
    const f = await fixture();
    try {
      const context = { version: 1, scope: "tc-apps", run_id: randomUUID() };
      const result = await runWrapper(f, shell, ["--profile", "named", "kv", "get"], { mode: "retry", input: "unchanged\n\n", context });
      assert.equal(result.code, 7);
      assert.equal(result.stdout, "out-1\n");
      assert.equal(result.stderr, "NETWORK_ERROR discarded-1\n\n");
      assert.equal((await calls(f.home))[0].input, "unchanged\n\n");
      const held = await runWrapper(f, shell, ["auth", "login"], { mode: "held", input: "line\n", held: true, context });
      assert.deepEqual(held, { code: 9, signal: null, stdout: "held-input-returned\n", stderr: "" });
      await assert.rejects(readFile(join(f.home, "helper-calls")), { code: "ENOENT" });
    } finally { await rm(f.home, { recursive: true, force: true }); }
  });
}

test("run attribution alone starts no wrapper helper and no --stdin still supplies one newline", async () => {
  const f = await fixture();
  try {
    const result = await runWrapper(f, "dash", ["sql", "query", "synthetic"], { mode: "success", input: "discarded", context: { version: 1, run_id: randomUUID() } });
    assert.deepEqual(result, { code: 0, signal: null, stdout: "out-1\n", stderr: "" });
    assert.equal((await calls(f.home))[0].input, "\n");
    await assert.rejects(readFile(join(f.home, "helper-calls")), { code: "ENOENT" });
  } finally { await rm(f.home, { recursive: true, force: true }); }
});

test("installed native channel isolates eight wrapper children across two runs", { skip: !nativeCli, timeout: 30000 }, async () => {
  const f = await fixture();
  try {
    await exec(process.execPath, [nativeCli, "diagnostics", "enable", "--scope", "tc-apps"], { env: f.env });
    const runs = [randomUUID(), randomUUID()], workflows = [randomUUID(), randomUUID()];
    const children = await Promise.all(Array.from({ length: 8 }, async (_, index) => {
      const run = index % 2, directory = join(f.home, `child-${index}`);
      const result = await runWrapper(f, index % 2 ? "bash" : "dash", ["kv", "get", "synthetic"], {
        mode: "success", native: true, directory, context: { version: 1, scope: "tc-apps", run_id: runs[run], workflow_id: workflows[run] },
      });
      assert.deepEqual(result, { code: 0, signal: null, stdout: "out-1\n", stderr: "" });
      const observation = (await calls(directory))[0];
      return { ...JSON.parse(observation.context), run };
    }));
    assert.equal(new Set(children.map((item) => item.wrapper_id)).size, 8);
    assert.equal(new Set(children.map((item) => item.parent_id)).size, 8);
    for (const item of children) {
      assert.equal(item.run_id, runs[item.run]); assert.equal(item.workflow_id, workflows[item.run]); assert.equal(item.child_ordinal, 1);
    }
    const selection = join(f.home, "selection.json");
    await writeFile(selection, JSON.stringify({ all: true }), { mode: 0o600 });
    const report = JSON.parse((await exec(process.execPath, [nativeCli, "diagnostics", "review", "--selection", selection, "--json"], { env: f.env })).stdout);
    assert.equal(report.invocations.length, 8);
    assert(report.invocations.every((item) => item.start === "observed" && item.finish === "observed" && item.business === "not_applicable"),
      JSON.stringify({ coverage: report.coverage, invocations: report.invocations, retries: report.retries }));
    assert.deepEqual(report.retries.find((item) => item.layer === "wrapper_child"), { layer: "wrapper_child", starts: 8, finishes: 8, scheduled_retries: 0, scheduled_delay_ms: 0, unfinished_attempts: 0 });
    assert.deepEqual(report.partial_order.cyclic_or_conflicting_event_ids, []);
    assert.equal(report.timeline.some((item) => JSON.stringify(item.event).includes("synthetic")), false);
  } finally { await rm(f.home, { recursive: true, force: true }); }
});
