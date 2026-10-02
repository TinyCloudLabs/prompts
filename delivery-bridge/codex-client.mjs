import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DeliveryLedger } from './ledger.mjs';

const object = properties => ({type:'object',properties,additionalProperties:false,required:Object.keys(properties)});
export const deliveryTools = [
 {type:'function',name:'tinycloud_delivery_context',description:'Read verified original human delivery metadata for this runtime turn. No caller-supplied identity. Call before recurring capture.',inputSchema:object({})},
 {type:'function',name:'tinycloud_delivery_plan',description:'Freeze ordered original-message item plans before consent or mutation. Read stored plan first. Returns native-derived source, record and operation IDs; never regenerate them. Corrections provide original source_key, record_id and expected_revision.',inputSchema:object({items:{type:'array',items:{type:'object',additionalProperties:true}}})},
 {type:'function',name:'tinycloud_delivery_dispatch',description:'Persist first-dispatch UTC time before dispatching this planned item; retries return the same timestamp. This does not write TinyCloud or prove a successful write.',inputSchema:object({item_id:{type:'string'}})},
];
const deliveryInstructions = `For TinyCloud recording, call tinycloud_delivery_context before interpreting a self-report. Its original text, received_at, local_date and timezone belong to the original human event, including on replay after consent. Tool-output continuations and injected context are not new observations. Read the installed tc-conversational-data skill and selected app guidance. Freeze a complete ordered item plan using tinycloud_delivery_plan BEFORE requesting write consent; use its native-derived identities verbatim. Call tinycloud_delivery_dispatch immediately before each first attempted write and use the retained timestamp on retry. Reconcile by original record/source before retry; original replay must preserve a later correction. A plan or delivery binding proves neither remote readiness nor successful persistence. Never claim successful capture without independent readback. Follow the shared writer guard for all writes.`;

