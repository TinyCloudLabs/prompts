// Builds the site twice in copies of the repository, so the shared _site the
// other tests read is left alone: once for production, once as a Pages preview.
import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { CLI_VERSION } from "./install-cli.mjs";
import { marked } from "marked";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://agents.tinycloud.xyz";
const PREVIEW = "https://abc.tinycloud-agents.pages.dev";
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const work = mkdtempSync(join(realpathSync(tmpdir()), "tc-preview-build-"));
after(() => rmSync(work, { recursive: true, force: true }));

// `edit(dir)` changes the copy before it builds.
const build = async (name, env, edit) => {
  const dir = join(work, name);
  cpSync(root, dir, { recursive: true, filter: (src) => src === root || dirname(src) !== root || ![".git", "_site", "node_modules"].includes(basename(src)) });
  symlinkSync(join(root, "node_modules"), join(dir, "node_modules"));
  edit?.(dir);
  const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(CF_PAGES.*|SITE_URL)$/.test(key)));
  await promisify(execFile)(process.execPath, [join(dir, "scripts/build-site.mjs")], { env: { ...clean, ...env } });
  return join(dir, "_site");
};
let production, preview;
before(async () => {
  [production, preview] = await Promise.all([build("production", {}), build("preview", { CF_PAGES_BRANCH: "x", CF_PAGES_URL: PREVIEW })]);
});

const servedSkillFiles = (site) =>
  readdirSync(join(site, "skills"), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name).slice(site.length));

// Every file index.json lists is served with that size and checksum, and the
// skill's SHA256SUMS and agent-skills digest agree with it.
const assertIntegrity = (site) => {
  const index = JSON.parse(readFileSync(join(site, "skills/index.json"), "utf8"));
  const discovery = JSON.parse(readFileSync(join(site, ".well-known/agent-skills/index.json"), "utf8"));
  for (const skill of index.skills) {
    for (const file of skill.files) {
      const body = readFileSync(join(site, file.url));
      assert.equal(body.length, file.size, file.url);
      assert.equal(sha256(body), file.sha256, file.url);
    }
    assert.equal(readFileSync(join(site, `skills/${skill.short}/SHA256SUMS`), "utf8"), skill.files.map((f) => `${f.sha256}  ${f.path}\n`).join(""));
    const main = skill.files.find((f) => f.path === "SKILL.md");
    assert.equal(discovery.skills.find((s) => s.name === skill.name).digest, `sha256:${main.sha256}`, skill.name);
  }
  return index;
};

test("a preview's skills send agents to the preview, not production, under matching checksums", () => {
  for (const path of ["skills/apps.md", "skills/apps/SKILL.md"]) {
    const text = readFileSync(join(preview, path), "utf8");
    assert.ok(text.includes(`${PREVIEW}/onboarding`), `${path} has no ${PREVIEW}/onboarding`);
    assert.ok(!text.includes(`${SITE}/onboarding`), `${path} sends agents to production /onboarding`);
  }
  // install.js mentions production only in its usage comment; its SITE is the preview.
  const leaks = servedSkillFiles(preview).filter((p) => p !== "/skills/install.js" && readFileSync(join(preview, p), "utf8").includes(SITE));
  assert.deepEqual(leaks, []);
  assert.ok(readFileSync(join(preview, "skills/install.js"), "utf8").includes(`const SITE = "${PREVIEW}";`));
  const index = assertIntegrity(preview);
  for (const short of ["apps", "feed", "publish", "secrets", "cli", "courier"]) {
    assert.ok(index.skills.find((s) => s.short === short).changed.includes("SKILL.md"), `${short}: SKILL.md not listed as changed`);
  }
});

