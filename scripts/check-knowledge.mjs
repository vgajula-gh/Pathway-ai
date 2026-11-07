// Owner-triggered diagnostics. The default is read-only; preparation requires explicit paid consent.
import {parseArgs} from 'node:util';
try {
  const {values}=parseArgs({options:{url:{type:'string'},mode:{type:'string',default:'status'},program:{type:'string'},'allow-paid':{type:'boolean',default:false}},strict:true,allowPositionals:false});
  if(!values.url||!['status','prepare'].includes(values.mode))throw new Error('Use --url https://your-app.replit.app [--mode status|prepare] [--program PROGRAM_ID].');
  if(values.mode==='prepare'&&(!values.program||!values['allow-paid']))throw new Error('Preparation requires --program PROGRAM_ID and --allow-paid. Normal shared caps apply.');
  if(values.mode==='status'&&values['allow-paid'])throw new Error('Status is read-only; omit --allow-paid.');
  const origin=new URL(values.url);
  if(origin.username||origin.password||origin.protocol!=='https:'&&!(origin.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(origin.hostname)))throw new Error('Use the published HTTPS URL or a local HTTP server.');
  if(!process.env.JOBS_SECRET||process.env.JOBS_SECRET.length<32)throw new Error('Set JOBS_SECRET in this Shell environment, matching the published owner secret.');
  const address=origin.origin+(values.mode==='status'?'/internal/knowledge/status'+(values.program?'?opportunityId='+encodeURIComponent(values.program):''):'/internal/knowledge/prepare');
  const response=await fetch(address,{method:values.mode==='status'?'GET':'POST',redirect:'error',signal:AbortSignal.timeout(110000),
    headers:{Authorization:'Bearer '+process.env.JOBS_SECRET,'Content-Type':'application/json'},
    ...(values.mode==='prepare'?{body:JSON.stringify({opportunityId:values.program,allowPaid:true})}:{})});
  const result=await response.json();console.log(JSON.stringify(result,null,2));
  if(!response.ok||result.configurationReady===false||values.mode==='prepare'&&(result.program?.sqlReady!==true||result.program?.vectorConfirmation!=='confirmed'))process.exitCode=1;
}catch(error){
  const usageError=error instanceof Error&&/^(Use |Set JOBS_SECRET|Preparation requires|Status is read-only)/.test(error.message);
  console.error(error?.code?.startsWith('ERR_PARSE_ARGS')?'Invalid knowledge-check options. Never pass Secrets as command arguments.':usageError?error.message:'The knowledge check could not finish. Check the URL, owner Secret and Publishing logs.');
  process.exitCode=1;
}
