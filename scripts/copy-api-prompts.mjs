import {cpSync,mkdirSync} from 'node:fs';
const target=new URL('../apps/api/dist/agent/prompts/',import.meta.url);
mkdirSync(target,{recursive:true});
cpSync(new URL('../apps/api/src/agent/prompts/',import.meta.url),target,{recursive:true});