// Shared blocks are expanded from standard/blocks.md and expanded skills are listed as changed.
test("a production build serves the repository's skills byte for byte, pointing at production", () => {
  assert.ok(readFileSync(join(production, "skills/apps.md"), "utf8").includes(`${SITE}/onboarding`));
  assert.deepEqual(servedSkillFiles(production).filter((p) => readFileSync(join(production, p), "utf8").includes(PREVIEW)), []);
  const index = assertIntegrity(production);
  const parts = readFileSync(join(root, "standard/blocks.md"), "utf8").split(/^<!-- std:([a-z][a-z0-9-]*) -->\n/m).slice(1);
  const blocks = new Map();
  for (let i = 0; i < parts.length; i += 2) blocks.set(parts[i], parts[i + 1].trim());
  for (const [short, dir] of [["apps", "tc-apps"], ["feed", "tinycloud-feed"], ["publish", "tc-publish"], ["secrets", "tc-secrets"]]) {
    const skill = index.skills.find((s) => s.short === short);
    const sources = skill.files.map((file) => [file, readFileSync(join(root, "skills", dir, file.path))]);
    const expanded = (body) => body.toString("utf8").replace(/^\{\{std:([a-z][a-z0-9-]*)\}\}$/gm, (_, name) => blocks.get(name));
    assert.deepEqual(skill.changed, sources.filter(([, body]) => expanded(body) !== body.toString("utf8")).map(([file]) => file.path).sort(), short);
    assert.ok(skill.changed.includes("SKILL.md"), short);
    for (const [file, body] of sources) assert.ok(readFileSync(join(production, file.url)).equals(Buffer.from(expanded(body))), file.url);
  }
});

test("the served /cli keeps its POSIX blocks fenced and syntactically valid", (t) => {
  const sites = [production, preview].map((site) => {
    const blocks = marked.lexer(readFileSync(join(site, "cli"), "utf8")).filter((token) => token.type === "code");
    assert.equal(blocks.length, 13, `${site}/cli code blocks`);
    const posix = blocks.filter((token) => token.lang === "sh");
    assert.equal(posix.length, 5, `${site}/cli POSIX blocks`);
    return { site, posix };
  });

  for (const { site, posix } of sites) {
    for (const [index, block] of posix.entries()) {
      const result = spawnSync("sh", ["-n"], { input: block.text, encoding: "utf8" });
      if (result.error?.code === "ENOENT") {
        t.skip("sh is unavailable; code-block boundaries were checked");
        return;
      }
      assert.equal(result.status, 0, `${site}/cli POSIX block ${index + 1}: ${result.stderr}`);
    }
  }
});

// Fetch tools that summarize a page keep its first lines and drop its shell
// blocks, so each served guide and skill opens with this line and its own URL.
const rawLine = (url) => `> **Agents: read this file raw, not summarized.** If your fetch tool returned a summary, fetch it again with \`curl -fsSL ${url}\` and follow that text. Summaries drop the shell blocks you must run.\n\n`;
const GUIDES = ["onboarding.md", "connect.md", "setup", "agent", "apps", "chat", "feed", "publish", "share", "secrets", "courier", "cli", "openkey", "bugs"];
const afterFrontMatter = (text) => text.replace(/^---\n[\s\S]*?\n---\n\n/, "");

test("every served Markdown guide and every skill, opens with the read-raw line for its own URL, in production and on a preview", () => {
  for (const [site, base] of [[production, SITE], [preview, PREVIEW]]) {
    const guides = readdirSync(site, { withFileTypes: true }).filter((e) => e.isFile() && /^[a-z]+(\.md)?$/.test(e.name)).map((e) => e.name).sort();
    assert.deepEqual(guides, GUIDES.sort(), site);
    for (const guide of GUIDES) assert.ok(readFileSync(join(site, guide), "utf8").startsWith(rawLine(`${base}/${guide}`)), `${base}/${guide}`);
    const { skills } = JSON.parse(readFileSync(join(site, "skills/index.json"), "utf8"));
    assert.deepEqual(skills.map((s) => s.short).sort(), ["apps", "chat", "cli", "courier", "feed", "mcp", "publish", "secrets"]);
    for (const { short } of skills) {
      for (const path of [`skills/${short}.md`, `skills/${short}/SKILL.md`]) {
        assert.ok(afterFrontMatter(readFileSync(join(site, path), "utf8")).startsWith(rawLine(`${base}/skills/${short}.md`)), `${base}/${path}`);
      }
    }
  }
});

