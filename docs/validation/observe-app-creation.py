#!/usr/bin/env python3
# Synthetic acceptance only: snapshot registered fixture apps through CLI reads.
# python3 observe-app-creation.py FIXTURE_CONTEXT PRIVATE_OUTPUT_DIRECTORY
import json,subprocess,os,sys,hashlib
from pathlib import Path
context=Path(sys.argv[1]);c=json.loads(context.read_text());out=Path(sys.argv[2]);out.mkdir(exist_ok=True,parents=True)
def call(args):
 r=subprocess.run([c['cli'],'--profile',c['observer']['profile'],'--host',c['host'],'--json',*args],env={**os.environ,'TC_HOME':c['observer']['tcHome']},capture_output=True,text=True)
 if r.returncode:raise RuntimeError(r.stderr or r.stdout)
 return json.loads(r.stdout)
def val(x):
 x=x.get('data',x)
 if isinstance(x,str):
  try:return json.loads(x)
  except ValueError:return x
 return x
apps=call(['account','apps','list','--live']);state={'applications':[]}
for a in apps['applications']:
 appid=a['appId']; canonical=val(call(['kv','get','applications/'+appid,'--space',c['accountSpace']]))
 x={'appId':appid,'canonical':canonical,'knowledge':{},'kv':{},'sql':{}}
 for m in canonical['manifests']:
  space=m['space'];prefix=m.get('prefix',appid);key=(prefix+'/' if prefix else '')+('knowledge/index.md' if m['knowledge'] is True else m['knowledge'])
  x['knowledge'][key]=val(call(['kv','get',key,'--space',space]))
  for p in m['permissions']:
   if p['service']=='tinycloud.kv' and 'list' in p['actions']:
    listing=call(['kv','list','--prefix',p['path'],'--space',space]);x['kv'][p['path']]={'listing':listing,'values':{}}
    items=listing.get('keys',listing.get('data',[]))
    if isinstance(items,dict):items=items.get('keys',[])
    for k in items:
     k=k if isinstance(k,str) else k.get('key')
     x['kv'][p['path']]['values'][k]=val(call(['kv','get',k,'--space',space]))
   if p['service']=='tinycloud.sql':
    db=p['path'];tables=call(['sql','query','SELECT name,sql FROM sqlite_master WHERE type = ?','--params','["table"]','--db',db,'--space',space]);x['sql'][db]={'schema':tables,'records':{}}
    for row in tables['rows']:
     name=row[0];quote='"'+name.replace('"','""')+'"'
     x['sql'][db]['records'][name]=call(['sql','query','SELECT * FROM '+quote,'--db',db,'--space',space])
 state['applications'].append(x)
(out/'snapshot.json').write_text(json.dumps(state,indent=2))
summary={'applicationCount':len(state['applications']),'apps':[{'appId':a['appId'],'recordCounts':{**{k:len(v['values']) for k,v in a['kv'].items()},**{k:{t:v['rowCount'] for t,v in d['records'].items()} for k,d in a['sql'].items()}},'canonicalHash':hashlib.sha256(json.dumps(a['canonical'],sort_keys=True).encode()).hexdigest(),'knowledgeHash':hashlib.sha256(json.dumps(a['knowledge'],sort_keys=True).encode()).hexdigest()} for a in state['applications']]}
(out/'summary.json').write_text(json.dumps(summary,indent=2));print(json.dumps(summary))
