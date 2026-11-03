// Owner-only client. JOBS_SECRET stays in the request header, never the URL/output.
const args=process.argv.slice(2),value=flag=>{const at=args.indexOf(flag);return at<0?undefined:args[at+1];};
const mode=value('--mode')||'diagnostics',runId=value('--run'),address=value('--url');
if(!address||!['diagnostics','configuration','fixture','live','advance'].includes(mode)||mode==='advance'&&!runId) {
  console.error('Usage: npm run check:scout -- --url https://your-app.replit.app [--mode configuration|fixture|live|advance] [--run JOB_ID]');process.exit(1);
}
const origin=new URL(address);
if(origin.username||origin.password||origin.protocol!=='https:'&&!(['localhost','127.0.0.1','[::1]'].includes(origin.hostname)&&origin.protocol==='http:'))throw new Error('Use the published HTTPS URL or a local HTTP server.');
if(!process.env.JOBS_SECRET||process.env.JOBS_SECRET.length<32)throw new Error('Set JOBS_SECRET in this Shell environment, matching the published owner secret.');
const path=mode==='diagnostics'?'/internal/diagnostics'+(runId?'?runId='+encodeURIComponent(runId):''):'/internal/diagnostics/test-scout';
const response=await fetch(origin.origin+path,{method:mode==='diagnostics'?'GET':'POST',redirect:'error',signal:AbortSignal.timeout(70000),headers:{Authorization:'Bearer '+process.env.JOBS_SECRET,'Content-Type':'application/json'},...(mode==='diagnostics'?{}:{body:JSON.stringify({mode,...(runId?{runId}:{})})})});
console.log(JSON.stringify(await response.json(),null,2));
if(!response.ok)process.exitCode=1;
