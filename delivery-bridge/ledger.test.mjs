import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DeliveryLedger } from './ledger.mjs';

const text = 'Dinner was 800 kcal. Lunch was 650 kcal.';
const human = (id = 'native-message-1', value = text, thread = 'native-thread-1', turn = 'native-turn-1') => ({method:'item/started',params:{threadId:thread,turnId:turn,startedAtMs:1790899200000,item:{type:'userMessage',id,content:[{type:'text',text:value}]}}});
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'tc-delivery-test-'));
  t.after(() => rm(dir,{recursive:true,force:true}));
  return {dir, ledger:await DeliveryLedger.open(dir)};
}
async function bind(ledger, notification = human()) {
  await ledger.beginHuman(notification.params.threadId,{text:notification.params.item.content[0].text,timezone:'Europe/Lisbon',receivedAt:'2026-10-01T00:30:00.000Z'});
  await ledger.observe(notification);
  return ledger.context(notification.params);
}
const item = value => ({action:'create',target:{host:'http://127.0.0.1:9999',owner:'synthetic-owner',space:'tinycloud:synthetic:default',app:'meals',key:'entries/record'},occurrence_date:'2026-10-01',values:{kcal:value}});

test('only a submitted human event gets native binding and original local date',async t=>{
 const {ledger}=await fixture(t);
 await assert.rejects(ledger.observe(human()),/unbound/);
 const e=await bind(ledger);
 assert.equal(e.native.message_id,'native-message-1');
 assert.equal(e.original.text,text);
 assert.equal(e.original.local_date,'2026-10-01');
 assert.equal(e.original.timezone,'Europe/Lisbon');
 await assert.rejects(ledger.context({threadId:'other',turnId:'native-turn-1'}),/unbound/);
});
test('mismatching message and injected user-role content are never accepted as human',async t=>{
 const {ledger}=await fixture(t);
 await ledger.beginHuman('native-thread-1',{text,timezone:'UTC'});
 await assert.rejects(ledger.observe(human('injected','Summary: '+text)),/mismatch/);
 await assert.rejects(ledger.context({threadId:'native-thread-1',turnId:'native-turn-1'}),/unbound/);
});
test('distinct identical native submissions have distinct sources; duplicate native notification is stable',async t=>{
 const {ledger}=await fixture(t);
 const first=await bind(ledger);
 await ledger.observe(human());
 assert.equal((await ledger.context(human().params)).event_id,first.event_id);
 await ledger.complete('native-thread-1','native-turn-1');
 const second=await bind(ledger,human('native-message-2',text,'native-thread-1','native-turn-2'));
 assert.notEqual(second.event_id,first.event_id);
});
test('multi-item plans are retained through restart and replay without reinterpretation',async t=>{
 const {ledger,dir}=await fixture(t);
 const first=await bind(ledger);
 const plan=await ledger.freeze(human().params,[item(800),item(650)]);
 assert.notEqual(plan.items[0].source_key,plan.items[1].source_key);
 assert.match(plan.items[0].source_key,/native-message-1/);
 const restored=await DeliveryLedger.open(dir);
 await restored.beginReplay(first.event_id);
 await restored.observe({method:'turn/started',params:{threadId:'native-thread-1',turn:{id:'resume-turn'}}});
 const recovered=await restored.context({threadId:'native-thread-1',turnId:'resume-turn'});
 assert.deepEqual(recovered.plan,plan);
 assert.equal(recovered.original.received_at,'2026-10-01T00:30:00.000Z');
 await assert.rejects(restored.freeze({threadId:'native-thread-1',turnId:'resume-turn'},[item(801)]),/frozen/);
});
test('correction has its own operation identity and retains original source identity',async t=>{
 const {ledger}=await fixture(t);
 await bind(ledger);
 const first=await ledger.freeze(human().params,[item(800)]);
 await ledger.complete('native-thread-1','native-turn-1');
 await bind(ledger,human('correction-message','Actually dinner was 850 kcal.','native-thread-1','correction-turn'));
 const correction=await ledger.freeze({threadId:'native-thread-1',turnId:'correction-turn'},[{...item(850),action:'correct',record_id:first.items[0].record_id,source_key:first.items[0].source_key,expected_revision:1}]);
 assert.equal(correction.items[0].source_key,first.items[0].source_key);
 assert.notEqual(correction.items[0].operation_id,first.items[0].operation_id);
});
test('tool messages and turn notifications alone do not establish human provenance',async t=>{
 const {ledger}=await fixture(t);
 await ledger.observe({method:'turn/started',params:{threadId:'native-thread-1',turn:{id:'tool-turn'}}});
 await ledger.observe({method:'item/started',params:{threadId:'native-thread-1',turnId:'tool-turn',item:{type:'functionCallOutput',id:'tool-id'}}});
 await assert.rejects(ledger.context({threadId:'native-thread-1',turnId:'tool-turn'}),/unbound/);
});
test('pending unknown native delivery cannot silently start another submission',async t=>{
 const {ledger,dir}=await fixture(t);
 await ledger.beginHuman('native-thread-1',{text,timezone:'UTC'});
 const restored=await DeliveryLedger.open(dir);
 await assert.rejects(restored.beginHuman('native-thread-1',{text,timezone:'UTC'}),/pending/);
 assert.equal(JSON.parse(await readFile(join(dir,'delivery.json'),'utf8')).active.text,text);
});
test('first dispatch timestamp persists on retries and must follow a frozen plan',async t=>{
 const {ledger,dir}=await fixture(t);
 await bind(ledger);
 await assert.rejects(ledger.dispatch(human().params,'1'),/plan/);
 await ledger.freeze(human().params,[item(800)]);
 const first=await ledger.dispatch(human().params,'1');
 const restored=await DeliveryLedger.open(dir);
 assert.equal(await restored.dispatch(human().params,'1'),first);
 assert.ok(Number.isFinite(Date.parse(first)));
 await assert.rejects(restored.dispatch(human().params,'2'),/item/);
});
test('an app requiring a UUID record key can bind it without calling it native identity',async t=>{
 const {ledger}=await fixture(t);
 await bind(ledger);
 const record_id='c60e9c99-74d8-40cd-b989-32d662a8ce31';
 const planned=await ledger.freeze(human().params,[{...item(800),record_id}]);
 assert.equal(planned.items[0].record_id,record_id);
 assert.match(planned.items[0].source_key,/native-message-1/);
 assert.notEqual(planned.items[0].source_key,record_id);
});
