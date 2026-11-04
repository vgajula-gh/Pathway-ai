import {WORDS} from '../data/words.js';
import {dkey} from './time.js';

/** Calendar-day selection, independent of host DST; practice never writes data. */
export function practiceWord(now:Date,offset=0) {
  const day=Math.round((Date.UTC(now.getFullYear(),now.getMonth(),now.getDate())-Date.UTC(now.getFullYear(),0,0))/864e5);
  const [word,pos,meaning,example]=WORDS[(day+offset)%WORDS.length];
  return {date:dkey(now),word:{word,pos,meaning,example},position:offset%WORDS.length+1,total:WORDS.length};
}
