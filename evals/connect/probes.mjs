import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { appendResult, saveNew, json, hash, caseFor, assert } from './store.mjs';

const LIMIT = 2 * 1024 * 1024;
function httpsUrl(value) {
  const url = new URL(value);
  assert(url.protocol === 'https:' && !url.username && !url.password && !url.hash, 'Discovery must use HTTPS without credentials/fragments');
  return url;
}

async function request(url, options = {}) {
  let target = httpsUrl(url);
  const signal = AbortSignal.timeout(20000);
  for (let redirects = 0; redirects <= 5; redirects++) {
    const response = await fetch(target, { ...options, redirect: 'manual', signal });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      assert(options.method !== 'POST', 'MCP POST redirected; inspect the configured endpoint instead of forwarding it');
      assert(redirects < 5, 'Too many redirects');
      target = httpsUrl(new URL(response.headers.get('location'), target));
      continue;
    }
    const chunks = [];
    let bytes = 0;
    for await (const chunk of response.body ?? []) {
      bytes += chunk.length;
      if (bytes > LIMIT) throw new Error('Public response exceeds 2 MiB');
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);
    return { url: target.href, status: response.status, contentType: response.headers.get('content-type') ?? '', challenge: response.headers.get('www-authenticate') ?? '', sha256: hash(body), bytes: body.length, body };
  }
}
const summary = response => ({ url: response.url, status: response.status, contentType: response.contentType, sha256: response.sha256, bytes: response.bytes });
function document(response) {
  assert(response.status === 200 && response.bytes > 0, `Expected a readable document; HTTP ${response.status}, ${response.bytes} bytes`);
  return JSON.parse(response.body.toString('utf8'));
}

export function resourceMetadataUrl(challenge) {
  assert(/\bBearer\b/i.test(challenge), 'Missing Bearer authentication challenge');
  const match = /\bresource_metadata\s*=\s*"([^"]+)"/i.exec(challenge);
  assert(match, 'Bearer challenge does not advertise resource_metadata');
  return httpsUrl(match[1]).href;
}

export function validateResource(metadata, resource) {
  assert(metadata.resource === resource, 'Protected resource identity differs from configured MCP URL');
  assert(Array.isArray(metadata.authorization_servers) && metadata.authorization_servers.length, 'No authorization server advertised');
  metadata.authorization_servers.forEach(httpsUrl);
}

export function validateAuthorization(metadata, issuer) {
  assert(metadata.issuer === issuer, 'OAuth issuer identity mismatch');
  for (const key of ['authorization_endpoint', 'token_endpoint']) httpsUrl(metadata[key]);
  assert(metadata.response_types_supported?.includes('code'), 'Authorization-code response not advertised');
  assert(metadata.code_challenge_methods_supported?.includes('S256'), 'PKCE S256 not advertised');
}

async function persistProbe(directory, run, scenarioId, execute) {
  const { scenario } = caseFor(run, 'public-web', scenarioId);
  const checks = [];
  const evidenceData = [];
  const started = Date.now();
  const check = async (id, fn) => {
    try {
      const observed = await fn();
      checks.push({ id, status: 'passed', observed, evidence: [] });
    } catch (error) {
      checks.push({ id, status: 'failed', observed: error.message, evidence: [] });
    }
  };
  await execute(check, evidenceData);
  assert(checks.length === scenario.checks.length && scenario.checks.every(c => checks.some(check => check.id === c.id)), 'Probe/catalog check contract mismatch');
  const path = `evidence/${randomUUID()}/public-probe.json`;
  const bytes = json({ scenario: scenarioId, checkedAt: new Date().toISOString(), candidate: run.candidate, requests: evidenceData, checks });
  await saveNew(join(directory, path), bytes);
  const evidence = [{ path, sha256: hash(bytes) }, ...evidenceData.filter(item => item.publicSnapshot).map(item => ({ path: item.publicSnapshot, sha256: item.sha256 }))];
  return appendResult(directory, {
    platform: 'public-web', scenario: scenarioId, variant: 'default', status: checks.every(c => c.status === 'passed') ? 'passed' : 'failed',
    environment: { model: 'none', clientVersion: process.version, os: process.platform, surface: 'unauthenticated HTTPS', account: 'none', workspace: 'none', fixture: 'public-read-only' },
    observed: checks.map(c => `${c.id}: ${c.observed}`).join('\n'), checks: checks.map(c => ({ ...c, evidence: [path] })), evidence,
    metrics: { durationMs: Date.now() - started },
  });
}

