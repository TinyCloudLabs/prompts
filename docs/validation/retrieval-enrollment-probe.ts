// Synthetic source probe; no login, network, credentials, or live storage.
// Run: bun run docs/validation/retrieval-enrollment-probe.ts /absolute/web-sdk/root
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

const sdkRoot = process.argv[2];
assert.ok(sdkRoot, "Pass the inspected web-sdk source root with its dependencies installed.");
const cli = resolve(sdkRoot, "packages/cli/src");
const owner = "did:pkh:eip155:1:0x1111111111111111111111111111111111111111";
const space = `tinycloud:${owner.slice(4)}:default`;
const accountSpace = `tinycloud:${owner.slice(4)}:account`;
const profile = { name: "synthetic", did: "did:key:synthetic", ownerDid: owner, chainId: 1 };
globalThis.fetch = async () => { throw new Error("Network is forbidden in this synthetic probe"); };
mock.module(`${cli}/config/profiles.js`, () => ({ ProfileManager: { getProfile: async () => profile, getSession: async () => null } }));
const core = await import(resolve(sdkRoot, "packages/sdk-core/src/manifest.ts"));
const { loadManifestPermissions } = await import(`${cli}/lib/permissions.ts`);
const { AccountService } = await import(resolve(sdkRoot, "packages/sdk-core/src/account/AccountService.ts"));
const guide = await readFile(new URL("../../setup/conversational-data.md", import.meta.url), "utf8");
const blocks = [...guide.matchAll(/```json\n([\s\S]*?)\n```/g)].map(match => JSON.parse(match[1]));
assert.equal(blocks.length, 2, "Check the two documented enrollment/application manifests.");
const [enrollment, application] = blocks;
application.space = space;
application.prefix = "synthetic/private";
application.permissions[0].path = "synthetic_fitness";
application.permissions[1].path = "synthetic_finance";
application.permissions[2].path = "synthetic/private/";
const temporary = await mkdtemp(join(tmpdir(), "tc-enrollment-probe-"));
const results: Record<string, unknown> = { scope: "Synthetic SDK/CLI parser and in-memory AccountService checks; not signing, node authorization, agent acceptance, or live enrollment." };
try {
  for (const [name, manifest] of Object.entries({ enrollment, application })) {
    core.validateManifest(manifest);
    const file = join(temporary, `${name}.json`);
    await writeFile(file, JSON.stringify(manifest), { mode: 0o600 });
    const sdk = core.resolveManifest(manifest);
    const cliPermissions = await loadManifestPermissions(file, "synthetic");
    const normalize = (entry: any) => ({
      service: entry.service,
      space: entry.space === "account" ? accountSpace : entry.space,
      path: entry.path,
      actions: entry.actions,
    });
    assert.deepEqual(cliPermissions.map(normalize), sdk.resources
      .filter((entry: any) => name === "enrollment" || entry.service !== "tinycloud.capabilities")
      .map(normalize));
    assert.equal(sdk.includePublicSpace, false);
    results[name] = { resourcePaths: cliPermissions.map((entry: any) => entry.path), parserAgreement: true };
  }
  const root = core.resolveManifestKnowledgeRoot(application.knowledge);
  assert.equal(core.applyPrefix(application.prefix, root, false), "synthetic/private/knowledge/index.md");
  results.knowledge = { root, key: "synthetic/private/knowledge/index.md" };

  const records = new Map<string, any>();
  let writes = 0;
  let responseLoss = false;
  let cachedHash = false;
  let stringEncoded = false;
  const kv = {
    get: async (key: string) => records.has(key)
      ? { ok: true, data: { data: stringEncoded ? JSON.stringify(records.get(key)) : structuredClone(records.get(key)) } }
      : { ok: false, error: { code: "NOT_FOUND", message: "Synthetic missing key", service: "kv" } },
    list: async () => ({ ok: true, data: { keys: [...records.keys()] } }),
    put: async (key: string, value: unknown) => {
      assert.equal(key, `applications/${application.app_id}`);
      writes++;
      records.set(key, structuredClone(value));
      if (responseLoss) return { ok: false, error: { code: "NETWORK_ERROR", message: "Synthetic response loss after commit", service: "kv" } };
      return { ok: true, data: {} };
    },
  };
  const account = new AccountService({
    getDid: () => owner,
    getHost: () => "https://node.invalid",
    getPrimarySpaceId: () => space,
    getAccountSpaceId: () => accountSpace,
    getSpaces: () => ({ get: (selected: string) => {
      assert.equal(selected, accountSpace, "Registry methods may access only the synthetic account space.");
      return { kv };
    } }),
  });
  // Control the index's hash result only; canonical reads and registration are real SDK methods.
  account.indexHasApplicationHash = async () => cachedHash;
  const appId = application.app_id;
  assert.equal((await account.applications.get(appId)).ok, false);
  assert.equal((await account.applications.register(application)).ok, true);
  assert.equal(writes, 1);
  const info = await account.applications.get(appId);
  assert.equal(info.ok, true);
  assert.deepEqual(info.data.manifests, [application]);
  const live = await account.applications.list();
  assert.deepEqual(live.data.map((entry: any) => entry.appId), [appId]);
  results.canonicalRegistration = { writes, canonicalInfoAndLiveListMatch: true };

  // The real KV service can return stored object JSON as text. Current account
  // APIs then discard manifests; verify the documented canonical-read recovery.
  stringEncoded = true;
  const lossy = await account.applications.get(appId);
  assert.deepEqual(lossy.data.manifests, []);
  const envelope = (await kv.get(`applications/${appId}`)).data;
  const normalized = typeof envelope.data === "string" ? JSON.parse(envelope.data) : envelope.data;
  assert.equal(normalized.app_id, appId);
  assert.deepEqual(normalized.manifests, [application]);
  results.stringEncodedCanonicalRecord = { accountApiDropsManifest: true, explicitCanonicalNormalizationRecoversIt: true };
  stringEncoded = false;

  // The retry protocol inspects this canonical match and omits another register call.
  const retry = await account.applications.get(appId);
  assert.deepEqual(retry.data.manifests, [application]);
  assert.equal(writes, 1);
  results.matchingRetryReadback = { canonicalMatch: true, registryWrites: writes };

  const userManifest = { ...application, name: "Owner's existing custom name", appVersion: "personal-2" };
  records.get(`applications/${appId}`).manifests = [userManifest];
  const differing = await account.applications.get(appId);
  assert.notDeepEqual(differing.data.manifests, [application]);
  assert.deepEqual(differing.data.manifests, [userManifest]);
  assert.equal(writes, 1);
  cachedHash = true;
  const skipped = await account.applications.register(application);
  assert.equal(skipped.ok, true);
  assert.equal(writes, 1);
  assert.deepEqual((await account.applications.get(appId)).data.manifests, [userManifest]);
  results.staleHash = { registerReportedSuccess: true, canonicalMismatchDetected: true, customMetadataPreservedByNoFurtherWrite: true };

  account.index.applications.list = async () => ({ ok: true, data: [{ appId: "stale.app", manifests: [] }] });
  assert.equal((await account.applications.list({ preferIndex: true })).data[0].appId, "stale.app");
  assert.equal((await account.applications.list()).data[0].appId, appId);
  results.staleList = { indexedAndCanonicalDiffer: true };

  records.clear();
  cachedHash = false;
  responseLoss = true;
  assert.equal((await account.applications.register(application)).ok, false);
  const recovered = await account.applications.get(appId);
  assert.deepEqual(recovered.data.manifests, [application]);
  const afterLoss = writes;
  assert.deepEqual((await account.applications.list()).data[0].manifests, [application]);
  assert.equal(writes, afterLoss);
  results.partialResponse = { failureAfterStoredWrite: true, canonicalReadbackRecoversWithoutWrite: true };
  process.stdout.write(JSON.stringify(results, null, 2) + "\n");
} finally {
  await rm(temporary, { recursive: true, force: true });
}
