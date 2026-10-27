// Opt-in real CLI -> local node -> Health Log browser test. All identities are throwaway.
// TC_HEALTHLOG_SAMPLE: app-kit examples/sample-healthlog (run npm ci there first).
// TC_CLI_BIN: guide-pinned tinycloud CLI; TC_NODE_BIN: native node binary.
// TC_PLAYWRIGHT_MODULE: Playwright index.mjs; TC_CHROMIUM_BIN: installed Chromium.
// TMPDIR=/var/tmp keeps the sample's throwaway node under /var/tmp too.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { test } from "node:test";

const required = ["TC_HEALTHLOG_SAMPLE", "TC_CLI_BIN", "TC_NODE_BIN", "TC_PLAYWRIGHT_MODULE", "TC_CHROMIUM_BIN"];
const missing = required.filter((key) => !process.env[key]);
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("agent meals use the intended owner and owner day, and agree with the page after reload", {
  skip: missing.length ? `local fixtures required: ${missing.join(", ")}` : false,
  timeout: 180000,
}, async () => {
  const sample = process.env.TC_HEALTHLOG_SAMPLE;
  const cliBin = process.env.TC_CLI_BIN;
  const root = await mkdtemp("/var/tmp/tc-2174-test.");
  await chmod(root, 0o700);
  const env = { PATH: process.env.PATH, TC_HOME: root, TC_APPS_STATE: join(root, "state"), TZ: "UTC", NO_COLOR: "1" };
  await mkdir(env.TC_APPS_STATE);
  await mkdir(join(root, "wrapper"));
  const wrapper = join(root, "wrapper/tinycloud");
  await copyFile(join(repo, "skills/tc-apps/tc-wrapper.sh"), wrapper);
  await chmod(wrapper, 0o755);
  await writeFile(join(root, "wrapper/cli-path"), cliBin + "\n");
  const fromSample = (path) => import(pathToFileURL(join(sample, path)).href);
  const { startNode } = await fromSample("tests/lib/node.mjs");
  const { connect } = await fromSample("dev/shim.mjs");
  const { loadApp } = await fromSample("dev/build.mjs");
  const { TinyCloudNode } = await fromSample("node_modules/@tinycloud/node-sdk/dist/index.js");
  const { build } = await fromSample("node_modules/esbuild/lib/main.js");
  const { chromium } = await import(pathToFileURL(process.env.TC_PLAYWRIGHT_MODULE).href);
  const manifest = JSON.parse(await readFile(join(sample, "manifest.json"), "utf8"));
  const schema = await readFile(join(sample, "schema.sql"), "utf8");
  const db = `${manifest.app_id}/healthlog`;
  const docs = await readFile(join(repo, "skills/tc-apps/TINY-APPS.md"), "utf8");
  const insert = [...docs.matchAll(/```sh\n([\s\S]*?)\n```/g)].map((m) => m[1]).find((b) => b.includes("INSERT INTO meal"));
  assert.ok(insert, "use the documented meal writer");
  let node, bridge, browser, server;
  const bridges = [];
  const run = (bin, args) => new Promise((resolveCall, reject) => {
    const child = spawn(bin, args, { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", (b) => stdout += b);
    child.stderr.on("data", (b) => stderr += b);
    child.once("error", reject);
    child.once("close", (code) => resolveCall({ code, stdout, stderr }));
  });
  const cli = async (profile, args) => {
    const result = await run(cliBin, ["--host", node.host, "--profile", profile, ...args]);
    assert.equal(result.code, 0, `${args.slice(0, 2).join(" ")}: ${result.stderr}`);
    try { return JSON.parse(result.stdout); } catch { return result.stdout; }
  };
  const writeMeal = async (name, kcal) => {
    const op = randomUUID();
    const values = {
      "<TC_BIN>": wrapper, "<STATE>": env.TC_APPS_STATE,
      "<HEALTHLOG_CONTEXT>": join(repo, "skills/tc-apps/healthlog-context.mjs"),
      "<MARK>": op.replaceAll("-", ""), "<OP_ID>": op,
      "<DAY>": new Date().toISOString().slice(0, 10), "<UTC>": new Date().toISOString(),
      "<SLOT>": "breakfast", "<KCAL>": String(kcal),
      "<the owner's meal name, exactly as typed (line breaks allowed)>": name,
    };
    let block = insert;
    for (const [key, value] of Object.entries(values)) block = block.replaceAll(key, value);
    assert.doesNotMatch(block, /<[A-Z_]+>/, "all command placeholders supplied");
    return run("sh", ["-c", block]);
  };
  try {
    node = await startNode();
    assert.match(node.host, /^http:\/\/127\.0\.0\.1:/);
    env.TC_HOST = node.host;
    const app = await loadApp();
    const owners = {};
    for (const profile of ["page-owner", "other-owner"]) {
      await cli(profile, ["init", "--name", profile, "--key-only"]);
      await cli(profile, ["auth", "login", "--method", "local"]);
      const { spaceId } = await cli(profile, ["space", "create", "applications"]);
      // Only this test's newly generated key is used for its local browser bridge.
      const { privateKey } = JSON.parse(await readFile(join(root, `.tinycloud/profiles/${profile}/profile.json`), "utf8"));
      const installer = new TinyCloudNode({ privateKey, host: node.host, autoCreateSpace: true,
        manifest: { ...manifest, permissions: [{ service: "tinycloud.kv", path: "app/", actions: ["put"] }] } });
      await installer.signIn();
      assert.equal((await installer.kv.put(`${manifest.app_id}/app/schema.sql`, schema)).ok, true);
      bridge = await connect({ manifest, host: node.host, privateKey });
      bridges.push(bridge);
      assert.equal((await app.ensureSchema()).ok, true);
      const { ownerDid } = await cli(profile, ["context", "--json"]);
      owners[profile] = { bridge, ownerDid, spaceId };
      await cli(profile, ["auth", "request", "--cap", "tinycloud.kv:applications::get,list,put,del", "--cap", "tinycloud.sql:applications::read,write,schema,admin", "--grant", "--yes"]);
    }
    await cli("agent-meal", ["profile", "create", "agent-meal", "--posture", "delegate-session", "--operator", "agent"]);
    const req = join(env.TC_APPS_STATE, "meal-request.json"), grant = join(env.TC_APPS_STATE, "meal-grant.json");
    await cli("agent-meal", ["auth", "request", "--preset", "apps-agent", "--write", "--app", manifest.app_id, "--emit", req]);
    const importGrant = async (profile) => {
      const result = await run(cliBin, ["--host", node.host, "--profile", profile, "auth", "grant", req, "--yes"]);
      assert.equal(result.code, 0, result.stderr);
      await writeFile(grant, result.stdout, { mode: 0o600 });
      await cli("agent-meal", ["auth", "import", grant]);
      const context = await cli("agent-meal", ["context", "--json"]);
      await writeFile(join(env.TC_APPS_STATE, "meal-space.txt"), context.spaceId + "\n");
      assert.equal(context.spaceId, owners[profile].spaceId);
    };
    await importGrant("other-owner");
    env.TC_APPS_OWNER_DID = owners["page-owner"].ownerDid;
    env.TC_APPS_TIMEZONE = "Pacific/Kiritimati";
    const wrongOwner = await writeMeal("Wrong account must not receive this meal", 600);
    assert.notEqual(wrongOwner.code, 0, "grant B / expected page owner A must stop before INSERT");
    assert.equal(wrongOwner.stderr.trim().split("\n").length, 1);
    assert.match(wrongOwner.stderr, /Ask the owner/);
    assert.deepEqual((await owners["other-owner"].bridge.sql.query("healthlog", "SELECT COUNT(*) FROM meal")).rows, [[0]]);

    // Match the independent expected owner to the grant; host stays UTC.
    env.TC_APPS_OWNER_DID = owners["other-owner"].ownerDid;
    for (const [name, kcal] of [["Eggs and toast", 350], ["Banana and yogurt", 250]]) {
      const result = await writeMeal(name, kcal);
      assert.equal(result.code, 0, result.stderr);
    }
    bridge = owners["other-owner"].bridge;
    const rows = await bridge.sql.query(`/${db}`, "SELECT day, name, kcal, source FROM meal ORDER BY id");
    assert.equal(rows.ok, true);
    assert.equal(rows.rows.length, 2);
    assert.deepEqual(rows.rows.map((r) => r.slice(1)), [["Eggs and toast", 350, "agent"], ["Banana and yogurt", 250, "agent"]]);
    const bundle = await build({ entryPoints: [join(sample, "dev/browser-entry.jsx")], bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
      alias: { "@tinycloud/app": join(sample, "dev/browser-bridge.mjs") }, define: { "process.env.NODE_ENV": '"development"' }, logLevel: "silent" });
    server = createServer(async (req, res) => {
      if (req.url === "/") return res.end('<!doctype html><meta name="bridge-token" content="local-test"><div id="root"></div><script src="/app.js"></script>');
      if (req.url === "/app.js") { res.setHeader("content-type", "text/javascript"); return res.end(bundle.outputFiles[0].text); }
      if (req.url !== "/bridge" || req.headers["x-bridge-token"] !== "local-test") { res.statusCode = 404; return res.end(); }
      let raw = ""; for await (const b of req) raw += b;
      const { op, args: a } = JSON.parse(raw), [svc, fn] = op.split(".");
      let out = svc === "sql" ? await bridge.sql[fn](a.db, a.text, a.params) : await bridge.kv[fn](a.key ?? a.prefix, a.body, a.opts);
      if (out.ok && out.bytes) out = { ...out, bytes: undefined, bytesB64: Buffer.from(out.bytes).toString("base64") };
      res.setHeader("content-type", "application/json"); res.end(JSON.stringify(out));
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    browser = await chromium.launch({ headless: true, executablePath: process.env.TC_CHROMIUM_BIN });
    const context = await browser.newContext({ timezoneId: env.TC_APPS_TIMEZONE });
    const page = await context.newPage();
    const checkPage = async () => {
      await page.locator('[data-testid="today-card"]').waitFor();
      const day = await page.locator('[data-testid="today-day"]').innerText();
      assert.equal(await page.locator('[data-testid="today-kcal"]').innerText(), "600");
      assert.equal(await page.locator('[data-testid="today-meals-count"]').innerText(), "2 meals");
      assert.match(await page.locator('[data-testid="today-meals"]').innerText(), /Eggs and toast/);
      assert.match(await page.locator('[data-testid="today-meals"]').innerText(), /Banana and yogurt/);
      assert.deepEqual(rows.rows.map((r) => r[0]), [day, day]);
      const card = await bridge.sql.query("healthlog", "SELECT kcal, meals FROM day_card WHERE day = ?", [day]);
      assert.deepEqual(card.rows, [[600, 2]]);
      return day;
    };
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const day = await checkPage();
    await page.reload(); await checkPage();
    // The independently signed-in account A remains empty.
    bridge = owners["page-owner"].bridge;
    await page.reload(); await page.locator('[data-testid="today-card"]').waitFor();
    assert.equal(await page.locator('[data-testid="today-kcal"]').innerText(), "0");
    console.log(JSON.stringify({ host: node.host, appId: manifest.app_id, db, table: "meal", view: "day_card", expectedOwner: env.TC_APPS_OWNER_DID, pageSpace: owners["other-owner"].spaceId, hostTimezone: "UTC", ownerTimezone: env.TC_APPS_TIMEZONE, day, meals: 2, kcal: 600, afterReload: true }));
  } finally {
    await browser?.close();
    if (server) await new Promise((r) => server.close(r));
    for (const b of bridges) b.close();
    await node?.stop();
    await rm(root, { recursive: true, force: true });
  }
});
