import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

// Every home and tool home lives in one /var/tmp directory; the process environment is pointed there
// before any file is written, and checked.
const base = mkdtempSync(join("/var/tmp", "TC-1943."));
for (const key of ["HOME", "TC_HOME", "COURIER_HOME", "BUN_INSTALL_CACHE_DIR"]) process.env[key] = base;
assert.ok(base.startsWith("/var/tmp/TC-1943."));
for (const key of ["HOME", "TC_HOME", "COURIER_HOME", "BUN_INSTALL_CACHE_DIR"]) assert.ok(process.env[key].startsWith("/var/tmp/TC-1943."), key);
after(() => rmSync(base, { recursive: true, force: true }));

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skill = join(root, "skills/tc-apps");
let count = 0;
const fresh = () => {
  const dir = join(base, `h${++count}`);
  const work = join(dir, ".local/share/tc-apps");
  const state = join(dir, "state");
  mkdirSync(work, { recursive: true });
  mkdirSync(state, { recursive: true });
  return { dir, work, state };
};
// A stand-in CLI: records which file name was run and its arguments, and prints a grant for `auth grant`.
const stub = (path) => {
  writeFileSync(path, `#!/bin/sh\necho "${path} $*" >> "$HOME/calls"\ncase "$1 $2" in "auth grant") echo '{"ok":1}' ;; esac\n`, { mode: 0o755 });
  chmodSync(path, 0o755);
};
const run = (args, env) => spawnSync(args[0], args.slice(1), {
  encoding: "utf8", input: "", timeout: 20000,
  env: { PATH: process.env.PATH, ...env },
});
const calls = (dir) => (existsSync(join(dir, "calls")) ? readFileSync(join(dir, "calls"), "utf8").trim().split("\n") : []);

const section = readFileSync(join(skill, "SKILL.md"), "utf8").split("## 1. Read the paths and the time")[1];
const firstBlock = section.match(/```sh\n([\s\S]*?)\n```/)[1];

test("SKILL §1 names the tinycloud script, then an earlier tc script, then reports unset; TC_BIN wins", () => {
  const first = (setup, extra = {}) => {
    const h = fresh();
    setup(h);
    const out = run(["sh", "-c", firstBlock], { HOME: h.dir, ...extra });
    assert.equal(out.status, 0, out.stderr);
    return { line: out.stdout.split("\n")[0], h };
  };
  const both = first(({ work }) => { writeFileSync(join(work, "tinycloud"), ""); writeFileSync(join(work, "tc"), ""); });
  assert.equal(both.line, join(both.h.work, "tinycloud"));
  const old = first(({ work }) => writeFileSync(join(work, "tc"), ""));
  assert.equal(old.line, join(old.h.work, "tc"));
  assert.equal(first(() => {}).line, "TC_BIN is unset");
  assert.equal(first(({ work }) => writeFileSync(join(work, "tinycloud"), ""), { TC_BIN: "/opt/own/cli" }).line, "/opt/own/cli");
});

for (const [name, argv, expected] of [
  ["owner-grant.sh", ["healthlog"], ["profile show", "auth grant"]],
  ["owner-undo.sh", [], ["--profile agent-data auth logout", "--profile agent-data-sql auth logout", "profile delete agent-meal"]],
]) {
  const scenarios = [
    ["tinycloud script when both exist", ["tinycloud", "tc"], {}, "tinycloud"],
    ["an earlier tc script when it is the only one", ["tc"], {}, "tc"],
    ["TC_BIN over both", ["tinycloud", "tc"], { TC_BIN: "custom" }, "custom"],
  ];
  for (const [label, present, extra, used] of scenarios) {
    test(`${name} runs the ${label}`, () => {
      const h = fresh();
      for (const file of [...present, "custom"]) stub(join(h.work, file));
      writeFileSync(join(h.state, "meal-request.json"), "{}");
      const env = { HOME: h.dir, TC_APPS_STATE: h.state };
      if (extra.TC_BIN) env.TC_BIN = join(h.work, extra.TC_BIN);
      const out = run(["sh", join(skill, name), ...argv], env);
      assert.equal(out.status, 0, out.stderr + out.stdout);
      const seen = calls(h.dir);
      assert.deepEqual(seen.map((line) => line.split(" ")[0]), expected.map(() => join(h.work, used)));
      expected.forEach((tail, i) => assert.ok(seen[i].endsWith(` ${tail}`) || seen[i].includes(` ${tail} `), seen[i]));
    });
  }
}

test("the wrapper runs the CLI named in cli-path whatever its own file name is", () => {
  const h = fresh();
  const cli = join(h.work, "cli-target");
  writeFileSync(cli, '#!/bin/sh\necho "CLI $*"\n', { mode: 0o755 });
  writeFileSync(join(h.work, "cli-path"), `${cli}\n`);
  for (const name of ["tinycloud", "tc"]) {
    copyFileSync(join(skill, "tc-wrapper.sh"), join(h.work, name));
    chmodSync(join(h.work, name), 0o755);
    const out = run([join(h.work, name), "--version"], { HOME: h.dir });
    assert.equal(out.status, 0, out.stderr);
    assert.equal(out.stdout, "CLI --version\n");
  }
});
