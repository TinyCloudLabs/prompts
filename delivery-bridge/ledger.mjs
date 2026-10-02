import { mkdir, readFile, open, rename } from 'node:fs/promises';
import { join } from 'node:path';

const key = (...parts) => parts.map(encodeURIComponent).join(':');
const clone = value => structuredClone(value);
const requireString = value => { if (typeof value !== 'string' || !value) throw new Error('Expected a nonempty string'); return value; };

// Single writer: the enclosing client holds directory/client.lock for its lifetime.
export class DeliveryLedger {
  #persistedState;
  static async open(directory) {
    await mkdir(directory,{recursive:true,mode:0o700});
    const ledger = new DeliveryLedger();
    ledger.file = join(directory,'delivery.json');
    try { ledger.state = JSON.parse(await readFile(ledger.file,'utf8')); }
    catch(error) { if(error.code !== 'ENOENT') throw error; ledger.state = {format:'tc-delivery-ledger/v1',events:{},turns:{},active:null}; }
    if(ledger.state.format !== 'tc-delivery-ledger/v1') throw new Error('Unsupported delivery ledger');
    ledger.#persistedState = clone(ledger.state);
    return ledger;
  }
  async save() {
    try {
      const snapshot = clone(this.state);
      const file = await open(this.file+'.tmp','w',0o600);
      try { await file.writeFile(JSON.stringify(snapshot,null,2)+'\n'); await file.sync(); }
      finally { await file.close(); }
      await rename(this.file+'.tmp',this.file);
      this.#persistedState = snapshot;
    } catch(error) {
      // Calls are serialized by the client. A retry must never acknowledge a
      // plan, binding or dispatch clock that only reached in-memory state.
      this.state = clone(this.#persistedState);
      throw error;
    }
  }
  async beginHuman(threadId,{text,timezone,receivedAt = new Date().toISOString()}) {
    if(this.state.active) throw new Error('A pending delivery must be reconciled before another submission');
    requireString(threadId); requireString(text); requireString(timezone);
    const date = new Date(receivedAt);
    if(!Number.isFinite(date.getTime())) throw new Error('Invalid original receive time');
    const localDate = new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
    this.state.active = {kind:'human',threadId,text,timezone,receivedAt:date.toISOString(),localDate};
    await this.save();
  }
  async beginReplay(eventId) {
    const event = this.state.events[eventId];
    if(!event) throw new Error('Unknown original delivery; cannot infer it from equal text');
    if(this.state.active && this.state.active.eventId !== eventId) throw new Error('Another pending delivery needs reconciliation');
    this.state.active = {kind:'replay',threadId:event.native.thread_id,eventId};
    await this.save();
    return clone(event);
  }
  async observe({method,params}) {
    const active = this.state.active;
    if(method === 'turn/started' && active?.kind === 'replay' && params.threadId === active.threadId) {
      this.state.turns[key(params.threadId,requireString(params.turn.id))] = active.eventId;
      active.turnId = params.turn.id;
      await this.save();
    }
    if(method !== 'item/started' || params.item.type !== 'userMessage') return;
    const {threadId,turnId,item,startedAtMs} = params;
    if(!active || active.kind !== 'human' || active.threadId !== threadId) throw new Error('unbound human delivery');
    // The bridge submits exactly one text item; skill/context injection is separate.
    if(item.content?.length !== 1 || item.content[0].type !== 'text' || item.content[0].text !== active.text) throw new Error('Native human message mismatch');
    const eventId = 'codex:app-server:'+key(requireString(threadId),requireString(turnId),requireString(item.id));
    if(active.eventId && active.eventId !== eventId) throw new Error('Unexpected second native human event');
    const existing = this.state.events[eventId];
    if(existing && existing.original.text !== active.text) throw new Error('Native identity collision');
    this.state.events[eventId] ??= {
      format:'tc-delivery/v1',event_id:eventId,client:'codex',mode:'app-server-bridge',
      native:{thread_id:threadId,turn_id:turnId,message_id:item.id},
      original:{text:active.text,received_at:active.receivedAt,local_date:active.localDate,timezone:active.timezone,runtime_started_at:new Date(startedAtMs).toISOString()},
      plan:null,
    };
    this.state.turns[key(threadId,turnId)] = eventId;
    Object.assign(active,{eventId,turnId});
    await this.save();
  }
  async context({threadId,turnId}) {
    const eventId = this.state.turns[key(threadId,turnId)];
    if(!eventId) throw new Error('unbound turn: no verified original human delivery');
    return clone(this.state.events[eventId]);
  }
  async freeze(runtime,items) {
    const event = await this.context(runtime);
    if(!Array.isArray(items) || items.length === 0) throw new Error('A plan needs at least one item');
    if(event.plan) {
      if(JSON.stringify(event.plan.requested_items) !== JSON.stringify(items)) throw new Error('Delivery plan is frozen; retain the original payload and targets');
      return event.plan;
    }
    const planned = items.map((item,index) => {
      if(!['create','correct'].includes(item.action)) throw new Error('Only create/correct plans are supported');
      if(!item.target || !item.values || !/^\d{4}-\d{2}-\d{2}$/.test(item.occurrence_date)) throw new Error('Plan needs exact target, values and resolved occurrence_date');
      for(const field of ['host','owner','space','app']) requireString(item.target[field]);
      if(!item.target.key && !(item.target.database && item.target.table)) throw new Error('Plan needs exact KV key or SQL database/table');
      const source = event.event_id+':item:'+(index+1);
      if(item.action === 'correct' && (!item.source_key || !item.record_id || !Number.isInteger(item.expected_revision) || item.expected_revision<1)) throw new Error('Correction requires original source, record and expected revision');
      if(item.action === 'create' && (item.source_key || item.operation_id)) throw new Error('Create identities are supplied by the bridge');
      return {...clone(item),item_id:String(index+1),source_key:item.action==='correct'?item.source_key:source,record_id:item.record_id ? requireString(item.record_id) : source,operation_id:source+':'+item.action};
    });
    const plan = {requested_items:clone(items),items:planned};
    this.state.events[event.event_id].plan = plan;
    await this.save();
    return clone(plan);
  }
  async dispatch(runtime,itemId) {
    const event = await this.context(runtime);
    if(!event.plan) throw new Error('Freeze the plan before dispatch');
    const item = this.state.events[event.event_id].plan.items.find(item => item.item_id === itemId);
    if(!item) throw new Error('Unknown plan item');
    if(!item.first_dispatched_at) { item.first_dispatched_at = new Date().toISOString(); await this.save(); }
    return item.first_dispatched_at;
  }
  async complete(threadId,turnId) {
    if(this.state.active?.threadId === threadId && this.state.active.turnId === turnId) { this.state.active=null; await this.save(); }
  }
}
