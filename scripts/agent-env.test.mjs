import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";

const script = new URL("./agent-env.mjs", import.meta.url).pathname;
const homes = [];
const owner = "did:pkh:eip155:1:0xd559CCd9EB87c530A9a349262669386dE93cf412";
const fresh = () => {
  const home = mkdtempSync(join(realpathSync(tmpdir()), "tc-agent-env-"));
  homes.push(home);
  return home;
};
const run = (home, args, extra = {}) => spawnSync(process.execPath, [script, ...args], {
  encoding: "utf8",
  env: { HOME: home, PATH: process.env.PATH, ...extra },
});
afterEach(() => { for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true }); });

test("operator defaults are data, and process values take precedence", () => {
  const home = fresh();
  const path = join(home, ".config/tinycloud/agent.env");
  assert.equal(run(home, ["set", "TC_OWNER_DID", owner]).status, 0);
  assert.equal(run(home, ["set", "TC_OWNER_EMAIL", "owner@example.com"]).status, 0);
  assert.equal(run(home, ["get", "TC_OWNER_DID"]).stdout.trim(), owner);
  assert.equal(run(home, ["get", "TC_OWNER_EMAIL"], { TC_OWNER_EMAIL: "other@example.com" }).stdout.trim(), "other@example.com");
  assert.equal(statSync(join(home, ".config/tinycloud")).mode & 0o777, 0o700);
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.equal(readFileSync(path, "utf8"), `TC_OWNER_DID=${owner}\nTC_OWNER_EMAIL=owner@example.com\n`);
});

test("malicious and unknown lines neither execute nor leak their values", () => {
  const home = fresh();
  const dir = join(home, ".config/tinycloud");
  mkdirSync(dir, { recursive: true });
  const marker = join(home, "executed");
  writeFileSync(join(dir, "agent.env"), `TC_OWNER_DID=${owner}\nTC_BIN=$(touch ${marker})\nTC_OWNER_EMAIL=\`touch ${marker}\`\nELEVENLABS_API_KEY=private-canary\nTC_OWNER_DID=\${INJECTED}\n`, { mode: 0o600 });
  const result = run(home, ["get", "TC_BIN"]);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(existsSync(marker), false);
  assert.match(result.stderr, /AGENT_ENV_IGNORED line=2 INVALID_VALUE/);
  assert.match(result.stderr, /AGENT_ENV_IGNORED line=4 INVALID_KEY/);
  assert.doesNotMatch(result.stderr, /private-canary|touch|INJECTED/);
  assert.equal(run(home, ["get", "TC_OWNER_DID"]).stdout.trim(), owner);
});

test("a delimiter-free uppercase token is never logged", () => {
  const home = fresh();
  const dir = join(home, ".config/tinycloud");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(join(dir, "agent.env"), "UPPERCASE_PRIVATE_CANARY\n", { mode: 0o600 });
  const result = run(home, ["get", "TC_OWNER_DID"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /AGENT_ENV_IGNORED line=1 INVALID_LINE/);
  assert.doesNotMatch(result.stdout + result.stderr, /UPPERCASE_PRIVATE_CANARY/);
});

test("writes reject secret-looking keys and never retain them", () => {
  const home = fresh();
  const path = join(home, ".config/tinycloud/agent.env");
  assert.notEqual(run(home, ["set", "ELEVENLABS_API_KEY", "private-canary"]).status, 0);
  assert.notEqual(run(home, ["set", "TC_PRIVATE_KEY", "private-canary"]).status, 0);
  assert.equal(existsSync(path), false);
  assert.equal(run(home, ["set", "TC_BIN", "/opt/tinycloud/bin/tinycloud"]).status, 0);
  assert.equal(readFileSync(path, "utf8"), "TC_BIN=/opt/tinycloud/bin/tinycloud\n");
});

test("an absolute CLI path containing spaces remains a literal data value", () => {
  const home = fresh();
  const bin = "/home/test user/tinycloud/bin/tinycloud";
  assert.equal(run(home, ["set", "TC_BIN", bin]).status, 0);
  assert.equal(run(home, ["get", "TC_BIN"]).stdout.trim(), bin);
});

test("TC_AGENT_ENV selects an independent owner's defaults", () => {
  const home = fresh();
  const selected = join(home, "owners/second.env");
  assert.equal(run(home, ["set", "TC_OWNER_EMAIL", "second@example.com"], { TC_AGENT_ENV: selected }).status, 0);
  assert.equal(run(home, ["get", "TC_OWNER_EMAIL"], { TC_AGENT_ENV: selected }).stdout.trim(), "second@example.com");
  assert.equal(run(home, ["get", "TC_OWNER_EMAIL"]).status, 1);
  assert.equal(statSync(join(home, "owners")).mode & 0o777, 0o700);
  assert.equal(statSync(selected).mode & 0o777, 0o600);
});

test("selected directory links are rejected without changing their target", () => {
  const home = fresh();
  const target = join(home, "other");
  mkdirSync(target, { mode: 0o755 });
  symlinkSync(target, join(home, "selected"));
  const selected = join(home, "selected/agent.env");
  const result = run(home, ["set", "TC_OWNER_EMAIL", "owner@example.com"], { TC_AGENT_ENV: selected });
  assert.equal(result.status, 2);
  assert.equal(statSync(target).mode & 0o777, 0o755);
  assert.equal(existsSync(join(target, "agent.env")), false);
});

test("selected file links are not read or replaced", () => {
  const home = fresh();
  const dir = join(home, "selected");
  mkdirSync(dir, { mode: 0o700 });
  const target = join(home, "unrelated");
  writeFileSync(target, "TC_OWNER_EMAIL=canary@example.com\n");
  symlinkSync(target, join(dir, "agent.env"));
  const env = { TC_AGENT_ENV: join(dir, "agent.env") };
  assert.equal(run(home, ["get", "TC_OWNER_EMAIL"], env).status, 2);
  assert.equal(run(home, ["set", "TC_OWNER_EMAIL", "owner@example.com"], env).status, 2);
  assert.equal(readFileSync(target, "utf8"), "TC_OWNER_EMAIL=canary@example.com\n");
});

test("directory replacement during activation stays anchored to the opened directory", () => {
  const home = fresh();
  const selected = join(home, "selected");
  const moved = join(home, "moved");
  const target = join(home, "unrelated");
  mkdirSync(selected, { mode: 0o700 });
  mkdirSync(target, { mode: 0o700 });
  const hook = join(home, "replace.cjs");
  writeFileSync(hook, `
    const fs = require("node:fs");
    const { syncBuiltinESMExports } = require("node:module");
    const original = fs.renameSync;
    let swapped = false;
    fs.renameSync = (from, to) => {
      if (!swapped && (to === "agent.env" || to.endsWith("/agent.env"))) {
        swapped = true;
        original(${JSON.stringify(selected)}, ${JSON.stringify(moved)});
        fs.symlinkSync(${JSON.stringify(target)}, ${JSON.stringify(selected)});
      }
      return original(from, to);
    };
    syncBuiltinESMExports();
  `);
  const result = run(home, ["set", "TC_OWNER_EMAIL", "owner@example.com"], {
    TC_AGENT_ENV: join(selected, "agent.env"), NODE_OPTIONS: `--require=${hook}`,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(target, "agent.env")), false);
  assert.equal(readFileSync(join(moved, "agent.env"), "utf8"), "TC_OWNER_EMAIL=owner@example.com\n");
});
