import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { CLI_VERSION } from "./install-cli.mjs";

// Task guides with no CLI found use `npx -y @tinycloud/cli@<pin>` through a launcher file, not /cli.
// Build a repository copy so this test never reads or writes the shared _site.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const work = mkdtempSync(join(realpathSync(tmpdir()), "tc-npx-form-"));
after(() => rmSync(work, { recursive: true, force: true }));
let site;
before(async () => {
  const dir = join(work, "repo");
  cpSync(root, dir, { recursive: true, filter: (src) => src === root || dirname(src) !== root || ![".git", "_site", "node_modules"].includes(basename(src)) });
  symlinkSync(join(root, "node_modules"), join(dir, "node_modules"));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(CF_PAGES.*|SITE_URL)$/.test(key)));
  await promisify(execFile)(process.execPath, [join(dir, "scripts/build-site.mjs")], { env });
  site = join(dir, "_site");
});
const served = (file) => readFileSync(join(site, file), "utf8");
const LAUNCHER = ".local/share/tinycloud/npx/tinycloud";
const PINNED = `npx --prefix "$HOME" -y -p @tinycloud/cli@${CLI_VERSION} tinycloud`;

// Each guide's first check block, as served, and the heading that opens it.
const CHECKS = [
  { name: "apps", file: "skills/apps/SKILL.md", heading: "## 1. Read the paths and the time" },
  { name: "publish", file: "skills/publish/SKILL.md", heading: "## 1. Check the CLI" },
  { name: "secrets", file: "skills/secrets/SKILL.md", heading: "## 1. Check the CLI" },
  { name: "feed skill", file: "skills/feed/SKILL.md", heading: "## 1. Check the CLI" },
  { name: "feed page", file: "feed", heading: "## 1. Check the CLI" },
];

const firstBlock = (text, heading) => {
  const from = text.indexOf(`\n${heading}`);
  assert.notEqual(from, -1, heading);
  const open = text.indexOf("\n```sh\n", from);
  const close = text.indexOf("\n```\n", open + 1);
  return text.slice(open + 7, close);
};

// A home with no TinyCloud install, and a PATH whose only `npx` is a stand-in that records its arguments.
function sandbox() {
  const dir = mkdtempSync(join(work, "sandbox-"));
  const home = join(dir, "home");
  const bin = join(dir, "bin");
  mkdirSync(home);
  mkdirSync(bin);
  symlinkSync(process.execPath, join(bin, "node"));
  const log = join(dir, "npx.log");
  writeFileSync(join(bin, "npx"), `#!/bin/sh
printf '%s\\n' "$*" >> "${log}"
pwd >> "${log}.pwd"
case "$*" in
  *--version*) echo ${CLI_VERSION} ;;
  *) echo "--expiry --owner --raw --timeout --requester" ;;
esac
`);
  chmodSync(join(bin, "npx"), 0o755);
  const run = (script, env = {}) =>
    spawnSync("/bin/sh", ["-c", script], {
      encoding: "utf8",
      env: { PATH: `${bin}:/usr/bin:/bin`, HOME: home, TMPDIR: dir, ...env },
    });
  const calls = () => (existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : []);
  return { home, bin, run, calls, pwds: () => readFileSync(`${log}.pwd`, "utf8").trim().split("\n") };
}