export async function probe(directory, run, selected = null) {
  const results = [];
  const base = new URL(run.candidate.connectUrl);
  const probes = {
    'HTTP-entry': async (check, evidence) => {
      const markdown = new URL(base); markdown.pathname += '.md';
      for (const [id, url, accept, expected] of [
        ['entry-readable', base, 'text/html', /text\/(html|markdown|plain)/],
        ['markdown-readable', markdown, 'text/markdown', /text\/(markdown|plain)/],
        ['coding-guide-readable', new URL('/apps', base), 'text/markdown', /text\/(html|markdown|plain)/],
      ]) {
        await check(id, async () => {
          const response = await request(url, { headers: { Accept: accept } });
          evidence.push(summary(response));
          assert(response.status === 200 && expected.test(response.contentType) && response.bytes > 200, `Unreadable guide: HTTP ${response.status}, ${response.contentType}, ${response.bytes} bytes`);
          const path = `evidence/${randomUUID()}/${id}.txt`;
          await saveNew(join(directory, path), response.body);
          evidence.push({ publicSnapshot: path, sha256: response.sha256 });
          return `Readable public document (${response.bytes} bytes); content SHA-256 ${response.sha256}. No agent behavior asserted.`;
        });
      }
    },
    'HTTP-oauth': async (check, evidence) => {
      let resourceUrl;
      let resource;
      await check('challenge', async () => {
        const response = await request(run.candidate.mcpUrl, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'tinycloud-connect-eval-public-probe', version: '1' } } }),
        });
        evidence.push({ ...summary(response), challenge: response.challenge });
        assert(response.status === 401, `Expected unauthenticated 401, received ${response.status}`);
        resourceUrl = resourceMetadataUrl(response.challenge);
        return 'Unauthenticated initialize rejected with 401 and a discoverable Bearer protected resource.';
      });
      await check('resource-metadata', async () => {
        assert(resourceUrl, 'Challenge did not supply usable metadata; cannot validate protected resource');
        const response = await request(resourceUrl, { headers: { Accept: 'application/json' } });
        evidence.push(summary(response));
        resource = document(response);
        validateResource(resource, run.candidate.mcpUrl);
        evidence.push({ protectedResource: resource });
        return 'Protected resource matches MCP URL and advertises HTTPS authorization servers.';
      });
      await check('authorization-metadata', async () => {
        assert(resource?.authorization_servers?.length, 'No validated authorization server; discovery not exercised');
        for (const issuer of resource.authorization_servers) {
          const parsed = httpsUrl(issuer);
          const suffix = parsed.pathname.replace(/\/$/, '');
          const oauth = new URL(`/.well-known/oauth-authorization-server${suffix}`, parsed.origin);
          let response = await request(oauth, { headers: { Accept: 'application/json' } });
          evidence.push(summary(response));
          if (response.status === 404) {
            const oidc = new URL(`${parsed.href.replace(/\/$/, '')}/.well-known/openid-configuration`);
            response = await request(oidc, { headers: { Accept: 'application/json' } });
            evidence.push(summary(response));
          }
          const metadata = document(response);
          validateAuthorization(metadata, issuer);
          evidence.push({ authorizationServer: metadata });
        }
        return 'Advertised issuers and endpoints validated; code flow and PKCE S256 advertised. No signup/token/tool call performed.';
      });
    },
    'HTTP-skill': async (check, evidence) => {
      const files = new Map();
      let manifestValid = false;
      await check('manifest', async () => {
        const response = await request(new URL('/skills/apps/SHA256SUMS', base));
        evidence.push(summary(response));
        assert(response.status === 200, `Checksum manifest returned HTTP ${response.status}`);
        for (const line of response.body.toString('utf8').trim().split(/\r?\n/)) {
          const match = /^([a-fA-F0-9]{64})\s+\*?(?:\.\/)?([a-zA-Z0-9._-]+)$/.exec(line);
          assert(match && !files.has(match[2]), 'Malformed/duplicate checksum entry');
          files.set(match[2], match[1].toLowerCase());
        }
        const expected = ['SKILL.md', 'QUICKSTART.md', 'SQL.md', 'tc-wrapper.sh'];
        assert(files.size === expected.length && expected.every(name => files.has(name)), 'Checksum manifest must enumerate exactly the four published skill files');
        manifestValid = true;
        return 'Checksum manifest names all four skill files; nothing executed.';
      });
      await check('integrity', async () => {
        assert(manifestValid, 'Manifest did not validate; cannot trust its filenames');
        for (const [name, expected] of files) {
          const response = await request(new URL(`/skills/apps/${name}`, base));
          evidence.push(summary(response));
          assert(response.status === 200 && response.sha256 === expected, `${name}: HTTP ${response.status} or checksum mismatch`);
        }
        return 'All four downloaded files match the published checksums. This is transport integrity, not publisher authenticity.';
      });
    },
  };
  if (selected) assert(probes[selected], `Unknown public probe: ${selected}`);
  for (const [id, execute] of Object.entries(probes)) if (!selected || selected === id) results.push(await persistProbe(directory, run, id, execute));
  return results;
}