test("the owner-facing HTML pages leave the read-raw line out", () => {
  for (const site of [production, preview]) {
    for (const page of readdirSync(site).filter((name) => name.endsWith(".html"))) {
      assert.doesNotMatch(readFileSync(join(site, page), "utf8"), /read this file raw/, `${site}/${page}`);
    }
    // Each html page's rendered body still starts with its title.
    for (const page of ["onboarding", "connect"]) assert.match(readFileSync(join(site, `${page}.html`), "utf8"), /<main>\n<h1 id="[^"]+">/, page);
  }
});


// The set-up example is /onboarding's own prompt, word for word: the front page's first card, llms.txt's
// first ability and its /onboarding guide entry.
const SET_UP = (base) => `Fetch ${base}/onboarding.md with curl and follow it, including running its installer. Set me up with TinyCloud.`;
test("the front page and llms.txt open with a set-up example, /onboarding's own prompt", () => {
  assert.equal(SET_UP(SITE), "Fetch https://agents.tinycloud.xyz/onboarding.md with curl and follow it, including running its installer. Set me up with TinyCloud.");
  for (const [site, base] of [[production, SITE], [preview, PREVIEW]]) {
    const prompt = SET_UP(base);
    assert.ok(readFileSync(join(site, "onboarding.md"), "utf8").includes(`\n> ${prompt}\n`), `${base}/onboarding.md`);
    const index = readFileSync(join(site, "index.html"), "utf8");
    const card = index.split('<ul class="abilities">\n')[1].split("</li>")[0];
    assert.match(card, /<h3><a href="\/onboarding">Set up TinyCloud<\/a><\/h3>/, base);
    assert.ok(card.includes(`<p>Try: <code>${prompt}</code></p>`), `${base}/index.html: ${card}`);
    const llms = readFileSync(join(site, "llms.txt"), "utf8").split("\n");
    const firstAbility = llms[llms.indexOf("## Abilities") + 2];
    assert.ok(firstAbility.startsWith(`- [Set up TinyCloud](${base}/onboarding): `) && firstAbility.endsWith(` Example prompt: "${prompt}"`), `${base}/llms.txt: ${firstAbility}`);
    const guide = llms.find((line) => line.startsWith("- [") && line.includes(`](${base}/onboarding): `) && llms.indexOf(line) > llms.indexOf("## Guides"));
    assert.ok(guide?.endsWith(` Example prompt: "${prompt}"`), `${base}/llms.txt: ${guide}`);
  }
});

const BLOCKED = `Claude Code blocked installing the TinyCloud CLI (npm package @tinycloud/cli ${CLI_VERSION}, into ~/.local/share/tinycloud/cli). Reply "Go ahead: install the TinyCloud CLI" and I'll run it once more.`;
const blockedSection = (site) => readFileSync(join(site, "cli"), "utf8").split("\n### If the client blocks the installer\n")[1].split("\n### ")[0];