for (const { name, file, heading } of CHECKS) {
  test(`${name}: with no CLI found the first check writes the npx launcher and runs it`, () => {
    const { home, run, calls } = sandbox();
    const result = run(firstBlock(served(file), heading));
    assert.doesNotMatch(result.stdout + result.stderr, /TC_NOT_FOUND|TC_BIN is unset|CLI_OLDER/);
    const launcher = join(home, LAUNCHER);
    assert.equal(statSync(launcher).mode & 0o777, 0o700);
    assert.equal(readFileSync(launcher, "utf8"), `#!/bin/sh\nexec ${PINNED} "$@"\n`);
    if (name !== "publish" && name !== "secrets") assert.ok(result.stdout.split("\n").includes(launcher), "the check prints the launcher as the CLI path");
    assert.ok(calls().length > 0 && calls().every((line) => line.startsWith(`--prefix ${home} -y -p @tinycloud/cli@${CLI_VERSION} tinycloud `)), calls().join("|"));
  });

  test(`${name}: with TC_BIN set the first check behaves as before and writes nothing`, () => {
    const { home, run, calls } = sandbox();
    const own = join(home, "own-tinycloud");
    writeFileSync(own, `#!/bin/sh\ncase "$*" in *--version*) echo ${CLI_VERSION} ;; *) echo "--expiry --owner --raw --timeout --requester" ;; esac\n`);
    chmodSync(own, 0o755);
    const result = run(firstBlock(served(file), heading), { TC_BIN: own });
    assert.equal(existsSync(join(home, LAUNCHER)), false);
    assert.deepEqual(calls(), []);
    assert.match(result.stdout + result.stderr, new RegExp(CLI_VERSION.replaceAll(".", "\\.")));
  });
}

test("a later block's preamble finds the launcher when no CLI is installed", () => {
  const { home, run } = sandbox();
  const text = served("skills/publish/SKILL.md");
  run(firstBlock(text, "## 1. Check the CLI"));
  const lines = firstBlock(text, "## 2. Sign in — only when there is no live session").split("\n");
  const preamble = lines.slice(0, lines.findIndex((line) => line.includes("export TC_BIN")) + 1).join("\n");
  const result = run(`${preamble}\nprintf '%s\\n' "$TC_BIN"`);
  assert.equal(result.stdout.trim(), join(home, LAUNCHER), result.stderr);
});

test("the Courier resolver writes the launcher only when TC_BIN is unset", () => {
  const text = served("skills/courier/SKILL.md");
  const start = text.indexOf("{ set +x; } 2>/dev/null; umask 077");
  const notFound = text.indexOf('[ -x "$TC" ] || { echo "TC_NOT_FOUND', start);
  const resolver = text.slice(start, text.indexOf("\n", notFound));
  const { home, run, calls } = sandbox();
  const unset = run(`${resolver}\n"$TC" --version`);
  assert.equal(unset.stdout.trim(), CLI_VERSION, unset.stderr);
  assert.equal(readFileSync(join(home, LAUNCHER), "utf8"), `#!/bin/sh\nexec ${PINNED} "$@"\n`);
  assert.equal(calls()[0], `--prefix ${home} -y -p @tinycloud/cli@${CLI_VERSION} tinycloud --version`);
  const other = sandbox();
  const set = other.run(`${resolver}\n"$TC" --version`, { TC_BIN: join(other.home, "missing") });
  assert.equal(existsSync(join(other.home, LAUNCHER)), false, "a TC_BIN that isn't executable stays an error");
  assert.match(set.stderr, /TC_NOT_FOUND/);
});


