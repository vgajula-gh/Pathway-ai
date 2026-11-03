/** URL hints only. DNS, robots, redirects and the response body are checked before use. */
export function httpsSourceURL(value:string):URL|null {
  try {
    const url=new URL(value);
    if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443'))return null;
    url.hash='';return url;
  } catch{return null;}
}
export const sourceTypes=['application/pdf','application/json','application/octet-stream','application/zip','office_document','image','audio','video','other'] as const;
export type SourceType=typeof sourceTypes[number];
export function fileSourceType(value:string|URL):SourceType|null {
  let path:string;
  try{path=decodeURIComponent((typeof value==='string'?new URL(value):value).pathname).toLowerCase();}catch{return null;}
  if(/\.pdf$/.test(path))return 'application/pdf';
  if(/\.(docx?|xlsx?|pptx?|od[tp])$/.test(path))return 'office_document';
  if(/\.(zip|gz|tar|7z|rar)$/.test(path))return 'application/zip';
  if(/\.(png|jpe?g|gif|webp|svg|ico|avif)$/.test(path))return 'image';
  if(/\.(mp3|wav|ogg|m4a)$/.test(path))return 'audio';
  if(/\.(mp4|webm|mov|avi)$/.test(path))return 'video';
  if(/\.json$/.test(path))return 'application/json';
  return null;
}
export function sourceType(contentType:string):SourceType {
  const type=contentType.split(';')[0].trim().toLowerCase();
  if(type==='application/pdf'||type==='application/json'||type==='application/zip')return type;
  if(type==='application/octet-stream'||type==='binary/octet-stream')return 'application/octet-stream';
  if(type.startsWith('image/'))return 'image';
  if(type.startsWith('audio/'))return 'audio';
  if(type.startsWith('video/'))return 'video';
  if(/officedocument|msword|ms-excel|ms-powerpoint|opendocument/.test(type))return 'office_document';
  return 'other';
}