test("/cli's blocked-install line and fallback commands carry install-cli.mjs's pin, filled in by the build", () => {
  const source = readFileSync(join(root, "setup/tinycloud.md"), "utf8");
  assert.ok(source.includes(BLOCKED.replace(CLI_VERSION, "{{CLI_VERSION}}")), "setup/tinycloud.md writes the pin as {{CLI_VERSION}}");
  for (const [site, base] of [[production, SITE], [preview, PREVIEW]]) {
    const section = blockedSection(site);
    assert.ok(section.includes(`\n> ${BLOCKED}\n`), `${base}/cli: blocked line`);
    assert.ok(section.includes('"Your agent app blocked installing the TinyCloud CLI"'), `${base}/cli: other clients' line`);
    assert.ok(section.includes(`curl -fsSL -o "$HOME/.local/share/tinycloud/install-cli.mjs" ${base}/install-cli.mjs || exit 1\nnode "$HOME/.local/share/tinycloud/install-cli.mjs" --needs-install\n`), `${base}/cli: POSIX download and check`);
    assert.ok(section.includes(`  0) npm install --prefix "$HOME/.local/share/tinycloud/cli" --save-exact @tinycloud/cli@${CLI_VERSION} ;;\n`), `${base}/cli: POSIX fallback`);
    assert.ok(section.includes(`Invoke-WebRequest ${base}/install-cli.mjs -OutFile $installer -ErrorAction Stop\nnode $installer --needs-install\n`), `${base}/cli: PowerShell download and check`);
    assert.ok(section.includes(`  npm.cmd install --prefix $prefix --save-exact "@tinycloud/cli@${CLI_VERSION}"\n`), `${base}/cli: PowerShell fallback`);
    const unfilled = readdirSync(site, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile() && readFileSync(join(e.parentPath, e.name), "utf8").includes("{{CLI_VERSION}}"))
      .map((e) => join(e.parentPath, e.name).slice(site.length));
    assert.deepEqual(unfilled, [], base);
  }
});

test("a literal CLI pin that isn't install-cli.mjs's fails the build", async () => {
  const stale = "1.5.2";
  await assert.rejects(build("stale-pin", {}, (dir) => {
    const file = join(dir, "setup/tinycloud.md");
    const text = readFileSync(file, "utf8");
    const edited = text.replace("npm package @tinycloud/cli {{CLI_VERSION}}", `npm package @tinycloud/cli ${stale}`).replace("@tinycloud/cli@{{CLI_VERSION}}", `@tinycloud/cli@${stale}`);
    assert.equal(edited.split(stale).length, 3);
    writeFileSync(file, edited);
  }), (error) => {
    assert.match(error.stderr, new RegExp(`CLI version pins that differ from install-cli\\.mjs's ${CLI_VERSION.replaceAll(".", "\\.")}:`));
    assert.equal(error.stderr.split(`setup/tinycloud.md: ${stale}`).length, 3, error.stderr);
    return true;
  });
});

// Stand-ins, run as CommonJS scripts. npm records its arguments in $HOME/npm-calls and lays out the release
// like `npm install --prefix`; curl records the URL and saves this repository's installer to -o.
function npmStandIn() {
  const fs = require("node:fs"), path = require("node:path");
  const args = process.argv.slice(2);
  fs.appendFileSync(path.join(process.env.HOME, "npm-calls"), JSON.stringify(args) + "\n");
  const prefix = args[args.indexOf("--prefix") + 1], version = args[args.length - 1].split("@").pop();
  const modules = path.join(prefix, "node_modules"), cli = path.join(modules, "@tinycloud/cli/cli.js");
  fs.mkdirSync(path.dirname(cli), { recursive: true });
  fs.mkdirSync(path.join(modules, ".bin"), { recursive: true });
  fs.writeFileSync(path.join(prefix, "package.json"), JSON.stringify({ dependencies: { "@tinycloud/cli": (args.includes("--save-exact") ? "" : "^") + version } }));
  fs.writeFileSync(path.join(modules, "@tinycloud/cli/package.json"), JSON.stringify({ name: "@tinycloud/cli", version }));
  fs.writeFileSync(cli, "#!/bin/sh\nprintf '%s\\n' '" + version + "'\n", { mode: 0o700 });
  for (const name of ["tc", "tinycloud"]) { const link = path.join(modules, ".bin", name); fs.rmSync(link, { force: true }); fs.symlinkSync(cli, link); }
}
function curlStandIn() {
  const fs = require("node:fs"), path = require("node:path");
  const args = process.argv.slice(2);
  fs.appendFileSync(path.join(process.env.HOME, "curl-calls"), args[args.length - 1] + "\n");
  fs.copyFileSync(process.env.TC_TEST_INSTALLER, args[args.indexOf("-o") + 1]);
}