test("no served guide sends an agent to /cli when TC_BIN is unset", () => {
  for (const file of ["skills/apps/SKILL.md", "skills/apps.md", "feed", "skills/feed/SKILL.md", "skills/feed/creating-a-post.md", "skills/publish/SKILL.md", "skills/secrets/SKILL.md", "courier"]) {
    const text = served(file);
    assert.doesNotMatch(text, /TC_BIN is unset/, file);
    assert.doesNotMatch(text, /TC_NOT_FOUND: set up the CLI at/, file);
  }
  const agent = served("agent");
  assert.match(agent, /If `TC_BIN` is unset and no CLI is found, skip the shared CLI setup: the skill's first check writes a launcher that runs the pinned CLI with `npx`\./);
  assert.match(served("apps"), /If `TC_BIN` is unset and no CLI is found, skip the shared CLI setup: skill §1 writes a launcher/);
  assert.match(served("courier"), /If no CLI is found, skip the CLI setup: the next check writes a launcher/);
});

test("every npx form in the served guides carries the pinned version and nothing resolves a moving tag", () => {
  const files = ["agent", "apps", "courier", "feed", "skills/apps/SKILL.md", "skills/feed/SKILL.md", "skills/feed/creating-a-post.md", "skills/publish/SKILL.md", "skills/secrets/SKILL.md", "skills/courier/SKILL.md"];
  let seen = 0;
  for (const file of files) {
    const text = served(file);
    assert.doesNotMatch(text, /\{\{CLI_VERSION\}\}/, file);
    for (const [, spec] of text.matchAll(/(?:npx -y|-y -p) (@tinycloud\/cli@\S+?)[\s`"']/g)) {
      seen++;
      assert.equal(spec, `@tinycloud/cli@${CLI_VERSION}`, file);
    }
  }
  assert.ok(seen >= 8, `found ${seen} npx forms`);
});

test("the npx branch adds no sudo, no global install and no piped shell", () => {
  const lines = [];
  for (const file of ["agent", "apps", "courier", "feed", "skills/apps/SKILL.md", "skills/feed/SKILL.md", "skills/publish/SKILL.md", "skills/secrets/SKILL.md", "skills/courier/SKILL.md"]) {
    for (const line of served(file).split("\n")) if (/npx\/tinycloud|npx -y|npx --prefix|skip the (shared )?CLI setup/.test(line)) lines.push(line);
  }
  assert.ok(lines.length >= 9);
  for (const line of lines) {
    assert.doesNotMatch(line, /\bsudo\b/i, line);
    assert.doesNotMatch(line, /\bnpm\s+(install|i|add)\b|--global|\s-g\b|\byarn\s+global\b|\bpnpm\s+(add|install)\b/, line);
    assert.doesNotMatch(line, /\|\s*(sudo\s+)?(ba|z|da)?sh\b|\bInvoke-Expression\b|\biex\b|\bcurl\b|\bwget\b/, line);
  }
});

test("the launcher keeps the caller's folder, so relative paths in arguments still work", () => {
  const { home, run, pwds } = sandbox();
  run(firstBlock(served("skills/publish/SKILL.md"), "## 1. Check the CLI"));
  const cwd = join(home, "work");
  mkdirSync(cwd);
  const result = run(`cd "${cwd}" && "$HOME/${LAUNCHER}" kv put some/relative.json`, {});
  assert.equal(result.status, 0, result.stderr);
  assert.equal(pwds().at(-1), cwd);
});

test("a project-local CLI and registry do not steer the launcher", () => {
  const { home, bin, calls } = sandbox();
  const project = join(dirname(home), "project");
  const pkg = join(project, "node_modules/@tinycloud/cli");
  mkdirSync(join(pkg, "bin"), { recursive: true });
  writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "@tinycloud/cli", version: CLI_VERSION, bin: { tinycloud: "bin/t.js" } }));
  writeFileSync(join(pkg, "bin/t.js"), '#!/usr/bin/env node\nconsole.log("DECOY");\n');
  chmodSync(join(pkg, "bin/t.js"), 0o755);
  writeFileSync(join(project, "package.json"), '{"name":"project","version":"1.0.0"}\n');
  writeFileSync(join(project, ".npmrc"), "registry=http://127.0.0.1:9/\n");
  const env = { PATH: `${bin}:/usr/bin:/bin`, HOME: home, TMPDIR: dirname(home) };
  const first = spawnSync("/bin/sh", ["-c", firstBlock(served("skills/publish/SKILL.md"), "## 1. Check the CLI")], { cwd: project, env, encoding: "utf8" });
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /CLI_OK/);
  assert.doesNotMatch(first.stdout + first.stderr, /DECOY/);
  assert.ok(calls().every((line) => line.startsWith(`--prefix ${home} -y -p @tinycloud/cli@${CLI_VERSION} tinycloud `)));
  const version = spawnSync(join(home, LAUNCHER), ["--version"], { cwd: project, env, encoding: "utf8" });
  assert.equal(version.status, 0, version.stderr);
  assert.equal(version.stdout.trim(), CLI_VERSION);
});

