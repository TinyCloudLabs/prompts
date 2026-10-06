import { mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { hostname } from 'node:os';
import { digest } from './capture.mjs';

export async function withWriterGuard({ directory, owner, host, space, timeoutMs = 30000 }, operation) {
  if (![directory, owner, host, space].every(v => typeof v === 'string' && v.length)) throw Error('Full writer context required');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  // All profiles touching the same owner/space must share this directory and
  // canonical host selection. No profile/job ID in the key: those writers contend.
  const lock = join(await realpath(directory), `${digest([owner, new URL(host).origin, space])}.lock`);
  const deadline = Date.now() + timeoutMs;
  while (true) {
    try { await mkdir(lock, { mode: 0o700 }); break; }
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      if (Date.now() >= deadline) throw Error(`Writer guard busy: ${lock}; never automatically remove a possibly live lock`);
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
  try {
    await writeFile(join(lock, 'holder.json'), JSON.stringify({ pid: process.pid, machine: hostname(), owner, host, space, acquired_at: new Date().toISOString() }), { mode: 0o600 });
    return await operation();
  } finally { await rm(lock, { recursive: true }); }
}
