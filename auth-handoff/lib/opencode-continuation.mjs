// Adapted from TinyCloudLabs/tinychat f67bf08417c8954fc0bab4379e99db13977f4d96, lib/opencode-continuation.mjs
import { lstat, readFile, open, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const continuation = 'TinyCloud installation completed and tinycloud_setup is loaded in this same conversation. Continue the original request with tinycloud_setup({originalRequest: the original user question}). Setup owns runtime selection, account context and permission preparation. Do not write setup JSON or search for a CLI. Retain the original requested stopping point. Do not reinstall, restart OpenCode, ask for a continue message, or request a paste before setup opens approval. Keep authorization input in native chat capture; after its safe receipt, read the selected app guidance, inspect schema, query real records and answer the original question.';
const fail = code => { throw Object.assign(new Error(code), { code }); };
const data = result => { if (result?.error || result?.data === undefined) fail('CONTINUATION_CONTEXT_UNAVAILABLE'); return result.data; };

/** One attempt, only in the installer-bound conversation. Never submit the TUI draft,
 * infer a latest session, or retry an ambiguous prompt response. */
export async function resumeActivation({ client, directory, version, env = process.env, now = Date.now }) {
  const hostPID = Number(env.OPENCODE_PID);
  if (!Number.isSafeInteger(hostPID) || hostPID < 2 || !env.HOME) return { status: 'absent' };
  const root = join(env.XDG_STATE_HOME || join(env.HOME, '.local/state'), 'tinycloud-auth-handoff/opencode-activation');
  const path = join(root, `${hostPID}.json`);
  const stat = await lstat(path).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (!stat) return { status: 'absent' };
  let descriptor, resultPath, result, timer, controller;
  try {
    const directoryStat = await lstat(root);
    const owner = process.getuid?.();
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink() || (directoryStat.mode & 0o077) ||
        !stat.isFile() || (stat.mode & 0o077) || stat.size > 8192 || (owner !== undefined && (stat.uid !== owner || directoryStat.uid !== owner))) fail('CONTINUATION_INVALID');
    descriptor = JSON.parse(await readFile(path, 'utf8'));
    const d = descriptor;
    if (d.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(d.nonce) || d.marker !== `TINYCLOUD_AUTH_ACTIVATION:${d.nonce}` || d.hostPID !== hostPID || d.directory !== directory || d.integrationVersion !== version ||
        !Number.isSafeInteger(d.createdAt) || !Number.isSafeInteger(d.expiresAt) || d.createdAt > now() || d.expiresAt <= now() || d.expiresAt - d.createdAt > 120000 ||
        !/^ses_[A-Za-z0-9]+$/.test(d.sessionID) || !/^msg_[A-Za-z0-9]+$/.test(d.messageID) || !/^msg_[A-Za-z0-9]+$/.test(d.userMessageID) || !/^prt_[A-Za-z0-9]+$/.test(d.partID) ||
        typeof d.agent !== 'string' || !d.agent || typeof d.model?.providerID !== 'string' || typeof d.model?.modelID !== 'string' ||
        (d.variant !== undefined && (typeof d.variant !== 'string' || !d.variant))) fail('CONTINUATION_INVALID');
    const claim = join(root, `${hostPID}.${d.nonce}.claimed`);
    const handle = await open(claim, 'wx', 0o600).catch(error => { if (error.code === 'EEXIST') return null; throw error; });
    if (!handle) return { status: 'absent' };
    try { await handle.writeFile(JSON.stringify(d)); } finally { await handle.close(); }
    await unlink(path).catch(error => { if (error.code !== 'ENOENT') throw error; });
    resultPath = join(root, `${hostPID}.${d.nonce}.result.json`);

    controller = new AbortController();
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(Object.assign(new Error('CONTINUATION_TIMEOUT'), { code: 'CONTINUATION_TIMEOUT' }));
      }, Math.max(1, Math.min(15000, d.expiresAt - now())));
    });
    const request = operation => Promise.race([operation(controller.signal), deadline]);

    // Waiting for the registry also waits for plugin initialization and hook registration.
    const ids = data(await request(signal => client.tool.ids({ query: { directory }, signal })));
    if (!['tinycloud_setup', 'tinycloud_signin_status', 'tinycloud_auth_cancel'].every(id => ids.includes(id))) fail('CONTINUATION_CAPTURE_UNAVAILABLE');
    const session = data(await request(signal => client.session.get({ path: { id: d.sessionID }, query: { directory }, signal })));
    if (session.id !== d.sessionID || session.directory !== directory) fail('CONTINUATION_CONTEXT_CHANGED');
    const message = data(await request(signal => client.session.message({ path: { id: d.sessionID, messageID: d.messageID }, query: { directory }, signal })));
    const info = message.info;
    const part = message.parts?.find(part => part.id === d.partID);
    if (info?.id !== d.messageID || info.sessionID !== d.sessionID || info.role !== 'assistant' || info.parentID !== d.userMessageID || info.agent !== d.agent ||
        info.providerID !== d.model.providerID || info.modelID !== d.model.modelID || info.variant !== d.variant || part?.type !== 'tool' || part.tool !== 'bash' || part.sessionID !== d.sessionID || part.messageID !== d.messageID ||
        !['error', 'completed'].includes(part.state?.status)) fail('CONTINUATION_CONTEXT_CHANGED');
    const nativeOutput = [part.state.metadata?.output, part.state.output].filter(value => typeof value === 'string');
    if (!nativeOutput.some(value => value.split(/\r?\n/).includes(d.marker))) fail('CONTINUATION_CONTEXT_CHANGED');
    const latest = data(await request(signal => client.session.messages({ path: { id: d.sessionID }, query: { directory, limit: 1 }, signal })));
    if (latest.length !== 1 || latest[0].info?.id !== d.messageID) fail('CONTINUATION_SUPERSEDED');
    const statuses = data(await request(signal => client.session.status({ query: { directory }, signal })));
    if (Object.values(statuses).some(status => status.type !== 'idle')) fail('CONTINUATION_BUSY');
    if (d.expiresAt <= now()) fail('CONTINUATION_EXPIRED');
    try {
      const response = await request(signal => client.session.promptAsync({ path: { id: d.sessionID }, query: { directory }, signal, body: { model: d.model, agent: d.agent, ...(d.variant ? { variant: d.variant } : {}), parts: [{ type: 'text', text: continuation }] } }));
      if (response.error) fail('CONTINUATION_REQUEST_FAILED');
    } catch { fail('CONTINUATION_REQUEST_FAILED'); }
    result = { status: 'resumed', sessionID: d.sessionID, model: d.model, agent: d.agent };
  } catch (error) {
    result = { status: 'failed', code: /^CONTINUATION_[A-Z_]+$/.test(error.code) ? error.code : 'CONTINUATION_FAILED' };
  } finally {
    clearTimeout(timer);
    controller?.abort();
  }
  if (resultPath) await writeFile(resultPath, JSON.stringify({ ...result, at: now() }) + '\n', { mode: 0o600 });
  return result;
}