// The POSIX fallback's two blocks as served, a stand-in npm and curl (the curl saves this repository's
// installer) and fresh homes with /agent's helper. PATH holds only the stand-ins, node and the system:
// `npm test` puts this repository's own CLI (a devDependency) on PATH, and node's directory can hold a global one.
let kit;
const fallbackKit = () => {
  if (kit) return kit;
  const blocks = [...blockedSection(production).matchAll(/```sh\n([\s\S]*?)\n```/g)].map((match) => match[1]);
  assert.equal(blocks.length, 2);
  const tools = join(work, "fallback-tools");
  mkdirSync(tools);
  writeFileSync(join(tools, "npm"), `#!${process.execPath}\n(${npmStandIn})();\n`, { mode: 0o700 });
  writeFileSync(join(tools, "curl"), `#!${process.execPath}\n(${curlStandIn})();\n`, { mode: 0o700 });
  symlinkSync(process.execPath, join(tools, "node"));
  const freshHome = (name) => {
    const home = join(work, name);
    const config = join(home, ".config/tinycloud");
    mkdirSync(config, { recursive: true, mode: 0o700 });
    writeFileSync(join(config, "agent-env.mjs"), readFileSync(join(root, "scripts/agent-env.mjs")), { mode: 0o600 });
    return { home, env: { HOME: home, PATH: `${tools}:/usr/bin:/bin`, TC_TEST_INSTALLER: join(root, "scripts/install-cli.mjs") } };
  };
  const run = (script, { env }) => spawnSync("sh", ["-c", script], { env, encoding: "utf8" });
  // A private copy laid out by the stand-in npm, as if installed earlier; its call is not recorded in this home.
  const privateCopy = ({ home, env }, version) => {
    const result = spawnSync(join(tools, "npm"), ["install", "--prefix", prefix(home), "--save-exact", `@tinycloud/cli@${version}`], { env: { ...env, HOME: join(home, "..") }, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  };
  kit = { blocks, freshHome, run, privateCopy };
  return kit;
};
const prefix = (home) => join(home, ".local/share/tinycloud/cli");
const selectedCli = (stdout) => JSON.parse(stdout.match(/^TC_SELECTED (.+)$/m)[1]);
const savedCli = ({ home, env }) => spawnSync(process.execPath, [join(home, ".config/tinycloud/agent-env.mjs"), "get", "TC_BIN"], { env, encoding: "utf8" }).stdout.trim();
const callLines = (file) => existsSync(file) ? readFileSync(file, "utf8").trim().split("\n") : [];

test("/cli's fallback, run in a fresh home with a stand-in npm, makes the installer's private install, which the installer then selects and saves", { skip: process.platform === "win32" }, () => {
  const { blocks, freshHome, run } = fallbackKit();
  const fallback = freshHome("fallback-home");
  const check = run(blocks[0], fallback);
  assert.equal(check.status, 0, check.stderr);
  assert.match(check.stdout, new RegExp(`^TC_INSTALL_NEEDED ${CLI_VERSION.replaceAll(".", "\\.")} `, "m"));
  const rerun = run(blocks[1], fallback);
  assert.equal(rerun.status, 0, rerun.stderr);
  const bin = join(prefix(fallback.home), "node_modules/.bin/tinycloud");
  assert.deepEqual(selectedCli(rerun.stdout), { bin, version: CLI_VERSION, source: "private" });
  assert.equal(savedCli(fallback), bin);
  assert.deepEqual(callLines(join(fallback.home, "curl-calls")), [`${SITE}/install-cli.mjs`]);
  // One npm call, the fallback's own: the rerun installer selects that install rather than installing again.
  const [call, ...more] = callLines(join(fallback.home, "npm-calls")).map((line) => JSON.parse(line));
  assert.deepEqual(more, []);
  assert.deepEqual(call, ["install", "--prefix", prefix(fallback.home), "--save-exact", `@tinycloud/cli@${CLI_VERSION}`]);

  // The installer itself, in another fresh home: the same npm install apart from its quieter output, and the same layout.
  const installer = freshHome("installer-home");
  const result = spawnSync(process.execPath, [join(root, "scripts/install-cli.mjs")], { env: installer.env, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(selectedCli(result.stdout), { bin: join(prefix(installer.home), "node_modules/.bin/tinycloud"), version: CLI_VERSION, source: "installed" });
  const installs = callLines(join(installer.home, "npm-calls")).map((line) => JSON.parse(line));
  assert.deepEqual(installs.map((args) => args.filter((arg) => !["--no-audit", "--no-fund"].includes(arg)).map((arg) => arg === prefix(installer.home) ? prefix(fallback.home) : arg)), [call]);
  for (const file of ["package.json", "node_modules/@tinycloud/cli/package.json"]) {
    assert.equal(readFileSync(join(prefix(fallback.home), file), "utf8"), readFileSync(join(prefix(installer.home), file), "utf8"), file);
  }
});

test("/cli's fallback keeps a newer private copy: no npm install, and the installer selects it", { skip: process.platform === "win32" }, () => {
  const { blocks, freshHome, run, privateCopy } = fallbackKit();
  const newer = "1.7.0";
  const fallback = freshHome("fallback-newer/home");
  privateCopy(fallback, newer);
  const bin = join(prefix(fallback.home), "node_modules/.bin/tinycloud");
  const check = run(blocks[0], fallback);
  assert.equal(check.status, 0, check.stderr);
  assert.match(check.stdout, new RegExp(`^TC_INSTALL_NOT_NEEDED ${newer.replaceAll(".", "\\.")} ${bin}$`, "m"));
  const rerun = run(blocks[1], fallback);
  assert.equal(rerun.status, 0, rerun.stderr);
  assert.deepEqual(selectedCli(rerun.stdout), { bin, version: newer, source: "private" });
  assert.equal(savedCli(fallback), bin);
  assert.deepEqual(callLines(join(fallback.home, "npm-calls")), []);
  assert.equal(JSON.parse(readFileSync(join(prefix(fallback.home), "node_modules/@tinycloud/cli/package.json"), "utf8")).version, newer);
});

test("/cli's fallback stops on a private folder that holds another package: no npm install, nothing changed", { skip: process.platform === "win32" }, () => {
  const { blocks, freshHome, run } = fallbackKit();
  const fallback = freshHome("fallback-occupied");
  mkdirSync(prefix(fallback.home), { recursive: true });
  const project = join(prefix(fallback.home), "package.json");
  const original = JSON.stringify({ dependencies: { "left-pad": "1.3.0" } });
  writeFileSync(project, original);
  const check = run(blocks[0], fallback);
  assert.equal(check.status, 2, check.stdout);
  assert.match(check.stderr, /^TC_INSTALL_FAILED Unrelated packages occupy the private CLI directory: left-pad$/m);
  assert.deepEqual(callLines(join(fallback.home, "npm-calls")), []);
  assert.equal(readFileSync(project, "utf8"), original);
  assert.deepEqual(readdirSync(prefix(fallback.home)), ["package.json"]);
});

test("/owner and /owner/ redirect to /onboarding and no built page or listing links /owner", () => {
  for (const site of [production, preview]) {
    const redirects = readFileSync(join(site, "_redirects"), "utf8").split("\n");
    assert.ok(redirects.includes("/owner /onboarding 301"), site);
    assert.ok(redirects.includes("/owner/ /onboarding 301"), site);
    assert.ok(redirects.includes("/owner.md /onboarding 301"), site);
    assert.ok(redirects.includes("/setup/owner.md /onboarding 301"), site);
    assert.ok(!existsSync(join(site, "owner")), site);
    for (const name of readdirSync(site, { withFileTypes: true, recursive: true }).filter((e) => e.isFile() && e.name !== "_redirects").map((e) => join(e.parentPath, e.name))) {
      const text = readFileSync(name, "utf8");
      assert.doesNotMatch(text, /agents\.tinycloud\.xyz\/owner(?![\w.-])|href="\/owner\/?"|\]\(\/owner\/?\)/, name);
    }
  }
});
