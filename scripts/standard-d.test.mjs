// Standard D (agent standardization brief, rule 3): one approval loop. Secrets, publish/share and the apps fallbacks
// sign in with a short OpenKey link the CLI collects by itself; the pasted codes left are listed in setup/errors.md,
// each with an owner and an end date.
import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const walk = (dir) => readdirSync(join(root, dir)).flatMap((name) => statSync(join(root, dir, name)).isDirectory() ? walk(`${dir}/${name}`) : [`${dir}/${name}`]);
const AUTHORED = [...walk("setup"), ...walk("skills"), "apps/tinychat/setup.md"].filter((path) => /\.(md|sh|mjs)$/.test(path));
const work = mkdtempSync(join(realpathSync(tmpdir()), "tc-standard-d-"));
after(() => rmSync(work, { recursive: true, force: true }));

// The flows that still take a pasted code, by the files that carry them. Each must be in errors.md's list.
const PASTED = {
  "apps/tinychat/setup.md": "TinyChat's sign-in",
  "setup/courier.md": "Courier's code import",
};
const CODE_ASK = /sends? back the code|send (?:me )?(?:back )?the (?:short )?code|paste (?:it|the code|its code) back|send it back to me here|paste the code here|send me that long code|8-character code|chat code/i;
// A `--paste` that runs: anything but "don't add `--paste`" advice, or `auth grant --paste` (which reads a request file).
const pasteRuns = (line) => /--paste\b/.test(line) && !/(?:do not|don't|never|not) (?:add|use|pass)[^.]*--paste|without `?--paste|\bno `--paste`|explicit `--paste` remains manual|auth grant[^.]*--paste|`--paste` to it/i.test(line);

test("Secrets, publish/share and the apps fallbacks have no pasted code and no `--paste` left", () => {
  const found = [];
  for (const path of [...AUTHORED, "README.md"]) {
    if (path === "setup/errors.md") continue;
    read(path).split("\n").forEach((line, i) => {
      if ((CODE_ASK.test(line) || pasteRuns(line)) && !PASTED[path]) found.push(`${path}:${i + 1}: ${line.trim().slice(0, 140)}`);
    });
  }
  assert.deepEqual(found, []);
  for (const path of ["skills/tc-secrets/SKILL.md", "skills/tc-secrets/QUICKSTART.md", "skills/tc-publish/SKILL.md", "skills/tc-publish/QUICKSTART.md",
    "skills/tc-apps/owner-grant.sh", "skills/tc-apps/LEGACY.md", "skills/tc-apps/LEGACY-SQL.md", "skills/tc-apps/TINY-APPS.md", "skills/tc-apps/announce.sh"]) {
    const text = read(path);
    assert.doesNotMatch(text, /PASTE_CODE_MISSING|DEVICE_AUTH_(?:EXPIRED|DENIED|RATE_LIMITED)|auth login --device|enable share\b|\/delegate\?/, path);
  }
});

test("each moved flow runs the short-link command", () => {
  const has = (path, command) => assert.ok(read(path).includes(command), `${path}: ${command}`);
  has("skills/tc-secrets/SKILL.md", `"$TC_BIN" --profile "$PROFILE" auth login --method openkey --no-popup --manifest "$STATE/manifest.json" --owner "$TC_OWNER_DID" --expiry 30d`);
  has("skills/tc-publish/SKILL.md", `"$TC_BIN" --profile "$PROFILE" auth login --method openkey --no-popup --manifest "$STATE/share-publishing.json" --expiry 30d`);
  has("skills/tc-apps/owner-grant.sh", `init --name "$OWNER_PROFILE" --no-popup`);
  has("skills/tc-apps/owner-grant.sh", `"$TC_BIN" --profile "$OWNER_PROFILE" auth login --method openkey --no-popup`);
  has("skills/tc-apps/LEGACY.md", `"$TC_BIN" auth login --method openkey --no-popup --manifest "$STATE/agent-data.json" --expiry 30d --profile agent-data`);
  has("skills/tc-apps/LEGACY-SQL.md", `"$TC_BIN" auth login --method openkey --no-popup --manifest "$STATE/agent-data-sql.json" --expiry 30d --profile agent-data-sql`);
  // One sign-in in LEGACY-SQL.md, not a link step and a code step.
  assert.equal(read("skills/tc-apps/LEGACY-SQL.md").split("auth login").length - 1, 1);
  // Secrets and publish send the link with the shared ask line, and wait in the same turn.
  for (const path of ["skills/tc-secrets/SKILL.md", "skills/tc-publish/SKILL.md"]) {
    const text = read(path);
    assert.ok(text.includes("> Open this link and approve. I'll carry on as soon as you do."), path);
    assert.match(text, /again each time it prints `WAITING`, without waiting for the owner to reply/, path);
  }
});

test("errors.md lists every remaining pasted code, each with an owner and an end date", () => {
  const errors = read("setup/errors.md");
  const list = errors.split("**Codes the owner still pastes.**")[1];
  assert.ok(list, "the list exists");
  const entries = list.split("\n").filter((line) => line.startsWith("- "));
  assert.deepEqual(entries.map((line) => line.match(/^- \*\*([^*]+)\*\*/)?.[1]).sort(), [...new Set(Object.values(PASTED))].sort());
  for (const entry of entries) {
    assert.match(entry, /\*\*Owner:\*\* \S/, entry);
    assert.match(entry, /\*\*Ends:\*\* \S/, entry);
  }
  const tinychat = entries.find((line) => line.startsWith("- **TinyChat's sign-in**"));
  assert.match(tinychat, /\*\*Owner:\*\* TBD \(Holden and Naomi to name one\)\./);
  assert.match(tinychat, /\*\*Ends:\*\* the next TinyChat pack release\./);
  // The moved flows are gone from the exceptions.
  assert.doesNotMatch(errors, /auth login --paste|auth login --device|PASTE_CODE_MISSING|DEVICE_AUTH|Secrets and publish sign-ins|older apps fallbacks/);
  // Every file that still takes a code is one of the listed flows.
  for (const path of Object.keys(PASTED)) assert.match(read(path), /code/i, path);
});

// The link checks (Secrets §3d, publish §2), run as written against sealed requests made with the CLI's own link library.
// A preload stands in for the links service, so nothing leaves this machine.
const links = createRequire(join(root, "node_modules/@tinycloud/cli/package.json"))("@tinycloud/share-envelope/links");
const OWNER = "did:pkh:eip155:1:0x1111111111111111111111111111111111111111";
const HOST = "https://node.example";
const API = "https://links.test";
const PROMPT = "Approve this request in OpenKey (open the complete link):";
const records = join(work, "records");
mkdirSync(records);
const preload = join(work, "fake-links.cjs");
writeFileSync(preload, `const fs = require("fs");
globalThis.fetch = async (url, init = {}) => {
  const m = /^https:\\/\\/links\\.test\\/v1\\/links\\/([a-z2-7]{26})$/.exec(String(url));
  if (!m || (init.method ?? "GET") !== "GET") throw new TypeError("fetch failed");
  let rec;
  try { rec = JSON.parse(fs.readFileSync(${JSON.stringify(records)} + "/" + m[1] + ".json", "utf8")); } catch { return new Response(null, { status: 404 }); }
  return new Response(Buffer.from(rec.body, "base64url"), { status: 200, headers: { "content-type": "application/octet-stream", "x-link-record": rec.head } });
};
`);
const canon = (v) => Array.isArray(v) ? `[${v.map(canon).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}` : JSON.stringify(v);
const newKey = () => generateKeyPairSync("ed25519").privateKey.export({ format: "jwk" });
const permissions = (names) => [
  ...names.map((n) => ({ service: "tinycloud.kv", space: "secrets", path: `vault/secrets/${n}`, actions: ["tinycloud.kv/get"] })),
  { service: "tinycloud.encryption", space: "encryption", path: `urn:tinycloud:encryption:${OWNER}:default`, actions: ["tinycloud.encryption/decrypt"] },
  { service: "tinycloud.capabilities", space: "secrets", path: "", actions: ["tinycloud.capabilities/read"] },
];
async function sealedLink(jwk, { perms = permissions(["OPENAI_API_KEY"]), host = HOST, lifetime = 2592000 } = {}) {
  const signer = links.signerFromJwk(jwk);
  const relay = generateKeyPairSync("ec", { namedCurve: "P-256" }).publicKey.export({ format: "jwk" });
  const request = { issuer: signer.did, requestVersion: 1, targetDid: signer.did, targetPublicJwk: { kty: "OKP", crv: "Ed25519", x: jwk.x },
    nodeOrigin: host, permissions: perms, grantLifetimeSeconds: lifetime, resultEncryptionPublicJwk: { kty: "EC", crv: "P-256", x: relay.x, y: relay.y } };
  const id = [...randomBytes(26)].map((b) => "abcdefghijklmnopqrstuvwxyz234567"[b % 32]).join("");
  const created = await links.createApprovalRequest({ request, issuerKey: signer, apiOrigin: API, openkeyOrigin: "https://openkey.so",
    fetch: async (_url, init) => {
      const record = JSON.parse(init.body);
      writeFileSync(join(records, `${id}.json`), JSON.stringify({ head: Buffer.from(canon({ header: record.header, signature: record.signature })).toString("base64url"), body: record.body }));
      return new Response(JSON.stringify({ id, expiresAt: record.header.expiresAt }), { status: 201, headers: { "content-type": "application/json" } });
    } });
  return created.link;
}
const block = (path, marker) => read(path).split(marker)[1].split("```sh\n")[1].split("\n```\n")[0];
const publishSkill = read("skills/tc-publish/SKILL.md");
const PUBLISH_LIST = publishSkill.split(`cat > "$STATE/share-publishing.json" <<'JSON'\n`)[1].split("\nJSON\n")[0];
const publishPermissions = (space = "default") => JSON.parse(PUBLISH_LIST).permissions.map(({ service, path, actions }) => ({ service, space, path, actions }));
const CHECKS = {
  secrets: { script: block("skills/tc-secrets/SKILL.md", "**3d. Check the link before you send it.**").replace("NAMES='<SECRET_NAME …>'", "NAMES='OPENAI_API_KEY'"), stateVar: "TC_SECRETS_STATE", ok: "APPROVAL_READY" },
  publish: { script: block("skills/tc-publish/SKILL.md", "**Check the link before you send it.**"), stateVar: "TC_PUBLISH_STATE", ok: "APPROVE_URL_SAVED" },
};
let runs = 0;
function runCheck(jwk, stderr, { state, flow = "secrets", ownerDid = null } = {}) {
  const { script, stateVar } = CHECKS[flow];
  state ??= join(work, `state-${++runs}`);
  mkdirSync(state, { recursive: true, mode: 0o700 });
  writeFileSync(join(state, "login.err"), stderr);
  writeFileSync(join(state, "context.json"), JSON.stringify({ sessionDid: `${links.signerFromJwk(jwk).did}#key`, host: HOST, ownerDid }));
  if (flow === "publish") writeFileSync(join(state, "share-publishing.json"), PUBLISH_LIST);
  const env = { PATH: process.env.PATH, HOME: join(work, "home"), TC_BIN: join(root, "node_modules/.bin/tinycloud"), TC_OWNER_DID: OWNER,
    [stateVar]: state, TC_LINKS_API_ORIGIN: API, NODE_OPTIONS: `--require ${preload}` };
  const out = spawnSync("sh", ["-c", script], { env, encoding: "utf8", timeout: 60000 });
  let approved = "";
  try { approved = readFileSync(join(state, "approve.url"), "utf8"); } catch {}
  return { result: out.stdout.trim().split("\n").at(-1), approved, state, stderr: out.stderr };
}

// Both checks: the sign-in's own link passes; links from anywhere else, or from another key, don't.
for (const flow of ["secrets", "publish"]) {
  test(`the ${flow} link check takes only this sign-in's own short link, made by this profile's key`, async () => {
    const { ok: OK } = CHECKS[flow];
    const perms = flow === "secrets" ? permissions(["OPENAI_API_KEY"]) : publishPermissions();
    const key = newKey();
    const link = await sealedLink(key, { perms });
    const first = runCheck(key, `${PROMPT}\n${link}\n\n`, { flow });
    assert.equal(first.result, `${OK} NEW_LINK`, first.stderr);
    assert.equal(first.approved, link);
    assert.equal(runCheck(key, `${PROMPT}\n${link}\n`, { flow, state: first.state }).result, `${OK} SAME_LINK`);
    for (const other of ["https://openkey.so/delegate?did=did:key:z6Mk&permissions=e30", link.replace("https://openkey.so/a/", "https://openkey.example/a/")]) {
      const r = runCheck(key, `${PROMPT}\n${other}\n`, { flow });
      assert.equal(r.result, "REQUEST_MISMATCH not a short OpenKey link", other);
      assert.equal(r.approved, "");
    }
    assert.equal(runCheck(key, `${link}\n`, { flow }).result, "NO_URL");
    assert.equal(runCheck(key, `${PROMPT}\n${link}\nSee https://openkey.so/a/other\n`, { flow }).result, "REQUEST_MISMATCH more than one link");
    // A different profile's link: right shape and permissions, another key.
    assert.equal(runCheck(key, `${PROMPT}\n${await sealedLink(newKey(), { perms })}\n`, { flow }).result, "REQUEST_MISMATCH link is for another key");
    // A foreign /a/ link: an id the links service doesn't know.
    assert.match(runCheck(key, `${PROMPT}\n${link.replace(/\/a\/[a-z2-7]{26}/, "/a/aaaaaaaaaaaaaaaaaaaaaaaaaa")}\n`, { flow }).result, /^REQUEST_MISMATCH the sealed request doesn't open \(gone\)/);
    assert.equal(runCheck(key, `${PROMPT}\n${await sealedLink(key, { perms, host: "https://evil.example" })}\n`, { flow }).result, "REQUEST_MISMATCH link is for another node");
  });
}

test("the publish link check requires exactly the publishing list, in the profile's default space", async () => {
  const key = newKey();
  const run = async (options, ownerDid = null) => runCheck(key, `${PROMPT}\n${await sealedLink(key, options)}\n`, { flow: "publish", ownerDid }).result;
  // A foreign /a/ link this key made for something else: the Secrets request.
  assert.equal(await run({ perms: permissions(["OPENAI_API_KEY"]) }), "REQUEST_MISMATCH entry outside the profile's default space");
  assert.equal(await run({ perms: publishPermissions().slice(1) }), "REQUEST_MISMATCH requested permissions differ from the publishing list");
  assert.equal(await run({ perms: [...publishPermissions(), { service: "tinycloud.kv", space: "default", path: "", actions: ["tinycloud.kv/get"] }] }), "REQUEST_MISMATCH requested permissions differ from the publishing list");
  assert.equal(await run({ perms: publishPermissions(), lifetime: 2592001 }), "REQUEST_MISMATCH lifetime over 30 days");
  // A profile with a recorded owner may name its default space in full, but only that owner's.
  const full = (addr) => `tinycloud:pkh:eip155:1:${addr}:default`;
  assert.equal(await run({ perms: publishPermissions(full("0x1111111111111111111111111111111111111111")) }, OWNER), "APPROVE_URL_SAVED NEW_LINK");
  assert.equal(await run({ perms: publishPermissions(full("0x2222222222222222222222222222222222222222")) }, OWNER), "REQUEST_MISMATCH entry outside the profile's default space");
});

// An operator's older CLI (§1 TC_OLDER, or CLI_LEGACY) can read with an existing grant but can't make a short-link
// sign-in: §3b stops before writing anything, with the TC_OLDER notice, and never falls back to a pasted code.
test("Secrets §3b stops a sign-in on an operator CLI older than 1.6.0, and §1 says reads keep working", () => {
  const build = block("skills/tc-secrets/SKILL.md", "**3b. Build the request.**").replace("NAMES='<SECRET_NAME …>'", "NAMES='OPENAI_API_KEY'");
  const fake = (version) => {
    const bin = join(work, `fake-${version}`);
    writeFileSync(bin, `#!/bin/sh\ncase "$*" in\n  --version) echo ${version} ;;\n  *"context --json"*) echo '{"sessionDid":"did:key:z6Mk#z6Mk","host":"${HOST}"}' ;;\n  *) exit 9 ;;\nesac\n`, { mode: 0o700 });
    return bin;
  };
  for (const [version, expected] of [["1.5.1", "SIGNIN_TC_OLDER"], ["1.0.0-beta.23", "SIGNIN_TC_OLDER"], ["1.6.0-beta.3", "SIGNIN_TC_OLDER"], ["1.6.0", "REQUEST_READY"], ["1.7.0", "REQUEST_READY"]]) {
    const state = join(work, `build-${version}`);
    const env = { PATH: process.env.PATH, HOME: join(work, "home"), TC_BIN: fake(version), TC_OWNER_DID: OWNER, TC_SECRETS_STATE: state };
    const out = spawnSync("sh", ["-c", build], { env, encoding: "utf8" });
    assert.ok(out.stdout.trim().startsWith(expected), `${version}: ${out.stdout}${out.stderr}`);
    const wrote = ["manifest.json", "signin.sh"].filter((f) => { try { return statSync(join(state, f)).isFile(); } catch { return false; } });
    assert.deepEqual(wrote, expected === "REQUEST_READY" ? ["manifest.json", "signin.sh"] : [], version);
  }
  const skill = read("skills/tc-secrets/SKILL.md");
  for (const state of ["`CLI_LEGACY` →", "`TC_OLDER <version> <path>` →"]) {
    const line = skill.split("\n").find((l) => l.startsWith(`- ${state}`));
    assert.match(line, /SIGNIN_TC_OLDER/, state);
    assert.doesNotMatch(line, /Everything still works/, state);
  }
  assert.match(skill, /`SIGNIN_TC_OLDER <version> <path>` → .*tell the owner in one line that the CLI is older than the required `1\.6\.0`, and stop\./);
  assert.match(skill.split("**3d. Check the link")[1].split("**3e.")[0], /§1 printed `TC_OLDER` or `CLI_LEGACY`/);
});

test("the Secrets link check accepts this sign-in's own short link, and only that", async () => {
  const key = newKey();
  const link = await sealedLink(key);
  const ok = runCheck(key, `${PROMPT}\n${link}\n\n`);
  assert.equal(ok.result, "APPROVAL_READY NEW_LINK", ok.stderr);
  assert.equal(ok.approved, link);
  // A rerun that prints the same link (a resumed sign-in) says so, so it isn't sent twice.
  assert.equal(runCheck(key, `${PROMPT}\n${link}\n`, { state: ok.state }).result, "APPROVAL_READY SAME_LINK");

  // Not a short link: the old long /delegate link, or another site.
  for (const other of ["https://openkey.so/delegate?did=did:key:z6Mk&permissions=e30", link.replace("https://openkey.so/a/", "https://openkey.example/a/"), `${link}&x=1`]) {
    const r = runCheck(key, `${PROMPT}\n${other}\n`);
    assert.equal(r.result, "REQUEST_MISMATCH not a short OpenKey link", other);
    assert.equal(r.approved, "");
  }
  // Not printed by this sign-in: no CLI prompt before it, or a second link beside it.
  assert.equal(runCheck(key, `${link}\n`).result, "NO_URL");
  assert.equal(runCheck(key, `Open this link: ${link}\n${link}\n`).result, "NO_URL");
  assert.equal(runCheck(key, `${PROMPT}\n${link}\nSee https://openkey.so/a/other\n`).result, "REQUEST_MISMATCH more than one link");
  // Another profile's link (another key made it), even with the right shape and permissions.
  const other = await sealedLink(newKey());
  assert.equal(runCheck(key, `${PROMPT}\n${other}\n`).result, "REQUEST_MISMATCH link is for another key");
  // A forged link: another link's key or hash, or an id the links service doesn't know.
  const [, k] = other.match(/&k=([^&]+)/);
  assert.match(runCheck(key, `${PROMPT}\n${link.replace(/&k=[^&]+/, `&k=${k}`)}\n`).result, /^REQUEST_MISMATCH the sealed request doesn't open/);
  assert.match(runCheck(key, `${PROMPT}\n${link.replace(/&c=[^&]+/, other.match(/&c=[^&]+/)[0])}\n`).result, /^REQUEST_MISMATCH the sealed request doesn't open/);
  assert.match(runCheck(key, `${PROMPT}\n${link.replace(/\/a\/[a-z2-7]{26}/, "/a/aaaaaaaaaaaaaaaaaaaaaaaaaa")}\n`).result, /^REQUEST_MISMATCH the sealed request doesn't open \(gone\)/);
  // The right key, but not what §3b built.
  const wrong = [
    [{ perms: permissions(["OPENAI_API_KEY", "GITHUB_TOKEN"]) }, "requested permissions differ from the named secrets"],
    [{ perms: [...permissions(["OPENAI_API_KEY"]), { service: "tinycloud.kv", space: "default", path: "", actions: ["tinycloud.kv/get"] }] }, "entry outside the owner's secrets space"],
    [{ host: "https://evil.example" }, "link is for another node"],
    [{ lifetime: 2592001 }, "lifetime over 30 days"],
  ];
  for (const [options, why] of wrong) assert.equal(runCheck(key, `${PROMPT}\n${await sealedLink(key, options)}\n`).result, `REQUEST_MISMATCH ${why}`);
});
