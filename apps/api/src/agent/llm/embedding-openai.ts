import OpenAI from 'openai';
/** Keep provider SDK construction inside the adapter boundary, including local compatibility. */
export function openaiEmbeddingClient(options:{apiKey:string;baseURL?:string;timeout:number;local?:boolean}) {
  return new OpenAI({apiKey:options.apiKey,baseURL:options.baseURL,maxRetries:0,timeout:options.timeout,...(options.local?{defaultHeaders:{Authorization:null}}:{})});
}
