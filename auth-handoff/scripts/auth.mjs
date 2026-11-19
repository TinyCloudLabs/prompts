#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { createHandoff } from '../lib/handoff.mjs';

const invalid = () => { throw Object.assign(new Error(), { code: 'INVALID_ARGUMENT' }); };
try {
  let parsed;
  try {
    parsed = parseArgs({ allowPositionals: true, options: {
      state: { type: 'string' }, config: { type: 'string' }, 'conversation-id': { type: 'string' },
      'code-file': { type: 'string' }, 'delivery-mode': { type: 'string' }, retry: { type: 'boolean', default: false }, help: { type: 'boolean' },
    } });
  } catch { invalid(); }
  const { values, positionals } = parsed;
  if (values.help) {
    console.log('tc-auth-handoff prepare --state <private-state-path> --config <config.json>\n' +
      'tc-auth-handoff authorize|status|cancel --state <private-state-path> --conversation-id <native-id> [--retry] [--delivery-mode browser|file]\n' +
      'tc-auth-handoff import --state <private-state-path> --conversation-id <native-id> --code-file <existing-private-file>\n' +
      'Raw chat capture requires the installed OpenCode native plugin. The importer does not create a client capture transport.');
  } else {
    if (positionals.length !== 1 || !values.state) invalid();
    const [command] = positionals;
    if (!['prepare', 'authorize', 'status', 'cancel', 'import'].includes(command)) invalid();
    if (command !== 'prepare' && !values['conversation-id']) invalid();
    const handoff = createHandoff({ statePath: values.state });
    let result;
    if (command === 'prepare') {
      if (!values.config) invalid();
      result = await handoff.prepare(JSON.parse(await readFile(values.config, 'utf8')));
    } else if (command === 'import') {
      if (!values['code-file']) invalid();
      result = await handoff.importCodeFile({ conversationId: values['conversation-id'], codeFile: values['code-file'] });
    } else {
      result = await handoff[command]({ conversationId: values['conversation-id'], retry: values.retry, deliveryMode: values['delivery-mode'] ?? 'browser' });
    }
    console.log(JSON.stringify({ ok: true, ...result }));
  }
} catch (error) {
  const code = typeof error.code === 'string' && /^[A-Z][A-Z0-9_]{1,80}$/.test(error.code) ? error.code : 'HANDOFF_FAILED';
  console.log(JSON.stringify({ ok: false, error: { code, message: 'TinyCloud authorization was not completed. Preserve the selected profile and original request.' } }));
  process.exitCode = 1;
}
