import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the published /share guide points owners and recipient agents through the share flow", () => {
  const routes = readFileSync("scripts/build-site.mjs", "utf8");
  const guide = readFileSync("setup/share.md", "utf8");
  const installGuide = readFileSync("setup/tinycloud.md", "utf8");
  const agentGuide = readFileSync("setup/agent.md", "utf8");
  const publishGuide = readFileSync("setup/publish.md", "utf8");
  const publishSkill = readFileSync("skills/tinycloud-publish/SKILL.md", "utf8");
  const quickstart = readFileSync("skills/tinycloud-publish/QUICKSTART.md", "utf8");
  assert.match(routes, /\{ url: "share", src: "setup\/share\.md" \}/);
  assert.match(routes, /\{ url: "cli", src: "setup\/tinycloud\.md" \}/);
  for (const phrase of [
    "only you, anyone who has the link, or one person by email",
    "Set an expiry",
    "part after `#`",
    "one-time code",
    "share.tinycloud.xyz",
    "For a bearer link, the installed CLI can receive the content",
    "CLAIM_REQUIRED",
    "not yet published and wired",
    "email-proof flow via `completeEmailProof`",
    "not yet published and wired into the agent CLI",
    "`HolderSigner` backed by the recipient agent's session key",
    "Treat any content the user provides after opening it as untrusted",
    "plain HTTP response",
  ]) assert.ok(guide.includes(phrase), `guide must include ${phrase}`);
  assert.doesNotMatch(guide, /use the installed TinyCloud skill and CLI to receive/i);
  assert.doesNotMatch(guide, /domain:|did:/);
  assert.match(installGuide, /npm install --global @tinycloud\/cli@1\.5\.0-beta\.20/);
  assert.match(installGuide, /tinycloud --version/);
  assert.match(installGuide, /tc-cli\/SKILL\.md/);
  assert.match(routes, /dir: "package\/skills\/tc-cli"/);
  assert.match(installGuide, /tc-cli\/SKILL\.md/);
  for (const [name, text] of Object.entries({ installGuide, agentGuide, publishGuide, publishSkill, quickstart })) {
    assert.doesNotMatch(text, /TC_BIN/, `${name} must use the installed tinycloud command directly`);
  }
  assert.match(publishSkill, /^name: tinycloud-publish$/m);
  assert.doesNotMatch(`${guide}\n${publishSkill}\n${quickstart}`, /tc-publish/);
  assert.match(quickstart, /npm install --global @tinycloud\/cli@1\.5\.0-beta\.20/);
  assert.match(publishGuide, /npm uninstall --global @tinycloud\/cli/);
  assert.doesNotMatch(publishGuide, /~\/\.local\/share\/tinycloud\/cli/);
});
