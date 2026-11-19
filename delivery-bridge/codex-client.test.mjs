import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CodexDeliveryClient } from './codex-client.mjs';

test('client refuses concurrent ownership of one durable delivery directory',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'tc-client-test-'));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 const client=await CodexDeliveryClient.open({directory});
 t.after(()=>client.close());
 await assert.rejects(CodexDeliveryClient.open({directory}),/locked/);
});

test('native Codex supplies original identity during execution and restart replay', {skip:process.env.TC_NATIVE_TEST!=='1',timeout:180000},async t=>{
 const directory=await mkdtemp(join(tmpdir(),'tc-native-delivery-'));
 // Synthetic only; no TinyCloud identity or host is connected.
 const executedTools=[];
 const onEvent=message=>{if(message.method==='item/started' && ['commandExecution','mcpToolCall','dynamicToolCall','webSearch','fileChange'].includes(message.params.item.type)) executedTools.push(message.params.item);};
 let client=await CodexDeliveryClient.open({directory,onText:()=>{},onEvent});
 t.after(async()=>{await client.close();await rm(directory,{recursive:true,force:true});});
 const instructions='Synthetic identity test only. Do not read files, fetch URLs, or use any tools except tinycloud_delivery_context. For each turn call tinycloud_delivery_context exactly once; reply with its event_id. Do not write anything.';
 await client.start({cwd:directory,instructions});
 const first=await client.submit('Synthetic dinner was 800 kcal.',{timezone:'Europe/Lisbon'});
 assert.equal(first.status,'completed');
 assert.equal(first.contextCalls,1);
 assert.match(first.text,new RegExp(first.delivery.native.message_id));
 const second=await client.submit('Synthetic dinner was 800 kcal.',{timezone:'Europe/Lisbon'});
 assert.notEqual(second.delivery.event_id,first.delivery.event_id);
 await client.close();
 client=await CodexDeliveryClient.open({directory,onText:()=>{},onEvent});
 await client.start({cwd:directory,instructions,threadId:first.delivery.native.thread_id});
 const replay=await client.replay(first.delivery.event_id);
 assert.equal(replay.status,'completed');
 assert.equal(replay.contextCalls,1);
 assert.deepEqual(replay.delivery,first.delivery);
 assert.match(replay.text,new RegExp(first.delivery.native.message_id));
 assert.equal(executedTools.length,3);
 assert.ok(executedTools.every(item=>item.type==='dynamicToolCall' && item.tool==='tinycloud_delivery_context'));
 console.log(JSON.stringify({native:true,thread:first.delivery.native.thread_id,first:first.delivery.native,second:second.delivery.native,replay:replay.delivery.native,status:replay.status}));
});

test('replay into a different thread does not poison the original ledger',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'tc-client-test-'));
 const client=await CodexDeliveryClient.open({directory});
 t.after(async()=>{await client.close();await rm(directory,{recursive:true,force:true});});
 await client.ledger.beginHuman('thread-1',{text:'Synthetic report.',timezone:'UTC'});
 const params={threadId:'thread-1',turnId:'turn-1',startedAtMs:1790899200000,item:{type:'userMessage',id:'message-1',content:[{type:'text',text:'Synthetic report.'}]}};
 await client.ledger.observe({method:'item/started',params});
 const event=await client.ledger.context(params);
 await client.ledger.complete('thread-1','turn-1');
 client.threadId='wrong-thread';
 await assert.rejects(client.replay(event.event_id),/original thread/);
 assert.equal(client.ledger.state.active,null);
});

test('an unavailable runtime rejects start and closes without leaving the lock', {timeout:3000},async t=>{
 const directory=await mkdtemp(join(tmpdir(),'tc-client-test-'));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 const client=await CodexDeliveryClient.open({directory,executable:join(directory,'missing-codex')});
 await assert.rejects(client.start({cwd:directory}),/ENOENT/);
 await client.close();
 const reopened=await CodexDeliveryClient.open({directory});
 await reopened.close();
});

test('resume refuses a thread outside this bridge ledger before runtime access',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'tc-client-test-'));
 const client=await CodexDeliveryClient.open({directory,executable:join(directory,'missing-codex')});
 t.after(async()=>{await client.close();await rm(directory,{recursive:true,force:true});});
 await assert.rejects(client.start({cwd:directory,threadId:'unowned-thread'}),/not owned/);
});

test('a failed transport cannot accept later queued native messages',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'tc-client-test-'));
 const client=await CodexDeliveryClient.open({directory});
 t.after(async()=>{await client.close();await rm(directory,{recursive:true,force:true});});
 await client.ledger.beginHuman('thread-1',{text:'Synthetic report.',timezone:'UTC'});
 client.fail(new Error('Native human message mismatch'));
 const params={threadId:'thread-1',turnId:'turn-1',startedAtMs:1790899200000,item:{type:'userMessage',id:'message-1',content:[{type:'text',text:'Synthetic report.'}]}};
 await client.handle({method:'item/started',params});
 await assert.rejects(client.ledger.context(params),/unbound/);
});
