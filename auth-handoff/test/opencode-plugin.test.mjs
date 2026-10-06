import { test } from 'node:test';
import assert from 'node:assert/strict';
const module = await import('../lib/opencode-plugin.mjs').catch(() => ({}));
const make = options => { assert.equal(typeof module.createSigninHooks, 'function', 'native hooks must be implemented'); return module.createSigninHooks(options); };
const response = JSON.stringify({ signature: 'synthetic-not-a-credential', message: 'test' });
function fixture() {
  const calls = [];
  const contexts = new Map();
  const handoff = {
    async prepare(config) { calls.push(['prepare', config]); contexts.set(config.conversationId, { status: 'prepared', task: config.task, host: 'https://node.tinycloud.xyz', sessionDid: 'did:key:same' }); return { status: 'prepared' }; },
    async status({ conversationId }) { return contexts.get(conversationId) ?? { status: 'unprepared' }; },
    async authorize({ conversationId, retry }) { calls.push(['authorize', conversationId, retry]); const result = { ...contexts.get(conversationId), status: 'awaiting-approval', delivery: { status: 'launch-requested' } }; contexts.set(conversationId, result); return result; },
    async importResponse(response, value) { value = { ...value, response }; calls.push(['import', value]); return { status: 'ready', task: contexts.get(value.conversationId)?.task, access: 'not-tested' }; },
    async cancel(value) { calls.push(['cancel', value]); contexts.set(value.conversationId, { status: 'cancelled' }); return { status: 'cancelled' }; },
  };
  const hooks = make({ legacy: true, forSession: () => handoff, readConfig: async () => ({ cli: '/tc', conversationId: 'forged', client: 'wrong', task: { originalRequest: 'last weight-in?' } }) });
  const user = (text = response, sessionID = 'ses_one', id = 'msg_one') => ({ message: { id, sessionID }, parts: [{ type: 'text', text }] });
  return { hooks, calls, handoff, user };
}
test('prepare binds the native conversation, preserves original task, and has no response tool argument', async () => {
  const { hooks, calls } = fixture();
  await hooks.tool.tinycloud_auth_prepare.execute({ configPath: '/private/config.json' }, { sessionID: 'ses_one' });
  assert.equal(calls[0][1].conversationId, 'ses_one');
  assert.equal(calls[0][1].client, 'opencode');
  assert.equal(calls[0][1].task.originalRequest, 'last weight-in?');
  assert.equal(Object.keys(hooks.tool).some(k => /import|login/.test(k)), false);
});
test('native input is redacted synchronously before private import, then replaced with safe receipt and continuation', async () => {
  const { hooks, handoff, user } = fixture();
  await hooks.tool.tinycloud_auth_prepare.execute({ configPath: '/private/config.json' }, { sessionID: 'ses_one' });
  await hooks.tool.tinycloud_authorize.execute({}, { sessionID: 'ses_one' });
  let release;
  handoff.importResponse = async (raw, value) => { assert.equal(raw, response); await new Promise(r => { release = r; }); return { status: 'ready', task: { originalRequest: 'last weight-in?' }, access: 'not-tested' }; };
  const output = user();
  const pending = hooks['chat.message']({ sessionID: 'ses_one' }, output);
  assert.doesNotMatch(JSON.stringify(output.parts), /synthetic-not-a-credential/);
  await new Promise(r => setImmediate(r));
  release(); await pending;
  assert.match(output.parts[0].text, /last weight-in/);
  assert.match(output.parts[0].text, /not-tested/);
});
test('ordinary messages pass through, malformed and cross-conversation responses stay private', async () => {
  const { hooks, calls, user } = fixture();
  const normal = user('hello'); await hooks['chat.message']({ sessionID: 'ses_one' }, normal); assert.equal(normal.parts[0].text, 'hello');
  const other = user(response, 'ses_two'); await hooks['chat.message']({ sessionID: 'ses_two' }, other);
  assert.doesNotMatch(other.parts[0].text, /synthetic-not-a-credential/);
  assert.match(other.parts[0].text, /NO_PENDING_APPROVAL/);
  assert.equal(calls.some(c => c[0] === 'import'), false);
});
test('rejects multi-part capture and duplicate native message IDs without leaking input', async () => {
  const { hooks, calls, user } = fixture();
  await hooks.tool.tinycloud_auth_prepare.execute({ configPath: '/private/config.json' }, { sessionID: 'ses_one' });
  await hooks.tool.tinycloud_authorize.execute({}, { sessionID: 'ses_one' });
  const ambiguous = user(); ambiguous.parts.push({ type: 'file', url: 'file:///anything' });
  await hooks['chat.message']({ sessionID: 'ses_one' }, ambiguous);
  assert.match(ambiguous.parts[0].text, /AMBIGUOUS_AUTH_RESPONSE/);
  const duplicate = user(); await hooks['chat.message']({ sessionID: 'ses_one' }, duplicate);
  assert.match(duplicate.parts[0].text, /DUPLICATE_AUTH_RESPONSE/);
  assert.equal(calls.some(c => c[0] === 'import'), false);
});
test('unexpected verifier errors never expose raw subprocess output or response', async () => {
  const { hooks, handoff, user } = fixture();
  await hooks.tool.tinycloud_auth_prepare.execute({ configPath: '/private/config.json' }, { sessionID: 'ses_one' });
  await hooks.tool.tinycloud_authorize.execute({}, { sessionID: 'ses_one' });
  handoff.importResponse = async () => { throw new Error(response); };
  const out = user(); await hooks['chat.message']({ sessionID: 'ses_one' }, out);
  assert.doesNotMatch(out.parts[0].text, /synthetic-not-a-credential/); assert.match(out.parts[0].text, /SIGNIN_FAILED/);
});

