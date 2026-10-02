import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const transport = await import("../lib/login.mjs").catch(() => ({}));

test("authorization input normalizes JSON/base64 without accepting malformed or oversized input", () => {
  assert.equal(typeof transport.responseInput, "function");
  const value = { authorization: "synthetic-only", note: "$(do-not-execute)" };
  for (const input of [JSON.stringify(value, null, 2), Buffer.from(JSON.stringify(value)).toString("base64")]) {
    assert.equal(transport.responseInput(` \n${input}\n `), JSON.stringify(value) + "\n");
  }
  for (const invalid of ["eyJ...TRUNCATED", "[]", "null", "A".repeat(1024 * 1024 + 1)]) {
    assert.throws(() => transport.responseInput(invalid), { code: "INVALID_AUTH_RESPONSE" });
  }
});

async function fixture(t) {
  assert.equal(typeof transport.runLogin, "function");
  const directory = await mkdtemp(join(tmpdir(), "tc-signin-transport-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const executable = join(directory, "tc");
  const record = join(directory, "synthetic-input.json");
  const authorizationUrl = "https://openkey.example.test/delegate?space=applications&note=%24%28not-shell%29";
  await writeFile(executable, `#!${process.execPath}
import { writeFileSync } from 'node:fs';
process.stderr.write('Open this URL in a browser to authenticate:\\n\\n  ${authorizationUrl}\\n\\nPaste delegation code: ');
let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>input+=chunk);
process.stdin.on('end',()=>{
  writeFileSync(process.env.TC_HOME,JSON.stringify({input,args:process.argv.slice(2)}));
  if (process.env.REJECT) { console.error(JSON.stringify({error:{code:process.env.REJECT,message:'PRIVATE '+input}}));process.exitCode=3; }
  else console.log(JSON.stringify({...JSON.parse(process.env.RESULT || '{}'),privateOutput:input}));
});
`, { mode: 0o700 });
  return { executable, record, authorizationUrl, env: { TC_HOME: record } };
}

test("official CLI receives the exact response only on stdin using the supplied TC_HOME", async t => {
  const f = await fixture(t);
  const input = transport.responseInput(JSON.stringify({ authorization: "SYNTHETIC_SECRET", note: "`not-shell`" }));
  assert.equal(await transport.runLogin(["auth", "login", "--manifest", "/synthetic/manifest.json"], { executable: f.executable, env: f.env, input }), undefined);
  const recorded = JSON.parse(await readFile(f.record, "utf8"));
  assert.equal(recorded.input, input);
  assert.deepEqual(recorded.args, ["auth", "login", "--manifest", "/synthetic/manifest.json", "--paste"]);
  assert.ok(!recorded.args.join(" ").includes("SYNTHETIC_SECRET"));
});

test("URL acquisition stops the waiting CLI and preserves its opaque URL", async t => {
  const f = await fixture(t);
  assert.equal(await transport.runLogin(["auth", "login"], { executable: f.executable, env: f.env }), f.authorizationUrl);
  await assert.rejects(readFile(f.record), { code: "ENOENT" });
});

test("CLI failures preserve known codes without leaking private subprocess output", async t => {
  const f = await fixture(t);
  for (const [reject, expected] of [["OPENKEY_OWNER_MISMATCH", "OWNER_MISMATCH"], ["OPENKEY_SCOPE_MISMATCH", "OPENKEY_SCOPE_MISMATCH"], ["OPENKEY_SCOPE_INCOMPLETE", "OPENKEY_SCOPE_INCOMPLETE"], ["UNKNOWN_PRIVATE_CODE", "AUTH_RESPONSE_REJECTED"]]) {
    await assert.rejects(transport.runLogin(["auth", "login"], { executable: f.executable, env: { ...f.env, REJECT: reject }, input: '{"authorization":"SYNTHETIC_SECRET"}\n' }), error => {
      assert.equal(error.code, expected);
      assert.ok(!error.message.includes("SYNTHETIC_SECRET"));
      assert.ok(!error.message.includes("PRIVATE"));
      return true;
    });
  }
});

for (const selectionFlag of ['--discover-app-read', '--app-read-selection']) test(`selected app transport returns only safe verified scope (${selectionFlag})`, async t => {
  const f = await fixture(t);
  const owner = 'did:pkh:eip155:1:0x1111111111111111111111111111111111111111';
  const permissions = [{ service: 'tinycloud.sql', space: `tinycloud:${owner.slice(4)}:applications`, path: 'health', actions: ['tinycloud.sql/read'] }];
  const appReadSelection = { schemaVersion: 1, protocolVersion: 1, appId: 'health-records', ownerDid: owner, host: 'https://node.tinycloud.xyz', clientKeyDigest: 'a'.repeat(64), manifestHash: 'b'.repeat(16), selectionDigest: 'c'.repeat(64), permissions };
  const result = await transport.runLogin(['--json', 'auth', 'login', selectionFlag], { executable: f.executable, env: { ...f.env, RESULT: JSON.stringify({ appReadSelection: { ...appReadSelection, signature: 'PRIVATE' }, permissions, jwk: { d: 'PRIVATE' } }) }, input: '{"signature":"SYNTHETIC_SECRET"}\n' });
  assert.deepEqual(result, { appReadSelection, permissions });
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
  assert.equal(JSON.stringify(result).includes('SYNTHETIC_SECRET'), false);
});

test('discovery transport rejects success without a complete safe app receipt', async t => {
  const f = await fixture(t);
  await assert.rejects(() => transport.runLogin(['--json', 'auth', 'login', '--discover-app-read'], { executable: f.executable, env: f.env, input: '{}\n' }), { code: 'AUTH_RECEIPT_INVALID' });
});

test('unsupported CLI flag is a startup diagnostic, never a rejected proof', async t => {
  const f = await fixture(t);
  await writeFile(f.executable, `#!${process.execPath}\nconsole.error("error: unknown option '--discover-app-read'"); console.error('PRIVATE_CLI_OUTPUT'); process.exitCode=1;\n`, { mode: 0o700 });
  await assert.rejects(transport.runLogin(['auth', 'login', '--discover-app-read'], { executable: f.executable, env: f.env }), error => {
    assert.equal(error.code, 'CLI_ARGUMENT_INVALID'); assert.equal(error.phase, 'acquire');
    assert.equal(error.cliPath, f.executable); assert.match(error.message, /unknown option '--discover-app-read'/);
    assert.doesNotMatch(JSON.stringify(error) + error.message, /PRIVATE_CLI_OUTPUT/); return true;
  });
});
test('unknown acquisition failure is classified as startup; known deployment incompatibility survives', async t => {
  const f = await fixture(t);
  await writeFile(f.executable, `#!${process.execPath}\nconsole.error(process.env.FAILURE); process.exitCode=1;\n`, { mode: 0o700 });
  for (const [output, expected] of [['PRIVATE_FAILURE', 'CLI_STARTUP_FAILED'], [JSON.stringify({ error: { code: 'OPENKEY_DEPLOYMENT_INCOMPATIBLE', message: 'PRIVATE' } }), 'OPENKEY_DEPLOYMENT_INCOMPATIBLE']]) {
    await assert.rejects(transport.runLogin(['auth', 'login'], { executable: f.executable, env: { FAILURE: output } }), error => {
      assert.equal(error.code, expected); assert.doesNotMatch(error.message, /PRIVATE/); return true;
    });
  }
});