export class CodexDeliveryClient {
 static async open({directory,executable='codex',serverArgs=[],onText=()=>{},onEvent=()=>{}}) {
  await mkdir(directory,{recursive:true,mode:0o700});
  const lock=join(directory,'client.lock');
  try { await mkdir(lock,{mode:0o700}); } catch(error) { if(error.code==='EEXIST') throw new Error('Delivery directory is locked; do not steal a live or stale lock'); throw error; }
  try {
   await writeFile(join(lock,'owner.json'),JSON.stringify({pid:process.pid}),{mode:0o600});
   const client=new CodexDeliveryClient();
   Object.assign(client,{directory,lock,executable,serverArgs,onText,onEvent,pending:new Map(),sequence:0,queue:Promise.resolve(),ledger:await DeliveryLedger.open(directory),closed:false});
   return client;
  } catch(error) { await rm(lock,{recursive:true,force:true}); throw error; }
 }
 send(value) { this.process.stdin.write(JSON.stringify(value)+'\n'); }
 rpc(method,params) {
  if(this.failure) return Promise.reject(this.failure);
  const id=++this.sequence;
  return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.send({id,method,params});});
 }
 fail(error) {
  this.failure=error;
  for(const pending of this.pending.values()) pending.reject(error);
  this.pending.clear();
  this.running?.reject(error);
 }
 async start({cwd,instructions='',threadId,sandbox='read-only',model}) {
  if(this.process) throw new Error('Client already started');
  if(threadId && !Object.values(this.ledger.state.events).some(event=>event.native.thread_id===threadId)) throw new Error('Thread is not owned by this delivery ledger');
  this.process=spawn(this.executable,['app-server','--listen','stdio://',...this.serverArgs],{cwd,stdio:['pipe','pipe','pipe']});
  this.process.stderr.on('data',chunk=>this.onEvent({type:'stderr',text:String(chunk)}));
  this.process.on('error',error=>this.fail(error));
  this.process.on('exit',(code,signal)=>{if(!this.closed)this.fail(new Error(`Codex app-server exited (${code ?? signal})`));});
  createInterface({input:this.process.stdout}).on('line',line=>{
   let message; try {message=JSON.parse(line);} catch(error){this.fail(error);return;}
   if(!message.method && Object.hasOwn(message,'id')) {
    const pending=this.pending.get(message.id);this.pending.delete(message.id);
    if(message.error)pending?.reject(new Error(message.error.message));else pending?.resolve(message.result);
   } else this.queue=this.queue.then(()=>this.handle(message)).catch(error=>this.fail(error));
  });
  await this.rpc('initialize',{clientInfo:{name:'tinycloud_delivery_bridge',title:'TinyCloud delivery bridge',version:'0.1.0'},capabilities:{experimentalApi:true}});
  this.send({method:'initialized',params:{}});
  const params={cwd,approvalPolicy:'never',sandbox,developerInstructions:deliveryInstructions+'\n'+instructions,...(model?{model}:{})};
  const result=await this.rpc(threadId?'thread/resume':'thread/start',threadId?{...params,threadId}:{...params,dynamicTools:deliveryTools});
  this.threadId=result.thread.id;
  return this.threadId;
 }
 async handle(message) {
  if(this.failure)return;
  this.onEvent(message);
  await this.ledger.observe(message);
  const {method,params}=message;
  if(method==='item/tool/call') {
   try {
    let result;
    if(params.tool==='tinycloud_delivery_context') {
     if(Object.keys(params.arguments??{}).length) throw new Error('Delivery identity is supplied by the runtime, not tool arguments');
     result=await this.ledger.context(params); if(this.running)this.running.contextCalls++;
    } else if(params.tool==='tinycloud_delivery_plan') result=await this.ledger.freeze(params,params.arguments.items);
    else if(params.tool==='tinycloud_delivery_dispatch') result={first_dispatched_at:await this.ledger.dispatch(params,params.arguments.item_id)};
    else throw new Error('Unsupported dynamic tool');
    this.send({id:message.id,result:{success:true,contentItems:[{type:'inputText',text:JSON.stringify(result)}]}});
   } catch(error) {this.send({id:message.id,result:{success:false,contentItems:[{type:'inputText',text:error.message}]}});}
  } else if(Object.hasOwn(message,'id')) {
   // This transport has no approval UI. Preserve pending work; do not auto-approve.
   this.send({id:message.id,error:{code:-32601,message:'This delivery bridge cannot answer interactive approval requests; use the supported human terminal/callback flow.'}});
  }
  if(method==='item/agentMessage/delta') {this.onText(params.delta);if(this.running)this.running.text+=params.delta;}
  if(method==='turn/completed' && params.threadId===this.threadId && this.running) {
   const delivery=await this.ledger.context({threadId:params.threadId,turnId:params.turn.id});
   await this.ledger.complete(params.threadId,params.turn.id);
   const running=this.running;this.running=null;
   running.resolve({status:params.turn.status,error:params.turn.error,delivery,text:running.text,contextCalls:running.contextCalls});
  }
 }
 async run(input) {
  if(this.running) throw new Error('Only one in-flight submission is supported; steering is unavailable');
  let resolve,reject;
  const done=new Promise((a,b)=>{resolve=a;reject=b;});
  // Attach a handler immediately in case the start RPC fails before done is awaited.
  done.catch(()=>{});
  this.running={resolve,reject,text:'',contextCalls:0};
  try {await this.rpc('turn/start',{threadId:this.threadId,...input});}
  catch(error) {this.running=null;reject(error);}
  return done;
 }
 async submit(text,{timezone,receivedAt}={}) {
  if(!this.threadId) throw new Error('Start a thread before submitting');
  if(this.running) throw new Error('Only one in-flight submission is supported');
  await this.ledger.beginHuman(this.threadId,{text,timezone,receivedAt});
  return this.run({input:[{type:'text',text}]});
 }
 async replay(eventId) {
  if(this.running) throw new Error('Only one in-flight submission is supported');
  const known=this.ledger.state.events[eventId];
  if(known && this.threadId!==known.native.thread_id) throw new Error('Resume the original thread before replay');
  await this.ledger.beginReplay(eventId);
  return this.run({input:[],toolOutput:{name:'tinycloud_delivery_resume',output:'Resume the existing bound original delivery. Call tinycloud_delivery_context. This is a continuation, not new human input. Reconcile existing records; preserve later corrections.'}});
 }
 async close() {
  if(this.closed)return;
  this.closed=true;
  if(this.process && this.process.exitCode===null && this.process.signalCode===null) {
   await new Promise(resolve=>{this.process.once('exit',resolve);this.process.kill('SIGTERM');const timer=setTimeout(()=>this.process.kill('SIGKILL'),3000);timer.unref();});
  }
  await this.queue;
  await rm(this.lock,{recursive:true,force:true});
 }
}