test('missing installed app receipt remains a classified private recovery error', async () => {
  const { hooks, handoff, user } = fixture();
  await hooks.tool.tinycloud_auth_prepare.execute({ configPath: '/private/config.json' }, { sessionID: 'ses_one' });
  await hooks.tool.tinycloud_authorize.execute({}, { sessionID: 'ses_one' });
  handoff.importResponse = async () => { throw Object.assign(new Error(response), { code: 'AUTH_RECEIPT_INVALID' }); };
  const out = user(); await hooks['chat.message']({ sessionID: 'ses_one' }, out);
  assert.match(out.parts[0].text, /AUTH_RECEIPT_INVALID/);
  assert.doesNotMatch(out.parts[0].text, /synthetic-not-a-credential/);
});

test('ordinary JSON remains unchanged outside pending sign-in', async () => {
 const { hooks, user } = fixture(); const out=user('{"weight":80}');
 await hooks['chat.message']({sessionID:'ses_one'},out); assert.equal(out.parts[0].text,'{"weight":80}');
});

test('restored pending status arms truncated capture and cancellation disarms ordinary JSON', async () => {
 const { hooks, handoff, user }=fixture();
 handoff.status=async()=>({status:'awaiting-approval'});
 await hooks.tool.tinycloud_signin_status.execute({}, {sessionID:'ses_one'});
 const truncated=user('eyJbad'); await hooks['chat.message']({sessionID:'ses_one'},truncated);
 assert.match(truncated.parts[0].text,/TinyCloud sign-in receipt/);
 await hooks.tool.tinycloud_auth_cancel.execute({}, {sessionID:'ses_one'});
 const normal=user('{"weight":80}'); await hooks['chat.message']({sessionID:'ses_one'},normal); assert.equal(normal.parts[0].text,'{"weight":80}');
});
test('browser launch failure retains its private artifact and arms capture', async()=>{
 const {hooks,handoff,user}=fixture();
 handoff.authorize=async()=>{throw Object.assign(new Error('failed'),{code:'BROWSER_OPEN_FAILED',delivery:{artifactPath:'/private/approval.html'}});};
 handoff.status=async()=>({status:'awaiting-approval',delivery:{artifactPath:'/private/approval.html'}});
 const receipt=JSON.parse(await hooks.tool.tinycloud_authorize.execute({}, {sessionID:'ses_one'}));
 assert.equal(receipt.delivery.artifactPath,'/private/approval.html');
 const out=user('eyJbad');await hooks['chat.message']({sessionID:'ses_one'},out);assert.match(out.parts[0].text,/TinyCloud sign-in receipt/);
});

