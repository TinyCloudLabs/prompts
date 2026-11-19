#!/usr/bin/env python3
# Synthetic acceptance only: arm CLI receipt loss, then stop the fresh process.
# python3 interrupt-app-creation-agent.py FIXTURE_CONTEXT RUN_DIRECTORY STAGE
import json,os,signal,sys,time
from pathlib import Path
context=Path(sys.argv[1]);run=Path(sys.argv[2]);stage=sys.argv[3]
c=json.loads(context.read_text());log=Path(c['commandLog']);offset=len(log.read_text().splitlines())
signature={'storage':['sql','execute'],'guidance':['kv','put'],'registration':['account','apps','register'],'item':['sql','execute']}[stage]
Path(c['interruptControl']).write_text(json.dumps({'contains':signature}))
deadline=time.time()+1200
while time.time()<deadline:
 if (run/'exit.json').exists():raise SystemExit('Agent exited before interrupt boundary')
 for line in log.read_text().splitlines()[offset:]:
  v=json.loads(line);a=v['args'];hit=False
  if v['code']!=0 or '--help' in a:continue
  if stage=='storage':hit='sql' in a and 'execute' in a and any(x.upper().lstrip().startswith('CREATE TABLE') for x in a)
  if stage=='guidance':hit='kv' in a and 'put' in a and any(x.endswith('/knowledge/index.md') for x in a)
  if stage=='registration':hit='account' in a and 'apps' in a and 'register' in a
  if stage=='item':hit='sql' in a and 'execute' in a and any(x.upper().lstrip().startswith('INSERT') for x in a)
  if hit:
   pid=json.loads((run/'process.json').read_text())['pid']
   os.killpg(pid,signal.SIGKILL)
   (run/'interruption.json').write_text(json.dumps({'stage':stage,'command':v,'agentPid':pid,'confirmedProcessGroupKill':True},indent=2))
   print(json.dumps({'stage':stage,'stoppedAgent':pid,'afterSuccessfulRemoteMutation':True}));raise SystemExit(0)
 time.sleep(.1)
raise SystemExit('Interruption timed out')
