import {lookup} from 'node:dns/promises';
import {get} from 'node:https';
import type {NewsFeed} from '../data/news-feeds.js';
import {publicAddress,pinnedLookup} from './calendar-fetch.js';

/** Publisher-only redirects, public pinned DNS, 1 MiB and a total 10s deadline. */
export async function fetchNewsFeed(feed:NewsFeed):Promise<string> {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  const abort=new Promise<never>((_resolve,reject)=>controller.signal.addEventListener('abort',()=>reject(new Error('News feed timed out')),{once:true}));
  const read=async(value:string,redirects:number):Promise<string>=>{
    const url=new URL(value),original=new URL(feed.url);
    if(url.protocol!=='https:'||url.username||url.password||url.host!==original.host)throw new Error('Unsupported feed redirect');
    const addresses=await Promise.race([lookup(url.hostname,{all:true}),abort]);
    if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw new Error('Private feed address');
    return new Promise((resolve,reject)=>{
      const {address,family}=addresses[0];
      const req=get(url,{agent:false,lookup:pinnedLookup(address,family),signal:controller.signal,headers:{accept:'application/rss+xml, application/atom+xml, application/xml, text/xml', 'user-agent':'Pathway-News/1.0'}},res=>{
        if([301,302,303,307,308].includes(res.statusCode||0)&&res.headers.location){
          res.resume();if(redirects>=2){reject(new Error('Too many feed redirects'));return;}
          read(new URL(res.headers.location,url).href,redirects+1).then(resolve,reject);return;
        }
        if(res.statusCode!==200){res.resume();reject(new Error('Feed unavailable'));return;}
        const parts:Buffer[]=[];let bytes=0;
        res.on('data',(part:Buffer)=>{bytes+=part.length;if(bytes>1024*1024){req.destroy(new Error('Feed too large'));return;}parts.push(part);});
        res.on('end',()=>resolve(Buffer.concat(parts).toString('utf8')));res.on('error',reject);
      });req.on('error',reject);
    });
  };
  try{return await Promise.race([read(feed.url,0),abort]);}finally{clearTimeout(timer);}
}
