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

// The Secrets link check (SKILL.md §3d), run as written against sealed requests made with the CLI's own link library.
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
const skill = read("skills/tc-secrets/SKILL.md");
const check = skill.split("**3d. Check the link before you send it.**")[1].split("```sh\n")[1].split("\n```\n")[0]
  .replace("NAMES='<SECRET_NAME …>'", "NAMES='OPENAI_API_KEY'");
let runs = 0;
function runCheck(jwk, stderr, { state } = {}) {
  state ??= join(work, `state-${++runs}`);
  mkdirSync(state, { recursive: true, mode: 0o700 });
  writeFileSync(join(state, "login.err"), stderr);
  writeFileSync(join(state, "context.json"), JSON.stringify({ sessionDid: `${links.signerFromJwk(jwk).did}#key`, host: HOST }));
  const env = { PATH: process.env.PATH, HOME: join(work, "home"), TC_BIN: join(root, "node_modules/.bin/tinycloud"), TC_OWNER_DID: OWNER,
    TC_SECRETS_STATE: state, TC_LINKS_API_ORIGIN: API, NODE_OPTIONS: `--require ${preload}` };
  const out = spawnSync("sh", ["-c", check], { env, encoding: "utf8", timeout: 60000 });
  let approved = "";
  try { approved = readFileSync(join(state, "approve.url"), "utf8"); } catch {}
  return { result: out.stdout.trim().split("\n").at(-1), approved, state, stderr: out.stderr };
}

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