test('same profile key cannot have approvals in two native conversations', async()=>{
 const {hooks}=fixture();
 for(const sessionID of ['ses_one','ses_two']) await hooks.tool.tinycloud_auth_prepare.execute({configPath:'/private/config.json'},{sessionID});
 await hooks.tool.tinycloud_authorize.execute({},{sessionID:'ses_one'});
 const other=JSON.parse(await hooks.tool.tinycloud_authorize.execute({},{sessionID:'ses_two'}));
 assert.equal(other.error.code,'APPROVAL_IN_ANOTHER_SESSION');
 await hooks.tool.tinycloud_auth_cancel.execute({},{sessionID:'ses_one'});
 assert.equal(JSON.parse(await hooks.tool.tinycloud_authorize.execute({},{sessionID:'ses_two'})).status,'awaiting-approval');
});

test('discovered app receipt resumes the data query without another sign-in', async () => {
  const { hooks, handoff, user } = fixture();
  await hooks.tool.tinycloud_auth_prepare.execute({ configPath: '/private/config.json' }, { sessionID: 'ses_one' });
  await hooks.tool.tinycloud_authorize.execute({}, { sessionID: 'ses_one' });
  handoff.importResponse = async () => ({ status: 'ready', task: { originalRequest: 'last weight-in?' }, appReadSelection: { appId: 'measurements' } });
  const output = user(); await hooks['chat.message']({ sessionID: 'ses_one' }, output);
  const receipt = JSON.parse(output.parts[0].text.replace('TinyCloud sign-in receipt: ', ''));
  assert.equal(receipt.appReadSelection.appId, 'measurements');
  assert.match(receipt.nextAction, /answer the saved original request now/);
  assert.match(receipt.nextAction, /Do not stop at sign-in confirmation/);
});

test('supported read tools expose one setup call and recovery controls', async () => {
  const calls = [];
  const hooks = make({ forSession: id => ({ setup: async args => { calls.push([id, args]); return { status: 'awaiting-approval', task: args.originalRequest, host: 'https://node.test', sessionDid: 'did:key:test' }; } }) });
  assert.deepEqual(Object.keys(hooks.tool).sort(), ['tinycloud_auth_cancel', 'tinycloud_setup', 'tinycloud_signin_status']);
  const result = JSON.parse(await hooks.tool.tinycloud_setup.execute({ originalRequest: 'Read my notes' }, { sessionID: 'ses_one' }));
  assert.equal(result.status, 'awaiting-approval'); assert.match(result.instructions, /paste the code here/);
  assert.deepEqual(calls, [['ses_one', { originalRequest: 'Read my notes' }]]);
});
test('startup error receipt preserves safe runtime identity and phase', async () => {
  const hooks = make({ forSession: () => ({ setup: async () => { throw Object.assign(new Error('PRIVATE'), { code: 'CLI_ARGUMENT_INVALID', cliPath: '/bound/runtime/tc', cliVersion: '0.10.1-lean-auth.1', phase: 'acquire', diagnostic: "error: unknown option '--discover-app-read'" }); } }) });
  const result = JSON.parse(await hooks.tool.tinycloud_setup.execute({ originalRequest: 'Read notes' }, { sessionID: 'ses_one' }));
  assert.equal(result.error.code, 'CLI_ARGUMENT_INVALID'); assert.equal(result.error.cliPath, '/bound/runtime/tc');
  assert.equal(result.error.phase, 'acquire'); assert.doesNotMatch(JSON.stringify(result), /PRIVATE/);
});
test('invalid setup arguments cannot release another pending approval claim', async () => {
  const hooks = make({ forSession: () => ({ setup: async args => {
    if (args.originalRequest === 'changed') throw Object.assign(new Error(), { code: 'APPROVAL_CONTEXT_CHANGED' });
    return { status: 'awaiting-approval', host: 'https://node.test', sessionDid: 'did:key:same' };
  } }) });
  await hooks.tool.tinycloud_setup.execute({ originalRequest: 'original' }, { sessionID: 'ses_first' });
  await hooks.tool.tinycloud_setup.execute({ originalRequest: 'changed' }, { sessionID: 'ses_first' });
  const next = JSON.parse(await hooks.tool.tinycloud_setup.execute({ originalRequest: 'another' }, { sessionID: 'ses_second' }));
  assert.equal(next.error?.code, 'APPROVAL_IN_ANOTHER_SESSION');
});
