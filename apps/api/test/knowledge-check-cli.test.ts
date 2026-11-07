import {expect,it} from 'vitest';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';

it.each([
  ['status',false,'not_checked',0],
  ['prepare',true,'confirmed',0],
  ['prepare',true,'pending_or_missing',1],
  ['prepare',false,'not_checked',1],
] as const)('owner CLI %s with SQL ready=%s and read-back=%s exits %s without retrying',async(mode,sqlReady,vectorConfirmation,expectedCode)=>{
  const args=['--url','https://published.example.test','--program','public-program',...(mode==='prepare'?['--mode','prepare','--allow-paid']:[])];
  const report={configurationReady:true,program:{sqlReady,vectorConfirmation}};
  const script=`let calls=0;
    globalThis.fetch=async(url,init)=>{
      calls++;
      if(init.method!==${JSON.stringify(mode==='status'?'GET':'POST')}||init.headers.Authorization!=='Bearer '+process.env.JOBS_SECRET)throw Error('Unexpected owner request');
      return new Response(${JSON.stringify(JSON.stringify(report))},{status:200,headers:{'content-type':'application/json'}});
    };
    process.on('exit',()=>console.log('CHECK_CALLS='+calls));`;
  const result=await promisify(execFile)(process.execPath,['--import','data:text/javascript,'+encodeURIComponent(script),'scripts/check-knowledge.mjs',...args],{
    cwd:resolve('../..'),timeout:15000,env:{...process.env,JOBS_SECRET:'owner-cli-fixture-secret-'.repeat(3)},
  }).then(r=>({...r,code:0}),e=>({stdout:e.stdout as string,stderr:e.stderr as string,code:e.code as number}));
  expect(result.code).toBe(expectedCode);expect(result.stdout).toContain('CHECK_CALLS=1');
  expect(result.stdout+result.stderr).not.toContain('owner-cli-fixture-secret-');
});
